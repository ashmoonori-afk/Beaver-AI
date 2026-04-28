#!/bin/bash
# Beaver AI launcher (macOS / Phase 4D.1).
#
# Replaces the terminal CLI prompt with the Tauri desktop shell. On
# first run this builds the desktop binary (~5 min, one-off); on
# subsequent runs the .app boots in <200 ms.
#
# Pre-built .dmg lives at packages/desktop/src-tauri/target/release/bundle/dmg/
# once `pnpm --filter @beaver-ai/desktop tauri build` has run. Distribute
# the .dmg to end users so they don't need pnpm + Rust.
#
# Legacy CLI launcher (terminal prompt) preserved at Start-Beaver-CLI.command.

set -e
cd "$(dirname "$0")"

APP_BUNDLE="packages/desktop/src-tauri/target/release/bundle/macos/Beaver.app"
APP_BINARY="packages/desktop/src-tauri/target/release/beaver-desktop"

if [ ! -d "$APP_BUNDLE" ] && [ ! -x "$APP_BINARY" ]; then
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
    exec ./Start-Beaver-CLI.command
  fi
fi

if [ -d "$APP_BUNDLE" ]; then
  open "$APP_BUNDLE"
else
  exec "$APP_BINARY"
fi
