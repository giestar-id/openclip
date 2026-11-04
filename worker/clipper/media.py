"""Utilitas FFmpeg: lokasi binary, eksekusi dengan progress, probe, audio, peaks, potong."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import wave
from collections import deque
from pathlib import Path
from typing import Callable

import numpy as np

from . import config

_FFMPEG: str | None = None
PEAKS_PER_SEC = 25

CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def ffmpeg_path() -> str:
    """FFMPEG_PATH di .env -> ffmpeg di PATH -> binary bawaan imageio-ffmpeg."""
    global _FFMPEG
    if _FFMPEG:
        return _FFMPEG
    candidates: list[str] = []
    if config.FFMPEG_PATH:
        candidates.append(config.FFMPEG_PATH)
    found = shutil.which("ffmpeg")
    if found:
        candidates.append(found)
    try:
        import imageio_ffmpeg

        candidates.append(imageio_ffmpeg.get_ffmpeg_exe())
    except Exception:  # pragma: no cover
        pass
    for c in candidates:
        if c and Path(c).exists():
            _FFMPEG = c
            return c
    raise RuntimeError(
        "FFmpeg tidak ditemukan. Install FFmpeg, set FFMPEG_PATH di worker/.env, "
        "atau `pip install imageio-ffmpeg`."
    )


class FFmpegError(RuntimeError):
    pass


def run_ffmpeg(
    args: list[str],
    duration: float | None = None,
    on_progress: Callable[[float], None] | None = None,
    cwd: str | Path | None = None,
) -> None:
    """Jalankan ffmpeg. on_progress menerima 0..1 jika duration diketahui."""
    cmd = [ffmpeg_path(), "-hide_banner", "-nostdin", "-y", "-progress", "pipe:1", "-nostats", *args]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=str(cwd) if cwd else None,
        creationflags=CREATE_NO_WINDOW,
    )
    tail: deque[str] = deque(maxlen=30)

    def _drain_stderr() -> None:
        assert proc.stderr
        for raw in proc.stderr:
            tail.append(raw.decode("utf-8", "replace").rstrip())

    t = threading.Thread(target=_drain_stderr, daemon=True)
    t.start()
    assert proc.stdout
    for raw in proc.stdout:
        line = raw.decode("utf-8", "replace").strip()
        if on_progress and duration and line.startswith("out_time_us="):
            try:
                us = int(line.split("=", 1)[1])
                on_progress(max(0.0, min(1.0, us / 1e6 / duration)))
            except ValueError:
                pass
    proc.wait()
    t.join(timeout=2)
    if proc.returncode != 0:
        msg = "\n".join(list(tail)[-8:])
        raise FFmpegError(f"FFmpeg gagal (kode {proc.returncode}):\n{msg}")


def probe(path: str | Path) -> dict:
    """Durasi & dimensi video dengan mem-parse output `ffmpeg -i` (tanpa ffprobe)."""
    proc = subprocess.run(
        [ffmpeg_path(), "-hide_banner", "-i", str(path)],
        capture_output=True,
        creationflags=CREATE_NO_WINDOW,
    )
    text = proc.stderr.decode("utf-8", "replace")
    info: dict = {"duration": None, "width": None, "height": None, "has_audio": "Audio:" in text}
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
    if m:
        h, mi, s = m.groups()
        info["duration"] = int(h) * 3600 + int(mi) * 60 + float(s)
    for line in text.splitlines():
        if "Video:" in line:
            vm = re.search(r",\s*(\d{2,5})x(\d{2,5})", line)
            if vm:
                info["width"], info["height"] = int(vm.group(1)), int(vm.group(2))
                rot = re.search(r"rotate\s*:\s*(-?\d+)", text)
                if rot and abs(int(rot.group(1))) in (90, 270):
                    info["width"], info["height"] = info["height"], info["width"]
                break
    return info


def extract_audio_wav(src: Path, dst: Path, duration: float | None, on_progress=None) -> None:
    """Audio mono 16 kHz PCM - dipakai faster-whisper & perhitungan peaks."""
    run_ffmpeg(
        ["-i", str(src), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(dst)],
        duration=duration,
        on_progress=on_progress,
    )


def encode_audio_mp3(src: Path, dst: Path, start: float = 0, length: float | None = None) -> None:
    """Audio kecil (mono 32 kbps) untuk diunggah ke Whisper API (batas 25 MB)."""
    args = ["-ss", f"{start:.3f}"]
    if length:
        args += ["-t", f"{length:.3f}"]
    args += ["-i", str(src), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k", str(dst)]
    run_ffmpeg(args)


def compute_peaks(wav_path: Path, out_path: Path) -> dict:
    """Peaks (0..100) & RMS per 1/25 detik untuk waveform timeline dan sinyal volume."""
    with wave.open(str(wav_path), "rb") as wf:
        rate = wf.getframerate()
        n = wf.getnframes()
        bucket = max(1, rate // PEAKS_PER_SEC)
        peaks: list[int] = []
        rms: list[int] = []
        chunk_frames = bucket * PEAKS_PER_SEC * 60  # proses per 60 detik
        read = 0
        while read < n:
            data = wf.readframes(min(chunk_frames, n - read))
            if not data:
                break
            arr = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
            read += len(arr)
            usable = (len(arr) // bucket) * bucket
            if usable:
                blocks = arr[:usable].reshape(-1, bucket)
                peaks.extend((np.abs(blocks).max(axis=1) * 100).round().astype(int).tolist())
                rms.extend((np.sqrt((blocks**2).mean(axis=1)) * 300).clip(0, 100).round().astype(int).tolist())
    data = {"rate": PEAKS_PER_SEC, "peaks": peaks, "rms": rms}
    out_path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    return data


_PREVIEW_ENCODER: list[str] | None = None


def get_preview_encoder_args() -> list[str]:
    """Deteksi encoder video tercepat (NVENC / QSV / AMF) dengan fallback 100% universal ke CPU multi-threaded.
    Aman dan kompatibel untuk laptop apa pun (Intel, AMD, NVIDIA, maupun CPU murni).
    """
    global _PREVIEW_ENCODER
    if _PREVIEW_ENCODER is not None:
        return list(_PREVIEW_ENCODER)

    try:
        ff = ffmpeg_path()
        candidates = [
            ("h264_nvenc", ["-c:v", "h264_nvenc", "-preset", "p1", "-cq", "24"]),
            ("h264_qsv", ["-c:v", "h264_qsv", "-preset", "veryfast", "-global_quality", "24"]),
            ("h264_amf", ["-c:v", "h264_amf", "-quality", "speed"]),
        ]
        for name, args in candidates:
            test_cmd = [ff, "-hide_banner", "-f", "lavfi", "-i", "nullsrc=s=256x256:d=0.05", *args, "-f", "null", "-"]
            try:
                res = subprocess.run(test_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=1.5)
                if res.returncode == 0:
                    _PREVIEW_ENCODER = args
                    return list(args)
            except Exception:
                continue
    except Exception:
        pass

    # Fallback universal untuk semua laptop / CPU (Intel, AMD Ryzen, ARM)
    # -threads 0 memaksimalkan seluruh core CPU, -preset veryfast 2.5x lebih cepat dari preset standar
    _PREVIEW_ENCODER = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-threads", "0"]
    return list(_PREVIEW_ENCODER)


def cut_preview(src: Path, dst: Path, start: float, end: float, height: int | None = None) -> None:
    """Preview HD TANPA burn-in caption untuk playback cepat & mulus di dashboard editor.

    Catatan: Ekspor final tetap dirender dari file video sumber asli (source.mp4)
    dengan kualitas Full HD 1080p di export.py.
    """
    h = height or config.PREVIEW_HEIGHT or 720
    target_h = min(h, 720)
    dur = max(0.1, end - start)
    encoder_args = get_preview_encoder_args()

    run_ffmpeg(
        [
            "-ss", f"{start:.3f}",
            "-i", str(src),
            "-t", f"{dur:.3f}",
            "-vf", f"scale=-2:'min({target_h},ih)'",
            *encoder_args,
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-ac", "2",
            "-movflags", "+faststart",
            str(dst),
        ],
    )


def thumbnail(src: Path, dst: Path, at: float, height: int = 360) -> None:
    run_ffmpeg(["-ss", f"{max(0, at):.3f}", "-i", str(src), "-frames:v", "1", "-vf", f"scale=-2:{height}", "-q:v", "4", str(dst)])


def has_filter(name: str) -> bool:
    proc = subprocess.run([ffmpeg_path(), "-hide_banner", "-filters"], capture_output=True, creationflags=CREATE_NO_WINDOW)
    return any(line.split()[1:2] == [name] for line in proc.stdout.decode("utf-8", "replace").splitlines() if line.strip())
