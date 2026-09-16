#!/usr/bin/env bash
# Build pupluv and install it on a connected iPhone.
#
#   pnpm ios:device
#
# Needs the phone plugged in, unlocked, trusted, and with Developer Mode on
# (Settings → Privacy & Security → Developer Mode, then restart).
set -euo pipefail

API_URL="${PUBLIC_API_URL:-https://www.pupluv.online}"
BUNDLE_ID="com.pupluv.app"
DERIVED="${TMPDIR:-/tmp}/pupluv-device"
APP="$DERIVED/Build/Products/Release-iphoneos/App.app"
DEVICE_LIST="${TMPDIR:-/tmp}/pupluv-devices.json"

# devicectl prints "Failed to load provisioning paramter list" on every
# invocation, successful ones included. Swallow output unless it actually fails.
devicectl() {
  local out
  if ! out=$(xcrun devicectl "$@" 2>&1); then
    printf '%s\n' "$out" >&2
    return 1
  fi
}

# A device must be *paired*, not merely present: an unpaired phone reports its
# tunnel as "disconnected" rather than "unavailable", so filtering on the tunnel
# alone happily picks one that cannot be installed to.
pick_device() {
  devicectl list devices --json-output "$DEVICE_LIST" || true
  node -e '
    // Wrapped in a function: `node -e` rejects a top-level return.
    const choose = (devices) => {
      const live = (d) => d.connectionProperties?.tunnelState !== "unavailable"
      const paired = (d) => d.connectionProperties?.pairingState === "paired"

      const ready = devices.find((d) => paired(d) && live(d))
      if (ready) return ["ready", ready]

      // Plugged in but never trusted — worth one automatic pairing attempt.
      const pairable = devices.find((d) => !paired(d) && live(d))
      if (pairable) return ["pair", pairable]

      return [null, null]
    }

    let devices = []
    try {
      devices = require(process.argv[1])?.result?.devices ?? []
    } catch {}

    const [state, device] = choose(devices)
    if (state) {
      process.stdout.write(`${state}\t${device.identifier}\t${device.deviceProperties?.name ?? ""}`)
    } else {
      process.stderr.write(
        devices
          .map((d) => {
            const c = d.connectionProperties ?? {}
            const bits = [`pairing=${c.pairingState ?? "?"}`, `connection=${c.tunnelState ?? "?"}`]
            const mode = d.deviceProperties?.developerModeStatus
            if (mode) bits.push(`developer-mode=${mode}`)
            return `  \u00b7 ${d.deviceProperties?.name ?? d.identifier}: ${bits.join(", ")}`
          })
          .join("\n") || "  (no devices known to Xcode at all)",
      )
    }
  ' "$DEVICE_LIST" 2>"${TMPDIR:-/tmp}/pupluv-devices.txt"
}

FOUND=$(pick_device)

if [ "${FOUND%%	*}" = "pair" ]; then
  REST="${FOUND#*	}"
  echo "→ pairing with ${REST#*	} (accept the prompt on the phone)"
  devicectl manage pair --device "${REST%%	*}"
  FOUND=$(pick_device)
fi

if [ "${FOUND%%	*}" != "ready" ]; then
  echo "No iPhone is ready to install to." >&2
  echo >&2
  cat "${TMPDIR:-/tmp}/pupluv-devices.txt" >&2 2>/dev/null || true
  echo >&2
  echo "Fixes, in the order they usually bite:" >&2
  echo "  pairing=unpaired         → unlock the phone, accept 'Trust This Computer'" >&2
  echo "                             AND enter its passcode, then run this again" >&2
  echo "  developer-mode=disabled  → Settings → Privacy & Security → Developer Mode," >&2
  echo "                             then restart the phone" >&2
  echo "  connection=unavailable   → plug it in and unlock it" >&2
  exit 1
fi

REST="${FOUND#*	}"
DEVICE_ID="${REST%%	*}"
DEVICE_NAME="${REST#*	}"
echo "→ target: ${DEVICE_NAME:-$DEVICE_ID}"

# A redirecting origin bakes a broken API base into the app: a cross-origin POST
# does not survive a redirect, because the 3xx carries no CORS headers. This is
# what an apex that forwards to www, or a stray trailing slash, both look like.
PROBE=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$API_URL/api/dogs" || echo '000 ')
case "${PROBE%% *}" in
  30[1278])
    echo "$API_URL redirects to ${PROBE#* }" >&2
    echo "Bake in the origin it lands on instead — a cross-origin POST cannot follow a redirect." >&2
    exit 1
    ;;
esac

echo "→ building the web app against $API_URL"
PUBLIC_API_URL="$API_URL" pnpm build >/dev/null
pnpm exec cap sync ios >/dev/null

echo "→ compiling and signing"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination "generic/platform=iOS" -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates -quiet build 2>/dev/null

echo "→ installing"
devicectl device install app --device "$DEVICE_ID" "$APP"
devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID"

echo "✓ pupluv is on ${DEVICE_NAME:-the device}"
