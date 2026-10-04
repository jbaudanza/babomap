import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { api } from '../api';
import { COLORS } from '../config';
import { clearCredentials, type Credentials } from '../credentials';
import {
  getPermissions,
  isSharingEnabled,
  isTaskRunning,
  startSharing,
  stopSharing,
  type PermissionState,
} from '../location';
import { flush, lastUploadAt, pendingCount } from '../queue';
import { timeAgo } from '../timeAgo';

type Props = { creds: Credentials; onClose: () => void; onSignOut: () => void };

export function SettingsScreen({ creds, onClose, onSignOut }: Props) {
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [perms, setPerms] = useState<PermissionState | null>(null);
  const [taskRunning, setTaskRunning] = useState(false);
  const [pending, setPending] = useState(0);
  const [lastUpload, setLastUpload] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [s, p, t, n, l] = await Promise.all([
      isSharingEnabled(),
      getPermissions(),
      isTaskRunning(),
      pendingCount(),
      lastUploadAt(),
    ]);
    setSharing(s);
    setPerms(p);
    setTaskRunning(t);
    setPending(n);
    setLastUpload(l);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function toggle(on: boolean) {
    setBusy(true);
    setMessage(null);
    setSharing(on);
    try {
      if (on) await startSharing();
      else await stopSharing();
      await api.setSharing(creds, on);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(msg);
      if (on) {
        // Permission denied or task failed: roll back and point at Settings.
        await stopSharing().catch(() => undefined);
        Alert.alert('Could not start sharing', msg, [
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          { text: 'OK' },
        ]);
      }
    } finally {
      setBusy(false);
      await reload();
    }
  }

  // Check -> download -> reload, in one tap. Normally expo-updates checks at
  // launch and applies on the *next* launch, so a change needs two restarts.
  async function checkForUpdates() {
    if (!Updates.isEnabled) {
      setMessage('Updates are disabled in this build (dev client?).');
      return;
    }
    setBusy(true);
    setMessage('Checking for updates…');
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        setMessage('Already up to date.');
        return;
      }
      setMessage('Downloading update…');
      const fetched = await Updates.fetchUpdateAsync();
      if (!fetched.isNew) {
        setMessage('Update downloaded but nothing new to apply.');
        return;
      }
      setMessage('Restarting…');
      await Updates.reloadAsync();
    } catch (e) {
      setMessage(`Update failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function flushNow() {
    setBusy(true);
    const r = await flush(creds);
    setMessage(r.error ? `Upload failed: ${r.error}` : `Sent ${r.sent} queued point(s).`);
    setBusy(false);
    await reload();
  }

  function forget() {
    Alert.alert('Forget this device?', 'Sharing stops and you will need to scan a setup code again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await stopSharing().catch(() => undefined);
            await api.setSharing(creds, false).catch(() => undefined);
            await clearCredentials();
            onSignOut();
          })();
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Pressable onPress={onClose}>
          <Text style={styles.link}>Done</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Share my location</Text>
          <Switch value={sharing} onValueChange={(v) => void toggle(v)} disabled={busy} trackColor={{ true: COLORS.pink }} />
        </View>
        <Text style={styles.hint}>
          When off, your partner sees you as paused. When on, the phone reports movement in the background.
        </Text>
      </View>

      <View style={styles.card}>
        <Row label="Foreground permission" value={perms?.foreground ?? '…'} />
        <Row label="Background permission" value={perms?.background ?? '…'} />
        <Row label="Background task" value={taskRunning ? 'running' : 'stopped'} />
        <Pressable onPress={() => void Linking.openSettings()}>
          <Text style={styles.link}>Open system settings</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Row label="Last upload" value={lastUpload ? timeAgo(lastUpload) : 'never'} />
        <Row label="Queued points" value={String(pending)} />
        {pending > 0 && (
          <Pressable onPress={() => void flushNow()} disabled={busy}>
            <Text style={styles.link}>Upload now</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.card}>
        <Row label="App version" value={`${Updates.runtimeVersion ?? '?'} · ${updateLabel()}`} />
        <Pressable onPress={() => void checkForUpdates()} disabled={busy}>
          <Text style={styles.link}>Check for updates</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Row label="Server" value={creds.url} />
        <Pressable onPress={forget}>
          <Text style={[styles.link, { color: '#C0392B' }]}>Forget this device</Text>
        </Pressable>
      </View>

      {message && <Text style={styles.message}>{message}</Text>}
    </ScrollView>
  );
}

function updateLabel(): string {
  if (Updates.isEmbeddedLaunch || !Updates.updateId) return 'built-in bundle';
  const when = Updates.createdAt ? ` (${Updates.createdAt.toLocaleDateString()})` : '';
  return `update ${Updates.updateId.slice(0, 8)}${when}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingTop: 64, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.ink },
  card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  label: { fontSize: 15, color: COLORS.ink, fontWeight: '600' },
  value: { fontSize: 14, color: COLORS.muted, flexShrink: 1 },
  hint: { fontSize: 12, color: COLORS.muted },
  link: { color: COLORS.pink, fontWeight: '700', fontSize: 15 },
  message: { color: COLORS.muted, textAlign: 'center' },
});
