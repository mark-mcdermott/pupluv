#!/usr/bin/env bash
# Build the Mac app and put it in /Applications.
#
#   pnpm desktop:install [destination]
#
# The sibling of `pnpm ios:device`: one command from source to something you can
# open from Spotlight. Defaults to /Applications; pass a directory to put it
# somewhere else.
set -euo pipefail

BUILT="desktop/target/release/bundle/macos/pupluv.app"
DEST="${1:-/Applications}"
TARGET="$DEST/pupluv.app"

bash "$(dirname "$0")/build-desktop.sh"

if [[ ! -d "$BUILT" ]]; then
  echo "no app at $BUILT" >&2
  exit 1
fi

# Replaced rather than merged: a stale file left inside the bundle breaks the
# signature, and macOS then refuses to open it at all.
if [[ -d "$TARGET" ]]; then
  echo "replacing the copy already in $DEST"
  rm -rf "$TARGET"
fi

cp -R "$BUILT" "$TARGET"
echo "installed: $TARGET"
