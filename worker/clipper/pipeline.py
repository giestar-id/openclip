"""Orkestrasi pipeline pemrosesan project & export job.

Alur:
1. Downloading  : yt-dlp mengunduh video sumber + metadata
2. Transcribing : ekstrak wav 16kHz + peaks + transkrip (API / faster-whisper)
3. Analyzing    : analisis viral LLM / heuristik + sentence snap + dedupe
4. Cutting      : potong preview 540p (padding +-10s) + thumbnail + default edits (progressive)
5. Ready        : semua klip selesai dan siap di dashboard editor
"""
from __future__ import annotations

import json
import logging
import shutil
import time
import traceback
from datetime import datetime
from pathlib import Path

from . import analyzer, captions, config, db, downloader, export, face_tracker, media, transcribe

logger = logging.getLogger(__name__)


def process_project(project_id: int) -> None:
    proj = db.one("SELECT * FROM projects WHERE id = %s", (project_id,))
    if not proj:
        logger.error("Project #%d tidak ditemukan di database.", project_id)
        return

    active_keys = [
        f"{name.upper()} [{info['masked']}] ({info['source']})"
        for name, info in config.key_info().items()
        if info["available"]
    ]
    keys_str = ", ".join(active_keys) if active_keys else "Tidak ada (Mode Heuristik Offline)"
    logger.info(">>> Memulai pemrosesan Project #%d: '%s' | Kunci API: %s",
                project_id, proj.get("title") or proj["source_url"], keys_str)
    db.update_project(
        project_id,
        status="downloading",
        progress=5,
        progress_message="Menyiapkan folder dan unduhan video...",
        started_at=datetime.now(),
        error=None,
        failed_stage=None,
    )

    stage = "downloading"
    pdir = config.project_dir(project_id)

    try:
        source_url = proj["source_url"]

        # ==============================================================
        # TAHAP 1: DOWNLOAD VIDEO
        # ==============================================================
        stage = "downloading"
        def check_alive():
            if not db.one("SELECT id FROM projects WHERE id = %s", (project_id,)):
                raise InterruptedError(f"Project #{project_id} telah dibatalkan / dihapus oleh user.")

        def on_dl_progress(frac: float, msg: str) -> None:
            check_alive()
            pct = 5 + int(frac * 20)  # 5% -> 25%
            db.set_progress(project_id, "downloading", pct, msg)

        # Cek apakah source_url atau source_path adalah file lokal/upload yang sudah ada
        src_path: Path
        src_info: dict = {}

        # 1. Cek jika file sumber sudah ada di direktori project (misal hasil upload lokal)
        existing_sources = [
            f for f in pdir.glob("source.*")
            if f.suffix.lower() in (".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v")
        ]

        # 2. Cek jika source_path terdaftar di database
        db_source_path = proj.get("source_path")
        abs_db_source = config.abs_storage(db_source_path) if db_source_path else None

        if existing_sources:
            src_path = existing_sources[0]
            logger.info("Project #%d: Menggunakan file hasil upload lokal di folder project: %s", project_id, src_path)
            src_info = {"title": proj.get("title") or src_path.stem}
            db.set_progress(project_id, "downloading", 25, "File video lokal siap.")
        elif abs_db_source and abs_db_source.exists() and abs_db_source.is_file():
            src_path = abs_db_source
            logger.info("Project #%d: Menggunakan source_path lokal yang tersimpan: %s", project_id, src_path)
            src_info = {"title": proj.get("title") or src_path.stem}
            db.set_progress(project_id, "downloading", 25, "File video lokal siap.")
        elif source_url.startswith("local:"):
            # Kasus marker upload lokal tapi file dicari di pdir
            if existing_sources:
                src_path = existing_sources[0]
            else:
                raise FileNotFoundError(f"File video lokal untuk project #{project_id} tidak ditemukan di {pdir}")
            src_info = {"title": proj.get("title") or src_path.stem}
            db.set_progress(project_id, "downloading", 25, "File video lokal siap.")
        elif source_url.startswith("file://") or (Path(source_url).exists() and Path(source_url).is_file()):
            clean_local = source_url.replace("file://", "")
            raw_path = Path(clean_local)
            # Pastikan berada di dalam pdir agar relative_to STORAGE_DIR valid
            if raw_path.parent != pdir:
                dest = pdir / f"source{raw_path.suffix}"
                if not dest.exists():
                    shutil.copy2(raw_path, dest)
                src_path = dest
            else:
                src_path = raw_path
            logger.info("Project #%d: Menggunakan file lokal: %s", project_id, src_path)
            src_info = {"title": proj.get("title") or src_path.stem}
            db.set_progress(project_id, "downloading", 25, "File lokal siap.")
        else:
            db.set_progress(project_id, "downloading", 8, "Menghubungi server video...")
            src_path, src_info = downloader.download(source_url, pdir, on_dl_progress)

        probe_info = media.probe(src_path)
        total_duration = probe_info.get("duration") or float(src_info.get("duration") or 0.0)
        width = probe_info.get("width") or src_info.get("width")
        height = probe_info.get("height") or src_info.get("height")
        video_title = src_info.get("title") or proj.get("title") or src_path.stem

        # Simpan thumbnail video sumber jika belum ada
        thumb_path = pdir / "source_thumb.jpg"
        if not thumb_path.exists() and total_duration > 0:
            try:
                media.thumbnail(src_path, thumb_path, at=min(5.0, total_duration * 0.1))
            except Exception as e:
                logger.warning("Gagal membuat thumbnail sumber: %s", e)

        rel_thumb = config.rel_storage(thumb_path) if thumb_path.exists() else None
        db.update_project(
            project_id,
            source_path=config.rel_storage(src_path),
            title=video_title,
            duration_sec=total_duration,
            width=width,
            height=height,
            thumbnail_path=rel_thumb,
        )

        # ==============================================================
        # TAHAP 2: AUDIO EXTRACT, PEAKS, & TRANSCRIBE
        # ==============================================================
        stage = "transcribing"
        logger.info("Project #%d: Tahap 2 - Transcribing audio (durasi %.1fs)...", project_id, total_duration)
        db.set_progress(project_id, "transcribing", 28, "Mengekstrak audio PCM 16kHz...")

        wav_path = pdir / "audio_16k.wav"
        if not wav_path.exists() or wav_path.stat().st_size == 0:
            media.extract_audio_wav(src_path, wav_path, total_duration)

        db.set_progress(project_id, "transcribing", 32, "Menghitung waveform & peaks audio...")
        peaks_path = pdir / "peaks.json"
        peaks_data = None
        if not peaks_path.exists():
            peaks_data = media.compute_peaks(wav_path, peaks_path)
        else:
            try:
                peaks_data = json.loads(peaks_path.read_text(encoding="utf-8"))
            except Exception:
                peaks_data = media.compute_peaks(wav_path, peaks_path)

        # Cek transkrip yang tersimpan di DB
        existing_tr = db.one("SELECT * FROM transcripts WHERE project_id = %s", (project_id,))
        words: list[dict] = []
        detected_lang = proj.get("language")
        global_s = db.get_settings()

        if existing_tr and existing_tr.get("words"):
            logger.info("Project #%d: Menggunakan transkrip yang sudah ada di database.", project_id)
            words = db.from_json(existing_tr["words"], [])
            detected_lang = existing_tr.get("language") or detected_lang
            db.set_progress(project_id, "transcribing", 65, "Transkrip dimuat dari riwayat.")
        else:
            transcribe_mode = proj.get("transcribe_mode") or "local"
            transcribe_cfg = db.from_json(proj.get("transcribe_config"), {}) or {}

            if transcribe_mode == "api":
                chosen_provider = transcribe_cfg.get("provider") or global_s.get("transcribe_api_provider", "groq")
                keys_info = config.key_info()
                has_key = {p: keys_info.get(p, {}).get("available", False) for p in ("groq", "openai", "gemini")}
                if chosen_provider and has_key.get(chosen_provider):
                    transcribe_cfg["provider"] = chosen_provider
                    p_info = keys_info[chosen_provider]
                    logger.info("Project #%d: Transkrip API menggunakan %s [%s] (dari %s)",
                                project_id, chosen_provider.upper(), p_info["masked"], p_info["source"])
                else:
                    available_tr = [p for p, k in has_key.items() if k]
                    if available_tr:
                        transcribe_cfg["provider"] = available_tr[0]
                        p_info = keys_info[available_tr[0]]
                        logger.info("Project #%d: Transkrip API dialihkan ke %s [%s] (dari %s) karena memiliki Kunci API aktif",
                                    project_id, available_tr[0].upper(), p_info["masked"], p_info["source"])
                    else:
                        logger.warning("Project #%d: Tidak ada Kunci API Cloud yang aktif untuk transkripsi! Otomatis beralih ke Lokal Whisper.", project_id)
                        transcribe_mode = "local"
                        transcribe_cfg = {
                            "model": global_s.get("local_model", "base"),
                            "device": global_s.get("local_device", "cpu"),
                            "compute_type": global_s.get("local_compute_type", "int8"),
                        }
            else:
                # Mode lokal: Baca model, device, dan compute_type langsung dari pengaturan sistem
                if "model" not in transcribe_cfg or not transcribe_cfg.get("model"):
                    transcribe_cfg["model"] = global_s.get("local_model", "base")
                if "device" not in transcribe_cfg:
                    transcribe_cfg["device"] = global_s.get("local_device", "cpu")
                if "compute_type" not in transcribe_cfg:
                    transcribe_cfg["compute_type"] = global_s.get("local_compute_type", "int8")

            active_engine = transcribe_cfg.get("model") if transcribe_mode == "local" else transcribe_cfg.get("provider")
            logger.info("Project #%d: Memulai transkrip mode=%s (engine/model=%s, device=%s)",
                        project_id, transcribe_mode, active_engine, transcribe_cfg.get("device", "cpu"))

            def on_tr_progress(frac: float, msg: str) -> None:
                check_alive()
                pct = 35 + int(frac * 30)  # 35% -> 65%
                db.set_progress(project_id, "transcribing", pct, msg)

            try:
                words, detected_lang = transcribe.transcribe(
                    wav_path=wav_path,
                    mode=transcribe_mode,
                    cfg=transcribe_cfg,
                    language=proj.get("language") or "auto",
                    duration=total_duration,
                    on_progress=on_tr_progress,
                )
            except transcribe.TranscribeError as e:
                if e.retry_local and transcribe_mode == "api":
                    fallback_model = global_s.get("local_model", "base")
                    logger.warning("Transkrip API gagal (%s), beralih otomatis ke mode lokal (model=%s)...", e, fallback_model)
                    db.set_progress(project_id, "transcribing", 36, f"API gagal, beralih ke transkrip lokal ({fallback_model})...")
                    words, detected_lang = transcribe.transcribe(
                        wav_path=wav_path,
                        mode="local",
                        cfg={
                            "model": fallback_model,
                            "device": global_s.get("local_device", "cpu"),
                            "compute_type": global_s.get("local_compute_type", "int8"),
                        },
                        language=proj.get("language") or "auto",
                        duration=total_duration,
                        on_progress=on_tr_progress,
                    )
                else:
                    raise

            # Cek apakah project masih aktif sebelum menyimpan transkrip ke DB
            if not db.one("SELECT id FROM projects WHERE id = %s", (project_id,)):
                logger.info("Project #%d telah dibatalkan / dihapus oleh user saat transkripsi. Menghentikan.", project_id)
                return

            # Simpan transkrip ke DB
            db.execute(
                "INSERT INTO transcripts (project_id, language, words) VALUES (%s, %s, %s) "
                "ON CONFLICT(project_id) DO UPDATE SET language = excluded.language, words = excluded.words",
                (project_id, detected_lang, db.to_json(words)),
            )

        logger.info("Project #%d: Transkrip selesai dengan %d kata (bahasa=%s).", project_id, len(words), detected_lang)

        # Cek apakah project masih ada sebelum lanjut ke tahap analisis
        if not db.one("SELECT id FROM projects WHERE id = %s", (project_id,)):
            logger.info("Project #%d telah dibatalkan / dihapus. Menghentikan proses.", project_id)
            return

        # ==============================================================
        # TAHAP 3: ANALISIS VIRAL (LLM / HEURISTIK)
        # ==============================================================
        stage = "analyzing"
        logger.info("Project #%d: Tahap 3 - Analyzing viral moments...", project_id)
        db.set_progress(project_id, "analyzing", 68, "Menganalisis potensi konten & hook kalimat...")

        llm_provider = proj.get("llm_provider")
        if not llm_provider or llm_provider == "auto":
            llm_provider = global_s.get("llm_provider", "auto")
        clip_dur = int(proj.get("clip_duration") or 30)
        clip_cnt = int(proj.get("clip_count") or 0)

        def on_an_progress(pct: int, msg: str):
            check_alive()
            db.set_progress(project_id, "analyzing", pct, msg)

        candidates = analyzer.analyze_transcript(
            words=words,
            peaks_data=peaks_data,
            total_duration=total_duration,
            clip_duration=clip_dur,
            clip_count=clip_cnt,
            language=detected_lang or "id",
            preferred_provider=llm_provider,
            on_progress=on_an_progress,
        )

        # Jika video tidak ada ucapan atau kata terlalu sedikit, buat klip fallback proporsional
        if not candidates:
            logger.warning("Project #%d: Transkrip tidak menghasilkan kandidat. Membuat klip fallback proporsional.", project_id)
            c_dur = min(total_duration, float(clip_dur))
            num_fallback = clip_cnt if clip_cnt > 0 else max(1, min(4, int(total_duration // max(10.0, c_dur))))
            candidates = []
            step = (total_duration - c_dur) / max(1, num_fallback - 1) if num_fallback > 1 else 0.0

            for k in range(num_fallback):
                s_t = round(k * step, 2)
                e_t = round(min(total_duration, s_t + c_dur), 2)
                title_label = f"Highlight #{k + 1} ({video_title[:25]})" if num_fallback > 1 else f"Highlight Utama ({video_title[:30]})"
                candidates.append({
                    "start_sec": s_t,
                    "end_sec": e_t,
                    "viral_score": 75,
                    "score_breakdown": {"hook": 75, "emotion": 70, "standalone": 80, "punchline": 70, "pace": 75},
                    "title": title_label,
                    "reason": f"Segmen highlight video berdurasi optimal ({int(e_t - s_t)}s).",
                    "description": "Klip sorotan dari video sumber.",
                    "hashtags": ["#fyp", "#viral", "#video"],
                })

        logger.info("Project #%d: Terpilih %d kandidat klip terbaik.", project_id, len(candidates))

        # ==============================================================
        # TAHAP 4: POTONG PREVIEW & THUMBNAIL (PROGRESSIVE)
        # ==============================================================
        stage = "cutting"
        logger.info("Project #%d: Tahap 4 - Cutting clip previews...", project_id)
        db.set_progress(project_id, "cutting", 75, "Memotong preview klip untuk editor...")

        # Pastikan project masih ada di DB (mencegah error jika project dihapus saat pipeline berjalan)
        if not db.one("SELECT id FROM projects WHERE id = %s", (project_id,)):
            logger.warning("Project #%d telah dibatalkan / dihapus dari database. Menghentikan proses.", project_id)
            return

        # Hapus klip lama project ini jika ada
        db.execute("DELETE FROM clips WHERE project_id = %s AND is_manual = 0", (project_id,))

        total_cands = len(candidates)
        for idx, cand in enumerate(candidates):
            # Cek apakah project masih ada sebelum lanjut tiap klip
            if not db.one("SELECT id FROM projects WHERE id = %s", (project_id,)):
                logger.warning("Project #%d telah dihapus dari database saat pemotongan klip.", project_id)
                return

            c_start = float(cand["start_sec"])
            c_end = float(cand["end_sec"])

            # Preview dibuat dengan padding +-10s agar user bisa memperlebar trim di editor (PRD 6.1)
            p_start = max(0.0, c_start - config.PREVIEW_PADDING_SEC)
            p_end = min(total_duration, c_end + config.PREVIEW_PADDING_SEC)

            prev_name = f"clip_{idx + 1}_preview.mp4"
            prev_file = pdir / prev_name

            thumb_name = f"clip_{idx + 1}_thumb.jpg"
            thumb_file = pdir / thumb_name

            db.set_progress(
                project_id,
                "cutting",
                75 + int((idx / total_cands) * 22),
                f"Memproses klip {idx + 1}/{total_cands}: {cand['title'][:35]}...",
            )

            # Potong preview HD landscape cepat (reuse jika sudah ada dan valid)
            if not prev_file.exists() or prev_file.stat().st_size < 1024 * 50:
                media.cut_preview(src_path, prev_file, start=p_start, end=p_end)

            # Buat thumbnail kartu klip (reuse jika sudah ada dan valid)
            if not thumb_file.exists() or thumb_file.stat().st_size < 1024 * 10:
                t_at = min(total_duration - 0.2, c_start + 1.2)
                media.thumbnail(src_path, thumb_file, at=t_at)

            # Buat segmen caption otomatis untuk rentang klip ini
            seg_list = captions.build_segments(words, start=c_start, end=c_end, highlight=True)

            # Deteksi posisi wajah pembicara untuk Smart Auto-Framing 9:16 (Active Speaker & Smooth Follow)
            clip_frame = {**captions.DEFAULT_FRAME}
            try:
                face_info = face_tracker.analyze_clip_faces(
                    src_path,
                    start_sec=c_start,
                    end_sec=c_end,
                    sample_interval=0.4,
                    caption_segments=seg_list,
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

                    # Jika terdeteksi close-up framing rekomendasi
                    sugg_zoom = float(face_info.get("suggested_zoom", 1.0))
                    if sugg_zoom > 1.1:
                        clip_frame["zoom"] = sugg_zoom
                        clip_frame["autoZoomCloseUp"] = True

                    # Jika terdeteksi multi-speaker (podcast 2+ orang), atur posisi split otomatis
                    spk_list = face_info.get("detected_speakers", [])
                    if len(spk_list) >= 2:
                        clip_frame["splitTopOffsetX"] = spk_list[0]["offset_x"]
                        clip_frame["splitBottomOffsetX"] = spk_list[-1]["offset_x"]

                    logger.info(
                        "Project #%d: Klip #%d auto-framed (mode=%s, offsetX=%.1f%%, %d pembicara, %d shots, zoom=%.2fx)",
                        project_id,
                        idx + 1,
                        clip_frame["trackingMode"],
                        face_info["offset_x"],
                        len(spk_list),
                        len(clip_frame["speakerShots"]),
                        clip_frame["zoom"],
                    )
            except Exception as e:
                logger.warning("Project #%d: Gagal face tracking klip #%d: %s", project_id, idx + 1, e)

            # Cek sekali lagi keberadaan project sebelum insert klip
            if not db.one("SELECT id FROM projects WHERE id = %s", (project_id,)):
                logger.warning("Project #%d telah dihapus sebelum insert klip.", project_id)
                return

            # Insert klip ke DB
            try:
                clip_id = db.execute(
                    """
                    INSERT INTO clips (
                        project_id, start_sec, end_sec, preview_start_sec, preview_end_sec,
                        viral_score, score_breakdown, reason, title, description, hashtags,
                        preview_path, thumbnail_path, status, is_favorite, is_manual, sort_order
                    ) VALUES (
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s
                    )
                    """,
                    (
                        project_id,
                        c_start,
                        c_end,
                        p_start,
                        p_end,
                        cand["viral_score"],
                        db.to_json(cand.get("score_breakdown")),
                        cand.get("reason"),
                        cand.get("title"),
                        cand.get("description"),
                        db.to_json(cand.get("hashtags")),
                        config.rel_storage(prev_file),
                        config.rel_storage(thumb_file),
                        "ready",  # Progressive loading: klip langsung siap di-preview!
                        0,
                        0,
                        idx,
                    ),
                )
            except Exception as insert_err:
                if not db.one("SELECT id FROM projects WHERE id = %s", (project_id,)):
                    logger.warning("Project #%d telah dibatalkan/dihapus saat insert klip.", project_id)
                    return
                raise insert_err

            # Insert default clip_edits
            db.execute(
                """
                INSERT INTO clip_edits (
                    clip_id, caption_segments, style, frame, audio
                ) VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT(clip_id) DO UPDATE SET
                    caption_segments = excluded.caption_segments,
                    style = excluded.style,
                    frame = excluded.frame,
                    audio = excluded.audio
                """,
                (
                    clip_id,
                    db.to_json(seg_list),
                    db.to_json(captions.DEFAULT_STYLE),
                    db.to_json(clip_frame),
                    db.to_json(captions.DEFAULT_AUDIO),
                ),
            )
            logger.info("Project #%d: Klip #%d (ID=%d) siap di-preview.", project_id, idx + 1, clip_id)


        # ==============================================================
        # TAHAP 5: READY
        # ==============================================================
        db.update_project(
            project_id,
            status="ready",
            progress=100,
            progress_message="Selesai! Semua klip siap diedit di Dashboard Editor.",
            finished_at=datetime.now(),
        )
    except InterruptedError as e:
        logger.info(">>> %s Menghentikan pipeline project #%d seketika.", e, project_id)
        return
    except Exception as e:
        # Cek jika error terjadi karena project sengaja dihapus oleh user saat worker sedang jalan
        if not db.one("SELECT id FROM projects WHERE id = %s", (project_id,)):
            logger.info("Project #%d telah dibatalkan / dihapus oleh user. Pipeline dihentikan dengan aman.", project_id)
            return

        logger.error("Project #%d GAGAL pada tahap %s: %s\n%s", project_id, stage, e, traceback.format_exc())
        try:
            db.update_project(
                project_id,
                status="failed",
                error=str(e),
                failed_stage=stage,
                progress_message=f"Gagal pada tahap {stage}: {e}",
            )
        except Exception:
            pass


def process_export_job(export_id: int) -> None:
    """Proses satu antrean export dari tabel exports."""
    exp = db.one(
        """
        SELECT e.*, c.start_sec, c.end_sec, c.project_id, c.title AS clip_title,
               p.source_path, p.id AS p_id,
               ed.caption_segments, ed.style, ed.frame, ed.audio
        FROM exports e
        JOIN clips c ON e.clip_id = c.id
        JOIN projects p ON c.project_id = p.id
        LEFT JOIN clip_edits ed ON ed.clip_id = c.id
        WHERE e.id = %s
        """,
        (export_id,),
    )
    if not exp:
        return

    logger.info(">>> Memulai Export #%d (Clip #%d, Resolusi=%s)", export_id, exp["clip_id"], exp["resolution"])
    db.execute("UPDATE exports SET status = 'rendering', progress = 5, error = NULL WHERE id = %s", (export_id,))

    try:
        src_path = config.abs_storage(exp["source_path"])
        if not src_path.exists():
            raise FileNotFoundError(f"File video sumber tidak ditemukan di {src_path}")

        res = exp["resolution"] or "1080p"
        exports_dir = config.STORAGE_DIR / "exports"
        exports_dir.mkdir(parents=True, exist_ok=True)

        timestamp_str = int(time.time())
        out_name = f"export_p{exp['project_id']}_c{exp['clip_id']}_{res}_{timestamp_str}.mp4"
        out_file = exports_dir / out_name

        segments = db.from_json(exp.get("caption_segments"), [])
        style = db.from_json(exp.get("style"), {})
        frame = db.from_json(exp.get("frame"), {})
        audio = db.from_json(exp.get("audio"), {})

        def on_exp_progress(frac: float) -> None:
            pct = 5 + int(frac * 90)
            db.execute("UPDATE exports SET progress = %s WHERE id = %s", (pct, export_id))

        export.render_clip(
            src_video=src_path,
            dst_video=out_file,
            start_sec=float(exp["start_sec"]),
            end_sec=float(exp["end_sec"]),
            caption_segments=segments,
            style=style,
            frame=frame,
            audio=audio,
            resolution=res,
            on_progress=on_exp_progress,
        )

        rel_out = config.rel_storage(out_file)
        db.execute(
            "UPDATE exports SET status = 'done', progress = 100, file_path = %s, finished_at = NOW() WHERE id = %s",
            (rel_out, export_id),
        )
        db.execute("UPDATE clips SET export_path = %s WHERE id = %s", (rel_out, exp["clip_id"]))
        logger.info(">>> Export #%d SELESAI: %s", export_id, rel_out)

    except Exception as e:
        logger.error("Export #%d GAGAL: %s\n%s", export_id, e, traceback.format_exc())
        db.execute(
            "UPDATE exports SET status = 'failed', error = %s WHERE id = %s",
            (str(e), export_id),
        )
