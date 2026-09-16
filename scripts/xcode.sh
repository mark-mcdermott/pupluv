#!/usr/bin/env bash
# Runs a ruby script against the Xcode project using the xcodeproj gem that
# ships inside Homebrew's CocoaPods, so nothing has to be installed globally.
set -euo pipefail

GEMS=$(ls -d /opt/homebrew/Cellar/cocoapods/*/libexec/gems 2>/dev/null | tail -1)
if [ -z "$GEMS" ]; then
  echo "xcodeproj not found. Install CocoaPods: brew install cocoapods" >&2
  exit 1
fi

ARGS=()
while IFS= read -r dir; do ARGS+=("-I$dir"); done < <(find "$GEMS" -maxdepth 2 -type d -name lib)
exec ruby "${ARGS[@]}" "$@"
