# OpenClip AI Worker Daemon

Daemon backend AI berkinerja tinggi untuk OpenClip yang menangani pemrosesan audio/video, transkripsi ucapan (STT), deteksi wajah cerdas, penentuan segmen viral, dan rendering ekspor video dengan subtitle serta overlay.

## Arsitektur Worker

Worker OpenClip dirancang modular dengan dual-loop concurrency:
1. **Project Worker (`worker.project`)**:
   - Pengunduhan video sumber (YouTube / direct link via `yt-dlp`).
   - Ekstraksi audio dan perhitungan waveform peaks.
   - Transkripsi ucapan (faster-whisper lokal CPU/GPU atau cloud API Groq/OpenAI).
   - Analisis segmen viral (LLM Claude/OpenAI/Gemini/Groq atau Smart Heuristic Audio/Speech Analyzer).
   - Deteksi dan tracking wajah otomatis (UltraFace ONNX) untuk auto-reframe 9:16.
2. **Export Worker (`worker.export`)**:
   - Pemotongan dan cropping video ke rasio aspek vertikal (9:16), kotak (1:1), atau horizontal (16:9).
   - Dynamic auto-reframe & face tracking smoothing.
   - Perenderan subtitle bergaya ASS / burn-in font kustom.
   - Overlay sosial media (avatar circular, verified rosette badge, platform handles).
   - Akselerasi hardware otomatis (NVIDIA NVENC, Intel QSV, AMD AMF) dengan fallback ke libx264.

## Persyaratan Sistem

- **Python**: `>= 3.10` (Direkomendasikan Python 3.10 - 3.12)
- **Package Manager**: [uv](https://astral.sh/uv) (Sangat direkomendasikan) atau standard `pip`
- **FFmpeg**: Bundled otomatis via `imageio-ffmpeg` atau FFmpeg sistem pada `PATH`.

## Instalasi & Menjalankan

### Menggunakan `uv` (Direkomendasikan):
```bash
# Sinkronkan dependensi
uv sync

# Jalankan pemeriksaan diagnostik sistem
uv run python main.py --check

# Jalankan daemon lengkap (Project + Export paralel)
uv run python main.py --mode all
```

### Menggunakan Standard Python `venv` + `pip`:
```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python main.py --check
.venv\Scripts\python main.py --mode all
```

## Variabel Lingkungan (.env)

Konfigurasi runtime dapat disesuaikan pada file `worker/.env` (disalin dari `.env.example`):
- `DB_PATH`: Lokasi database SQLite (bawaan: `database/clipper.db`).
- `STORAGE_DIR`: Direktori penyimpanan video dan hasil ekspor (bawaan: `storage`).
- `POLL_INTERVAL`: Interval polling antrean pekerjaan dalam detik (bawaan: `2`).
- `PREVIEW_HEIGHT`: Ketinggian resolusi video preview (bawaan: `720`).
- `GROQ_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`: Kunci API cloud opsional.
