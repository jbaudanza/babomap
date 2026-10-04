# BaboMap backend

Express + better-sqlite3 on one Fly.io machine. See `../PLAN.md` for the design.

## Run locally

```bash
npm install
cp .env.example .env            # then paste real tokens from scripts/token.sh
set -a; . ./.env; set +a
npm run dev
```

In another shell: `TOKEN=<jon token> npm run smoke`.

## Tokens

```bash
sh scripts/token.sh jon        # prints "jon:<hex>" and a QR code for the phone
sh scripts/token.sh wife
```

`USER_TOKENS` is `name:token,name:token`. Rotate a token by regenerating it,
updating the secret, and re-scanning on that one phone.

## Deploy

```bash
fly launch --no-deploy --copy-config      # accept the app name from fly.toml
fly volumes create data --size 1 --region sjc
fly secrets set USER_TOKENS='jon:<hex>,wife:<hex>'
fly deploy
```

Optional continuous backup with Litestream (recommended once real data flows):

```bash
fly secrets set LITESTREAM_REPLICA_URL=s3://<bucket>/babomap.db \
  LITESTREAM_ACCESS_KEY_ID=... LITESTREAM_SECRET_ACCESS_KEY=... \
  AWS_ENDPOINT=https://<account>.r2.cloudflarestorage.com
```

## API

All `/api/*` routes need `Authorization: Bearer <token>` and JSON bodies.

| Method | Path             | Body / query                 |
|--------|------------------|------------------------------|
| POST   | `/api/locations` | `{ points: [...] }` (≤ 1000) |
| GET    | `/api/status`    | —                            |
| PUT    | `/api/sharing`   | `{ enabled: boolean }`       |
| GET    | `/api/history`   | `?user=&from=&to=` (ms)      |
| GET    | `/healthz`       | no auth                      |
