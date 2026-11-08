#!/usr/bin/env bash
# ============================================================
#       OPENCLIP - UNIFIED ONE-CLICK LAUNCHER (macOS & Linux)
# ============================================================

set -e

echo "============================================================"
echo "        OPENCLIP - ONE-CLICK LAUNCHER (macOS & Linux)"
echo "============================================================"
echo ""

# 1. Deteksi direktori proyek
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$SCRIPT_DIR/web"
WORKER_DIR="$SCRIPT_DIR/worker"
STORAGE_DIR="$SCRIPT_DIR/storage"

# Tambahkan path umum binary di macOS (Homebrew M1/M2/M3/M4 & Intel, uv, cargo)
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -f "$HOME/.local/bin/env" ] && source "$HOME/.local/bin/env" 2>/dev/null || true

INSTALL_ONLY=0
if [ "$1" = "--install-only" ] || [ "$1" = "-i" ]; then
    INSTALL_ONLY=1
fi

# 2. Cek apakah dependensi sudah lengkap
NEED_INSTALL=0
[ ! -d "$WEB_DIR/node_modules" ] && NEED_INSTALL=1
[ ! -d "$WORKER_DIR/.venv" ] && NEED_INSTALL=1
[ ! -f "$WORKER_DIR/.env" ] && NEED_INSTALL=1
[ ! -f "$WEB_DIR/.env.local" ] && NEED_INSTALL=1
[ ! -d "$STORAGE_DIR/projects" ] && NEED_INSTALL=1

# Verifikasi better-sqlite3 native module
if command -v node >/dev/null 2>&1 && [ -d "$WEB_DIR/node_modules" ]; then
    if ! node -e "try { require('better-sqlite3'); } catch(e) { process.exit(1); }" >/dev/null 2>&1; then
        NEED_INSTALL=1
    fi
fi

if [ "$INSTALL_ONLY" -eq 1 ]; then
    NEED_INSTALL=1
fi

