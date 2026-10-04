import type { ExpoConfig } from 'expo/config';

// Android renders Google Maps and needs a key restricted to this package +
// signing SHA-1. Set GOOGLE_MAPS_ANDROID_API_KEY in the EAS build environment
// (eas env:create) or locally in .env. iOS uses Apple Maps and needs nothing.
const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
if (!androidMapsKey) {
  console.warn('GOOGLE_MAPS_ANDROID_API_KEY is not set: Android map tiles will be blank.');
}

const config: ExpoConfig = {
  name: 'BaboMap',
  slug: 'babomap',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  scheme: 'babomap',
  ios: {
    bundleIdentifier: 'org.jonb.babomap',
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'org.jonb.babomap',
    adaptiveIcon: {
      backgroundColor: '#FFE9EC',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'BaboMap shares your location with your partner, including in the background.',
        locationWhenInUsePermission: 'BaboMap shows your location on the map.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'BaboMap uses the camera to scan your setup QR code.',
        recordAudioAndroid: false,
      },
    ],
    'expo-secure-store',
    'expo-dev-client',
    ['react-native-maps', { androidGoogleMapsApiKey: androidMapsKey }],
  ],
  // EAS Update: `eas update:configure` adds `updates.url` and the EAS project
  // id. Runtime version follows the app version, so a native change means
  // bumping `version` and rebuilding; JS-only changes ship with `eas update`.
  runtimeVersion: { policy: 'appVersion' },
};

export default config;
