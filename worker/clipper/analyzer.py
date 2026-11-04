"""Analisis viral untuk memilih segmen terbaik dari transkrip video.

Mendukung 3 provider LLM (Anthropic Claude, OpenAI, Gemini) dengan fallback
heuristik offline yang cerdas jika API key tidak tersedia atau kuota habis (F-11, F-73).
Menyelaraskan ke batas kalimat (F-12) dan membuang klip tumpang tindih (F-13).
"""
from __future__ import annotations

import json
import logging
import math
import re
from typing import Any
import time

import requests

from . import config, model_discovery

logger = logging.getLogger(__name__)

TERMINAL_RE = re.compile(r"[.!?…]+[\"')\]]*$")
HOOK_WORDS_ID = {
    "kenapa", "mengapa", "bagaimana", "rahasia", "ternyata", "jangan", "stop",
    "pernah", "sadar", "tahukah", "fakta", "gila", "parah", "kaget", "tips",
    "trik", "kunci", "kesalahan", "penting", "wajib", "dilarang", "ajaib",
    "terbesar", "terbaik", "terburuk", "bahaya", "hati-hati", "viral", "dapat",
    "bisa", "cara", "solusi", "masalah", "tonton", "lihat", "dengar", "simak"
}
HOOK_WORDS_EN = {
    "why", "how", "secret", "never", "stop", "ever", "realize", "know", "fact",
    "crazy", "insane", "shocking", "tips", "tricks", "mistake", "critical",
    "must", "warning", "biggest", "best", "worst", "danger", "viral", "watch",
    "listen", "hack", "truth", "money", "win", "rule", "hidden", "proven"
}
PUNCHLINE_WORDS = {
    "jadi", "intinya", "kesimpulannya", "akhirnya", "ternyata", "ingat", "makanya",
    "so", "finally", "remember", "that's why", "in conclusion", "basically"
}
DANGLING_START = {"dan", "tapi", "lalu", "atau", "sehingga", "serta", "and", "but", "so", "or"}


def _clean(word: str) -> str:
    return re.sub(r"[^\w]", "", word.lower(), flags=re.UNICODE)


def _split_into_sentences(words: list[dict]) -> list[list[dict]]:
    """Kelompokkan daftar kata menjadi kalimat utuh berdasarkan tanda baca dan jeda."""
    if not words:
        return []
    sentences: list[list[dict]] = []
    current: list[dict] = []

    for w in words:
        if current and (float(w["start"]) - float(current[-1]["end"]) > 0.85):
            sentences.append(current)
            current = []
        current.append(w)
        text = str(w.get("word", "")).strip()
        if TERMINAL_RE.search(text) or (len(current) >= 12 and text.endswith(",")):
            sentences.append(current)
            current = []

    if current:
        sentences.append(current)
    return [s for s in sentences if s]


def _snap_range_to_sentences(
    sentences: list[list[dict]],
    raw_start: float,
    raw_end: float,
    min_dur: float,
    max_dur: float,
) -> tuple[float, float, list[dict]] | None:
    """Temukan rentang kalimat terdekat yang mencakup raw_start..raw_end dengan durasi ideal."""
    if not sentences:
        return None

    # Cari index kalimat terdekat dengan raw_start
    start_idx = 0
    best_start_diff = float("inf")
    for i, s in enumerate(sentences):
        diff = abs(float(s[0]["start"]) - raw_start)
        if diff < best_start_diff:
            best_start_diff = diff
            start_idx = i

    best_match: tuple[float, float, list[dict]] | None = None
    best_cost = float("inf")

    # Eksplorasi jendela kalimat di sekitar start_idx
    for si in range(max(0, start_idx - 2), min(len(sentences), start_idx + 3)):
        s_time = float(sentences[si][0]["start"])
        # hindari mulai dari kalimat yang diawali kata penghubung menggantung jika memungkinkan
        first_word = _clean(sentences[si][0]["word"])
        dangling_penalty = 2.0 if first_word in DANGLING_START else 0.0

        for ei in range(si, min(len(sentences), si + 60)):
            e_time = float(sentences[ei][-1]["end"])
            dur = e_time - s_time
            if dur < min_dur:
                continue
            if dur > max_dur:
                break

            target_mid = (min_dur + max_dur) / 2.0
            dur_cost = abs(dur - target_mid)
            boundary_cost = abs(s_time - raw_start) + abs(e_time - raw_end)
            cost = dur_cost + boundary_cost * 0.5 + dangling_penalty

            if cost < best_cost:
                best_cost = cost
                matched_words = [w for sent in sentences[si : ei + 1] for w in sent]
                best_match = (s_time, e_time, matched_words)

    return best_match


