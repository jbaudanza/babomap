#!/bin/sh
# Generate a user token and show it as a QR code for the phone to scan.
#   sh scripts/token.sh jon
# Then put "jon:<token>" into USER_TOKENS (fly secrets set USER_TOKENS=...).
set -e
name="${1:?usage: token.sh <name>}"
token="$(openssl rand -hex 32)"
echo "$name:$token"
echo
if command -v qrencode >/dev/null 2>&1; then
  qrencode -t ansiutf8 "$token"
else
  echo "(install qrencode to display a QR code: brew install qrencode)"
fi
