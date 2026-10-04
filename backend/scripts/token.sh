#!/bin/sh
# Generate a user token and show the setup QR code for that phone to scan.
#   sh scripts/token.sh jon https://babomap.fly.dev
# Then put "jon:<token>" into USER_TOKENS (fly secrets set USER_TOKENS=...).
# The QR encodes {"url":...,"token":...}; the app stores both in the keychain.
set -e
name="${1:?usage: token.sh <name> <server-url>}"
url="${2:?usage: token.sh <name> <server-url>}"
url="${url%/}"
token="$(openssl rand -hex 32)"
echo "$name:$token"
echo
payload="{\"url\":\"$url\",\"token\":\"$token\"}"
if command -v qrencode >/dev/null 2>&1; then
  qrencode -t ansiutf8 "$payload"
else
  echo "$payload"
  echo "(install qrencode to display this as a QR code: brew install qrencode)"
fi