def _overlap_ratio(start1: float, end1: float, start2: float, end2: float) -> float:
    overlap = max(0.0, min(end1, end2) - max(start1, start2))
    min_len = min(end1 - start1, end2 - start2)
    return (overlap / min_len) if min_len > 0 else 0.0


def deduplicate_clips(candidates: list[dict], max_overlap: float = 0.3) -> list[dict]:
    """Pilih kandidat skor tertinggi dan buang klip yang bertabrakan > 30%."""
    sorted_cands = sorted(candidates, key=lambda c: c.get("viral_score", 0), reverse=True)
    accepted: list[dict] = []

    for cand in sorted_cands:
        s1, e1 = float(cand["start_sec"]), float(cand["end_sec"])
        if any(_overlap_ratio(s1, e1, float(a["start_sec"]), float(a["end_sec"])) > max_overlap for a in accepted):
            continue
        accepted.append(cand)

    return accepted


# ------------------------------------------------------------------ LLM Prompting
SYSTEM_PROMPT = """Anda adalah kurator konten dan viral video strategist kelas dunia untuk TikTok, Instagram Reels, dan YouTube Shorts.
Tugas Anda adalah menganalisis transkrip audio bertanda waktu untuk menemukan momen-momen terbaik yang berpotensi viral tinggi, MEMILIKI MAKNA TUNTAS, dan SIAP DIPOSTING ke media sosial.

PRINSIP SELEKSI KLIP:
1. Keutuhan Makna (Standalone Context): Klip bisa dipahami sepenuhnya tanpa menonton video panjangnya (ada hook, isi, dan kesimpulan). JANGAN potong di tengah kalimat atau sebelum idenya selesai!
2. Hook 3 Detik Pertama: Pembuka harus mencengkeram perhatian penonton dalam 3 detik pertama.
3. Nilai & Insight: Memberikan edukasi, perspektif baru, solusi praktis, atau punchline emosional yang memicu penonton untuk share & save.

STANDAR METADATA SIAP POSTING (SANGAT PENTING):
- "title": Hook judul video yang MENARIK, PUNCHY, dan MEMICU RASA INGIN TAHU (maksimal 7-10 kata). Jangan pakai judul monoton atau tanda kutip. Contoh: "Fakta Pahit Soal Karir yang Jarang Dibahas", "Kenapa Orang Pintar Sering Terjebak Masalah Ini?"
- "description": Caption profesional 3 baris yang rapi dan memicu engagement:
  * Baris 1: Hook pembuka yang menggugah emosi/penasaran.
  * Baris 2: Inti bahasan penting atau pelajaran dari klip ini.
  * Baris 3: Call-to-action (CTA) yang mengajak diskusi di kolom komentar atau ajakan simpan video.
- "hashtags": 10-14 hashtag terkurasi yang SANGAT RELEVAN dengan topik spesifik klip (bukan hanya tag umum). Gabungan antara:
  * 5-7 tag niche spesifik topik (contoh: #tipskeuangan #investasileheratas #mindsetkaya dll).
  * 3-4 tag edukasi/kategori (contoh: #edukasi #pengembangandiri #belajaronline).
  * 2-3 tag reach/format (#fyp #reelsindonesia #shorts #videoviral).
- "reason": Evaluasi profesional alasan kenapa momen ini berpotensi viral tinggi.

Kriteria penilaian skor viral (0 - 100):
1. Keutuhan Makna & Konteks (bobot 25%)
2. Hook 3 detik pertama (bobot 30%)
3. Insight, Solusi, atau Punchline (bobot 20%)
4. Emosi dan intensitas bicara (bobot 15%)
5. Kepadatan dan ritme bicara (bobot 10%)

Kembalikan HANYA format JSON valid tanpa markdown atau teks pengantar:
{
  "clips": [
    {
      "start": 12.5,
      "end": 74.0,
      "score": 94,
      "breakdown": {
        "hook": 96,
        "emotion": 90,
        "standalone": 95,
        "punchline": 92,
        "pace": 90
      },
      "title": "Fakta Pahit Soal Karir yang Jarang Orang Sadari",
      "reason": "Hook awal menampar realita, penjelasan tuntas dan padat isi, diakhiri kesimpulan kuat yang memicu diskusi di kolom komentar.",
      "description": "Banyak yang kerja keras tapi ngerasa jalan di tempat, ternyata ini sebabnya! 🔥\\n\\nSimak penjelasannya sampai tuntas agar kamu nggak mengulang kesalahan yang sama.\\n\\nKira-kira kamu setuju nggak? Tulis pendapat kamu di kolom komentar & save video ini ya! 👇",
      "hashtags": ["#karir", "#tipspekerjaan", "#produktivitas", "#selfimprovement", "#mindset", "#suksesmuda", "#edukasi", "#duniakerja", "#reelsindonesia", "#fyp", "#shorts"]
    }
  ]
}
"""


