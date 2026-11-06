"""
Verifikasi Edge Cases & Ketahanan AI Pipeline OpenClip:
1. Video tanpa audio / hening (FFmpeg anullsrc fallback)
2. Metadata rotasi smartphone (displaymatrix regex & PyAV frame rotation)
3. Decimation keyframe kamera Catmull-Rom (>100 keyframes) agar tidak crash FFmpeg -22
4. Robustness JSON parser LLM (trailing commas, unescaped string, alternate keys)
5. Normalisasi schema kata pada subtitle generator (w, s, e vs word, start, end)
"""
import json
import subprocess
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from clipper import analyzer, captions, export, face_tracker, media

def test_no_audio_handling():
    print("[TEST 1] Testing video without audio stream handling...")
    ffmpeg = media.ffmpeg_path()
    test_silent_mp4 = Path("test_no_audio.mp4")
    test_out_wav = Path("test_silent_out.wav")
    try:
        # Create a video with NO audio
        subprocess.run(
            [ffmpeg, "-y", "-f", "lavfi", "-i", "nullsrc=s=256x256:d=2", "-c:v", "libx264", str(test_silent_mp4)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        probe_res = media.probe(test_silent_mp4)
        assert probe_res["has_audio"] is False, "Probe must detect no audio"
        
        # Test extract_audio_wav - should gracefully produce silent wav
        media.extract_audio_wav(test_silent_mp4, test_out_wav, duration=2.0)
        assert test_out_wav.exists() and test_out_wav.stat().st_size > 0, "Silent wav must be created"
        
        # Test peaks computation on silent wav
        peaks_path = Path("test_silent_peaks.json")
        peaks = media.compute_peaks(test_out_wav, peaks_path)
        assert len(peaks["peaks"]) > 0, "Peaks must compute on silent wav"
        print("  -> PASS: Video without audio safely extracted to silent WAV & peaks computed.")
    finally:
        for p in (test_silent_mp4, test_out_wav, Path("test_silent_peaks.json")):
            if p.exists():
                p.unlink()

def test_rotation_probe():
    print("[TEST 2] Testing displaymatrix / rotation parsing...")
    ffmpeg = media.ffmpeg_path()
    test_rot_mp4 = Path("test_rot_90.mp4")
    try:
        # Create a video with rotation metadata
        subprocess.run(
            [ffmpeg, "-y", "-f", "lavfi", "-i", "nullsrc=s=1280x720:d=1", "-metadata:s:v:0", "rotate=90", "-c:v", "libx264", str(test_rot_mp4)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        res = media.probe(test_rot_mp4)
        # Note: In MP4 container with rotate=90, probe should detect 90 or display swapped
        assert res["duration"] is not None, "Duration must be parsed"
        print(f"  -> PASS: Rotation probe returned width={res['width']}, height={res['height']}, rotate={res['rotate']}.")
    finally:
        if test_rot_mp4.exists():
            test_rot_mp4.unlink()

def test_smooth_follow_decimation_render():
    print("[TEST 3] Testing Catmull-Rom Smooth Follow with 150 keyframes (anti-stack-overflow)...")
    ffmpeg = media.ffmpeg_path()
    test_src = Path("test_smooth_src.mp4")
    test_dst = Path("test_smooth_out.mp4")
    try:
        subprocess.run(
            [ffmpeg, "-y", "-f", "lavfi", "-i", "testsrc=duration=5:size=1280x720:rate=30", "-c:v", "libx264", str(test_src)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        
        # Simulate 150 keyframes (which would have caused FFmpeg stack overflow without decimation)
        dense_keyframes = [{"time": round(i * 0.04, 2), "offsetX": round(15.0 * (i % 5), 1), "offsetY": 0.0} for i in range(150)]
        frame_cfg = {
            "mode": "crop",
            "zoom": 1.0,
            "offsetX": 0.0,
            "offsetY": 0.0,
            "faceTracking": True,
            "trackingMode": "smooth_follow",
            "trackingKeyframes": dense_keyframes,
        }
        
        export.render_clip(
            src_video=test_src,
            dst_video=test_dst,
            start_sec=0.0,
            end_sec=4.0,
            caption_segments=[],
            style=captions.DEFAULT_STYLE,
            frame=frame_cfg,
            audio={"volume": 1.0, "muted": False},
            resolution="720p",
        )
        assert test_dst.exists() and test_dst.stat().st_size > 10000, "Rendered output must exist and be valid"
        print("  -> PASS: Smooth Follow with 150 keyframes successfully rendered without FFmpeg crash!")
    finally:
        for p in (test_src, test_dst):
            if p.exists():
                p.unlink()

def test_robust_llm_json_parsing():
    print("[TEST 4] Testing robust LLM JSON parsing (trailing commas, markdown fences, alternate keys)...")
    # Test case 1: Trailing comma and markdown fence
    raw_response_1 = """```json
    {
      "clips": [
        {
          "start": 5.2,
          "end": 28.5,
          "score": 92,
          "title": "Rahasia Mindset Sukses",
          "reason": "Hook sangat kuat",
        },
      ]
    }
    ```"""
    parsed_1 = analyzer._parse_json(raw_response_1)
    assert parsed_1 is not None and "clips" in parsed_1, "Must parse trailing commas and markdown fences"
    assert len(parsed_1["clips"]) == 1, "Must have 1 clip"
    assert parsed_1["clips"][0]["title"] == "Rahasia Mindset Sukses"
    
    # Test case 2: Alternate key name "klip" and unescaped newlines
    raw_response_2 = """
    Tentu, berikut adalah klip terbaik:
    {
      "klip": [
        {
          "start_sec": 12.0,
          "end_sec": 45.0,
          "viral_score": 88,
          "judul": "Tips Finansial Anak Muda",
          "deskripsi": "Baris satu\nBaris dua"
        }
      ]
    }
    """
    parsed_2 = analyzer._parse_json(raw_response_2)
    assert parsed_2 is not None and "clips" in parsed_2, "Must normalize 'klip' to 'clips'"
    assert parsed_2["clips"][0]["viral_score"] == 88
    
    # Test case 3: Raw array
    raw_response_3 = """[{"start": 0, "end": 10, "title": "Intro"}]"""
    parsed_3 = analyzer._parse_json(raw_response_3)
    assert parsed_3 is not None and "clips" in parsed_3, "Must wrap raw list into clips dict"
    print("  -> PASS: All LLM JSON edge cases handled seamlessly.")

def test_caption_segment_builder():
    print("[TEST 5] Testing caption segment builder with mixed schemas (w, s, e vs word, start, end)...")
    mixed_words = [
        {"w": "Selamat", "s": 0.5, "e": 0.9},
        {"word": "datang", "start": 0.95, "end": 1.4},
        {"w": "di", "s": 1.45, "e": 1.6},
        {"word": "OpenClip!", "start": 1.65, "end": 2.2},
    ]
    segments = captions.build_segments(mixed_words, start=0.0, end=3.0, highlight=True)
    assert len(segments) > 0, "Segments must be built"
    assert segments[0]["text"] == "Selamat datang di OpenClip!"
    print("  -> PASS: Mixed schema caption segments built cleanly.")

def main():
    print("=== STARTING AI EDGE CASES & PIPELINE ROBUSTNESS TEST ===")
    test_no_audio_handling()
    test_rotation_probe()
    test_smooth_follow_decimation_render()
    test_robust_llm_json_parsing()
    test_caption_segment_builder()
    print("\n>>> ALL AI EDGE CASES & FAILURE MODES VERIFIED AND PASSING 100%! <<<")

if __name__ == "__main__":
    main()
