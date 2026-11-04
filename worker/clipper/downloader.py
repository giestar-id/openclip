"""Download video sumber dengan yt-dlp (modul Python) + progress."""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Callable

import yt_dlp

from . import media

FORMAT = (
    # 1. Prioritaskan format progressive direct HTTPS (non-HLS, non-DASH fragments) hingga 1080p:
    # Format ini 1 file utuh, jauh lebih cepat & stabil daripada fragmen m3u8_native
    "bv*[height<=?1080][protocol^=http]+ba[protocol^=http]/"
    "b[height<=?1080][protocol^=http]/"
    # 2. Fallback jika hanya tersedia format fragmen (HLS/DASH)
    "bv*[height<=?1080]+ba/"
    "b[height<=?1080]/"
    "bv*+ba/b"
)


class _Quiet:
    def debug(self, msg: str) -> None: ...
    def info(self, msg: str) -> None: ...
    def warning(self, msg: str) -> None: ...
    def error(self, msg: str) -> None: ...


import os
import logging

logger = logging.getLogger("clipper.downloader")


def _find_cookie_file() -> Path | None:
    env_p = os.environ.get("YOUTUBE_COOKIES_PATH")
    if env_p and Path(env_p).exists() and Path(env_p).stat().st_size > 0:
        return Path(env_p)

    candidates = [
        Path("storage/cookies.txt"),
        Path(__file__).resolve().parent.parent.parent / "storage" / "cookies.txt",
        Path(__file__).resolve().parent.parent / "cookies.txt",
        Path.cwd() / "cookies.txt",
        Path.cwd() / "storage" / "cookies.txt",
    ]
    for c in candidates:
        if c.exists() and c.stat().st_size > 0:
            return c
    return None


def _base_opts() -> dict:
    opts: dict = {
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "logger": _Quiet(),
        "ffmpeg_location": media.ffmpeg_path(),
        "retries": 10,
        "fragment_retries": 10,
        "concurrent_fragment_downloads": 8,  # Download 8 fragmen sekaligus jika HLS/DASH terpilih
        "http_chunk_size": 10485760,  # 10 MB buffer chunk untuk throughput maksimal & stabil
    }

    # Muat cookies.txt otomatis jika tersedia (untuk verifikasi YouTube anti-bot)
    cookie_file = _find_cookie_file()
    if cookie_file:
        logger.info("Menggunakan YouTube cookie file: %s", cookie_file)
        opts["cookiefile"] = str(cookie_file)

    # YouTube membutuhkan JS runtime untuk beberapa format; Node.js sudah terpasang untuk Next.js.
    node_exe = shutil.which("node")
    deno_exe = shutil.which("deno")
    runtimes: dict = {}
    if deno_exe:
        runtimes["deno"] = {}
    if node_exe:
        runtimes["node"] = {}
    if runtimes:
        opts["js_runtimes"] = runtimes
    return opts


def probe(url: str) -> dict:
    try:
        with yt_dlp.YoutubeDL({**_base_opts(), "skip_download": True}) as ydl:
            info = ydl.extract_info(url, download=False)
        return {
            "title": info.get("title"),
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration"),
            "uploader": info.get("uploader") or info.get("channel"),
            "width": info.get("width"),
            "height": info.get("height"),
        }
    except Exception as e:
        err_msg = str(e)
        if "confirm you" in err_msg.lower() or "bot" in err_msg.lower():
            raise RuntimeError(
                "YouTube meminta verifikasi login (Sign in to confirm you're not a bot). "
                "Silakan simpan file 'cookies.txt' di folder storage/cookies.txt, "
                "atau upload file video secara langsung via tab 'Upload File Video'."
            ) from e
        raise


def _strip_ansi(text: str) -> str:
    """Bersihkan karakter escape warna ANSI agar tidak mengotori UI / DB."""
    return re.sub(r"\x1b\[[0-9;]*[a-zA-Z]", "", text).strip()


def download(url: str, out_dir: Path, on_progress: Callable[[float, str], None] | None = None) -> tuple[Path, dict]:
    """Unduh ke out_dir/source.mp4. Mengembalikan (path, info)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    state = {"files": [], "last": -1.0}

    def hook(d: dict) -> None:
        if not on_progress:
            return
        fname = d.get("filename") or ""
        if fname and fname not in state["files"]:
            state["files"].append(fname)
        idx = max(0, len(state["files"]) - 1)

        if d.get("status") == "downloading":
            frag_cnt = d.get("fragment_count")
            frag_idx = d.get("fragment_index")

            if frag_cnt and frag_cnt > 0 and frag_idx is not None:
                # Mode unduhan fragmen (HLS / DASH)
                frac = min(1.0, max(0.0, frag_idx / frag_cnt))
            else:
                # Mode unduhan file langsung (HTTPS / HTTP)
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                done = d.get("downloaded_bytes") or 0
                frac = min(1.0, max(0.0, done / total)) if total else 0.0

            # Biasanya 2 file (video + audio): video 85%, audio 15%.
            overall = frac * 0.85 if idx == 0 else 0.85 + frac * 0.15
            if overall - state["last"] >= 0.01:
                state["last"] = overall
                raw_speed = d.get("_speed_str") or d.get("speed_str") or ""
                raw_eta = d.get("_eta_str") or d.get("eta_str") or ""
                speed = _strip_ansi(str(raw_speed))
                eta = _strip_ansi(str(raw_eta))

                pct_str = f"{int(frac * 100)}%"
                speed_str = f" {speed}" if speed else ""
                eta_str = f" ETA {eta}" if eta and eta != "Unknown" else ""
                on_progress(min(overall, 0.99), f"Mengunduh {pct_str}{speed_str}{eta_str}".strip())
        elif d.get("status") == "finished":
            on_progress(min(0.99, 0.85 if idx == 0 else 0.99), "Menggabungkan video & audio...")

    opts = {
        **_base_opts(),
        "format": FORMAT,
        "merge_output_format": "mp4",
        "outtmpl": str(out_dir / "source.%(ext)s"),
        "progress_hooks": [hook],
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            path: Path | None = None
            for rd in info.get("requested_downloads") or []:
                fp = rd.get("filepath")
                if fp and Path(fp).exists():
                    path = Path(fp)
            if not path:
                cands = sorted(out_dir.glob("source.*"), key=lambda p: p.stat().st_size, reverse=True)
                cands = [c for c in cands if c.suffix.lower() not in (".part", ".ytdl", ".json")]
                if not cands:
                    raise RuntimeError("File hasil download tidak ditemukan.")
                path = cands[0]
        return path, info
    except Exception as e:
        err_msg = str(e)
        if "confirm you" in err_msg.lower() or "bot" in err_msg.lower():
            raise RuntimeError(
                "YouTube meminta verifikasi login (Sign in to confirm you're not a bot). "
                "Silakan simpan file 'cookies.txt' di folder storage/cookies.txt, "
                "atau upload file video secara langsung via tab 'Upload File Video'."
            ) from e
        raise