def _format_transcript_for_prompt(sentences: list[list[dict]], max_chars: int = 180000) -> str:
    """Format transkrip bertanda waktu untuk prompt LLM dengan kapasitas hingga 180.000 karakter."""
    raw_lines = [
        f"[{float(s[0]['start']):06.2f} - {float(s[-1]['end']):06.2f}] {' '.join(w['word'] for w in s)}"
        for s in sentences
    ]
    total_len = sum(len(l) + 1 for l in raw_lines)
    if total_len <= max_chars:
        return "\n".join(raw_lines)

    # Jika transkrip video luar biasa panjang (>180k karakter, misal podcast 3+ jam),
    # lakukan sampling merata agar SELURUH bagian video (awal, tengah, akhir) tetap terwakili penuh!
    step = math.ceil(total_len / max_chars)
    sampled = []
    running_total = 0
    for i, line in enumerate(raw_lines):
        if i % step == 0:
            if running_total + len(line) + 1 > max_chars:
                break
            sampled.append(line)
            running_total += len(line) + 1
    return "\n".join(sampled)


def _call_claude(prompt: str) -> dict | None:
    if not config.ANTHROPIC_API_KEY:
        return None
    candidate_models = model_discovery.get_active_models("anthropic", "llm")
    for model in candidate_models:
        try:
            url = "https://api.anthropic.com/v1/messages"
            headers = {
                "x-api-key": config.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
            data = {
                "model": model,
                "max_tokens": 8000,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": prompt}],
            }
            res = requests.post(url, headers=headers, json=data, timeout=90)
            if res.status_code == 200:
                text = res.json()["content"][0]["text"]
                parsed = _parse_json(text)
                if parsed:
                    return parsed
            logger.warning("Claude API model %s failed status=%d: %s", model, res.status_code, res.text[:120])
        except Exception as e:
            logger.warning("Claude API error model %s: %s", model, e)
    return None


def _call_openai(prompt: str) -> dict | None:
    if not config.OPENAI_API_KEY:
        return None
    discovered = model_discovery.get_active_models("openai", "llm")
    preferred = getattr(config, "OPENAI_LLM_MODEL", "")
    candidate_models = list(dict.fromkeys(([preferred] if preferred else []) + discovered))
    headers = {
        "Authorization": f"Bearer {config.OPENAI_API_KEY}",
        "content-type": "application/json",
    }
    for model in candidate_models:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            data = {
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.4,
                "max_tokens": 8000,
            }
            res = requests.post(url, headers=headers, json=data, timeout=90)
            if res.status_code == 200:
                text = res.json()["choices"][0]["message"]["content"]
                parsed = _parse_json(text)
                if parsed:
                    return parsed
            logger.warning("OpenAI LLM model %s failed status=%d: %s", model, res.status_code, res.text[:120])
        except Exception as e:
            logger.warning("OpenAI LLM error model %s: %s", model, e)
    return None


def _call_groq(prompt: str) -> dict | None:
    if not config.GROQ_API_KEY:
        return None
    discovered = model_discovery.get_active_models("groq", "llm")
    candidate_models = list(dict.fromkeys(discovered or ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]))
    headers = {
        "Authorization": f"Bearer {config.GROQ_API_KEY}",
        "content-type": "application/json",
    }
    for model in candidate_models:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            data = {
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.4,
                "max_tokens": 8000,
            }
            res = requests.post(url, headers=headers, json=data, timeout=60)
            if res.status_code == 200:
                text = res.json()["choices"][0]["message"]["content"]
                parsed = _parse_json(text)
                if parsed:
                    return parsed
            logger.warning("Groq LLM model %s failed status=%d: %s", model, res.status_code, res.text[:120])
        except Exception as e:
            logger.warning("Groq LLM error model %s: %s", model, e)
    return None


