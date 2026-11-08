#!/usr/bin/env bash
# OpenClip - Setup Dependensi (macOS & Linux)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/start.sh" --install-only "$@"

