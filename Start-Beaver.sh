#!/bin/bash
# Beaver AI launcher (Linux). chmod +x then run.
# Equivalent: Start-Beaver.bat (Windows), Start-Beaver.command (macOS).

set -e
cd "$(dirname "$0")"

echo "Beaver AI v0.1"
echo

if [ ! -d node_modules ]; then
  echo "node_modules missing. Running pnpm install..."
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm not found. Install from https://pnpm.io and re-run."
    exit 1
  fi
  pnpm install
fi

if [ ! -d .beaver ]; then
  echo "Initializing .beaver/ ..."
  node --import=tsx packages/cli/src/bin.ts init
fi

read -r -p "What should Beaver do? " GOAL
GOAL="${GOAL//\"/}"
if [ -z "$GOAL" ]; then
  echo "No goal provided. Exiting."
  exit 1
fi

echo
node --import=tsx packages/cli/src/bin.ts run --no-server "$GOAL"