def _call_gemini(prompt: str, on_progress: Any = None) -> dict | None:
    if not config.GEMINI_API_KEY:
        return None
    discovered = model_discovery.get_active_models("gemini", "llm")
    preferred = getattr(config, "GEMINI_MODEL", "") or "gemini-3.5-flash"
    candidate_models = list(dict.fromkeys(([preferred] if preferred else []) + discovered))
    data = {
        "contents": [
            {"role": "user", "parts": [{"text": SYSTEM_PROMPT + "\n\n" + prompt}]}
        ],
        "generationConfig": {"temperature": 0.4, "responseMimeType": "application/json", "maxOutputTokens": 8192},
    }

    last_err = ""
    for model in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        headers = {"x-goog-api-key": config.GEMINI_API_KEY, "Content-Type": "application/json"}
        for attempt in range(2):
            try:
                if on_progress:
                    att_label = f" (Percobaan {attempt + 1})" if attempt > 0 else ""
                    on_progress(64, f"Menganalisis konten mendalam dengan Gemini AI [{model}]{att_label}...")

                # Timeout 70 detik agar model LLM online leluasa berpikir & menghasilkan klip terbaik tanpa terburu-buru fallback
                res = requests.post(url, headers=headers, json=data, timeout=70)
                if res.status_code == 200:
                    candidates = res.json().get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            parsed = _parse_json(parts[0].get("text", ""))
                            if parsed:
                                return parsed
                elif res.status_code in (503, 429):
                    last_err = f"Model {model} spike ({res.status_code})"
                    if on_progress:
                        on_progress(65, f"Server {model} sedang padat ({res.status_code}), mencoba jalur kedua...")
                    time.sleep(2)
                    continue
                else:
                    last_err = f"Model {model} status {res.status_code}: {res.text[:120]}"
                    break
            except requests.Timeout:
                last_err = f"Model {model} waktu tunggu habis (>70s)"
                if on_progress:
                    on_progress(65, f"Waktu tunggu {model} habis, mencoba model AI cadangan...")
                time.sleep(1)
            except Exception as e:
                last_err = f"Model {model} error: {e}"
                time.sleep(1)

    logger.warning("Gemini LLM sedang padat/gagal (%s), beralih ke analisis heuristik cerdas.", last_err)
    return None


def _parse_json(raw: str) -> dict | None:
    raw = raw.strip()
    if raw.startswith("```json"):
        raw = raw[7:]
    elif raw.startswith("```"):
        raw = raw[3:]
    if raw.endswith("```"):
        raw = raw[:-3]
    raw = raw.strip()

    def normalize(data: Any) -> dict | None:
        if isinstance(data, list):
            return {"clips": data}
        if isinstance(data, dict):
            if "clips" not in data and "data" in data and isinstance(data["data"], list):
                data["clips"] = data["data"]
            return data
        return None

    try:
        data = json.loads(raw)
        norm = normalize(data)
        if norm:
            return norm
    except Exception:
        pass

    # Coba regex extract JSON berdasarkan mana yang muncul lebih awal: '[' atau '{'
    idx_brace = raw.find("{")
    idx_bracket = raw.find("[")

    if idx_bracket != -1 and (idx_brace == -1 or idx_bracket < idx_brace):
        patterns = (r"(\[[\s\S]*\])", r"(\{[\s\S]*\})")
    else:
        patterns = (r"(\{[\s\S]*\})", r"(\[[\s\S]*\])")

    for pattern in patterns:
        m = re.search(pattern, raw)
        if m:
            try:
                data = json.loads(m.group(1))
                norm = normalize(data)
                if norm:
                    return norm
            except Exception:
                continue

    return None


