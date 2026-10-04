import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, type OutgoingPoint } from './api';
import type { Credentials } from './credentials';
import { QUEUE_MAX, UPLOAD_BATCH } from './config';

// Points that could not be uploaded (no network, server down). Flushed on the
// next background fix, on app foreground, or manually from Settings. The
// server dedupes on (user, recorded_at) so re-sending after a timeout is safe.

const QUEUE_KEY = 'babomap.queue';
const LAST_UPLOAD_KEY = 'babomap.lastUpload';

async function read(): Promise<OutgoingPoint[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as OutgoingPoint[]) : [];
  } catch {
    return [];
  }
}

async function write(points: OutgoingPoint[]): Promise<void> {
  if (points.length === 0) {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } else {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(points));
  }
}

export async function enqueue(points: OutgoingPoint[]): Promise<void> {
  const q = await read();
  q.push(...points);
  await write(q.length > QUEUE_MAX ? q.slice(q.length - QUEUE_MAX) : q);
}

export async function pendingCount(): Promise<number> {
  return (await read()).length;
}

export async function lastUploadAt(): Promise<number | null> {
  const v = await AsyncStorage.getItem(LAST_UPLOAD_KEY);
  return v ? Number(v) : null;
}

let flushing: Promise<FlushResult> | null = null;
export type FlushResult = { sent: number; remaining: number; error: string | null };

/** Upload everything queued, oldest first. Concurrent calls share one run. */
export function flush(creds: Credentials): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = doFlush(creds).finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush(creds: Credentials): Promise<FlushResult> {
  let q = await read();
  let sent = 0;
  while (q.length > 0) {
    const batch = q.slice(0, UPLOAD_BATCH);
    try {
      await api.postLocations(creds, batch);
    } catch (e) {
      await write(q);
      return { sent, remaining: q.length, error: e instanceof Error ? e.message : String(e) };
    }
    sent += batch.length;
    q = q.slice(batch.length);
    await write(q);
    await AsyncStorage.setItem(LAST_UPLOAD_KEY, String(Date.now()));
  }
  return { sent, remaining: 0, error: null };
}

/** Try to send directly; fall back to the queue. Returns true if sent now. */
export async function sendOrQueue(creds: Credentials, points: OutgoingPoint[]): Promise<boolean> {
  // Preserve ordering: if anything is already queued, append and flush.
  if ((await pendingCount()) > 0) {
    await enqueue(points);
    const r = await flush(creds);
    return r.remaining === 0;
  }
  try {
    await api.postLocations(creds, points);
    await AsyncStorage.setItem(LAST_UPLOAD_KEY, String(Date.now()));
    return true;
  } catch {
    await enqueue(points);
    return false;
  }
}
