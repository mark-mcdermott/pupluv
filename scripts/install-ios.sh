#!/usr/bin/env bash
# Build pupluv and install it on a connected iPhone.
#
#   pnpm ios:device
#
# Requires the phone plugged in, trusted, and with Developer Mode on
# (Settings → Privacy & Security → Developer Mode, then restart).
set -euo pipefail

API_URL="${PUBLIC_API_URL:-https://pupluv.vercel.app}"
BUNDLE_ID="com.pupluv.app"
DERIVED="${TMPDIR:-/tmp}/pupluv-device"
APP="$DERIVED/Build/Products/Release-iphoneos/App.app"

device_json=$(xcrun devicectl list devices --json-output /dev/stdout 2>/dev/null || echo '{}')
DEVICE=$(node -e '
  let raw = ""
  process.stdin.on("data", (c) => (raw += c)).on("end", () => {
    let devices = []
    try {
      devices = JSON.parse(raw.slice(raw.indexOf("{")))?.result?.devices ?? []
    } catch {}
    const ready = devices.find(
      (d) => d.connectionProperties?.tunnelState !== "unavailable",
    )
    process.stdout.write(ready ? `${ready.identifier}\t${ready.deviceProperties?.name ?? ""}` : "")
  })
' <<< "$device_json")

if [ -z "$DEVICE" ]; then
  echo "No iPhone is reachable. Check that it is:" >&2
  echo "  · plugged in, unlocked, and 'Trust This Computer' accepted" >&2
  echo "  · Developer Mode on (Settings → Privacy & Security → Developer Mode, then restart)" >&2
  echo >&2
  echo "Devices Xcode knows about:" >&2
  xcrun devicectl list devices 2>/dev/null | tail -n +2 >&2
  exit 1
fi

DEVICE_ID="${DEVICE%%$'\t'*}"
DEVICE_NAME="${DEVICE#*$'\t'}"
echo "→ target: ${DEVICE_NAME:-$DEVICE_ID}"

echo "→ building the web app against $API_URL"
PUBLIC_API_URL="$API_URL" pnpm build >/dev/null
pnpm exec cap sync ios >/dev/null

echo "→ compiling and signing"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination "generic/platform=iOS" -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates -quiet build

echo "→ installing"
xcrun devicectl device install app --device "$DEVICE_ID" "$APP" >/dev/null
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID" >/dev/null

echo "✓ pupluv is on ${DEVICE_NAME:-the device}"
