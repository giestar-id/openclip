#!/usr/bin/env bash
# OpenClip - Dual Worker Daemon (macOS & Linux)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -f "$HOME/.local/bin/env" ] && source "$HOME/.local/bin/env" 2>/dev/null || true

cd "$SCRIPT_DIR/worker"

if command -v uv >/dev/null 2>&1; then
    exec uv run python main.py --mode all
elif [ -f ".venv/bin/python" ]; then
    exec .venv/bin/python main.py --mode all
else
    exec python3 main.py --mode all
fi

