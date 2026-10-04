import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import type { OutgoingPoint } from './api';
import { COLORS, LOCATION_TASK } from './config';
import { loadCredentials, type Credentials } from './credentials';
import { flush, sendOrQueue } from './queue';

const SHARING_KEY = 'babomap.sharing';

// --- Background task -------------------------------------------------------
// Runs whenever the OS delivers fixes, including when the app is killed
// (headless JS). Never throw from here: an exception just gets swallowed and
// the points are lost, so every failure path ends in the queue.

type TaskData = { locations: Location.LocationObject[] };

TaskManager.defineTask<TaskData>(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[babomap] location task error', error.message);
    return;
  }
  const locations = data?.locations ?? [];
  if (locations.length === 0) return;
  try {
    const creds = await loadCredentials();
    if (!creds) return;
    const battery = await batteryLevel();
    const points = locations.map((l) => toPoint(l, 'background', battery));
    await sendOrQueue(creds, points);
  } catch (e) {
    console.warn('[babomap] background upload failed', e);
  }
});

// --- Options ---------------------------------------------------------------

const TASK_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced,
  // Report after moving this far...
  distanceInterval: 50,
  // ...or (Android only) after this long, even when stationary.
  timeInterval: 60_000,
  // iOS: Expo buffers fixes and wakes the JS task at most this often.
  deferredUpdatesInterval: 60_000,
  deferredUpdatesDistance: 100,
  // iOS: keep listening when stationary; otherwise CoreLocation sleeps and
  // only resumes on a significant-change event.
  pausesUpdatesAutomatically: false,
  activityType: Location.ActivityType.Other,
  showsBackgroundLocationIndicator: false,
  // Android: a foreground service keeps the process alive and is required
  // for background location since API 29.
  foregroundService: {
    notificationTitle: 'BaboMap',
    notificationBody: 'Sharing your location with your partner',
    notificationColor: COLORS.pink,
    killServiceOnDestroy: false,
  },
};

// --- Helpers ---------------------------------------------------------------

async function batteryLevel(): Promise<number | null> {
  try {
    const v = await Battery.getBatteryLevelAsync();
    return v >= 0 ? v : null;
  } catch {
    return null;
  }
}

/** iOS uses -1 for "unknown" speed/heading. */
function nonNegative(v: number | null): number | null {
  return v !== null && v >= 0 ? v : null;
}

export function toPoint(
  l: Location.LocationObject,
  source: 'background' | 'foreground',
  battery: number | null,
): OutgoingPoint {
  return {
    recorded_at: Math.round(l.timestamp),
    lat: l.coords.latitude,
    lon: l.coords.longitude,
    accuracy: l.coords.accuracy,
    altitude: l.coords.altitude,
    speed: nonNegative(l.coords.speed),
    heading: nonNegative(l.coords.heading),
    battery,
    source,
  };
}

// --- Sharing state (this device's own switch) ------------------------------

export async function isSharingEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(SHARING_KEY)) === '1';
}

async function setSharingFlag(on: boolean): Promise<void> {
  await AsyncStorage.setItem(SHARING_KEY, on ? '1' : '0');
}

export type PermissionState = {
  foreground: Location.PermissionStatus;
  background: Location.PermissionStatus;
};

export async function getPermissions(): Promise<PermissionState> {
  const [f, b] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  return { foreground: f.status, background: b.status };
}

/**
 * Ask for foreground then background permission. iOS requires that order;
 * Android 11+ sends the user to Settings for "Allow all the time".
 */
export async function requestPermissions(): Promise<PermissionState> {
  const f = await Location.requestForegroundPermissionsAsync();
  if (f.status !== 'granted') {
    return { foreground: f.status, background: 'denied' as Location.PermissionStatus };
  }
  const b = await Location.requestBackgroundPermissionsAsync();
  return { foreground: f.status, background: b.status };
}

export async function isTaskRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

/** Turn sharing on: permissions, background task, local flag. Throws if denied. */
export async function startSharing(): Promise<void> {
  const p = await requestPermissions();
  if (p.background !== 'granted') {
    throw new Error(
      Platform.OS === 'ios'
        ? 'Location permission must be set to "Always" in Settings.'
        : 'Location permission must be "Allow all the time" in Settings.',
    );
  }
  if (!(await isTaskRunning())) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, TASK_OPTIONS);
  }
  await setSharingFlag(true);
}

export async function stopSharing(): Promise<void> {
  await setSharingFlag(false);
  if (await isTaskRunning()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

/**
 * On launch: if the switch is on but the OS task isn't registered (fresh
 * install from a backup, task cleared by the system), start it again.
 */
export async function reconcileOnLaunch(): Promise<void> {
  if (!(await isSharingEnabled())) return;
  if (await isTaskRunning()) return;
  const p = await getPermissions();
  if (p.background === 'granted') {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, TASK_OPTIONS);
  } else {
    await setSharingFlag(false);
  }
}

/**
 * Foreground: grab one fix now and upload it, plus anything queued.
 * High accuracy here, unlike the background task: on Android "Balanced"
 * means wifi/cell only (~100 m), and this is a single read while someone is
 * looking at the map, so GPS is worth it.
 */
export async function postForegroundFix(creds: Credentials): Promise<void> {
  if (!(await isSharingEnabled())) return;
  const p = await getPermissions();
  if (p.foreground !== 'granted') return;
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  const battery = await batteryLevel();
  await sendOrQueue(creds, [toPoint(loc, 'foreground', battery)]);
  await flush(creds);
}
