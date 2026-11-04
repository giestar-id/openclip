# 🎬 OpenClip (AI Video Clipper & CapCut-Style Editor)

Aplikasi pemotong video cerdas bertenaga AI yang secara otomatis mendeteksi momen paling berpotensi viral (hook kuat, alur dinamis, dan klimaks emosional) dari video panjang (YouTube / URL / file lokal), menyelaraskannya ke batas kalimat, membuat subtitle animasi berirama kata (karaoke), dan menyediakan **Dashboard Editor NLE Multi-Track bertema CapCut Dark Pro** untuk kustomisasi sebelum ekspor vertikal 9:16 (Shorts, TikTok, Reels).

---

## 🚀 Fitur Unggulan

### 1. 🤖 Analisis Viralitas AI (Multi-LLM + Heuristik Offline)
- **Multi-Provider LLM**: Mendukung Anthropic Claude 3.5/4.5 Sonnet, OpenAI GPT-4o-mini, dan Google Gemini 2.5 Flash.
- **Fallback Heuristik Offline**: Jika tidak ada API key yang dikonfigurasi, sistem secara otomatis mengeksekusi analisis cerdas berbasis kepadatan kata, kata kunci pemicu rasa ingin tahu (*hook words*), dan dinamika volume audio WAV mono 16kHz tanpa biaya sepeser pun.
- **Sentence Boundary Snapping**: Klip tidak pernah terpotong di tengah kata atau kalimat yang menggantung.
- **Deduplikasi Cerdas**: Membuang kandidat klip dengan overlap tumpang-tindih > 25%.

### 2. 🎙️ Transkripsi Presisi Tinggi (Whisper)
- **Local faster-whisper**: Berjalan offline menggunakan akselerasi CPU atau GPU CUDA dengan model `tiny`, `base`, `small`, `medium`, atau `large-v3`.
- **Cloud API**: Mendukung Groq Cloud (`whisper-large-v3` super cepat) dan OpenAI Audio API dengan chunking otomatis di bawah batas 25 MB.
- **Word-Level Timestamping**: Setiap kata memiliki penanda waktu awal (*start*) dan akhir (*end*) dalam milidetik.

### 3. 🎨 Dashboard Editor CapCut Pro (`/projects/[id]`)
- **Estetika Dark Pro**: Desain antarmuka profesional dengan palet warna terkurasi (Background `#12131a`, Neon Cyan `#4cd7f6`, Mint `#4edea3`, Gold `#ffb95f`, font Geist & JetBrains Mono).
- **Kanvas Player Responsif**:
  - Pilihan rasio kanvas: **9:16 (Shorts/TikTok)**, **1:1 (Square)**, dan **16:9 (Landscape)**.
  - Safe Margins Guides Overlay: Garis panduan *Safe Title 90%* dan *Action Safe 80%*.
  - Mode Reframing: *Fit Warna* (dengan color picker heksadesimal & preset gelap/terang), *Center Crop* (dengan zoom & pan offset X/Y), atau *Fit + Background Blur*.
- **Live Animated Subtitle Overlay**:
  - Subtitle dirender secara real-time di browser menggunakan CSS yang sinkron dengan pemutaran video.
  - Efek Karaoke menyala (*active word highlight*) dengan warna kustom, animasi pop/bounce, outline, bayangan 3D, dan kotak latar semi-transparan.
  - Pilihan 8 font lokal populer: *Montserrat*, *Poppins*, *Anton*, *Bebas Neue*, *Bangers*, *Archivo Black*, *Luckiest Guy*, *Inter*.
- **Inspector Panel 5 Tab**:
  1. **Tab Caption**: Editor teks baris & kata langsung untuk memperbaiki transkripsi, split segmen, atau hapus kata.
  2. **Tab Style**: 5 template preset (*Bold Pop*, *Cyber Cyan*, *Neon Impact*, *Boxed Clean*, *Bebas Punch*), ukuran font, huruf kapital, pemilih warna, ketebalan outline, dan posisi vertikal Y.
  3. **Tab Frame**: Pilihan rasio, mode crop/blur/fit warna, skala zoom, dan blur latar.
  4. **Tab Audio**: Slider volume klip (0% - 200%), tombol bungkam (mute), dan indikator normalisasi EBU R128 (-14 LUFS).
  5. **Tab Viral AI**: Rincian parameter skor (Hook, Emotion, Standalone, Punchline, Pace), narasi evaluasi AI, judul, deskripsi, dan salin rekomendasi hashtag dengan 1 klik.
