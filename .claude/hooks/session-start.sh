#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if [ -f "$HOME/.config/vite-plus/env" ]; then
  . "$HOME/.config/vite-plus/env"
fi

if ! command -v vp >/dev/null 2>&1; then
  if ! (curl -fsSL https://vite.plus | VP_NODE_MANAGER=no bash >&2); then
    work="$(mktemp -d)"
    (cd "$work" && npm pack -q "@voidzero-dev/vite-plus-cli-linux-x64-gnu@1.1.0" >&2 && tar xzf ./*.tgz)
    mkdir -p "$HOME/.local/bin"
    install -m 755 "$work/package/vp" "$HOME/.local/bin/vp"
    rm -rf "$work"
    "$HOME/.local/bin/vp" env setup >&2
  fi
  . "$HOME/.config/vite-plus/env"
fi

echo ". \"$HOME/.config/vite-plus/env\"" >>"$CLAUDE_ENV_FILE"
echo "export NODE_USE_ENV_PROXY=1" >>"$CLAUDE_ENV_FILE"

cd "$CLAUDE_PROJECT_DIR"
vp env on >&2
vp install --frozen-lockfile >&2
