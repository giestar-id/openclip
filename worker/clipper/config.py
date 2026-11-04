"""Konfigurasi worker.

API key HANYA dibaca dari file .env milik worker (F-74) dan tidak pernah
ditulis ke database atau dikirim ke browser. Pengaturan non-rahasia (mode
transkrip, model, provider LLM) dibaca dari tabel `settings` (F-71).
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

WORKER_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = WORKER_DIR.parent


def reload_env() -> None:
    """Muat ulang file .env dari beberapa lokasi standar dengan override=True."""
    env_paths = [
        WORKER_DIR / ".env",
        ROOT_DIR / ".env",
        ROOT_DIR.parent / ".env",
        ROOT_DIR / "web" / ".env.local",
    ]
    for p in env_paths:
        if p.exists() and p.is_file():
            try:
                load_dotenv(p, override=True)
            except Exception:
                pass


reload_env()


def _path(env_name: str, default: Path) -> Path:
    raw = os.getenv(env_name, "").strip()
    if not raw:
        return default
    p = Path(raw)
    if not p.is_absolute():
        p = (ROOT_DIR / p).resolve()
    elif not p.exists() and default.parent.exists():
        # Path hardcoded dari copy folder lain yang tidak ada di lokasi baru
        return default
    return p


DB_PATH = _path("DB_PATH", ROOT_DIR / "database" / "clipper.db")
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "ai_clipper")

STORAGE_DIR = _path("STORAGE_DIR", ROOT_DIR / "storage")
MODELS_DIR = _path("MODELS_DIR", STORAGE_DIR / "models")
MODELS_DIR.mkdir(parents=True, exist_ok=True)
os.environ["HF_HOME"] = str(MODELS_DIR)
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

FONTS_DIR = _path("FONTS_DIR", ROOT_DIR / "web" / "public" / "fonts")

FFMPEG_PATH = os.getenv("FFMPEG_PATH", "").strip()

POLL_INTERVAL = float(os.getenv("POLL_INTERVAL", "2"))
MAX_VIDEO_MINUTES = float(os.getenv("MAX_VIDEO_MINUTES", "180"))
PREVIEW_PADDING_SEC = float(os.getenv("PREVIEW_PADDING_SEC", "10"))
PREVIEW_HEIGHT = int(os.getenv("PREVIEW_HEIGHT", "1080"))

# ---- API keys (bisa dari database settings UI atau worker/.env) ----
def _clean_api_key(raw: str | None) -> str:
    if not raw:
        return ""
    val = raw.strip()
    # Bersihkan prefix variabel jika tidak sengaja tertempel (misal "GEMINI_API_KEY=AQ...")
    val = re.sub(r"^(?:export\s+)?[A-Za-z0-9_]+\s*=\s*", "", val).strip()
    # Bersihkan tanda petik pembungkus
    val = re.sub(r"^[\"'](.*)[\"']$", r"\1", val).strip()
    # Bersihkan jika hanya placeholder template murni
    if val.upper() in (
        "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY",
        "YOUR_API_KEY_HERE", "NONE", "NULL", "UNDEFINED", ""
    ):
        return ""
    return val


def get_key_details(provider: str) -> dict[str, Any]:
    """Cari key di DB settings lalu di os.environ / .env dengan pelaporan sumber."""
    reload_env()
    provider = provider.lower()

    aliases = {
        "groq": ["groq_api_key", "GROQ_API_KEY", "groq_key", "GROQ_KEY"],
        "openai": ["openai_api_key", "OPENAI_API_KEY", "openai_key", "OPENAI_KEY"],
        "anthropic": ["anthropic_api_key", "ANTHROPIC_API_KEY", "claude_api_key", "CLAUDE_API_KEY", "anthropic_key"],
        "gemini": ["gemini_api_key", "GEMINI_API_KEY", "gemini_key", "GEMINI_KEY", "google_api_key", "GOOGLE_API_KEY"],
    }.get(provider, [f"{provider}_api_key", f"{provider.upper()}_API_KEY"])

    # 1. Cek dari database settings
    try:
        from . import db
        s = db.get_settings()
        for a in aliases:
            k = _clean_api_key(s.get(a) or s.get(a.lower()) or s.get(a.upper()))
            if k:
                masked = k[:6] + "..." + k[-4:] if len(k) > 10 else "***"
                return {"available": True, "key": k, "source": "Database Settings", "masked": masked}
    except Exception:
        pass

    # 2. Cek dari environment variables / .env
    for a in aliases:
        env_val = _clean_api_key(os.getenv(a.upper()) or os.getenv(a.lower()) or os.getenv(a))
        if env_val:
            masked = env_val[:6] + "..." + env_val[-4:] if len(env_val) > 10 else "***"
            return {"available": True, "key": env_val, "source": "File .env", "masked": masked}

    return {"available": False, "key": "", "source": "Tidak ditemukan", "masked": "-"}


def get_groq_key() -> str:
    return get_key_details("groq")["key"]


def get_openai_key() -> str:
    return get_key_details("openai")["key"]


def get_anthropic_key() -> str:
    return get_key_details("anthropic")["key"]


def get_gemini_key() -> str:
    return get_key_details("gemini")["key"]


def key_status() -> dict[str, bool]:
    """Hanya status ada/tidaknya key (boolean) - aman untuk pemeriksaan cepat."""
    return {
        "groq": bool(get_groq_key()),
        "openai": bool(get_openai_key()),
        "anthropic": bool(get_anthropic_key()),
        "gemini": bool(get_gemini_key()),
    }


def key_info() -> dict[str, dict[str, Any]]:
    """Status lengkap dengan informasi sumber dan masked key untuk logging informatif."""
    return {
        "groq": get_key_details("groq"),
        "openai": get_key_details("openai"),
        "anthropic": get_key_details("anthropic"),
        "gemini": get_key_details("gemini"),
    }


def __getattr__(name: str) -> Any:
    if name == "GROQ_API_KEY":
        return get_groq_key()
    if name == "OPENAI_API_KEY":
        return get_openai_key()
    if name == "ANTHROPIC_API_KEY":
        return get_anthropic_key()
    if name == "GEMINI_API_KEY":
        return get_gemini_key()
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")


# Model default per provider (bisa dioverride lewat .env)
GROQ_WHISPER_MODEL = os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3")
OPENAI_WHISPER_MODEL = os.getenv("OPENAI_WHISPER_MODEL", "whisper-1")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")
OPENAI_LLM_MODEL = os.getenv("OPENAI_LLM_MODEL", "gpt-4o-mini")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
GEMINI_TRANSCRIBE_MODEL = os.getenv("GEMINI_TRANSCRIBE_MODEL", "gemini-3.5-flash")


def project_dir(project_id: int) -> Path:
    d = STORAGE_DIR / "projects" / str(project_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def rel_storage(path: Path) -> str:
    """Path relatif terhadap STORAGE_DIR (yang disimpan di database)."""
    return Path(path).resolve().relative_to(STORAGE_DIR.resolve()).as_posix()


def abs_storage(rel: str) -> Path:
    return (STORAGE_DIR / rel).resolve()
