"""Model Discovery Dinamis untuk AI Providers (Gemini, OpenAI, Groq, Anthropic).

Mengambil daftar model yang aktif langsung dari API provider secara dinamis,
menyaring model yang kompatibel untuk Transkripsi Audio & Analisis Viral LLM,
dan menyediakan caching serta graceful fallback jika jaringan bermasalah.
"""
from __future__ import annotations

import logging
import re
import time
from typing import Any

import requests

from . import config

logger = logging.getLogger(__name__)

# Cache in-memory: { cache_key: { "timestamp": float, "models": list[str] } }
_CACHE: dict[str, dict[str, Any]] = {}
CACHE_TTL_SEC = 1800  # 30 menit


def _get_cached(key: str) -> list[str] | None:
    entry = _CACHE.get(key)
    if entry and (time.time() - entry["timestamp"] < CACHE_TTL_SEC):
        return entry["models"]
    return None


def _set_cache(key: str, models: list[str]) -> None:
    _CACHE[key] = {"timestamp": time.time(), "models": models}


# =====================================================================
# 1. GOOGLE GEMINI DISCOVERY
# =====================================================================

def fetch_gemini_models() -> dict[str, list[str]]:
    """Mengambil daftar model aktif dari Google Gemini API.
    
    Returns:
        dict dengan key 'transcribe' dan 'llm' yang berisi daftar nama model siap pakai.
    """
    cached_tr = _get_cached("gemini_transcribe")
    cached_llm = _get_cached("gemini_llm")
    if cached_tr and cached_llm:
        return {"transcribe": cached_tr, "llm": cached_llm}

    key = config.GEMINI_API_KEY
    if not key:
        return _gemini_defaults()

    url = "https://generativelanguage.googleapis.com/v1beta/models"
    headers = {"x-goog-api-key": key}
    try:
        resp = requests.get(url, headers=headers, timeout=12)
        if resp.status_code != 200:
            logger.warning("Gemini model discovery status=%d: %s", resp.status_code, resp.text[:120])
            return _gemini_defaults()

        items = resp.json().get("models", [])
        transcribe_cands: list[str] = []
        llm_cands: list[str] = []

        # Model yang diketahui sudah deprecated atau khusus media non-speech
        deprecated = {"gemini-2.5-flash", "models/gemini-2.5-flash"}
        skip_patterns = [r"-image", r"-tts", r"-embedding"]

        for item in items:
            name = item.get("name", "").replace("models/", "")
            methods = item.get("supportedGenerationMethods", [])
            if "generateContent" not in methods or name in deprecated:
                continue
            if any(re.search(pat, name) for pat in skip_patterns):
                continue

            # Klasifikasi untuk transcribe & LLM
            # Flash models sangat ideal untuk audio multimodal & analisis cepat
            if "flash" in name:
                transcribe_cands.append(name)
                llm_cands.append(name)
            elif "pro" in name:
                llm_cands.append(name)

        # Urutkan: dahulukan versi 3.8, 3.5, latest, dst.
        def _score_model(m: str) -> int:
            score = 0
            if "3.8" in m and "lite" not in m:
                score += 100
            elif "3.5" in m and "lite" not in m:
                score += 90
            elif "latest" in m:
                score += 85
            elif "3.8" in m:
                score += 80
            elif "3.5" in m:
                score += 75
            elif "3.6" in m or "3.7" in m:
                score += 70
            elif "lite" in m:
                score += 50
            return score

        transcribe_cands.sort(key=_score_model, reverse=True)
        llm_cands.sort(key=_score_model, reverse=True)

        # Pastikan tidak kosong
        if not transcribe_cands:
            transcribe_cands = _gemini_defaults()["transcribe"]
        if not llm_cands:
            llm_cands = _gemini_defaults()["llm"]

        _set_cache("gemini_transcribe", transcribe_cands)
        _set_cache("gemini_llm", llm_cands)
        logger.info(
            "Gemini Discovery: Menemukan %d model multimodal (utama: %s)",
            len(transcribe_cands),
            transcribe_cands[0] if transcribe_cands else "none",
        )
        return {"transcribe": transcribe_cands, "llm": llm_cands}

    except Exception as e:
        logger.warning("Gagal fetch Gemini models: %s (menggunakan default fallback)", e)
        return _gemini_defaults()


def _gemini_defaults() -> dict[str, list[str]]:
    defaults = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.8-flash-lite"]
    return {"transcribe": defaults, "llm": defaults}


# =====================================================================
# 2. OPENAI DISCOVERY
# =====================================================================

def fetch_openai_models() -> dict[str, list[str]]:
    """Mengambil model aktif dari OpenAI API."""
    cached_tr = _get_cached("openai_transcribe")
    cached_llm = _get_cached("openai_llm")
    if cached_tr and cached_llm:
        return {"transcribe": cached_tr, "llm": cached_llm}

    key = config.OPENAI_API_KEY
    if not key:
        return _openai_defaults()

    url = "https://api.openai.com/v1/models"
    headers = {"Authorization": f"Bearer {key}"}
    try:
        resp = requests.get(url, headers=headers, timeout=12)
        if resp.status_code != 200:
            return _openai_defaults()

        items = resp.json().get("data", [])
        llm_cands: list[str] = []
        transcribe_cands: list[str] = []

        for item in items:
            m_id = item.get("id", "")
            if m_id.startswith("whisper"):
                transcribe_cands.append(m_id)
            elif any(m_id.startswith(p) for p in ("gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo")):
                llm_cands.append(m_id)

        # Prioritaskan gpt-4o-mini untuk efisiensi & kecepatan
        def _score_openai(m: str) -> int:
            if m == "gpt-4o-mini":
                return 100
            if m == "gpt-4o":
                return 90
            if "turbo" in m:
                return 70
            return 50

        llm_cands.sort(key=_score_openai, reverse=True)
        if not transcribe_cands:
            transcribe_cands = ["whisper-1"]
        if not llm_cands:
            llm_cands = _openai_defaults()["llm"]

        _set_cache("openai_transcribe", transcribe_cands)
        _set_cache("openai_llm", llm_cands)
        logger.info("OpenAI Discovery: Menemukan %d model (utama: %s)", len(llm_cands), llm_cands[0])
        return {"transcribe": transcribe_cands, "llm": llm_cands}
    except Exception as e:
        logger.warning("Gagal fetch OpenAI models: %s", e)
        return _openai_defaults()


