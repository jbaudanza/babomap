import { StatusBar } from 'expo-status-bar';
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
