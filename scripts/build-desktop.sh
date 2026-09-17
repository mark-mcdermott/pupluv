#!/usr/bin/env bash
# Build the Mac app.
#
#   pnpm desktop:build
#
# Produces pupluv.app and a .dmg. Signs with the Developer ID certificate if the
# keychain has one — an unsigned build still runs, but macOS makes you approve it
# by hand every time it is replaced.
set -euo pipefail

export PUBLIC_API_URL="${PUBLIC_API_URL:-https://www.pupluv.online}"

# A trailing slash makes every API call a 308 to the canonical host, and a
# redirected cross-origin POST arrives without its body.
if [[ "$PUBLIC_API_URL" == */ ]]; then
  echo "PUBLIC_API_URL must not end in a slash: $PUBLIC_API_URL" >&2
  exit 1
fi

IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null \
  | sed -n 's/.*"\(Developer ID Application: .*\)"/\1/p' | head -1)"

if [[ -n "$IDENTITY" ]]; then
  export APPLE_SIGNING_IDENTITY="$IDENTITY"
  echo "signing as: $IDENTITY"
else
  echo "no Developer ID certificate in the keychain — building unsigned" >&2
fi

echo "api: $PUBLIC_API_URL"
pnpm exec tauri build

OUT="desktop/target/release/bundle"
echo
echo "built:"
[[ -d "$OUT/macos" ]] && find "$OUT/macos" -maxdepth 1 -name '*.app'
[[ -d "$OUT/dmg" ]] && find "$OUT/dmg" -maxdepth 1 -name '*.dmg'
