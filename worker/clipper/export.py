"""Render final klip video dengan reframing dan burn-in subtitle ASS (F-50, F-53, F-20, F-21).

Mendukung rasio 9:16, 1:1, 16:9, resolusi 720p dan 1080p, mode center crop,
fit + background blur, zoom/pan offset, pengaturan volume, dan pembersihan file retensi (F-64).
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Callable

from . import captions, config, media, overlays

logger = logging.getLogger(__name__)

_BEST_ENCODER_CONFIG: list[str] | None = None


def get_optimized_video_encoder_args() -> list[str]:
    """Deteksi dan pilih encoder video tercepat (Hardware GPU atau CPU x264 multi-threaded).

    Mekanisme terinspirasi dari arsitektur ekspor OpenCut yang memanfaatkan akselerasi GPU:
    1. Intel Quick Sync Video (h264_qsv)
    2. NVIDIA NVENC (h264_nvenc)
    3. AMD AMF (h264_amf)
    4. Fallback CPU libx264 multi-threaded (-preset veryfast -crf 22 -threads 0)
    """
    global _BEST_ENCODER_CONFIG
    if _BEST_ENCODER_CONFIG is not None:
        return list(_BEST_ENCODER_CONFIG)

    try:
        ffmpeg = media.ffmpeg_path()
        candidates = [
            ("h264_qsv", ["-c:v", "h264_qsv", "-global_quality", "22", "-preset", "veryfast"]),
            ("h264_nvenc", ["-c:v", "h264_nvenc", "-cq", "22", "-preset", "p4"]),
            ("h264_amf", ["-c:v", "h264_amf", "-quality", "speed"]),
            ("libx264", ["-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-threads", "0"]),
        ]

        for name, args in candidates:
            if name == "libx264":
                _BEST_ENCODER_CONFIG = args
                logger.info("Menggunakan CPU encoder teroptimasi multi-threaded: %s", " ".join(args))
                return list(args)

            test_cmd = [ffmpeg, "-f", "lavfi", "-i", "nullsrc=s=256x256:d=0.1", *args, "-f", "null", "-"]
            try:
                res = subprocess.run(test_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2.0)
                if res.returncode == 0:
                    _BEST_ENCODER_CONFIG = args
                    logger.info("Akselerasi Hardware GPU Aktif (%s) untuk ekspor video super cepat: %s", name, " ".join(args))
                    return list(args)
            except Exception:
                continue
    except Exception as e:
        logger.warning("Gagal mendeteksi hardware encoder: %s, menggunakan fallback CPU", e)

    _BEST_ENCODER_CONFIG = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-threads", "0"]
    return list(_BEST_ENCODER_CONFIG)


def _escape_filter_path(path: Path | str | None) -> str:
    """Escape path untuk argumen filter FFmpeg di Windows / Unix."""
    if not path:
        return ""
    p_str = Path(path).resolve().as_posix()
    # Di Windows, ganti C:/... menjadi C\:/...
    if len(p_str) > 1 and p_str[1] == ":":
        p_str = p_str[0] + r"\:" + p_str[2:]
    return p_str.replace("'", r"\'")


def resolve_dimensions(ratio: str, resolution: str) -> tuple[int, int]:
    """Tentukan dimensi (width, height) berdasarkan rasio dan resolusi target."""
    is_720 = resolution.lower() == "720p"
    ratio = ratio.lower()

    if ratio == "9:16":
        return (720, 1280) if is_720 else (1080, 1920)
    elif ratio == "1:1":
        return (720, 720) if is_720 else (1080, 1080)
    elif ratio == "16:9":
        return (1280, 720) if is_720 else (1920, 1080)
    else:  # default 9:16
        return (720, 1280) if is_720 else (1080, 1920)


def build_visual_effects_filter(frame: dict, target_h: int = 1920) -> str:
    """Bangun filter visual FFmpeg (Color Grading, Preset LUTs, Gaussian Blur, Vignette, dan Cinematic Bars)."""
    filters = []

    # 1. Kecerahan, Kontras, dan Saturasi Manual
    br = float(frame.get("brightness", 1.0))
    co = float(frame.get("contrast", 1.0))
    sa = float(frame.get("saturation", 1.0))
    if br != 1.0 or co != 1.0 or sa != 1.0:
        filters.append(f"eq=brightness={br-1.0:.2f}:contrast={co:.2f}:saturation={sa:.2f}")

    # 2. Preset Filter Warna (LUT-style)
    preset = frame.get("filterPreset", "none")
    intensity = max(0.0, min(1.0, float(frame.get("filterIntensity", 100)) / 100.0))

    if preset and preset != "none" and intensity > 0.05:
        if preset == "cinematic":
            # Teal & orange: warm highlights, cyan shadows
            rs = 0.08 * intensity
            bs = -0.06 * intensity
            rm = -0.04 * intensity
            bm = 0.08 * intensity
            filters.append(f"colorbalance=rs={rs:.2f}:bs={bs:.2f}:rm={rm:.2f}:bm={bm:.2f},eq=contrast={1.0 + 0.15*intensity:.2f}:saturation={1.0 + 0.2*intensity:.2f}")
        elif preset == "vintage":
            # Retro 90s: golden sepia warm tone
            rs = 0.12 * intensity
            gs = 0.06 * intensity
            bs = -0.10 * intensity
            filters.append(f"colorbalance=rs={rs:.2f}:gs={gs:.2f}:bs={bs:.2f},eq=contrast={1.0 - 0.06*intensity:.2f}:saturation={1.0 + 0.1*intensity:.2f}:brightness={0.03*intensity:.2f}")
        elif preset == "monochrome":
            # Noir B&W
            filters.append(f"hue=s={1.0 - intensity:.2f},eq=contrast={1.0 + 0.2*intensity:.2f}:brightness={0.02*intensity:.2f}")
        elif preset == "vibrant":
            # Extra pop & fresh
            filters.append(f"eq=saturation={1.0 + 0.45*intensity:.2f}:contrast={1.0 + 0.1*intensity:.2f}:brightness={0.02*intensity:.2f}")
        elif preset == "cold":
            # Nordic Cool: cool blues
            rs = -0.06 * intensity
            bs = 0.12 * intensity
            bm = 0.08 * intensity
            filters.append(f"colorbalance=rs={rs:.2f}:bs={bs:.2f}:bm={bm:.2f},eq=contrast={1.0 + 0.12*intensity:.2f}")
        elif preset == "warm":
            # Sunset Golden Hour
            rs = 0.12 * intensity
            gs = 0.04 * intensity
            bs = -0.08 * intensity
            filters.append(f"colorbalance=rs={rs:.2f}:gs={gs:.2f}:bs={bs:.2f},eq=saturation={1.0 + 0.25*intensity:.2f}:brightness={0.02*intensity:.2f}")
        elif preset == "fade":
            # Matte editorial film
            filters.append(f"curves=all='0/{0.08*intensity:.2f} 1/{1.0 - 0.08*intensity:.2f}',eq=saturation={1.0 - 0.15*intensity:.2f}")
        elif preset == "cyberpunk":
            # Neon purple / cyan
            rs = 0.10 * intensity
            gs = -0.04 * intensity
            bs = 0.14 * intensity
            filters.append(f"colorbalance=rs={rs:.2f}:gs={gs:.2f}:bs={bs:.2f},eq=contrast={1.0 + 0.22*intensity:.2f}:saturation={1.0 + 0.35*intensity:.2f}")

    # 3. Gaussian Blur pada video utama (OpenCut blur)
    video_blur = int(frame.get("videoBlur", 0))
    if video_blur > 0:
        filters.append(f"gblur=sigma={video_blur}:steps=1")

    # 4. Vignette (tepi gelap melingkar)
    if frame.get("vignette"):
        filters.append("vignette=PI/4")

    # 5. OpenCut Cinematic Bars (Letterbox Black Bars Mask)
    if frame.get("cinematicBars"):
        bar_pct = float(frame.get("cinematicBarsHeight", 12.0)) / 100.0
        bar_h = max(10, int(round(target_h * bar_pct)))
        filters.append(f"drawbox=x=0:y=0:w=iw:h={bar_h}:color=black:t=fill,drawbox=x=0:y=ih-{bar_h}:w=iw:h={bar_h}:color=black:t=fill")

    return ",".join(filters)


def _build_dynamic_crop_x_expr(
    frame: dict,
    target_w: int,
    default_offset_x: float,
) -> str:
    """Bangun ekspresi koordinat crop X dinamis (Active Speaker Multi-Cam Cut / Smooth Follow)."""
    mode = frame.get("mode", "crop")
    if mode in ("social", "fit", "fit_blur") or not frame.get("faceTracking", True):
        clamped_def = max(-0.85, min(0.85, default_offset_x))
        return f"min(iw-{target_w},max(0,(iw-{target_w})*(0.5+({clamped_def:.3f}))))"

    tracking_mode = frame.get("trackingMode", "static")
    speaker_shots = frame.get("speakerShots") or []
    keyframes = frame.get("trackingKeyframes") or []
    detected_speakers = frame.get("detectedSpeakers") or []

    # Anti-Empty-Center Gate: Jika terdeteksi 2 pembicara terpisah (kiri & kanan),
    # cegah kamera crop jatuh ke tengah-tengah meja kosong jika offset mendekati 0
    if len(detected_speakers) >= 2:
        spk_offs = [float(s.get("offset_x", 0.0)) / 100.0 for s in detected_speakers]
        if abs(spk_offs[0] - spk_offs[-1]) > 0.16:
            if abs(default_offset_x) < 0.08:
                prim = next((s for s in detected_speakers if s.get("is_primary")), detected_speakers[0])
                default_offset_x = float(prim.get("offset_x", 0.0)) / 100.0

    # 1. Active Speaker Auto-Switch (Multi-Cam Cut podcast 2+ pembicara)
    if tracking_mode == "auto_switch" and len(speaker_shots) >= 2:
        # Validasi setiap shot agar tidak menyorot tengah kosong
        cleaned_shots = []
        for s in speaker_shots:
            s_dict = dict(s)
            s_off = float(s_dict.get("offsetX", 0.0)) / 100.0
            if abs(s_off) < 0.08 and len(detected_speakers) >= 2:
                matching_spk = next((sp for sp in detected_speakers if sp.get("id") == s_dict.get("speakerId")), detected_speakers[0])
                s_dict["offsetX"] = matching_spk.get("offset_x", 0.0)
            cleaned_shots.append(s_dict)

        if len(cleaned_shots) > 40:
            while len(cleaned_shots) > 40:
                min_i = min(
                    range(len(cleaned_shots) - 1),
                    key=lambda idx: float(cleaned_shots[idx].get("end", 0.0)) - float(cleaned_shots[idx].get("start", 0.0)),
                )
                cleaned_shots[min_i]["end"] = cleaned_shots[min_i + 1]["end"]
                cleaned_shots.pop(min_i + 1)

        last_off = max(-0.50, min(0.50, float(cleaned_shots[-1].get("offsetX", 0.0)) / 100.0))
        expr = f"{last_off:.3f}"
        for s in reversed(cleaned_shots[:-1]):
            cut_t = float(s.get("end", 0.0))
            off_val = max(-0.50, min(0.50, float(s.get("offsetX", 0.0)) / 100.0))
            expr = f"if(lt(t\\,{cut_t:.2f})\\,{off_val:.3f}\\,{expr})"
        return f"min(iw-{target_w},max(0,(iw-{target_w})*(0.5+({expr}))))"

    # 2. Smooth Camera Follow (Presenter / vlogger berjalan di panggung dengan Catmull-Rom Spline)
    elif tracking_mode == "smooth_follow" and len(keyframes) >= 3:
        if len(keyframes) > 45:
            # Subsample keyframe agar aman dari batas stack FFmpeg (< 80)
            selected_indices = {0, len(keyframes) - 1}
            scores = []
            for idx in range(1, len(keyframes) - 1):
                d1 = abs(float(keyframes[idx].get("offsetX", 0.0)) - float(keyframes[idx - 1].get("offsetX", 0.0)))
                d2 = abs(float(keyframes[idx + 1].get("offsetX", 0.0)) - float(keyframes[idx].get("offsetX", 0.0)))
                scores.append((d1 + d2, idx))
            scores.sort(key=lambda x: x[0], reverse=True)
            for _, idx in scores[:43]:
                selected_indices.add(idx)
            keyframes = [keyframes[i] for i in sorted(selected_indices)]

        last_off = max(-0.50, min(0.50, float(keyframes[-1].get("offsetX", 0.0)) / 100.0))
        expr = f"{last_off:.3f}"
        for i in range(len(keyframes) - 2, -1, -1):
            t_s = float(keyframes[i].get("time", 0.0))
            t_e = float(keyframes[i + 1].get("time", 0.0))
            dt = max(0.04, t_e - t_s)
            p1 = max(-0.50, min(0.50, float(keyframes[i].get("offsetX", 0.0)) / 100.0))
            p2 = max(-0.50, min(0.50, float(keyframes[i + 1].get("offsetX", 0.0)) / 100.0))

            if abs(p2 - p1) > 0.18:
                # Pergantian antar orang berbeda: Instant Cut di titik tengah waktu (bukan meluncur lewat ruang kosong)
                t_mid = (t_s + t_e) / 2.0
                seg_expr = f"if(lt(t\\,{t_mid:.2f})\\,{p1:.3f}\\,{p2:.3f})"
            else:
                p0 = max(-0.50, min(0.50, float(keyframes[i - 1].get("offsetX", 0.0)) / 100.0)) if i > 0 else p1
                p3 = max(-0.50, min(0.50, float(keyframes[i + 2].get("offsetX", 0.0)) / 100.0)) if i + 2 < len(keyframes) else p2

                # Clamp tangents jika batas segmen adalah cut
                if abs(p1 - p0) > 0.18:
                    p0 = p1
                if abs(p3 - p2) > 0.18:
                    p3 = p2

                # Koefisien kurva spline Catmull-Rom
                c0 = p1
                c1 = 0.5 * (p2 - p0)
                c2 = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3
                c3 = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3

                u = f"((t-{t_s:.2f})/{dt:.2f})"
                seg_expr = f"({c0:.3f}+{u}*({c1:.3f}+{u}*({c2:.3f}+{u}*{c3:.3f})))"

            expr = f"if(lt(t\\,{t_e:.2f})\\,{seg_expr}\\,{expr})"
        return f"min(iw-{target_w},max(0,(iw-{target_w})*(0.5+({expr}))))"

    # 3. Static fallback
    clamped_def = max(-0.50, min(0.50, default_offset_x))
    return f"min(iw-{target_w},max(0,(iw-{target_w})*(0.5+({clamped_def:.3f}))))"


def build_filtergraph(
    frame: dict,
    target_w: int,
    target_h: int,
    ass_path: Path,
    fonts_dir: Path,
    duration: float = 60.0,
    overlay_png_path: Path | None = None,
    timed_overlays: list[tuple[Path, float | None, float | None]] | None = None,
) -> str:
    """Bangun filter_complex atau video filter untuk reframing + visual effects + progress bar + overlay + caption ASS."""
    mode = frame.get("mode", "crop")  # 'crop', 'fit_blur', 'fit', 'split', 'social'
    zoom = max(0.4, min(3.0, float(frame.get("zoom", 1.0))))
    offset_x = max(-85.0, min(85.0, float(frame.get("offsetX", 0.0)))) / 100.0  # -0.85 .. 0.85
    offset_y = max(-60.0, min(60.0, float(frame.get("offsetY", 0.0)))) / 100.0  # -0.60 .. 0.60
    speed = max(0.5, min(2.0, float(frame.get("speed", 1.0))))
    setpts = f",setpts=PTS/{speed:.4f}" if speed != 1.0 else ""

    if ass_path:
        escaped_ass = _escape_filter_path(ass_path)
        actual_fonts = fonts_dir or config.FONTS_DIR
        escaped_fonts = _escape_filter_path(actual_fonts)
        if escaped_fonts:
            ass_filter = f"ass='{escaped_ass}':fontsdir='{escaped_fonts}'"
        else:
            ass_filter = f"ass='{escaped_ass}'"
    else:
        ass_filter = ""

    # Efek visual gabungan (grading + preset LUTs + video blur + vignette + cinematic bars)
    fx = build_visual_effects_filter(frame, target_h=target_h)
    fx_comma = f",{fx}" if fx else ""
    fx_prefix = f"{fx}," if fx else ""

    # Progress bar drawbox jika diaktifkan
    pb = frame.get("progressBar", {})
    pb_filter = ""
    if pb.get("enabled"):
        pb_h = max(2, min(16, int(pb.get("height", 4))))
        pb_col = pb.get("color", "#38bdf8")
        pb_pos = pb.get("position", "bottom")
        if pb_col.startswith("#"):
            pb_col = "0x" + pb_col[1:]
        pb_y = f"{target_h - pb_h}" if pb_pos == "bottom" else "0"
        pb_filter = f",drawbox=x=0:y={pb_y}:w='min({target_w}\\,max(0\\,{target_w}*(t/{duration:.3f})))':h={pb_h}:color={pb_col}@1:t=fill"

    # Filter pasca-komposisi: setpts ditempatkan PERTAMA agar waktu `t` pada ProgressBar & Subtitle ASS selaras 100% dengan eff_duration!
    post_filters = []
    if speed != 1.0:
        post_filters.append(f"setpts=PTS/{speed:.4f}")
    if pb_filter:
        post_filters.append(pb_filter.lstrip(","))
    if ass_filter:
        post_filters.append(ass_filter)
    post_str = ",".join(post_filters) if post_filters else "null"

    # Bangun daftar overlay (statis penuh maupun timed dengan enable='between(t,s,e)')
    all_overlays: list[tuple[Path, float | None, float | None]] = []
    if overlay_png_path is not None and overlay_png_path.exists():
        all_overlays.append((overlay_png_path, None, None))
    for ov_p, ov_s, ov_e in (timed_overlays or []):
        if ov_p and ov_p.exists():
            all_overlays.append((ov_p, ov_s, ov_e))

    has_overlay = len(all_overlays) > 0

    def _chain_overlays(in_label: str) -> tuple[str, str]:
        """Rangkai semua PNG overlay di atas [in_label], kembalikan (filter_chain, out_label)."""
        parts: list[str] = []
        cur = in_label
        for idx, (ov_p, ov_s, ov_e) in enumerate(all_overlays):
            esc = _escape_filter_path(ov_p)
            ov_lbl = f"ov_{idx}"
            nxt_lbl = f"v_ov_{idx}"
            if ov_s is not None or ov_e is not None:
                s_val = max(0.0, float(ov_s or 0.0))
                e_val = float(ov_e) if ov_e is not None else max(s_val + 0.1, duration * speed)
                parts.append(f"movie='{esc}'[{ov_lbl}];[{cur}][{ov_lbl}]overlay=0:0:enable='between(t\\,{s_val:.3f}\\,{e_val:.3f})'[{nxt_lbl}]")
            else:
                parts.append(f"movie='{esc}'[{ov_lbl}];[{cur}][{ov_lbl}]overlay=0:0[{nxt_lbl}]")
            cur = nxt_lbl
        return ";".join(parts), cur

    if mode == "fit_blur":
        blur_sigma = int(frame.get("blur", 24))
        ds_w = max(64, int(target_w // 4))
        ds_h = max(64, int(target_h // 4))
        ds_w = ds_w if ds_w % 2 == 0 else ds_w + 1
        ds_h = ds_h if ds_h % 2 == 0 else ds_h + 1
        ds_sigma = max(3, min(10, int(blur_sigma * 0.25 * 0.75)))

        base = (
            f"[0:v]split=2[bg_src][fg_src];"
            f"[bg_src]scale={ds_w}:{ds_h}:force_original_aspect_ratio=increase,"
            f"crop={ds_w}:{ds_h},"
            f"gblur=sigma={ds_sigma}:steps=1,"
            f"scale={target_w}:{target_h}:flags=bilinear,"
            f"eq=brightness=-0.12:contrast=0.95[bg];"
            f"[fg_src]scale={target_w}*{zoom:.3f}:{target_h}*{zoom:.3f}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2{fx_comma}[fg];"
            f"[bg][fg]overlay=(W-w)/2+(W*{offset_x:.3f}):(H-h)/2+(H*{offset_y:.3f})[v_merged]"
        )
        if has_overlay:
            ov_chain, out_ov = _chain_overlays("v_merged")
            return f"{base};{ov_chain};[{out_ov}]{post_str}[outv]"
        return f"{base};[v_merged]{post_str}[outv]"

    elif mode == "split":
        split_ratio = max(0.3, min(0.7, float(frame.get("splitRatio", 50)) / 100.0))
        top_h = int(target_h * split_ratio)
        top_h = top_h if top_h % 2 == 0 else top_h + 1
        bot_h = target_h - top_h
        bot_h = bot_h if bot_h % 2 == 0 else bot_h - 1

        top_x = max(-85.0, min(85.0, float(frame.get("splitTopOffsetX", -25.0)))) / 100.0
        bot_x = max(-85.0, min(85.0, float(frame.get("splitBottomOffsetX", 25.0)))) / 100.0
        top_y = max(-60.0, min(60.0, float(frame.get("splitTopOffsetY", 0.0)))) / 100.0
        bot_y = max(-60.0, min(60.0, float(frame.get("splitBottomOffsetY", 0.0)))) / 100.0
        top_zoom = max(0.4, min(3.0, float(frame.get("splitTopZoom", frame.get("zoom", 1.0)))))
        bot_zoom = max(0.4, min(3.0, float(frame.get("splitBottomZoom", frame.get("zoom", 1.0)))))
        div_w = max(0, min(12, int(frame.get("splitDividerWidth", 2))))
        div_col = frame.get("splitDividerColor", "#38bdf8")

        def _make_split_box(prefix: str, box_h: int, zoom: float, off_x: float, off_y: float) -> str:
            scaled_w = int(target_w * zoom)
            scaled_h = int(box_h * zoom)
            scaled_w = scaled_w if scaled_w % 2 == 0 else scaled_w + 1
            scaled_h = scaled_h if scaled_h % 2 == 0 else scaled_h + 1
            return (
                f"[{prefix}_src]split=2[{prefix}_bg_src][{prefix}_fg_src];"
                f"[{prefix}_bg_src]scale={target_w}:{box_h}:force_original_aspect_ratio=increase,crop={target_w}:{box_h},gblur=sigma=16:steps=1,eq=brightness=-0.15[{prefix}_bg];"
                f"[{prefix}_fg_src]scale={scaled_w}:{scaled_h}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[{prefix}_fg];"
                f"[{prefix}_bg][{prefix}_fg]overlay=(W-w)/2+(W*{off_x:.3f}):(H-h)/2+(H*{off_y:.3f})[{prefix}_v]"
            )

        t_filter = _make_split_box("t", top_h, top_zoom, top_x, top_y)
        b_filter = _make_split_box("b", bot_h, bot_zoom, bot_x, bot_y)

        stacked_filters = []
        if div_w > 0:
            stacked_filters.append(f"drawbox=x=0:y={top_h - div_w//2}:w={target_w}:h={div_w}:color={div_col}@1:t=fill")
        if fx:
            stacked_filters.append(fx)
        stacked_str = ",".join(stacked_filters) if stacked_filters else "null"

        base = (
            f"[0:v]split=2[t_src][b_src];"
            f"{t_filter};"
            f"{b_filter};"
            f"[t_v][b_v]vstack[stacked];"
            f"[stacked]{stacked_str}[v_split]"
        )
        if has_overlay:
            ov_chain, out_ov = _chain_overlays("v_split")
            return f"{base};{ov_chain};[{out_ov}]{post_str}[outv]"
        return f"{base};[v_split]{post_str}[outv]"

    elif mode == "fit":
        fit_color = str(frame.get("fitColor") or frame.get("fitBgColor") or "#000000").strip()
        if fit_color.startswith("#"):
            fit_color = "0x" + fit_color[1:]

        if has_overlay:
            base = (
                f"[0:v]{fx_prefix}"
                f"scale={target_w}*{zoom:.3f}:{target_h}*{zoom:.3f}:force_original_aspect_ratio=decrease,"
                f"crop=min(iw\\,{target_w}):min(ih\\,{target_h}),"
                f"pad={target_w}:{target_h}:(ow-iw)/2+(ow*{offset_x:.3f}):(oh-ih)/2+(oh*{offset_y:.3f}):color={fit_color}[v_padded]"
            )
            ov_chain, out_ov = _chain_overlays("v_padded")
            return f"{base};{ov_chain};[{out_ov}]{post_str}[outv]"
        else:
            filters = []
            if fx:
                filters.append(fx)
            filters.append(f"scale={target_w}*{zoom:.3f}:{target_h}*{zoom:.3f}:force_original_aspect_ratio=decrease")
            filters.append(f"crop=min(iw\\,{target_w}):min(ih\\,{target_h})")
            filters.append(f"pad={target_w}:{target_h}:(ow-iw)/2+(ow*{offset_x:.3f}):(oh-ih)/2+(oh*{offset_y:.3f}):color={fit_color}")
            if post_str:
                filters.append(post_str)
            return ",".join(filters)

    elif mode == "social":
        sp = frame.get("socialProfile", {}) or {}
        vid_h_pct = max(15.0, min(90.0, float(sp.get("videoFrameHeight", 66)))) / 100.0
        vid_h = int(target_h * vid_h_pct)
        vid_h = vid_h if vid_h % 2 == 0 else vid_h + 1
        vid_h = min(target_h, vid_h)

        vid_offset_y_pct = float(sp.get("videoFrameOffsetY", 0.0)) / 100.0
        max_vid_y = max(0, target_h - vid_h)
        raw_vid_y = int((target_h - vid_h) / 2 + (target_h * vid_offset_y_pct))
        vid_y = max(0, min(max_vid_y, (raw_vid_y // 2) * 2))

        bg_color = sp.get("bgColor", "#FFFFFF")
        if bg_color.startswith("#"):
            bg_color = "0x" + bg_color[1:]

        pad_px_web = max(0.0, min(50.0, float(sp.get("framePadding", 0))))
        pad_pct = pad_px_web / 360.0
        raw_pad_x = int(target_w * pad_pct)
        inner_w = max(200, target_w - 2 * raw_pad_x)
        inner_w = inner_w if inner_w % 2 == 0 else inner_w - 1
        inner_w = min(target_w, inner_w)
        max_pad_x = max(0, (target_w - inner_w) // 2)
        pad_x = max(0, min(max_pad_x, (raw_pad_x // 2) * 2))

        scaled_w = int(inner_w * zoom)
        scaled_h = int(vid_h * zoom)
        scaled_w = scaled_w if scaled_w % 2 == 0 else scaled_w + 1
        scaled_h = scaled_h if scaled_h % 2 == 0 else scaled_h + 1

        base_fc = (
            f"[0:v]split=2[soc_bg_src][soc_fg_src];"
            f"[soc_bg_src]scale={inner_w}:{vid_h}:force_original_aspect_ratio=increase,crop={inner_w}:{vid_h},gblur=sigma=16:steps=1,eq=brightness=-0.15[soc_bg_v];"
            f"[soc_fg_src]scale={scaled_w}:{scaled_h}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2{fx_comma}[soc_fg_v];"
            f"[soc_bg_v][soc_fg_v]overlay=(W-w)/2+(W*{offset_x:.3f}):(H-h)/2+(H*{offset_y:.3f})[soc_v];"
            f"[soc_v]pad={target_w}:{target_h}:{pad_x}:{vid_y}:color={bg_color}[soc_padded]"
        )

        if has_overlay:
            ov_chain, out_ov = _chain_overlays("soc_padded")
            return f"{base_fc};{ov_chain};[{out_ov}]{post_str}[outv]"
        return f"{base_fc};[soc_padded]{post_str}[outv]"

    else:
        eff_zoom = max(zoom, 1.0 + 2.05 * abs(offset_y))
        w_scaled = int(round(target_w * eff_zoom))
        w_scaled = w_scaled if w_scaled % 2 == 0 else w_scaled + 1
        h_scaled = int(round(target_h * eff_zoom))
        h_scaled = h_scaled if h_scaled % 2 == 0 else h_scaled + 1

        crop_x = _build_dynamic_crop_x_expr(frame, target_w, offset_x)
        crop_y = f"min(ih-{target_h},max(0,(ih-{target_h})/2-({target_h}*{offset_y:.3f})))"

        scale_filter = f"scale='if(gt(a,{target_w}/{target_h}),-2,{w_scaled})':'if(gt(a,{target_w}/{target_h}),{h_scaled},-2)'"

        if has_overlay:
            base = (
                f"[0:v]{fx_prefix}"
                f"{scale_filter},"
                f"crop={target_w}:{target_h}:'{crop_x}':'{crop_y}'[v_cropped]"
            )
            ov_chain, out_ov = _chain_overlays("v_cropped")
            return f"{base};{ov_chain};[{out_ov}]{post_str}[outv]"
        else:
            filters = []
            if fx:
                filters.append(fx)
            filters.append(scale_filter)
            filters.append(f"crop={target_w}:{target_h}:'{crop_x}':'{crop_y}'")
            if post_str:
                filters.append(post_str)
            return ",".join(filters)


def _compute_active_ranges(start_sec: float, end_sec: float, cut_ranges: list[dict] | None) -> list[tuple[float, float]]:
    """Kurangi cutRanges dari [start_sec, end_sec] menjadi daftar segmen aktif yang akan digabung."""
    if not cut_ranges or end_sec <= start_sec:
        return [(start_sec, end_sec)]
    clamped = []
    for r in cut_ranges:
        try:
            cs = max(start_sec, min(end_sec, float(r.get("start", 0.0))))
            ce = max(start_sec, min(end_sec, float(r.get("end", 0.0))))
            if ce - cs >= 0.05:
                clamped.append((cs, ce))
        except Exception:
            continue
    if not clamped:
        return [(start_sec, end_sec)]
    clamped.sort(key=lambda x: x[0])
    merged: list[list[float]] = []
    for cs, ce in clamped:
        if not merged or cs > merged[-1][1] + 0.02:
            merged.append([cs, ce])
        else:
            merged[-1][1] = max(merged[-1][1], ce)

    active: list[tuple[float, float]] = []
    cursor = start_sec
    for cs, ce in merged:
        if cs > cursor + 0.04:
            active.append((cursor, cs))
        cursor = max(cursor, ce)
    if end_sec > cursor + 0.04:
        active.append((cursor, end_sec))
    return active if active else [(start_sec, end_sec)]


def _remap_segments_for_active_ranges(
    caption_segments: list[dict],
    active_ranges: list[tuple[float, float]],
) -> list[dict]:
    """Petakan ulang timestamp caption agar selaras 100% setelah segmen video tengah dibuang (cutRanges)."""
    def _map_t(t: float) -> float | None:
        acc = 0.0
        for rs, re in active_ranges:
            if t < rs:
                return acc
            if rs <= t <= re:
                return acc + (t - rs)
            acc += (re - rs)
        return None

    remapped: list[dict] = []
    for seg in caption_segments or []:
        new_words = []
        for w in seg.get("words") or []:
            ws = float(w.get("s", seg.get("start", 0.0)))
            we = float(w.get("e", seg.get("end", ws + 0.1)))
            mid = (ws + we) / 2.0
            in_active = any(rs <= mid <= re for rs, re in active_ranges)
            if not in_active:
                continue
            ms = _map_t(ws)
            me = _map_t(we)
            if ms is None or me is None:
                continue
            if me <= ms:
                me = ms + 0.05
            new_words.append({**w, "s": round(ms, 3), "e": round(me, 3)})
        if new_words:
            remapped.append({
                **seg,
                "start": new_words[0]["s"],
                "end": max(new_words[0]["s"] + 0.05, new_words[-1]["e"]),
                "text": " ".join(x.get("w", "") for x in new_words),
                "words": new_words,
            })
    return remapped


def _remap_frame_tracking_for_active_ranges(
    frame: dict,
    clip_start: float,
    active_ranges: list[tuple[float, float]],
) -> dict:
    """Petakan ulang speakerShots & trackingKeyframes (yang memakai waktu relatif thd clip_start) setelah cutRanges diterapkan."""
    if not active_ranges:
        return frame

    def _map_abs_t(t_abs: float) -> float | None:
        acc = 0.0
        for rs, re in active_ranges:
            if t_abs < rs:
                return acc
            if rs <= t_abs <= re:
                return acc + (t_abs - rs)
            acc += (re - rs)
        return acc

    updated = dict(frame)

    shots = frame.get("speakerShots")
    if isinstance(shots, list) and shots:
        new_shots = []
        for s in shots:
            abs_s = clip_start + float(s.get("start", 0.0))
            abs_e = clip_start + float(s.get("end", 0.0))
            ms = _map_abs_t(abs_s)
            me = _map_abs_t(abs_e)
            if ms is not None and me is not None and me - ms >= 0.08:
                new_shots.append({**s, "start": round(ms, 3), "end": round(me, 3)})
        updated["speakerShots"] = new_shots

    kfs = frame.get("trackingKeyframes")
    if isinstance(kfs, list) and kfs:
        new_kfs = []
        for kf in kfs:
            abs_t = clip_start + float(kf.get("time", 0.0))
            if any(rs - 0.05 <= abs_t <= re + 0.05 for rs, re in active_ranges):
                mt = _map_abs_t(abs_t)
                if mt is not None:
                    new_kfs.append({**kf, "time": round(mt, 3)})
        updated["trackingKeyframes"] = new_kfs

    return updated


def _concat_active_ranges(src_video: Path, dst_temp: Path, active_ranges: list[tuple[float, float]]) -> float:
    """Potong dan sambung beberapa segmen aktif [s, e] dari src_video ke file temp frame-accurate (aman meski video tanpa audio)."""
    probe_info = media.probe(src_video)
    has_audio = bool(probe_info.get("has_audio", True))

    v_parts = []
    a_parts = []
    concat_inputs = []
    total_dur = 0.0
    for idx, (rs, re) in enumerate(active_ranges):
        v_parts.append(f"[0:v]trim=start={rs:.3f}:end={re:.3f},setpts=PTS-STARTPTS[v{idx}]")
        if has_audio:
            a_parts.append(f"[0:a]atrim=start={rs:.3f}:end={re:.3f},asetpts=PTS-STARTPTS[a{idx}]")
            concat_inputs.append(f"[v{idx}][a{idx}]")
        else:
            concat_inputs.append(f"[v{idx}]")
        total_dur += max(0.05, re - rs)

    if has_audio:
        fc = ";".join(v_parts + a_parts) + f";{''.join(concat_inputs)}concat=n={len(active_ranges)}:v=1:a=1[cv][ca]"
        args = [
            "-i", str(src_video),
            "-filter_complex", fc,
            "-map", "[cv]",
            "-map", "[ca]",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "16",
            "-c:a", "aac", "-b:a", "192k",
            str(dst_temp),
        ]
    else:
        fc = ";".join(v_parts) + f";{''.join(concat_inputs)}concat=n={len(active_ranges)}:v=1:a=0[cv]"
        args = [
            "-i", str(src_video),
            "-filter_complex", fc,
            "-map", "[cv]",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "16",
            "-an",
            str(dst_temp),
        ]
    media.run_ffmpeg(args, duration=total_dur)
    return total_dur


def render_clip(
    src_video: Path,
    dst_video: Path,
    start_sec: float,
    end_sec: float,
    caption_segments: list[dict],
    style: dict | None = None,
    frame: dict | None = None,
    audio: dict | None = None,
    resolution: str = "1080p",
    on_progress: Callable[[float], None] | None = None,
) -> Path:
    """Render satu klip video final secara komplit dengan dukungan cutRanges, timed overlays, & optimasi GPU."""
    dst_video.parent.mkdir(parents=True, exist_ok=True)
    st = {**captions.DEFAULT_STYLE, **(style or {})}
    fr = {**captions.DEFAULT_FRAME, **(frame or {})}
    au = {**captions.DEFAULT_AUDIO, **(audio or {})}

    ratio = fr.get("ratio", "9:16")
    w, h = resolve_dimensions(ratio, resolution)
    speed = max(0.5, min(2.0, float(fr.get("speed", 1.0))))

    active_ranges = _compute_active_ranges(start_sec, end_sec, fr.get("cutRanges"))
    has_cuts = len(active_ranges) > 1 or (
        len(active_ranges) == 1
        and (abs(active_ranges[0][0] - start_sec) > 0.05 or abs(active_ranges[0][1] - end_sec) > 0.05)
    )

    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        render_src = src_video
        render_start = start_sec
        render_end = end_sec
        render_captions = caption_segments or []

        if has_cuts:
            logger.info("Menerapkan %d segmen aktif (non-destructive cutRanges) sebelum render...", len(active_ranges))
            concat_file = td_path / "cut_concat.mp4"
            concat_dur = _concat_active_ranges(src_video, concat_file, active_ranges)
            fr = _remap_frame_tracking_for_active_ranges(fr, start_sec, active_ranges)
            render_src = concat_file
            render_start = 0.0
            render_end = concat_dur
            render_captions = _remap_segments_for_active_ranges(render_captions, active_ranges)

        raw_duration = max(0.1, render_end - render_start)
        eff_duration = raw_duration / speed

        # Cek apakah Hook Title atau Watermark punya durasi kustom (startSec / endSec)
        ht = fr.get("hookTitle", {}) or {}
        wm = fr.get("watermark", {}) or {}
        ht_has_timing = bool(ht.get("enabled") and (ht.get("startSec") is not None or ht.get("endSec") is not None))
        wm_has_timing = bool(wm.get("enabled") and (wm.get("startSec") is not None or wm.get("endSec") is not None))

        timed_overlays: list[tuple[Path, float | None, float | None]] = []
        overlay_path = td_path / "static_overlay.png"

        if ht_has_timing or wm_has_timing:
            has_static = overlays.generate_static_overlay(
                fr, w, h, overlay_path,
                include_social=True,
                include_hook=not ht_has_timing,
                include_watermark=not wm_has_timing,
            )
            actual_overlay = overlay_path if has_static else None

            if ht_has_timing:
                ht_png = td_path / "hook_overlay.png"
                if overlays.generate_static_overlay(fr, w, h, ht_png, include_social=False, include_hook=True, include_watermark=False):
                    timed_overlays.append((ht_png, ht.get("startSec"), ht.get("endSec")))
            if wm_has_timing:
                wm_png = td_path / "wm_overlay.png"
                if overlays.generate_static_overlay(fr, w, h, wm_png, include_social=False, include_hook=False, include_watermark=True):
                    timed_overlays.append((wm_png, wm.get("startSec"), wm.get("endSec")))
            has_any_overlay = bool(actual_overlay or timed_overlays)
        else:
            has_overlay = overlays.generate_static_overlay(fr, w, h, overlay_path)
            actual_overlay = overlay_path if has_overlay else None
            has_any_overlay = has_overlay

        ass_path = td_path / "subtitles.ass"
        ass_content = captions.build_ass(
            segments=render_captions,
            style=st,
            width=w,
            height=h,
            clip_start=render_start,
            clip_end=render_end,
            frame=fr,
            include_static_overlays=not has_any_overlay,
        )
        ass_path.write_text(ass_content, encoding="utf-8")

        # Audio filter (volume, mute, atempo pitch-preserving speed, and vocal clarity boost)
        vol = 0.0 if au.get("muted") else float(au.get("volume", 1.0))
        vol = max(0.0, min(3.0, vol))
        audio_filter = f"volume={vol:.2f}"
        if speed != 1.0:
            audio_filter += f",atempo={speed:.4f}"
        if au.get("vocalBoost"):
            audio_filter += ",highpass=f=100,equalizer=f=3000:t=q:w=1.2:g=3.5"

        mode = fr.get("mode", "crop")
        encoder_args = get_optimized_video_encoder_args()
        audio_bitrate = "192k"
        use_filter_complex = mode in ("fit_blur", "split", "social") or has_any_overlay

        if use_filter_complex:
            filter_complex = build_filtergraph(
                fr, w, h, ass_path, config.FONTS_DIR,
                duration=eff_duration,
                overlay_png_path=actual_overlay,
                timed_overlays=timed_overlays,
            )
            args = [
                "-ss", f"{render_start:.3f}",
                "-accurate_seek",
                "-t", f"{raw_duration:.3f}",
                "-i", str(render_src),
                "-filter_complex", filter_complex,
                "-map", "[outv]",
                "-map", "0:a?",
                "-af", audio_filter,
                "-fps_mode", "cfr",
                *encoder_args,
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", audio_bitrate,
                "-movflags", "+faststart",
                str(dst_video),
            ]
        else:
            vf = build_filtergraph(
                fr, w, h, ass_path, config.FONTS_DIR,
                duration=eff_duration,
                overlay_png_path=None,
                timed_overlays=None,
            )
            args = [
                "-ss", f"{render_start:.3f}",
                "-accurate_seek",
                "-t", f"{raw_duration:.3f}",
                "-i", str(render_src),
                "-vf", vf,
                "-af", audio_filter,
                "-fps_mode", "cfr",
                *encoder_args,
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", audio_bitrate,
                "-movflags", "+faststart",
                str(dst_video),
            ]

        logger.info(
            "Memulai render klip final %s (%dx%d, durasi %.1fs, encoder=%s, audio=%s)...",
            dst_video.name,
            w,
            h,
            eff_duration,
            " ".join(encoder_args),
            audio_bitrate,
        )

        try:
            media.run_ffmpeg(args, duration=eff_duration, on_progress=on_progress)
        except Exception as e:
            if "-c:v" in encoder_args and encoder_args[encoder_args.index("-c:v") + 1] != "libx264":
                logger.warning("Hardware encoder gagal (%s), beralih ke fallback CPU libx264...", e)
                global _BEST_ENCODER_CONFIG
                cpu_args = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-threads", "0"]
                _BEST_ENCODER_CONFIG = cpu_args
                idx = args.index("-c:v")
                fallback_args = args[:idx] + cpu_args + args[idx + len(encoder_args):]
                media.run_ffmpeg(fallback_args, duration=eff_duration, on_progress=on_progress)
            else:
                raise

    return dst_video


def clean_retention(days: int = 7) -> int:
    """Bersihkan file export dan temporary yang lebih lama dari retention_days (F-64)."""
    if days <= 0:
        return 0
    cutoff = time.time() - (days * 86400)
    cleaned = 0

    exports_dir = config.STORAGE_DIR / "exports"
    if exports_dir.exists():
        for f in exports_dir.glob("*.mp4"):
            try:
                if f.stat().st_mtime < cutoff:
                    f.unlink()
                    cleaned += 1
            except Exception as e:
                logger.warning("Gagal menghapus file retensi %s: %s", f, e)

    return cleaned
