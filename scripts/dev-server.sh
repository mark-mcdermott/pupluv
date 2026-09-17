#!/usr/bin/env bash
# Starts the Astro dev server unless one is already serving.
#
# Tauri runs this as its beforeDevCommand and then waits for devUrl. A second
# `astro dev` would take the next free port and leave the desktop window pointed
# at the first server anyway, so reuse it and say so.
set -euo pipefail

PORT="${PORT:-4321}"

if curl -sf -o /dev/null "http://localhost:$PORT/"; then
  echo "dev server already on :$PORT — reusing it"
  exit 0
fi

exec pnpm dev
