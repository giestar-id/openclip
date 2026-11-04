"""Helper pemotongan klip manual dan segmentasi subtitle (F-13).

Menyediakan fungsi create_manual_clip dan CLI runner untuk dipanggil oleh web API.
Mencegah error spawn ENAMETOOLONG di Windows karena kata-kata transkrip dimuat langsung
dari database SQLite, bukan dilewatkan melalui argumen baris perintah (sys.argv).
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from . import captions, config, db, face_tracker, media


def create_manual_clip(
    project_id: int,
    start: float,
    end: float,
    source_rel: str,
) -> dict:
    """Potong preview dan thumbnail klip manual, lalu susun caption segments dan smart auto-framing."""
    pdir = config.project_dir(project_id)
    src_path = config.abs_storage(source_rel)
    if not src_path.exists():
        raise FileNotFoundError(f"Video sumber tidak ditemukan di {src_path}")

    p_start = max(0.0, start - config.PREVIEW_PADDING_SEC)
    p_end = end + config.PREVIEW_PADDING_SEC

    ts = int(time.time())
    prev_file = pdir / f"manual_{ts}_prev.mp4"
    thumb_file = pdir / f"manual_{ts}_thumb.jpg"

    media.cut_preview(src_path, prev_file, p_start, p_end)
    media.thumbnail(src_path, thumb_file, at=start + 0.5)

    # Muat kata transkrip langsung dari database SQLite (tanpa batas panjang)
    raw = db.one("SELECT words FROM transcripts WHERE project_id = %s", (project_id,))
    words = db.from_json(raw["words"], []) if raw else []

    segments = captions.build_segments(words, start, end)

    # Smart Auto-Framing multi-speaker untuk klip manual (Active Speaker & Smooth Follow)
    clip_frame = {**captions.DEFAULT_FRAME}
    try:
        face_info = face_tracker.analyze_clip_faces(
            src_path,
            start,
            end,
            sample_interval=0.4,
            caption_segments=segments,
        )
        if face_info.get("has_face"):
            clip_frame["offsetX"] = face_info["offset_x"]
            clip_frame["offsetY"] = face_info["offset_y"]
            clip_frame["faceTracking"] = True
            clip_frame["trackingMode"] = face_info.get("tracking_mode", "static")
            clip_frame["detectedSpeakers"] = face_info.get("detected_speakers", [])
            clip_frame["speakerShots"] = face_info.get("speaker_shots", [])
            clip_frame["trackingKeyframes"] = face_info.get("tracking_keyframes", [])
            clip_frame["isMultiSpeaker"] = face_info.get("is_multi_speaker", False)

            sugg_zoom = float(face_info.get("suggested_zoom", 1.0))
            if sugg_zoom > 1.1:
                clip_frame["zoom"] = sugg_zoom
                clip_frame["autoZoomCloseUp"] = True

            spk_list = face_info.get("detected_speakers", [])
            if len(spk_list) >= 2:
                clip_frame["splitTopOffsetX"] = spk_list[0]["offset_x"]
                clip_frame["splitBottomOffsetX"] = spk_list[-1]["offset_x"]
    except Exception:
        pass

    return {
        "preview_path": config.rel_storage(prev_file),
        "thumbnail_path": config.rel_storage(thumb_file),
        "segments": segments,
        "frame": clip_frame,
        "p_start": p_start,
        "p_end": p_end,
    }


def main() -> None:
    if len(sys.argv) < 5:
        print("Usage: python -m clipper.manual_clip <pid> <start> <end> <src_rel>", file=sys.stderr)
        sys.exit(1)

    pid = int(sys.argv[1])
    start = float(sys.argv[2])
    end = float(sys.argv[3])
    src_rel = sys.argv[4]

    try:
        res = create_manual_clip(pid, start, end, src_rel)
        print("RESULT:" + json.dumps(res))
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