def _openai_defaults() -> dict[str, list[str]]:
    return {
        "transcribe": ["whisper-1"],
        "llm": ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
    }


# =====================================================================
# 3. GROQ DISCOVERY
# =====================================================================

def fetch_groq_models() -> dict[str, list[str]]:
    """Mengambil model aktif dari Groq API."""
    cached_tr = _get_cached("groq_transcribe")
    cached_llm = _get_cached("groq_llm")
    if cached_tr and cached_llm:
        return {"transcribe": cached_tr, "llm": cached_llm}

    key = config.GROQ_API_KEY
    if not key:
        return _groq_defaults()

    url = "https://api.groq.com/openai/v1/models"
    headers = {"Authorization": f"Bearer {key}"}
    try:
        resp = requests.get(url, headers=headers, timeout=12)
        if resp.status_code != 200:
            return _groq_defaults()

        items = resp.json().get("data", [])
        transcribe_cands: list[str] = []
        llm_cands: list[str] = []

        for item in items:
            m_id = item.get("id", "")
            if "whisper" in m_id.lower():
                transcribe_cands.append(m_id)
            elif any(k in m_id.lower() for k in ("llama", "qwen", "gpt-oss", "mixtral", "gemma")):
                if "guard" not in m_id.lower() and "safeguard" not in m_id.lower():
                    llm_cands.append(m_id)

        # Prioritaskan whisper-large-v3
        transcribe_cands.sort(key=lambda m: 100 if "large-v3" in m else 50, reverse=True)
        llm_cands.sort(key=lambda m: 100 if "120b" in m else (90 if "qwen" in m or "70b" in m else 50), reverse=True)

        if not transcribe_cands:
            transcribe_cands = _groq_defaults()["transcribe"]
        if not llm_cands:
            llm_cands = _groq_defaults()["llm"]

        _set_cache("groq_transcribe", transcribe_cands)
        _set_cache("groq_llm", llm_cands)
        logger.info("Groq Discovery: Menemukan model whisper: %s, LLM: %s", transcribe_cands, llm_cands)
        return {"transcribe": transcribe_cands, "llm": llm_cands}
    except Exception as e:
        logger.warning("Gagal fetch Groq models: %s", e)
        return _groq_defaults()


def _groq_defaults() -> dict[str, list[str]]:
    return {
        "transcribe": ["whisper-large-v3", "whisper-large-v3-turbo"],
        "llm": ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "llama-3.3-70b-versatile"],
    }


# =====================================================================
# 4. ANTHROPIC DISCOVERY / DEFAULTS
# =====================================================================

def fetch_anthropic_models() -> dict[str, list[str]]:
    """Mengambil model aktif dari Anthropic API secara dinamis."""
    cached_llm = _get_cached("anthropic_llm")
    if cached_llm:
        return {"transcribe": [], "llm": cached_llm}

    defaults = [
        "claude-3-7-sonnet-20250219",
        "claude-3-5-sonnet-latest",
        "claude-3-5-haiku-latest",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-sonnet-20240229",
    ]

    key = config.ANTHROPIC_API_KEY
    if not key:
        return {"transcribe": [], "llm": defaults}

    url = "https://api.anthropic.com/v1/models"
    headers = {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
    }
    try:
        resp = requests.get(url, headers=headers, timeout=12)
        if resp.status_code == 200:
            items = resp.json().get("data", [])
            llm_cands: list[str] = [item.get("id", "") for item in items if item.get("id")]
            if llm_cands:
                def _score_claude(m: str) -> int:
                    if "3-7" in m or "3.7" in m:
                        return 100
                    if "3-5-sonnet" in m or "3.5-sonnet" in m:
                        return 90
                    if "3-5-haiku" in m or "3.5-haiku" in m:
                        return 85
                    if "latest" in m:
                        return 80
                    return 50
                llm_cands.sort(key=_score_claude, reverse=True)
                _set_cache("anthropic_llm", llm_cands)
                logger.info("Anthropic Discovery: Menemukan %d model (utama: %s)", len(llm_cands), llm_cands[0])
                return {"transcribe": [], "llm": llm_cands}
    except Exception as e:
        logger.warning("Gagal fetch Anthropic models: %s", e)

    return {"transcribe": [], "llm": defaults}


# =====================================================================
# 5. UNIFIED DISCOVERY API
# =====================================================================

def get_active_models(provider: str, task: str = "llm") -> list[str]:
    """Mendapatkan daftar model siap pakai secara dinamis berdasarkan provider dan tugasnya.
    
    Args:
        provider: 'gemini', 'openai', 'groq', atau 'anthropic'
        task: 'transcribe' atau 'llm'
    
    Returns:
        List nama model aktif yang diurutkan dari yang paling optimal.
    """
    prov = (provider or "").strip().lower()
    t = task.strip().lower()

    if prov == "gemini":
        data = fetch_gemini_models()
    elif prov == "openai":
        data = fetch_openai_models()
    elif prov == "groq":
        data = fetch_groq_models()
    elif prov == "anthropic":
        data = fetch_anthropic_models()
    else:
        return []

    return data.get(t, [])