if [ "$NEED_INSTALL" -eq 1 ]; then
    echo "============================================================"
    echo "      MEMERIKSA DAN MENYIAPKAN DEPENDENSI OPENCLIP"
    echo "============================================================"
    echo ""

    # A. Periksa / Pasang Node.js & npm
    echo "[1/6] Memeriksa Node.js dan npm..."
    if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
        echo "[INFO] Node.js belum terpasang."
        if command -v brew >/dev/null 2>&1; then
            echo "Memasang Node.js via Homebrew..."
            brew install node
        else
            echo "============================================================"
            echo "[ERROR] Node.js (LTS v18 ke atas) belum terpasang!"
            echo "Silakan unduh dari: https://nodejs.org/"
            echo "Atau pasang Homebrew lalu jalankan: brew install node"
            echo "============================================================"
            exit 1
        fi
    fi
    echo "[OK] Node.js terdeteksi: $(node -v)"
    echo "[OK] npm terdeteksi: v$(npm -v)"

    # B. Periksa / Pasang uv (Fast Python Package & Environment Manager)
    echo ""
    echo "[2/6] Memeriksa uv package manager..."
    if ! command -v uv >/dev/null 2>&1; then
        echo "[INFO] uv belum terpasang. Menginstall uv secara otomatis..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
        [ -f "$HOME/.local/bin/env" ] && source "$HOME/.local/bin/env" 2>/dev/null || true
    fi

    if command -v uv >/dev/null 2>&1; then
        echo "[OK] uv terdeteksi: $(uv --version)"
    else
        echo "[PERINGATAN] uv gagal dipasang otomatis, mencoba metode fallback..."
    fi

    # C. Periksa / Pasang Python
    echo ""
    echo "[3/6] Memeriksa Python..."
    if command -v uv >/dev/null 2>&1; then
        # uv dapat mengunduh dan memasang Python 3.12 mandiri untuk macOS (Apple Silicon / Intel)
        echo "Menyiapkan runtime Python 3.12 via uv..."
        uv python install 3.12 || true
        echo "[OK] Runtime Python siap via uv."
    elif command -v python3 >/dev/null 2>&1; then
        echo "[OK] Python sistem terdeteksi: $(python3 --version)"
    else
        if command -v brew >/dev/null 2>&1; then
            echo "Memasang Python via Homebrew..."
            brew install python@3.12
        else
            echo "[ERROR] Python 3 belum terpasang. Unduh dari: https://www.python.org/"
            exit 1
        fi
    fi

    # D. Setup Direktori Storage dan File .env
    echo ""
    echo "[4/6] Menyiapkan direktori storage dan konfigurasi environment..."
    mkdir -p "$STORAGE_DIR/projects" "$STORAGE_DIR/exports" "$STORAGE_DIR/models"

    if [ ! -f "$WORKER_DIR/.env" ] && [ -f "$WORKER_DIR/.env.example" ]; then
        cp "$WORKER_DIR/.env.example" "$WORKER_DIR/.env"
        echo "[OK] Dibuat worker/.env dari template"
    fi
    if [ ! -f "$WEB_DIR/.env.local" ] && [ -f "$WEB_DIR/.env.example" ]; then
        cp "$WEB_DIR/.env.example" "$WEB_DIR/.env.local"
        echo "[OK] Dibuat web/.env.local dari template"
    fi

    # E. Install Dependensi Web Frontend (npm install)
    echo ""
    echo "[5/6] Menginstall dependensi Web Frontend (npm install)..."
    cd "$WEB_DIR"
    if [ ! -d "$WEB_DIR/node_modules" ]; then
        npm install --no-audit --no-fund
    else
        if ! node -e "try { require('better-sqlite3'); } catch(e) { process.exit(1); }" >/dev/null 2>&1; then
            echo "Kompilasi ulang better-sqlite3..."
            npm rebuild better-sqlite3
        fi
    fi

    # F. Install Dependensi AI Worker (uv sync / pip)
    echo ""
    echo "[6/6] Menginstall dependensi AI Worker (Python)..."
    cd "$WORKER_DIR"
    if command -v uv >/dev/null 2>&1; then
        uv sync
    else
        [ ! -d ".venv" ] && python3 -m venv .venv
        .venv/bin/pip install --upgrade pip
        if [ -f "requirements.txt" ]; then
            .venv/bin/pip install -r requirements.txt
        else
            .venv/bin/pip install -e .
        fi
    fi

    # Unduh Font Subtitle jika belum ada
    if command -v uv >/dev/null 2>&1; then
        uv run python scripts/download_fonts.py >/dev/null 2>&1 || true
    else
        .venv/bin/python scripts/download_fonts.py >/dev/null 2>&1 || true
    fi

    # Startup Diagnostic Check
    echo ""
    echo "Menjalankan verifikasi akhir sistem..."
    if command -v uv >/dev/null 2>&1; then
        uv run python main.py --check || true
    else
        .venv/bin/python main.py --check || true
    fi

    echo ""
    echo "============================================================"
    echo "   SETUP DEPENDENSI SELESAI DENGAN SUKSES! (100%)"
    echo "============================================================"
    echo ""

    if [ "$INSTALL_ONLY" -eq 1 ]; then
        echo "Mode install-only selesai."
        exit 0
    fi
fi

# 3. Jalankan Aplikasi di Background
cd "$SCRIPT_DIR"

echo "[1/2] Menyalakan Web Server Next.js (Port 3000)..."
(cd "$WEB_DIR" && npm run dev) &
WEB_PID=$!

echo "[2/2] Menyalakan OpenClip AI Worker (Dual Engine)..."
if command -v uv >/dev/null 2>&1; then
    (cd "$WORKER_DIR" && uv run python main.py --mode all) &
elif [ -f "$WORKER_DIR/.venv/bin/python" ]; then
    (cd "$WORKER_DIR" && .venv/bin/python main.py --mode all) &
else
    (cd "$WORKER_DIR" && python3 main.py --mode all) &
fi
WORKER_PID=$!

# Trap untuk mematikan kedua proses saat script ditutup / Ctrl+C
cleanup() {
    echo ""
    echo "Mematikan server OpenClip..."
    kill $WEB_PID $WORKER_PID 2>/dev/null || true
    wait $WEB_PID $WORKER_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

echo ""
echo "Menunggu server siap (3 detik) dan membuka browser..."
sleep 3

# Buka browser otomatis
if [ "$(uname -s)" = "Darwin" ]; then
    # macOS / MacBook
    open "http://localhost:3000" 2>/dev/null || true
elif command -v xdg-open >/dev/null 2>&1; then
    # Linux desktop
    xdg-open "http://localhost:3000" 2>/dev/null || true
fi

echo ""
echo "============================================================"
echo "  OpenClip Berjalan di: http://localhost:3000"
echo "  - Web Server PID  : $WEB_PID"
echo "  - AI Worker PID   : $WORKER_PID"
echo ""
echo "  Tekan Ctrl+C di terminal ini untuk mematikan aplikasi."
echo "============================================================"
echo ""

wait
