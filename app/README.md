# BaboMap app

Expo (SDK 57) + TypeScript. See `../PLAN.md` for the design.

Background location does not work in Expo Go: use a development build.

```bash
npm install
cp .env.example .env               # Android Google Maps key (iOS needs none)
npx expo-doctor && npx tsc --noEmit

# one-time EAS setup (needs an Expo account)
npx eas-cli init                   # writes the project id into app.config.ts extra
npx eas-cli update:configure       # adds updates.url

# builds
npx eas-cli build --profile development --platform ios      # dev client, TestFlight/internal
npx eas-cli build --profile preview --platform android      # APK to install directly

# ship JS-only changes
npx eas-cli update --channel production --message "..."
```

## Layout

| File | What |
|------|------|
| `index.ts` | Imports `src/location` first so the background task is registered on headless launch. |
| `app.config.ts` | Expo config: bundle ids, location/camera/maps plugins, runtime version policy. |
| `src/credentials.ts` | Server URL + token in the keychain (`AFTER_FIRST_UNLOCK` so the background task can read it while locked). |
| `src/api.ts` | Typed fetch wrapper with bearer auth and a 15 s timeout. |
| `src/queue.ts` | Offline queue in AsyncStorage; flushed in batches, deduped server-side. |
| `src/location.ts` | Background task definition, permissions, start/stop, launch reconcile, foreground fix. |
| `src/screens/SetupScreen.tsx` | Scan the setup QR (or type URL + token), verify against the server, save. |
| `src/screens/MapScreen.tsx` | Both markers with "paused"/stale captions; polls `/api/status` every 20 s; posts a fix on foreground. |
| `src/screens/SettingsScreen.tsx` | Sharing switch, permission + task state, queue, forget device. |

## Testing on a device

1. Deploy the backend and run `sh ../backend/scripts/token.sh <name> <url>` on the laptop.
2. Install the dev or preview build, open it, scan the QR.
3. Settings → Share my location → grant "Always" / "Allow all the time".
4. Walk around; the other phone's map should update. Settings shows last upload and queued points.
