import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { COLORS } from './src/config';
import { loadCredentials, type Credentials } from './src/credentials';
import { MapScreen } from './src/screens/MapScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SetupScreen } from './src/screens/SetupScreen';

type Screen = 'loading' | 'setup' | 'map' | 'settings';

export default function App() {
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [screen, setScreen] = useState<Screen>('loading');

  useEffect(() => {
    void loadCredentials().then((c) => {
      setCreds(c);
      setScreen(c ? 'map' : 'setup');
    });
  }, []);

  // expo-updates checks and downloads on launch but only applies on the next
  // *process* start. On Android the location foreground service keeps the
  // process alive, so swiping the app away is not a restart and an update can
  // sit downloaded indefinitely. Reload as soon as one is ready, as long as
  // nobody is mid-setup.
  const { isUpdatePending } = Updates.useUpdates();
  useEffect(() => {
    if (isUpdatePending && screen === 'map') {
      void Updates.reloadAsync().catch((e) => console.warn('[babomap] reload failed', e));
    }
  }, [isUpdatePending, screen]);

  let body;
  if (screen === 'loading') {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.pink} />
      </View>
    );
  } else if (screen === 'setup' || !creds) {
    body = (
      <SetupScreen
        onDone={(c) => {
          setCreds(c);
          setScreen('map');
        }}
      />
    );
  } else if (screen === 'settings') {
    body = (
      <SettingsScreen
        creds={creds}
        onClose={() => setScreen('map')}
        onSignOut={() => {
          setCreds(null);
          setScreen('setup');
        }}
      />
    );
  } else {
    body = <MapScreen creds={creds} onOpenSettings={() => setScreen('settings')} />;
  }

  return (
    <View style={styles.root}>
      {body}
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
