#!/bin/bash
# Beaver AI launcher (Linux / Phase 4D.1).
#
# Replaces the terminal CLI prompt with the Tauri desktop shell. On
# first run this builds the desktop binary (~5 min, one-off); on
# subsequent runs the binary boots in <200 ms.
#
# Pre-built .AppImage lives at packages/desktop/src-tauri/target/release/bundle/appimage/
# once `pnpm --filter @beaver-ai/desktop tauri build` has run. Distribute
# the .AppImage to end users so they don't need pnpm + Rust.
#
# Legacy CLI launcher (terminal prompt) preserved at Start-Beaver-CLI.sh.

set -e
cd "$(dirname "$0")"

APP_BINARY="packages/desktop/src-tauri/target/release/beaver-desktop"

if [ ! -x "$APP_BINARY" ]; then
  echo "Building Beaver desktop app for first run..."
  echo "This is a one-time build (~5 min)."
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm not found. Install from https://pnpm.io and re-run." >&2
    exit 1
  fi
  if ! command -v cargo >/dev/null 2>&1; then
    echo "cargo not found. Install from https://rustup.rs and re-run." >&2
    exit 1
  fi
  if ! pnpm --filter @beaver-ai/desktop tauri build; then
    echo
    echo "Desktop build failed. Falling back to the legacy CLI launcher."
    exec ./Start-Beaver-CLI.sh
  fi
fi

exec "$APP_BINARY"
