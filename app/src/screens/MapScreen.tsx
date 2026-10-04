import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { api, type StatusResponse, type UserStatus } from '../api';
import { AVATARS, COLORS, FALLBACK_AVATARS, POLL_INTERVAL_MS, STALE_AFTER_MS } from '../config';
import type { Credentials } from '../credentials';
import { postForegroundFix, reconcileOnLaunch } from '../location';
import { flush } from '../queue';
import { timeAgo } from '../timeAgo';

type Props = { creds: Credentials; onOpenSettings: () => void };

/** Below this radius the circle hides under the marker anyway. */
const MIN_CIRCLE_M = 15;

export function MapScreen({ creds, onOpenSettings }: Props) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const mapRef = useRef<MapView>(null);
  const fitted = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const s = await api.status(creds);
      setStatus(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setNow(Date.now());
  }, [creds]);

  const onForeground = useCallback(async () => {
    await refresh();
    try {
      await postForegroundFix(creds);
      await flush(creds);
      await refresh();
    } catch (e) {
      console.warn('[babomap] foreground fix failed', e);
    }
  }, [creds, refresh]);

  // Launch + poll + foreground transitions.
  useEffect(() => {
    void reconcileOnLaunch().catch((e) => console.warn('[babomap] reconcile failed', e));
    void onForeground();
    const poll = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void onForeground();
    });
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      sub.remove();
    };
  }, [onForeground, refresh]);

  // Fit both markers once we have them.
  useEffect(() => {
    if (fitted.current || !status) return;
    const coords = status.users
      .filter((u) => u.latest)
      .map((u) => ({ latitude: u.latest!.lat, longitude: u.latest!.lon }));
    if (coords.length === 0) return;
    fitted.current = true;
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 120, right: 80, bottom: 160, left: 80 },
      animated: false,
    });
  }, [status]);

  const me = status?.users.find((u) => u.name === status.me);

  return (
    <View style={styles.root}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} showsUserLocation={false}>
        {status?.users.map((u) =>
          u.latest?.accuracy != null && u.latest.accuracy > MIN_CIRCLE_M ? (
            <Circle
              key={`${u.name}-acc`}
              center={{ latitude: u.latest.lat, longitude: u.latest.lon }}
              radius={u.latest.accuracy}
              strokeWidth={1}
              strokeColor={u.sharing_enabled ? COLORS.pinkStroke : COLORS.staleStroke}
              fillColor={u.sharing_enabled ? COLORS.pinkFill : COLORS.staleFill}
            />
          ) : null,
        )}
        {status?.users.map((u, i) =>
          u.latest ? (
            <Marker
              key={u.name}
              coordinate={{ latitude: u.latest.lat, longitude: u.latest.lon }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
            >
              <UserMarker user={u} avatar={AVATARS[u.name] ?? FALLBACK_AVATARS[i % FALLBACK_AVATARS.length]} now={now} />
            </Marker>
          ) : null,
        )}
      </MapView>

      <View style={styles.topBar}>
        <Text style={styles.brand}>바보맵</Text>
        {error ? <Text style={styles.errorPill}>offline: {error}</Text> : null}
      </View>

      <View style={styles.bottomBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.meLine}>
            {me ? `${AVATARS[me.name] ?? '🙂'} you · ${me.sharing_enabled ? 'sharing' : 'paused'}` : '…'}
          </Text>
          {me?.latest ? (
            <Text style={styles.meSub}>
              last fix {timeAgo(me.latest.recorded_at, now)} · synced {timeAgo(me.latest.received_at, now)}
            </Text>
          ) : null}
        </View>
        <Pressable
          style={styles.iconButton}
          onPress={() => {
            fitted.current = false;
            setStatus((s) => (s ? { ...s } : s));
          }}
        >
          <Text style={styles.iconText}>⌖</Text>
        </Pressable>
        <Pressable style={styles.iconButton} onPress={onOpenSettings}>
          <Text style={styles.iconText}>⚙︎</Text>
        </Pressable>
      </View>
    </View>
  );
}

function UserMarker({ user, avatar, now }: { user: UserStatus; avatar: string; now: number }) {
  const fix = user.latest!;
  const paused = !user.sharing_enabled;
  const stale = !paused && now - fix.recorded_at > STALE_AFTER_MS;
  const caption = paused ? 'paused' : timeAgo(fix.recorded_at, now);
  return (
    <View style={styles.marker}>
      <View style={[styles.bubble, (paused || stale) && styles.bubbleDim]}>
        <Text style={styles.avatar}>{avatar}</Text>
      </View>
      <View style={styles.tail} />
      <Text style={[styles.caption, (paused || stale) && styles.captionDim]}>
        {user.name} · {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { position: 'absolute', top: 56, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.pink,
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  errorPill: { flex: 1, color: '#C0392B', backgroundColor: '#FFF0EE', padding: 6, borderRadius: 999, fontSize: 12 },
  bottomBar: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  meLine: { fontSize: 16, fontWeight: '700', color: COLORS.ink },
  meSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.pinkSoft, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 20, color: COLORS.pink },
  marker: { alignItems: 'center' },
  bubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    borderWidth: 3,
    borderColor: COLORS.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleDim: { borderColor: COLORS.stale },
  avatar: { fontSize: 24 },
  tail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: COLORS.pink,
    marginTop: -2,
  },
  caption: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.ink,
    backgroundColor: COLORS.card,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  captionDim: { color: COLORS.muted },
});
