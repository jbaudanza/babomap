import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../api';
import { COLORS } from '../config';
import { parseSetupPayload, saveCredentials, type Credentials } from '../credentials';

type Props = { onDone: (creds: Credentials) => void };

export function SetupScreen({ onDone }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState(false);
  const [url, setUrl] = useState('https://');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  async function tryCredentials(creds: Credentials | null) {
    if (!creds) {
      setError('That does not look like a BaboMap setup code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.status(creds);
      await saveCredentials(creds);
      onDone(creds);
    } catch (e) {
      setError(`Could not reach the server: ${e instanceof Error ? e.message : String(e)}`);
      setScanned(false);
    } finally {
      setBusy(false);
    }
  }

  const showCamera = !manual && permission?.granted;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>바보맵</Text>
      <Text style={styles.subtitle}>Scan the setup code from the laptop.</Text>

      {showCamera ? (
        <View style={styles.cameraBox}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={
              scanned || busy
                ? undefined
                : ({ data }) => {
                    setScanned(true);
                    void tryCredentials(parseSetupPayload(data));
                  }
            }
          />
        </View>
      ) : manual ? (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="https://babomap.fly.dev"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            placeholder="token"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Pressable
            style={styles.button}
            disabled={busy}
            onPress={() => void tryCredentials(parseSetupPayload(token, url))}
          >
            <Text style={styles.buttonText}>Connect</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.button} onPress={() => void requestPermission()}>
          <Text style={styles.buttonText}>Allow camera to scan</Text>
        </Pressable>
      )}

      {busy && <ActivityIndicator style={{ marginTop: 16 }} color={COLORS.pink} />}
      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable onPress={() => setManual((m) => !m)} style={{ marginTop: 24 }}>
        <Text style={styles.link}>{manual ? 'Scan a QR code instead' : 'Enter manually'}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 40, fontWeight: '800', color: COLORS.pink, marginBottom: 4 },
  subtitle: { fontSize: 16, color: COLORS.muted, marginBottom: 24, textAlign: 'center' },
  cameraBox: { width: 260, height: 260, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  form: { width: '100%', gap: 12 },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.pinkSoft,
  },
  button: { backgroundColor: COLORS.pink, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 999 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16, textAlign: 'center' },
  link: { color: COLORS.pink, fontWeight: '600' },
  error: { color: '#C0392B', marginTop: 16, textAlign: 'center' },
});
