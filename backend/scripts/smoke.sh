#!/bin/sh
# End-to-end check against a running server.
#   BASE=http://localhost:8080 TOKEN=<jon token> sh scripts/smoke.sh
set -e
BASE="${BASE:-http://localhost:8080}"
: "${TOKEN:?set TOKEN to a configured user token}"
H="Authorization: Bearer $TOKEN"
J="Content-Type: application/json"
now=$(($(date +%s) * 1000))

echo "# healthz";              curl -sf "$BASE/healthz"; echo
echo "# no auth -> 401";       curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/status"
echo "# bad token -> 401";     curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/status" -H "Authorization: Bearer nope"
echo "# post 2 points";        curl -sf -X POST "$BASE/api/locations" -H "$H" -H "$J" \
  -d "{\"points\":[{\"recorded_at\":$((now-60000)),\"lat\":37.5665,\"lon\":126.978,\"accuracy\":12,\"source\":\"background\"},{\"recorded_at\":$now,\"lat\":37.5670,\"lon\":126.979,\"accuracy\":8,\"source\":\"foreground\"}]}"; echo
echo "# repost -> inserted 0"; curl -sf -X POST "$BASE/api/locations" -H "$H" -H "$J" \
  -d "{\"points\":[{\"recorded_at\":$now,\"lat\":37.5670,\"lon\":126.979}]}"; echo
echo "# status";               curl -sf "$BASE/api/status" -H "$H"; echo
echo "# sharing off";          curl -sf -X PUT "$BASE/api/sharing" -H "$H" -H "$J" -d '{"enabled":false}'; echo
echo "# sharing on";           curl -sf -X PUT "$BASE/api/sharing" -H "$H" -H "$J" -d '{"enabled":true}'; echo
echo "# history (last 24h)";   curl -sf "$BASE/api/history" -H "$H"; echo
echo "# bad point -> 400";     curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/locations" -H "$H" -H "$J" -d '{"points":[{"recorded_at":1,"lat":999,"lon":0}]}'
echo "# bad json -> 400";      curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/locations" -H "$H" -H "$J" -d '{nope'
echo "# not json -> 415";      curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/locations" -H "$H" -d 'x=1'