# ------------------------------------------------------------------ Fallback Heuristic
def _heuristic_analyze(
    sentences: list[list[dict]],
    peaks_data: dict | None,
    target_duration: int,
    desired_count: int,
    total_duration: float,
) -> list[dict]:
    """Analisis berbasis sinyal audio, hook leksikal, kepadatan kata, dan struktur kalimat."""
    if total_duration < target_duration:
        min_dur = max(2.0, total_duration * 0.4)
        max_dur = total_duration
    else:
        min_dur = target_duration * 0.75
        max_dur = target_duration * 1.25

    peaks = (peaks_data or {}).get("peaks", [])
    rate = (peaks_data or {}).get("rate", 25)
    mean_volume = (sum(peaks) / len(peaks)) if peaks else 30.0

    candidates: list[dict] = []

    # Slide across sentences
    for si in range(len(sentences)):
        s_time = float(sentences[si][0]["start"])
        # Stop jika sudah mendekati akhir
        if s_time > total_duration - min_dur:
            break

        first_sentence_words = sentences[si]
        first_text_lower = " ".join(_clean(w["word"]) for w in first_sentence_words[:6])

        # Hitung hook score awal (30%)
        hook_score = 50
        has_hook_word = any(hw in first_text_lower for hw in (HOOK_WORDS_ID | HOOK_WORDS_EN))
        if has_hook_word:
            hook_score += 30
        if any(w["word"].endswith("?") for w in first_sentence_words):
            hook_score += 20
        if any(w["word"].endswith("!") for w in first_sentence_words):
            hook_score += 10
        hook_score = min(98, hook_score)

        for ei in range(si, min(len(sentences), si + 12)):
            e_time = float(sentences[ei][-1]["end"])
            dur = e_time - s_time
            if dur < min_dur:
                continue
            if dur > max_dur:
                break

            all_words = [w for sent in sentences[si : ei + 1] for w in sent]
            word_count = len(all_words)
            wps = word_count / dur  # words per second

            # Pace & density (10%)
            # Kecepatan bicara optimal 2.0 - 3.8 kata/detik
            if 2.2 <= wps <= 3.6:
                pace_score = 90
            elif 1.6 <= wps < 2.2 or 3.6 < wps <= 4.2:
                pace_score = 75
            else:
                pace_score = 55

            # Emotion & Volume (25%)
            emotion_score = 60
            if peaks:
                p_start = int(s_time * rate)
                p_end = int(e_time * rate)
                seg_peaks = peaks[p_start:p_end]
                if seg_peaks:
                    seg_mean = sum(seg_peaks) / len(seg_peaks)
                    ratio = seg_mean / (mean_volume + 1e-4)
                    if ratio > 1.3:
                        emotion_score = min(96, int(70 + ratio * 15))
                    elif ratio > 1.05:
                        emotion_score = int(65 + ratio * 10)

            # Standalone (20%)
            standalone_score = 75
            first_w = _clean(sentences[si][0]["word"])
            if first_w in DANGLING_START:
                standalone_score -= 25

            # Punchline / Resolution (15%)
            punchline_score = 65
            last_sentence_words = sentences[ei]
            last_text = " ".join(_clean(w["word"]) for w in last_sentence_words[-6:])
            if any(pw in last_text for pw in PUNCHLINE_WORDS):
                punchline_score += 25
            if any(w["word"].endswith("!") for w in last_sentence_words):
                punchline_score += 10
            punchline_score = min(95, punchline_score)

            # Total bobot PRD: Hook 30%, Emotion 25%, Standalone 20%, Punchline 15%, Pace 10%
            total_score = int(
                hook_score * 0.30
                + emotion_score * 0.25
                + standalone_score * 0.20
                + punchline_score * 0.15
                + pace_score * 0.10
            )

            # Ekstrak kata kunci penting untuk judul dan hashtag dinamis
            stop_words = {
                "yang", "di", "ke", "dari", "pada", "dan", "ini", "itu", "untuk", "dengan",
                "saya", "kamu", "dia", "kita", "mereka", "akan", "bisa", "ada", "tidak", "juga",
                "sudah", "karena", "jadi", "lagi", "saja", "kalau", "nah", "ya", "kan", "sih",
                "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with"
            }
            clean_tokens = [
                re.sub(r"[^\w]", "", w["word"].lower())
                for w in all_words
                if len(w["word"]) >= 4
            ]
            key_topics = [t for t in clean_tokens if t and t not in stop_words]
            # Ambil 5 kata kunci paling unik
            unique_topics = list(dict.fromkeys(key_topics))[:6]

            # Pilih kalimat pembuka terbaik sebagai hook judul
            first_sentence = sentences[si]
            hook_text = " ".join(w["word"] for w in first_sentence[:8]).strip(" .,!?:;")
            if len(hook_text) < 12 and len(all_words) >= 6:
                hook_text = " ".join(w["word"] for w in all_words[:7]).strip(" .,!?:;")

            topic_label = unique_topics[0].capitalize() if unique_topics else "Momen Penting"
            title = f"{hook_text}!" if not hook_text.endswith("!") else hook_text
            if len(title) > 60:
                title = f"{title[:57]}..."

            reason = (
                f"Klip ini memiliki hook pembuka yang kuat ({hook_score}/100) "
                f"dengan dinamika vokal ({emotion_score}/100), kepadatan ritme ({wps:.1f} kata/detik), "
                f"dan struktur pesan yang selesai ({standalone_score}/100)."
            )

            # Buat deskripsi 3 baris yang terstruktur rapi
            description = (
                f"Poin penting soal {topic_label} yang wajib kamu simak sampai selesai! 🔥\n\n"
                f"Banyak insight menarik berdurasi {int(dur)}s yang bisa kamu jadikan pelajaran berharga.\n\n"
                f"Tulis pandanganmu di kolom komentar dan save video ini ya! 👇"
            )

            # Buat 10-12 hashtag gabungan niche topik + format reach
            niche_tags = [f"#{t}" for t in unique_topics[:5]]
            base_tags = ["#edukasi", "#insight", "#mindset", "#tipsberharga", "#reelsindonesia", "#fyp", "#shorts", "#videoviral"]
            final_tags = list(dict.fromkeys(niche_tags + base_tags))[:12]

            candidates.append({
                "start_sec": round(s_time, 2),
                "end_sec": round(e_time, 2),
                "viral_score": total_score,
                "score_breakdown": {
                    "hook": hook_score,
                    "emotion": emotion_score,
                    "standalone": standalone_score,
                    "punchline": punchline_score,
                    "pace": pace_score,
                },
                "title": title,
                "reason": reason,
                "description": description,
                "hashtags": final_tags,
            })

    # Deduplikasi klip tumpang tindih
    deduped = deduplicate_clips(candidates, max_overlap=0.25)
    return deduped[:desired_count]


