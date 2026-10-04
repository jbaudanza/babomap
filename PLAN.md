# BaboMap — Plan

A private two-person location-sharing app (iOS + Android) with a self-hosted
backend. Named after 바보. It replaces Life360 so location data stays on
infrastructure we control.

## Goals

- Each of us can see the other on a map, with "last fix at" and "backend
  updated at" timestamps.
- Each of us can pause/resume sharing from the phone. A paused user shows as
  *paused*, not merely *stale*.
- Full history of every location update is kept, indefinitely.
- Updates to the app ship over the air (EAS Update) without a store release.

## Architecture

```
┌──────────────┐  HTTPS (bearer token)  ┌─────────────────────────┐
│ Expo app     │ ─────────────────────► │ Express + better-sqlite3│
│ iOS / Android│ ◄───────────────────── │ on Fly.io (1 machine)   │
└──────────────┘  poll /api/status      │ volume + Litestream→R2  │
                                        └─────────────────────────┘
```

- **Backend:** Node 22, Express, better-sqlite3, tsx. Same template as
  `korean-handwriting/collection-app` (Dockerfile, `fly.toml` with a mounted
  volume, Litestream entrypoint). Single machine; SQLite must never scale out.
- **App:** Expo (latest SDK) + TypeScript. One map screen, one settings screen,
  one first-run setup screen. EAS Build for binaries, EAS Update for JS.
- **Transport:** plain HTTPS + polling. Two users do not need websockets.

## Authentication

Two per-user bearer tokens. The secret is never in the bundle.

- Tokens are generated on the laptop (`openssl rand -hex 32`) and stored on the
  server as a Fly secret, e.g. `USER_TOKENS=jon:<hex>,wife:<hex>`.
- The app's first-run screen scans a QR code shown on the laptop
  (`qrencode -t ansiutf8 '<hex>'`). The token is written to expo-secure-store
  (iOS Keychain / Android Keystore). It survives EAS Updates and is never in
  git or the JS bundle.
- Middleware: `Authorization: Bearer <token>` → constant-time compare against
  each configured token → attach `req.user`. Anything else is a bare `401`.
- Modest rate limiting on all routes so scanners can't hammer the box.
- Rotation: regenerate one token, update the Fly secret, re-scan on one phone.

Why not a single shared secret embedded in the app: EAS Update channels are
fetched by URL and an APK unzips, so anything in the bundle is readable; and the
server needs to know *which* user is posting.

## Schema

Timestamps are integer milliseconds since the epoch (8 bytes, sort correctly).
WAL mode so map reads never block background inserts.

```sql
PRAGMA journal_mode = WAL;

CREATE TABLE users (
  id                 INTEGER PRIMARY KEY,
  name               TEXT NOT NULL UNIQUE,     -- 'jon', 'wife'
  sharing_enabled    INTEGER NOT NULL DEFAULT 1,
  sharing_changed_at INTEGER
);

-- Append-only log. rowid alias => inserts land at the end of the b-tree.
CREATE TABLE locations (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  recorded_at  INTEGER NOT NULL,   -- device fix time
  received_at  INTEGER NOT NULL,   -- server time ("backend updated")
  lat          REAL NOT NULL,
  lon          REAL NOT NULL,
  accuracy     REAL,               -- metres
  altitude     REAL,
  speed        REAL,
  heading      REAL,
  battery      REAL,               -- 0..1
  source       TEXT,               -- 'background' | 'foreground'
  ip           TEXT,               -- client IP at upload time (weak "at home" signal)
  UNIQUE (user_id, recorded_at)    -- batch uploads are idempotent
);

-- The only index needed. "Latest for user" is a single b-tree seek;
-- history range queries use the UNIQUE index.
CREATE INDEX locations_user_recorded ON locations (user_id, recorded_at DESC);

-- Audit log for the sharing toggle.
CREATE TABLE sharing_log (
  id       INTEGER PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id),
  enabled  INTEGER NOT NULL,
  at       INTEGER NOT NULL
);

CREATE TABLE migrations (
  id         INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Growth notes:

- ~1 fix/min while moving × 2 users ≈ well under 1M rows/year, ~100 MB with
  the index. SQLite is comfortable for a decade of this.
- No lat/lon index unless geo queries are wanted later.
- `INSERT OR IGNORE` + the UNIQUE constraint makes phone retries safe.
- Optional later: downsample rows older than a year. Nothing requires it.

## API

All routes require the bearer token. JSON in, JSON out.

| Method | Path                 | Body / query                      | Returns |
|--------|----------------------|-----------------------------------|---------|
| POST   | `/api/locations`     | `{ points: [LocationPoint] }`     | `{ inserted }` |
| GET    | `/api/status`        | —                                 | `{ users: [UserStatus] }` |
| PUT    | `/api/sharing`       | `{ enabled: boolean }`            | `UserStatus` |
| GET    | `/api/history`       | `?user=&from=&to=` (ms)           | `{ points: [LocationPoint] }` |
| GET    | `/healthz`           | — (no auth)                       | `ok` |

```ts
type LocationPoint = {
  recorded_at: number; lat: number; lon: number;
  accuracy?: number; altitude?: number; speed?: number; heading?: number;
  battery?: number; source?: 'background' | 'foreground';
};

