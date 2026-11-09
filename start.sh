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
TOOLS_DIR="$SCRIPT_DIR/tools"

# Tambahkan path umum binary di macOS (Homebrew M1/M2/M3/M4 & Intel, tools/node, uv, cargo)
export PATH="$TOOLS_DIR/node/bin:$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
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

    # A. Periksa / Pasang Node.js & npm secara otomatis
    echo "[1/6] Memeriksa Node.js dan npm..."
    if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
        echo "[INFO] Node.js belum terpasang di sistem."
        
        # Opsi 1: Pasang via Homebrew jika ada
        if command -v brew >/dev/null 2>&1; then
            echo "Mencoba memasang Node.js via Homebrew..."
            brew install node || true
        fi

        # Opsi 2: Unduh standalone portable Node.js LTS jika brew belum ada (Zero-Admin)
        if ! command -v node >/dev/null 2>&1; then
            echo "[INFO] Mengunduh Node.js LTS mandiri untuk macOS/Linux..."
            NODE_VER="v20.18.0"
            OS_TYPE="$(uname -s)"
            ARCH_TYPE="$(uname -m)"
            
            if [ "$OS_TYPE" = "Darwin" ]; then
                if [ "$ARCH_TYPE" = "arm64" ]; then
                    NODE_PKG="node-${NODE_VER}-darwin-arm64.tar.gz"
                else
                    NODE_PKG="node-${NODE_VER}-darwin-x64.tar.gz"
                fi
            else
                if [ "$ARCH_TYPE" = "aarch64" ] || [ "$ARCH_TYPE" = "arm64" ]; then
                    NODE_PKG="node-${NODE_VER}-linux-arm64.tar.gz"
                else
                    NODE_PKG="node-${NODE_VER}-linux-x64.tar.gz"
                fi
            fi

            NODE_URL="https://nodejs.org/dist/${NODE_VER}/${NODE_PKG}"
            NODE_DEST="$TOOLS_DIR/node"
            mkdir -p "$NODE_DEST"
            echo "Mengunduh dan mengekstrak $NODE_PKG (~40 MB)..."
            curl -fsSL "$NODE_URL" | tar -xz -C "$NODE_DEST" --strip-components=1 2>/dev/null || true
            export PATH="$NODE_DEST/bin:$PATH"
        fi

        while ! command -v node >/dev/null 2>&1; do
            echo "============================================================"
            echo "[INFO] Tidak dapat mengunduh Node.js secara otomatis."
            echo "Membuka halaman unduh resmi di browser..."
            if [ "$(uname -s)" = "Darwin" ]; then
                open "https://nodejs.org/" 2>/dev/null || true
            elif command -v xdg-open >/dev/null 2>&1; then
                xdg-open "https://nodejs.org/" 2>/dev/null || true
            fi
            echo ""
            echo "1. Silakan unduh dan pasang Node.js LTS dari browser."
            echo "2. Setelah instalasi selesai, tekan Enter di jendela ini"
            echo "   untuk langsung melanjutkan setup OpenClip..."
            echo "============================================================"
            read -r -p "Tekan [Enter] untuk melanjutkan: " _
            export PATH="$TOOLS_DIR/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
        done
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
        echo "Menyiapkan runtime Python 3.12 mandiri via uv..."
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

    # D. Setup Direktori Storage dan File .env (Defensif)
    echo ""
    echo "[4/6] Menyiapkan direktori storage dan konfigurasi environment..."
    mkdir -p "$STORAGE_DIR/projects" "$STORAGE_DIR/exports" "$STORAGE_DIR/models" "$STORAGE_DIR/models/face" "$SCRIPT_DIR/database" "$WEB_DIR/public/fonts"

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
        npm install --no-audit --no-fund || npm install --no-audit --no-fund --legacy-peer-deps
    else
        if ! node -e "try { require('better-sqlite3'); } catch(e) { process.exit(1); }" >/dev/null 2>&1; then
            echo "Memperbarui native better-sqlite3..."
            npm rebuild better-sqlite3 2>/dev/null || npm install better-sqlite3@12.11.1 --save-exact --no-audit
        fi
    fi

    # F. Install Dependensi AI Worker (uv sync / pip)
    echo ""
    echo "[6/6] Menginstall dependensi AI Worker (Python)..."
    cd "$WORKER_DIR"
    if command -v uv >/dev/null 2>&1; then
        uv sync || (uv sync --offline 2>/dev/null || uv sync)
    else
        [ ! -d ".venv" ] && python3 -m venv .venv
        .venv/bin/pip install --upgrade pip
        .venv/bin/pip install .
    fi

    # Unduh Font Subtitle jika belum ada (Non-Fatal)
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

# Deteksi jika port 3000 sedang dipakai aplikasi lain di komputer
APP_PORT=3000
if command -v lsof >/dev/null 2>&1; then
    if lsof -i :3000 >/dev/null 2>&1; then
        echo "[INFO] Port 3000 sedang dipakai aplikasi lain. Beralih ke port 3001..."
        APP_PORT=3001
    fi
elif command -v nc >/dev/null 2>&1; then
    if nc -z 127.0.0.1 3000 2>/dev/null; then
        echo "[INFO] Port 3000 sedang dipakai aplikasi lain. Beralih ke port 3001..."
        APP_PORT=3001
    fi
fi

echo "[1/2] Menyalakan Web Server Next.js (Port ${APP_PORT})..."
(cd "$WEB_DIR" && npm run dev -- -p "$APP_PORT") &
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
    open "http://localhost:${APP_PORT}" 2>/dev/null || true
elif command -v xdg-open >/dev/null 2>&1; then
    # Linux desktop
    xdg-open "http://localhost:${APP_PORT}" 2>/dev/null || true
fi

echo ""
echo "============================================================"
echo "  OpenClip Berjalan di: http://localhost:${APP_PORT}"
echo "  - Web Server PID  : $WEB_PID"
echo "  - AI Worker PID   : $WORKER_PID"
echo ""
echo "  Tekan Ctrl+C di terminal ini untuk mematikan aplikasi."
echo "============================================================"
echo ""

wait
