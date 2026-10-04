import type { ExpoConfig } from 'expo/config';

// Android renders Google Maps and needs a key restricted to this package +
// signing SHA-1. Set GOOGLE_MAPS_ANDROID_API_KEY in the EAS build environment
// (eas env:create) or locally in .env. iOS uses Apple Maps and needs nothing.
const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
if (!androidMapsKey) {
  console.warn('GOOGLE_MAPS_ANDROID_API_KEY is not set: Android map tiles will be blank.');
}

const EAS_PROJECT_ID = 'c6067f4a-a7f8-4eee-9670-8825fb4d1a37';

const config: ExpoConfig = {
  name: 'BaboMap',
  slug: 'babomap',
  owner: 'jbaudanza',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  scheme: 'babomap',
  ios: {
    bundleIdentifier: 'org.jonb.babomap',
    // Personal team (not hilokal). Prebuild writes this as DEVELOPMENT_TEAM
    // for local `expo run:ios`; EAS uses it when choosing the Apple team.
    appleTeamId: '4BCYW8N8Z8',
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
  // EAS Update. Runtime version follows the app version, so a native change
  // means bumping `version` and rebuilding; JS-only changes ship with
  // `eas update --channel <channel>`.
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    // Local Xcode builds (`npm run ios:device`) don't go through EAS Build,
    // which is what normally stamps the update channel into the binary.
    requestHeaders: { 'expo-channel-name': 'production' },
  },
  extra: { eas: { projectId: EAS_PROJECT_ID } },
};

export default config;
