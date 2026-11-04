"""Transkrip dengan dua implementasi yang sama-sama mengembalikan [{word, start, end}].

- Mode API  : Groq atau OpenAI Whisper (butuh API key di worker/.env)
- Mode lokal: faster-whisper (tanpa API key)
"""
from __future__ import annotations

import base64
import json
import re
import tempfile
import time
from pathlib import Path
from typing import Callable

import requests

from . import config, media, model_discovery

Progress = Callable[[float, str], None]

API_ENDPOINTS = {
    "groq": "https://api.groq.com/openai/v1/audio/transcriptions",
    "openai": "https://api.openai.com/v1/audio/transcriptions",
}
API_CHUNK_SEC = 20 * 60  # mono 32 kbps -> ~4.8 MB per 20 menit, aman di bawah batas 25 MB


class TranscribeError(RuntimeError):
    def __init__(self, message: str, retry_local: bool = False):
        super().__init__(message)
        self.retry_local = retry_local


def transcribe(
    wav_path: Path,
    mode: str,
    cfg: dict,
    language: str,
    duration: float,
    on_progress: Progress,
) -> tuple[list[dict], str | None]:
    lang = None if language in (None, "", "auto") else language
    if mode == "api":
        provider = cfg.get("provider", "groq")
        if provider == "gemini":
            words, detected = _transcribe_gemini(wav_path, lang, duration, on_progress)
        else:
            words, detected = _transcribe_api(wav_path, provider, lang, duration, on_progress)
    else:
        words, detected = _transcribe_local(
            wav_path,
            cfg.get("model", "small"),
            cfg.get("device", "cpu"),
            cfg.get("compute_type", "int8"),
            lang,
            duration,
            on_progress,
        )
    words = [w for w in words if w["word"].strip()]
    words.sort(key=lambda w: w["start"])
    return words, detected


# ----------------------------------------------------------------- API mode

def _api_key(provider: str) -> str:
    if provider == "groq":
        key = config.GROQ_API_KEY
        env = "GROQ_API_KEY"
    elif provider == "gemini":
        key = config.GEMINI_API_KEY
        env = "GEMINI_API_KEY"
    else:
        key = config.OPENAI_API_KEY
        env = "OPENAI_API_KEY"

    if not key:
        raise TranscribeError(
            f"Mode transkrip API ({provider}) dipilih tetapi {env} kosong di worker/.env. "
            "Isi API key lalu restart worker, atau jalankan ulang dengan mode lokal (faster-whisper).",
            retry_local=True,
        )
    return key


def _norm(s: str) -> str:
    return re.sub(r"[^\w]", "", s.lower(), flags=re.UNICODE)


def _align_punctuation(words: list[dict], segments: list[dict]) -> list[dict]:
    """Word-level output API biasanya tanpa tanda baca. Salin token bertanda baca
    dari teks segmen ke kata yang cocok agar batas kalimat bisa dideteksi."""
    tokens = [t for seg in segments for t in (seg.get("text") or "").split()]
    ti = 0
    for w in words:
        nw = _norm(w["word"])
        for look in range(0, 4):
            j = ti + look
            if j >= len(tokens):
                break
            if _norm(tokens[j]) == nw and nw:
                w["word"] = tokens[j]
                ti = j + 1
                break
    return words


def _post_with_retry(url: str, key: str, files: dict, data: list) -> dict:
    last_err = ""
    for attempt in range(5):
        try:
            resp = requests.post(url, headers={"Authorization": f"Bearer {key}"}, files=files, data=data, timeout=600)
        except requests.RequestException as e:
            last_err = str(e)
            time.sleep(2 * (attempt + 1))
            continue
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code in (401, 403):
            raise TranscribeError("API key transkrip ditolak (401/403). Periksa key di worker/.env.", retry_local=True)
        if resp.status_code == 429 or resp.status_code >= 500:
            wait = float(resp.headers.get("retry-after", 0) or 0) or 5 * (attempt + 1)
            last_err = f"HTTP {resp.status_code}: {resp.text[:200]}"
            time.sleep(min(wait, 60))
            for f in files.values():
                f[1].seek(0)
            continue
        raise TranscribeError(f"Transkrip API gagal HTTP {resp.status_code}: {resp.text[:300]}")
    raise TranscribeError(f"Transkrip API gagal setelah beberapa percobaan (rate limit?). {last_err}", retry_local=True)