# ------------------------------------------------------------------ Main Entry Point
def analyze_transcript(
    words: list[dict],
    peaks_data: dict | None,
    total_duration: float,
    clip_duration: int = 30,
    clip_count: int = 0,
    language: str = "auto",
    preferred_provider: str = "auto",
    on_progress: Any = None,
) -> list[dict]:
    """Pipeline utama analisis viral: LLM multi-provider dengan fallback heuristik."""
    if on_progress:
        on_progress(58, "Menyiapkan transkrip untuk analisis konten...")

    sentences = _split_into_sentences(words)
    if not sentences:
        logger.warning("Tidak ada kalimat dalam transkrip untuk dianalisis.")
        return []

    if clip_duration and clip_duration > 0:
        target_dur = clip_duration
        min_dur = max(5.0, target_dur * 0.60)
        max_dur = min(total_duration, target_dur * 1.40)
    else:
        # Mode 0 = Fleksibel mengikuti keutuhan makna topik (30s s/d 120s)
        target_dur = 60
        min_dur = 20.0
        max_dur = min(total_duration, 130.0)

    if clip_count and clip_count > 0:
        desired_n = clip_count
        count_instruction = f"Tepat {clip_count} klip terbaik sesuai permintaan pengguna."
        min_auto, max_auto = clip_count, clip_count
    else:
        # Mode 0 = Otomatis Proporsional Berdasarkan Durasi Video
        if total_duration >= 3600:  # >= 60 menit (Podcast 1 jam+)
            min_auto, max_auto = 8, 16
        elif total_duration >= 2400:  # >= 40 menit
            min_auto, max_auto = 7, 14
        elif total_duration >= 1500:  # >= 25 menit
            min_auto, max_auto = 6, 12
        elif total_duration >= 900:   # >= 15 menit
            min_auto, max_auto = 5, 9
        elif total_duration >= 420:   # >= 7 menit
            min_auto, max_auto = 3, 6
        else:                         # < 7 menit
            min_auto, max_auto = 2, 4

        desired_n = min_auto
        count_instruction = (
            f"OTOMATIS PROPORSIONAL: Video ini berdurasi total {total_duration / 60:.1f} menit ({int(total_duration)} detik). "
            f"KARENA VIDEO INI {'PANJANG (1 JAM+)' if total_duration >= 3600 else 'CUKUP PANJANG' if total_duration >= 1500 else 'BERDURASI SEDANG'}, "
            f"JANGAN HANYA MENGHASILKAN SEDIKIT KLIP (DILARANG HANYA MENGHASILKAN 2-3 KLIP)! "
            f"JELAJAHI DAN TEMUKAN MOMEN-MOMEN DARI SELURUH BAGIAN VIDEO (AWAL, TENGAH, DAN AKHIR). "
            f"HASILKAN ANTARA {min_auto} HINGGA {max_auto} KLIP TERBAIK YANG BERBOBOT DAN BERBEDA TOPIK. "
            "Pastikan setiap klip memiliki nilai tonton yang tinggi, hook awal menarik, dan cerita/penjelasan yang utuh selesai."
        )

    candidates: list[dict] = []
    llm_result: dict | None = None

    # Kumpulkan hanya provider yang MEMILIKI API key aktif
    available_providers = []
    if config.ANTHROPIC_API_KEY:
        available_providers.append("anthropic")
    if config.OPENAI_API_KEY:
        available_providers.append("openai")
    if config.GEMINI_API_KEY:
        available_providers.append("gemini")
    if config.GROQ_API_KEY:
        available_providers.append("groq")

    # Tentukan urutan provider: prioritaskan preferred_provider jika kuncinya ada
    providers = []
    if preferred_provider == "heuristic":
        # Mode Heuristik Offline dipilih secara eksplisit (tanpa AI Cloud)
        providers = []
        logger.info("Analisis viral menggunakan mode Heuristik Offline (sesuai pilihan pengguna).")
    elif preferred_provider and preferred_provider != "auto" and preferred_provider in available_providers:
        providers.append(preferred_provider)
        for p in available_providers:
            if p not in providers:
                providers.append(p)
    else:
        # Mode auto atau preferred_provider tidak memiliki kunci: gunakan semua yang memiliki API key
        providers = available_providers
        if not providers:
            logger.info("Tidak ada provider AI dengan API key aktif, otomatis beralih ke analisis Heuristik Offline.")

    formatted_transcript = _format_transcript_for_prompt(sentences)
    dur_desc = f"sekitar {target_dur} detik (toleransi {min_dur:.0f} - {max_dur:.0f} detik)" if clip_duration > 0 else "fleksibel 30 hingga 120 detik (1-2 menit) sesuai keutuhan gagasan/cerita"
    user_prompt = f"""Video berdurasi total {total_duration / 60:.1f} menit ({total_duration:.0f} detik).
Bahasa utama: {language}.
Durasi target per klip: {dur_desc}.
Target jumlah klip: {count_instruction}
PENTING: Jangan memotong klip di tengah penjelasan! Jika satu ide atau cerita membutuhkan waktu 1 hingga 2 menit agar tuntas dan bermakna, berikan durasi tersebut.

Berikut adalah transkrip bertanda waktu:
{formatted_transcript}
"""

    for prov in providers:
        details = config.get_key_details(prov)
        logger.info(
            "Mencoba analisis viral dengan provider LLM: %s [%s] (dari %s)",
            prov.upper(),
            details.get("masked", "***"),
            details.get("source", "Aktif"),
        )
        if on_progress:
            prov_name = "Gemini Flash AI" if prov == "gemini" else f"AI {prov.capitalize()}"
            on_progress(64, f"Menghubungi {prov_name} untuk mengevaluasi hook & retensi penonton...")
        if prov == "anthropic":
            llm_result = _call_claude(user_prompt)
        elif prov == "openai":
            llm_result = _call_openai(user_prompt)
        elif prov == "groq":
            llm_result = _call_groq(user_prompt)
        elif prov == "gemini":
            llm_result = _call_gemini(user_prompt, on_progress=on_progress)

        if llm_result and isinstance(llm_result.get("clips"), list) and len(llm_result["clips"]) > 0:
            logger.info("Berhasil mendapatkan %d kandidat dari LLM (%s)", len(llm_result["clips"]), prov)
            break
        llm_result = None

    if on_progress:
        on_progress(71, "Menyelaraskan batas kalimat klip & menghitung skor kualitas...")

    # Proses output LLM jika ada
    if llm_result and isinstance(llm_result.get("clips"), list):
        for raw_c in llm_result["clips"]:
            try:
                r_start = float(raw_c.get("start", 0))
                r_end = float(raw_c.get("end", 0))
                if r_end <= r_start:
                    continue

                raw_dur = r_end - r_start
                # Menghormati keputusan durasi AI agar keutuhan makna terjaga
                snap_min = max(2.0, min(min_dur, raw_dur * 0.80))
                snap_max = max(max_dur, raw_dur * 1.25)

                # Pastikan diselaraskan dengan batas kalimat (F-12)
                snapped = _snap_range_to_sentences(sentences, r_start, r_end, snap_min, snap_max)
                if not snapped:
                    continue
                s_start, s_end, matched_words = snapped

                score = int(raw_c.get("score", 75))
                breakdown = raw_c.get("breakdown") or {
                    "hook": score,
                    "emotion": score,
                    "standalone": score,
                    "punchline": score,
                    "pace": score,
                }
                candidates.append({
                    "start_sec": round(s_start, 2),
                    "end_sec": round(s_end, 2),
                    "viral_score": max(1, min(100, score)),
                    "score_breakdown": breakdown,
                    "title": str(raw_c.get("title", f"Klip Highlight ({int(s_start)}s)")).strip(),
                    "reason": str(raw_c.get("reason", "Klip teridentifikasi memiliki potensi engagement tinggi.")).strip(),
                    "description": str(raw_c.get("description", "")).strip(),
                    "hashtags": raw_c.get("hashtags", ["#fyp", "#viral", "#shorts"]),
                })
            except Exception as e:
                logger.warning("Gagal mem-parse kandidat klip: %s", e)

    # Jika LLM gagal atau tidak ada kandidat yang valid, gunakan fallback heuristik
    if not candidates:
        logger.info("Menggunakan fallback analisis heuristik audio & leksikal...")
        heuristic_target = clip_count if clip_count > 0 else max(min_auto, min(max_auto, int(total_duration // 240) or 5))
        candidates = _heuristic_analyze(sentences, peaks_data, target_dur, heuristic_target * 2, total_duration)

    # Deduplikasi overlap (F-13)
    final_clips = deduplicate_clips(candidates, max_overlap=0.3)

    # Urutkan berdasarkan skor tertinggi
    final_clips.sort(key=lambda c: c["viral_score"], reverse=True)

    # 1. Jika pengguna memilih jumlah klip spesifik (misal: 5 atau 10 klip)
    if clip_count and clip_count > 0:
        return final_clips[:clip_count]

    # 2. Mode Otomatis (clip_count == 0):
    # Kembalikan klip-klip berkualitas tinggi (skor >= 65), dengan target rentang min_auto hingga max_auto
    quality_clips = [c for c in final_clips if c.get("viral_score", 0) >= 65]
    if len(quality_clips) >= min_auto:
        return quality_clips[:max_auto]

    # Jika klip dengan skor >= 65 kurang dari min_auto, ambil klip terbaik yang ada sampai minimal min_auto
    target_take = max(min_auto, min(max_auto, len(final_clips)))
    return final_clips[:target_take]
