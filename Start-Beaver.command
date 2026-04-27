#!/bin/bash
# Beaver AI launcher (macOS). Double-click to run (.command extension is
# Finder-recognised). Equivalent: Start-Beaver.bat (Windows), Start-Beaver.sh (Linux).

set -e
cd "$(dirname "$0")"

# Pin the provider to claude-code by default. Codex is opt-in (export
# BEAVER_PROVIDER=codex before launching) — keeps runs working when the
# local Codex / OpenAI account hits its usage cap.
: "${BEAVER_PROVIDER:=claude-code}"
export BEAVER_PROVIDER

echo "Beaver AI v0.1"
echo "Provider: $BEAVER_PROVIDER"
echo

if [ ! -d node_modules ]; then
  echo "node_modules missing. Running pnpm install..."
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm not found. Install from https://pnpm.io and re-run."
    read -n 1 -r -p "Press any key to exit..."
    exit 1
  fi
  pnpm install
fi

if [ ! -d .beaver ]; then
  echo "Initializing .beaver/ ..."
  node --import=tsx packages/cli/src/bin.ts init
fi

# Strip inner double quotes the user may have typed (cmd-style habit)

read -r -p "What should Beaver do? " GOAL
GOAL="${GOAL//\"/}"
if [ -z "$GOAL" ]; then
  echo "No goal provided. Exiting."
  read -n 1 -r -p "Press any key to exit..."
  exit 1
fi

echo
echo "Running: node packages/cli/src/bin.ts run --no-server \"$GOAL\""
echo

node --import=tsx packages/cli/src/bin.ts run --no-server "$GOAL"

echo
read -n 1 -r -p "Press any key to close..."