- **NLE Timeline Multi-Track**:
  - Track **T1**: Blok segmen subtitle interaktif.
  - Track **V1**: Klip video dengan penanda trim In-point dan Out-point yang dapat disesuaikan.
  - Track **A1**: Visualisasi waveform audio asli 25fps yang diekstraksi dari video sumber.
  - Playhead jarum laser cyan presisi tinggi yang dapat di-scrub atau diklik untuk melompat ke detik manapun.
- **Horizontal Clip Shelf**: Deretan kartu klip viral dengan badge skor bintang, durasi, tombol favorit, hapus, dan tombol **+ Tambah Klip Manual**.
- **Autosave & History (Undo/Redo)**: Autosave otomatis dengan debounce 600ms ke SQLite serta riwayat Undo (`Ctrl+Z`) dan Redo (`Ctrl+Y`).

### 4. ⚡ Ekspor Final & Dual Concurrent Worker
- **Dual Concurrent Worker**: Antrian transkripsi/download video dan antrian ekspor FFmpeg berjalan secara paralel di thread terpisah. Proses render ekspor video tidak akan lagi terblokir jika worker sedang mentranskrip video baru!
- **Render FFmpeg**: Burn-in subtitle ASS beresolusi tajam dengan font yang 100% identik dengan tampilan browser.
- **Pilihan Resolusi**: 1080p Full HD atau 720p HD render cepat.
- **Unduh ZIP**: Mengemas seluruh klip video yang telah diekspor dalam satu file `.zip` siap posting.

---

## 🛠️ Panduan Instalasi & Menjalankan

### Persyaratan Sistem:
- **Node.js**: v18+ atau v20+ (unduh dari [nodejs.org](https://nodejs.org/))
- **Python**: 3.10+ atau 3.12+ (disarankan menggunakan [uv](https://docs.astral.sh/uv/))
- **Database**: **SQLite 3** (Otomatis / Built-in — **TIDAK PERLU** install Laragon atau MySQL manual)
- **FFmpeg**: Terdeteksi otomatis dari paket virtualenv `imageio-ffmpeg` (tidak wajib ada di sistem PATH Windows).

---

### ⚡ Cara Termudah: 1-Klik Setup & Run (Rekomendasi)

1. **Instalasi Otomatis (Cukup 1x saat pertama kali pasang):**
   - Klik ganda file **`install.bat`** (atau ketik `install.bat` di terminal).
   - Script akan otomatis mengecek Node.js & Python, menjalankan `npm install`, sinkronisasi `uv sync`, mengunduh font subtitle bawaan, dan menginisialisasi database SQLite.

2. **Menjalankan Aplikasi (Setiap kali ingin memakai):**
   - Klik ganda file **`start.bat`** (atau ketik `start.bat` di terminal).
   - Secara otomatis akan membuka 2 jendela konsol paralel:
     - **Jendela 1:** Web Frontend Next.js (Port 3000)
     - **Jendela 2:** AI Worker Dual-Engine (Project Downloader & Export Worker)
   - Browser Anda akan otomatis terbuka langsung ke [http://localhost:3000](http://localhost:3000).

---

### 💻 Cara Manual (Opsional bagi Pengembang)

#### Langkah 1: Setup Python Worker (dengan uv)
1. Masuk ke direktori `worker`:
```bash
cd worker
```
2. Sinkronisasi virtual environment otomatis dengan **uv**:
```bash
uv sync
```
3. File database SQLite (`database/clipper.db`) otomatis dibuat dan terhubung. Jika ingin menyalin template konfigurasi:
```bash
copy .env.example .env
```
4. Jalankan diagnostik sistem untuk memastikan database SQLite, FFmpeg, dan font terhubung:
```bash
uv run main.py --check
```
5. Jalankan daemon worker (mode all untuk dual concurrency):
```bash
uv run main.py --mode all
```

#### Langkah 2: Setup Web App (Next.js)
1. Buka terminal baru dan masuk ke direktori `web`:
```bash
cd web
```
2. Install dependensi dan jalankan server:
```bash
npm install
npm run dev
```
3. Buka peramban di [http://localhost:3000](http://localhost:3000).

---

## ⌨️ Shortcut Keyboard Editor
| Tombol | Fungsi |
|---|---|
| `Space` | Play / Pause video |
| `←` (Panah Kiri) | Mundur 1 frame |
| `→` (Panah Kanan) | Maju 1 frame |
| `Ctrl + Z` | Undo perubahan styling/teks |
| `Ctrl + Y` | Redo perubahan |
| `L` | Toggle loop playback klip |

