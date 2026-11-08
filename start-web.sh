#!/usr/bin/env bash
# OpenClip - Web Server Launcher (macOS & Linux)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$SCRIPT_DIR/tools/node/bin:$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -f "$HOME/.local/bin/env" ] && source "$HOME/.local/bin/env" 2>/dev/null || true

cd "$SCRIPT_DIR/web"
exec npm run dev