type UserStatus = {
  name: string;
  sharing_enabled: boolean;
  sharing_changed_at: number | null;
  latest: (LocationPoint & { received_at: number }) | null;
};
```

- `POST /api/locations` is batched because the phone queues fixes while
  offline and flushes later. `recorded_at` more than a few minutes in the
  future is clamped to server time.
- `PUT /api/sharing` updates `users` and appends to `sharing_log`. It exists so
  the map can distinguish *paused* from *stale*.
- `/api/history` is cheap to add now and powers a later trail view.

## App

### Screens

- **Setup (first run):** scan QR → store token in expo-secure-store → verify
  with `GET /api/status`.
- **Map:** two avatar markers. Caption under each: "fix 2 min ago · synced
  1 min ago", or "paused" when `sharing_enabled` is false. Polls `/api/status`
  every 15–30 s while foregrounded.
- **Settings:** sharing toggle, own last-upload status, pending queue size,
  server URL, re-scan token.

### Location pipeline

- `expo-location` + `expo-task-manager` background task.
  - iOS: "Always" permission, `UIBackgroundModes: ["location"]`,
    `pausesUpdatesAutomatically: false`, `distanceInterval ≈ 50 m`,
    `deferredUpdatesInterval` for batching, `showsBackgroundLocationIndicator`.
    iOS only delivers fixes on movement — no heartbeat when stationary.
  - Android: `ACCESS_BACKGROUND_LOCATION`, foreground service with a persistent
    notification (`foregroundService` option), `timeInterval ≈ 60 s` which
    gives a heartbeat even when stationary.
- The task POSTs the fix immediately. On failure it appends to a local queue
  (expo-sqlite or AsyncStorage); the next task run or app launch flushes it.
- Foreground: also post a fix on app open so the other person always gets a
  fresh point when you look at the map.
- **Toggle:** stop/start the task and call `PUT /api/sharing`.

### Map library

- Default: `react-native-maps` (Apple Maps on iOS, Google Maps on Android;
  Android needs a Google Maps key restricted to the package/SHA).
- Alternative if we want Google fully out: `@maplibre/maplibre-react-native`
  with OpenFreeMap tiles. More setup, no keys.

### Expo config (`app.json`)

```json
{
  "plugins": [
    ["expo-location", {
      "locationAlwaysAndWhenInUsePermission": "BaboMap shares your location with your partner.",
      "isIosBackgroundLocationEnabled": true,
      "isAndroidBackgroundLocationEnabled": true,
      "isAndroidForegroundServiceEnabled": true
    }],
    "expo-secure-store",
    "expo-camera"
  ],
  "ios": { "infoPlist": { "UIBackgroundModes": ["location"] } },
  "updates": { "url": "https://u.expo.dev/<project-id>" },
  "runtimeVersion": { "policy": "appVersion" }
}
```

Background location does not work in Expo Go — use a development build.
Native changes (permissions, plugins, SDK upgrades) need a new EAS Build;
everything else ships via EAS Update.

## Deployment

### Backend (Fly.io)

- `fly launch` from the backend dir; app name `babomap`; one `shared-cpu-1x`
  machine; volume mounted at `/data`; `DATABASE_PATH=/data/babomap.db`.
- `min_machines_running = 1`, `auto_stop_machines = false` (SQLite + volume
  must never scale beyond one machine).
- Secrets: `USER_TOKENS`, and `LITESTREAM_REPLICA_URL` +
  `LITESTREAM_ACCESS_KEY_ID` + `LITESTREAM_SECRET_ACCESS_KEY` pointing at a
  private R2 bucket. Litestream restores on an empty volume and replicates
  continuously thereafter.
- Don't log request bodies.

### App

- iOS: local Xcode build onto the one iPhone (`npm run ios:device`). The
  personal Apple team has no active paid membership, which rules out EAS
  Build and TestFlight for iOS but is fine for Xcode's development signing.
- Android: `eas build --profile production --platform android` → APK installed
  directly on the one Android phone.
- `eas update --channel production` for JS-only changes on both. Local iOS
  builds get the channel from `updates.requestHeaders` in `app.config.ts`.

## Order of work

1. **Backend.** Repo scaffold, migrations, auth middleware, four endpoints,
   Dockerfile/fly.toml, deploy. Verify end-to-end with `curl`.
2. **App skeleton.** Expo project, QR setup screen, token in SecureStore, map
   with both markers from `/api/status`, polling.
3. **Foreground posting.** Post a fix on app open. Proves the pipeline.
4. **Background task + offline queue.** Both platforms. Budget the most time
   here; test overnight on both phones.
5. **Sharing toggle** and the paused state on the map.
6. **Distribution.** EAS Update channel, TestFlight, APK; Litestream backup.

## Later

- History trail on the map from `/api/history`.
- Arrival notifications ("arrived home") — geofence on the phone or a server
  job comparing against saved places.
- Battery level on the marker.
- Downsampling of very old history if the DB ever grows past comfort.

## Decisions

- **Map library:** `react-native-maps`. MapLibre remains the fallback if we
  later want Google out of the Android build.
- **iOS stationary heartbeat:** not in v1. iOS only delivers background fixes
  on movement, so a stationary phone's "last fix" caption will age. Mitigate
  with foreground posting on app open and a visibly aged caption past ~2 h.
  Revisit `expo-background-task` (BGTaskScheduler, ≥15 min, best-effort) if
  the ambiguity bothers us in practice; it needs a new EAS build but no API
  or schema change.