def _transcribe_api(wav: Path, provider: str, lang: str | None, duration: float, on_progress: Progress):
    key = _api_key(provider)
    url = API_ENDPOINTS[provider]
    discovered = model_discovery.get_active_models(provider, "transcribe")
    default_model = config.GROQ_WHISPER_MODEL if provider == "groq" else config.OPENAI_WHISPER_MODEL
    model = discovered[0] if discovered else default_model
    n_chunks = max(1, int((duration + API_CHUNK_SEC - 1) // API_CHUNK_SEC))
    all_words: list[dict] = []
    detected = None
    with tempfile.TemporaryDirectory() as td:
        for i in range(n_chunks):
            offset = i * API_CHUNK_SEC
            on_progress(i / n_chunks, f"Mengirim audio bagian {i + 1}/{n_chunks} ke {provider.title()} Whisper ({model})...")
            mp3 = Path(td) / f"chunk_{i}.mp3"
            media.encode_audio_mp3(wav, mp3, start=offset, length=API_CHUNK_SEC if n_chunks > 1 else None)
            data = [
                ("model", model),
                ("response_format", "verbose_json"),
                ("timestamp_granularities[]", "word"),
                ("timestamp_granularities[]", "segment"),
                ("temperature", "0"),
            ]
            if lang:
                data.append(("language", lang))
            with open(mp3, "rb") as fh:
                result = _post_with_retry(url, key, {"file": (mp3.name, fh, "audio/mpeg")}, data)
            detected = detected or result.get("language")
            words = [
                {"word": (w.get("word") or "").strip(), "start": float(w["start"]) + offset, "end": float(w["end"]) + offset}
                for w in result.get("words") or []
            ]
            segs = result.get("segments") or []
            words = _align_punctuation(words, segs)
            if not words and segs:  # fallback: bagi rata kata per segmen
                for s in segs:
                    toks = (s.get("text") or "").split()
                    if not toks:
                        continue
                    step = (s["end"] - s["start"]) / len(toks)
                    for k, t in enumerate(toks):
                        words.append({"word": t, "start": s["start"] + offset + k * step, "end": s["start"] + offset + (k + 1) * step})
            all_words.extend(words)
    on_progress(1.0, "Transkrip selesai")
    return all_words, _lang_code(detected)


def _transcribe_gemini(
    wav: Path,
    lang: str | None,
    duration: float,
    on_progress: Progress,
) -> tuple[list[dict], str | None]:
    key = _api_key("gemini")
    discovered = model_discovery.get_active_models("gemini", "transcribe")
    preferred = getattr(config, "GEMINI_TRANSCRIBE_MODEL", "")
    candidate_models = list(dict.fromkeys(([preferred] if preferred else []) + discovered))

    # Potong per 5 menit (300 detik) agar request payload < 5MB dan diproses cepat
    chunk_sec = 5 * 60
    n_chunks = max(1, int((duration + chunk_sec - 1) // chunk_sec))
    all_words: list[dict] = []
    detected = None

    prompt_instruction = (
        "You are an expert audio transcription system. "
        "Transcribe all speech in this audio accurately. "
        "Output ONLY a valid JSON object matching this schema:\n"
        "{\n"
        '  "language": "id",\n'
        '  "segments": [\n'
        '    {\n'
        '      "text": "transcribed segment text",\n'
        '      "start": 0.0,\n'
        '      "end": 2.5,\n'
        '      "words": [\n'
        '        {"word": "Halo", "start": 0.0, "end": 0.5},\n'
        '        {"word": "teman-teman", "start": 0.51, "end": 1.2}\n'
        '      ]\n'
        '    }\n'
        '  ]\n'
        "}\n"
        "RULES:\n"
        "1. All 'start' and 'end' timestamps MUST be in seconds (float) relative to the audio start (e.g. 0.0 to 300.0).\n"
        "2. Break speech into clear segments and provide word-level timestamps in the 'words' array whenever possible.\n"
        "3. Do not add explanations or markdown text outside the JSON."
    )
    if lang:
        prompt_instruction += f"\nThe spoken language in this audio is '{lang}'."

    with tempfile.TemporaryDirectory() as td:
        for i in range(n_chunks):
            offset = i * chunk_sec
            on_progress(i / n_chunks, f"Mengirim audio bagian {i + 1}/{n_chunks} ke Google Gemini...")
            mp3 = Path(td) / f"gemini_{i}.mp3"
            media.encode_audio_mp3(wav, mp3, start=offset, length=chunk_sec if n_chunks > 1 else None)

            audio_data = base64.b64encode(mp3.read_bytes()).decode("utf-8")
            payload = {
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {
                                "inlineData": {
                                    "mimeType": "audio/mp3",
                                    "data": audio_data,
                                }
                            },
                            {
                                "text": prompt_instruction,
                            },
                        ],
                    }
                ],
                "generationConfig": {
                    "temperature": 0.1,
                    "responseMimeType": "application/json",
                },
            }

            resp = None
            last_err = ""
            for curr_model in candidate_models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{curr_model}:generateContent"
                headers = {"x-goog-api-key": key, "Content-Type": "application/json"}
                for attempt in range(2):
                    try:
                        r = requests.post(url, headers=headers, json=payload, timeout=180)
                        if r.status_code == 200:
                            resp = r.json()
                            break
                        if r.status_code in (401, 403):
                            raise TranscribeError("GEMINI_API_KEY ditolak (401/403). Periksa key di worker/.env.", retry_local=True)
                        if r.status_code == 404:
                            last_err = f"Model {curr_model} not found (404)"
                            break  # coba model berikutnya di candidate_models
                        if r.status_code in (429, 503):
                            last_err = f"Model {curr_model} status {r.status_code}: {r.text[:150]}"
                            time.sleep(2 * (attempt + 1))
                            continue
                        last_err = f"HTTP {r.status_code}: {r.text[:150]}"
                        time.sleep(2)
                    except requests.RequestException as e:
                        last_err = str(e)
                        time.sleep(2)
                if resp:
                    break

            if not resp:
                raise TranscribeError(f"Transkrip Gemini gagal pada bagian {i + 1}: {last_err}", retry_local=True)

            try:
                candidates = resp.get("candidates", [])
                parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
                raw_text = parts[0].get("text", "") if parts else "{}"
                clean_json = re.sub(r"^```json\s*|\s*```$", "", raw_text.strip(), flags=re.MULTILINE)
                parsed = json.loads(clean_json)
            except Exception as e:
                match = re.search(r"\{[\s\S]*\}", raw_text)
                if match:
                    parsed = json.loads(match.group(0))
                else:
                    raise TranscribeError(f"Gagal membaca format JSON transkrip Gemini: {e}")

            detected = detected or parsed.get("language")
            segs = parsed.get("segments") or []

            for s in segs:
                s_start = float(s.get("start", 0)) + offset
                s_end = float(s.get("end", s_start + 1)) + offset
                raw_words = s.get("words") or []

                if raw_words:
                    for w in raw_words:
                        w_text = str(w.get("word") or "").strip()
                        if w_text:
                            w_s = float(w.get("start", 0)) + offset
                            w_e = float(w.get("end", w_s + 0.3)) + offset
                            all_words.append({"word": w_text, "start": w_s, "end": w_e})
                else:
                    toks = (s.get("text") or "").split()
                    if toks:
                        dur = max(0.2, s_end - s_start)
                        step = dur / len(toks)
                        for k, t in enumerate(toks):
                            all_words.append({
                                "word": t,
                                "start": s_start + k * step,
                                "end": s_start + (k + 1) * step,
                            })

    on_progress(1.0, "Transkrip selesai")
    return all_words, _lang_code(detected)


def _lang_code(lang: str | None) -> str | None:
    if not lang:
        return None
    lang = lang.lower()
    mapping = {"indonesian": "id", "english": "en"}
    return mapping.get(lang, lang[:5])


# --------------------------------------------------------------- local mode

_MODEL_CACHE: dict = {}


def local_model_cached(model: str) -> bool:
    try:
        from faster_whisper.utils import download_model

        download_model(model, output_dir=str(config.MODELS_DIR), local_files_only=True)
        return True
    except Exception:
        return False


def _load_model(model: str, device: str, compute_type: str, on_progress: Progress):
    from faster_whisper import WhisperModel
    import os

    actual_device = device
    actual_compute = compute_type

    # 1. Otomatis deteksi GPU NVIDIA (CUDA) jika device tidak dipaksa ke CPU
    if device in ("auto", "cuda", "cpu"):
        try:
            import ctranslate2
            if ctranslate2.get_cuda_device_count() > 0:
                actual_device = "cuda"
                actual_compute = "float16" if compute_type in ("int8", "auto") else compute_type
        except Exception:
            pass

    key = (model, actual_device, actual_compute)
    if key in _MODEL_CACHE:
        return _MODEL_CACHE[key]

    cpu_threads = max(1, os.cpu_count() or 4)

    if not local_model_cached(model):
        on_progress(0.0, f"Mengunduh model faster-whisper '{model}' ke Drive D (sekali saja)...")
    else:
        on_progress(0.0, f"Memuat model faster-whisper '{model}' ({actual_device}, {actual_compute})...")

    try:
        kwargs = {"download_root": str(config.MODELS_DIR)}
        if actual_device == "cpu":
            kwargs["cpu_threads"] = cpu_threads
        m = WhisperModel(model, device=actual_device, compute_type=actual_compute, **kwargs)
    except Exception as e:
        if actual_device != "cpu":
            on_progress(0.0, f"GPU tidak tersedia ({e.__class__.__name__}), beralih otomatis ke CPU int8 ({cpu_threads} threads)...")
            m = WhisperModel(model, device="cpu", compute_type="int8", cpu_threads=cpu_threads, download_root=str(config.MODELS_DIR))
            actual_device = "cpu"
            actual_compute = "int8"
            key = (model, actual_device, actual_compute)
        else:
            if actual_compute != "int8":
                m = WhisperModel(model, device="cpu", compute_type="int8", cpu_threads=cpu_threads, download_root=str(config.MODELS_DIR))
            else:
                raise

    _MODEL_CACHE.clear()
    _MODEL_CACHE[key] = m
    return m


def _transcribe_local(wav: Path, model: str, device: str, compute_type: str, lang: str | None, duration: float, on_progress: Progress):
    try:
        wm = _load_model(model, device, compute_type, on_progress)
    except ImportError as e:
        raise TranscribeError("faster-whisper belum terpasang. Jalankan: pip install faster-whisper") from e
    segments, info = wm.transcribe(
        str(wav),
        language=lang,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
        beam_size=5 if device != "cpu" else 1,
        condition_on_previous_text=False,
    )
    words: list[dict] = []
    last = 0.0
    for seg in segments:
        for w in seg.words or []:
            words.append({"word": w.word.strip(), "start": float(w.start), "end": float(w.end)})
        if duration and seg.end - last >= 2:
            last = seg.end
            on_progress(min(0.99, seg.end / duration), f"Transkrip lokal {seg.end / 60:.1f}/{duration / 60:.1f} menit")
    on_progress(1.0, "Transkrip selesai")
    return words, getattr(info, "language", None)
