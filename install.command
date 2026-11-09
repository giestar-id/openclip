#!/usr/bin/env bash
# OpenClip - macOS Finder One-Click Installer
# Klik dua kali file ini di Finder untuk menginstall seluruh dependensi di Mac/MacBook

cd "$(dirname "$0")"
exec ./start.sh --install-only "$@"

