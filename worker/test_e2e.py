"""
Test end-to-end verifikasi modul worker:
1. Sintesis test video MP4 25 detik dengan FFmpeg
2. Ekstraksi audio 16kHz WAV
3. Perhitungan 25fps peaks waveform
4. Heuristic viral analysis dengan kata-kata simulasi
5. Cut preview 540p + thumbnail JPG
6. Export final MP4 dengan ASS subtitle burn-in & 9:16 vertical reframe
"""
import os
import sys
import subprocess
from pathlib import Path

# Tambahkan worker ke sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from clipper import config, media, captions, analyzer, export

def main():
    print("=== STARTING END-TO-END PIPELINE VERIFICATION ===")
    
    test_dir = config.STORAGE_DIR / "test_run"
    test_dir.mkdir(parents=True, exist_ok=True)
    
    source_video = test_dir / "synthetic_source.mp4"
    audio_wav = test_dir / "audio.wav"
    peaks_json = test_dir / "peaks.json"
    preview_mp4 = test_dir / "preview_540p.mp4"
    thumb_jpg = test_dir / "thumb.jpg"
    ass_sub = test_dir / "subtitles.ass"
    export_mp4 = test_dir / "export_final_1080p.mp4"

    ffmpeg = media.ffmpeg_path()
    print(f"[1] Using FFmpeg: {ffmpeg}")

    # 1. Buat synthetic video 20 detik
    print("[2] Generating 20s synthetic video...")
    cmd = [
        ffmpeg, "-y",
        "-f", "lavfi", "-i", "testsrc=duration=20:size=1280x720:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=20",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        str(source_video)
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"    Created: {source_video} ({source_video.stat().st_size} bytes)")

    # 2. Extract audio
    print("[3] Extracting 16kHz audio WAV...")
    media.extract_audio_wav(source_video, audio_wav, duration=20)
    print(f"    Created: {audio_wav} ({audio_wav.stat().st_size} bytes)")

    # 3. Compute waveform peaks
    print("[4] Computing 25fps audio waveform peaks...")
    peaks_data = media.compute_peaks(audio_wav, peaks_json)
    peaks = peaks_data["peaks"]
    print(f"    Calculated {len(peaks)} peak points (peaks.json saved)")

    # 4. Simulasi transkrip kata & jalankan analisis heuristik
    print("[5] Running Heuristic Viral Analyzer...")
    sample_words = [
        {"word": "Halo", "start": 1.0, "end": 1.4},
        {"word": "semuanya,", "start": 1.5, "end": 1.9},
        {"word": "ini", "start": 2.0, "end": 2.2},
        {"word": "adalah", "start": 2.3, "end": 2.6},
        {"word": "rahasia", "start": 2.7, "end": 3.2},
        {"word": "terbesar", "start": 3.3, "end": 3.8},
        {"word": "yang", "start": 3.9, "end": 4.1},
        {"word": "tidak", "start": 4.2, "end": 4.5},
        {"word": "pernah", "start": 4.6, "end": 4.9},
        {"word": "kalian", "start": 5.0, "end": 5.3},
        {"word": "ketahui!", "start": 5.4, "end": 6.0},
        {"word": "Mari", "start": 6.5, "end": 6.8},
        {"word": "kita", "start": 6.9, "end": 7.1},
        {"word": "mulai", "start": 7.2, "end": 7.5},
        {"word": "membahasnya", "start": 7.6, "end": 8.3},
        {"word": "sekarang.", "start": 8.4, "end": 9.0},
        {"word": "Dan", "start": 10.0, "end": 10.3},
        {"word": "hasilnya", "start": 10.4, "end": 10.9},
        {"word": "sangat", "start": 11.0, "end": 11.4},
        {"word": "luar", "start": 11.5, "end": 11.8},
        {"word": "biasa", "start": 11.9, "end": 12.5},
        {"word": "mengejutkan!", "start": 12.6, "end": 13.5},
    ]
    candidates = analyzer.analyze_transcript(sample_words, peaks_data, total_duration=20.0, clip_duration=12, clip_count=2)
    print(f"    Identified {len(candidates)} viral candidates:")
    for idx, c in enumerate(candidates):
        print(f"      - Clip {idx+1}: {c['title']} (Score: {c['viral_score']}, Time: {c['start_sec']}s - {c['end_sec']}s)")

    # 5. Cut preview 540p & thumbnail
    clip = candidates[0]
    print(f"[6] Cutting lightweight 540p preview for Clip 1...")
    media.cut_preview(source_video, preview_mp4, clip['start_sec'], clip['end_sec'])
    print(f"    Preview cut: {preview_mp4} (Size: {preview_mp4.stat().st_size} bytes)")

    print("[7] Generating thumbnail JPG...")
    media.thumbnail(source_video, thumb_jpg, at=clip['start_sec'] + 1.0)
    print(f"    Thumbnail generated: {thumb_jpg} ({thumb_jpg.stat().st_size} bytes)")

    # 6. Generate ASS Subtitles
    print("[8] Building ASS Subtitle with Bold Pop style...")
    segments = captions.build_segments(sample_words, clip['start_sec'], clip['end_sec'], highlight=True)
    ass_content = captions.build_ass(segments, captions.DEFAULT_STYLE, width=1080, height=1920, clip_start=clip['start_sec'], clip_end=clip['end_sec'])
    ass_sub.write_text(ass_content, encoding='utf-8')
    print(f"    ASS Subtitles generated ({len(segments)} segments, {len(ass_content)} chars)")

    # 7. Render final export 1080p MP4
    print("[9] Rendering final 1080p MP4 with 9:16 reframe & ASS burn-in...")
    export.render_clip(
        src_video=source_video,
        dst_video=export_mp4,
        start_sec=clip['start_sec'],
        end_sec=clip['end_sec'],
        caption_segments=segments,
        style=captions.DEFAULT_STYLE,
        frame={"ratio": "9:16", "mode": "crop", "zoom": 1.0, "offsetX": 0, "offsetY": 0, "blur": 24},
        audio={"volume": 1.2, "muted": False},
        resolution="1080p",
    )
    print(f"    Export complete: {export_mp4} ({export_mp4.stat().st_size} bytes)")

    # Check probe on export
    probe_info = media.probe(export_mp4)
    print(f"[10] Export verification probe: {probe_info['width']}x{probe_info['height']}, duration {probe_info['duration']}s")

    assert export_mp4.exists() and export_mp4.stat().st_size > 10000, "Export file must be valid"
    assert probe_info['width'] == 1080 and probe_info['height'] == 1920, "Must be 1080x1920 9:16 vertical video"

    print("\n>>> ALL PIPELINE TESTS PASSED 100% SUCCESSFULLY! <<<")

if __name__ == "__main__":
    main()
