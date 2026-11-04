"""Entrypoint Worker Daemon OpenClip.

Menjalankan startup check (F-75), loop polling antrean project & export,
heartbeat ke database, dan pembersihan retensi berkala (F-64).
"""
import os

# Suppress HuggingFace symlinks warning on Windows
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

import argparse
import logging
import signal
import sys
import threading
import time
from datetime import datetime

from clipper import config, db, export, media, pipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("worker")

_STOP = False


def _sig_handler(signum, frame):
    global _STOP
    logger.info("Menerima sinyal stop (%s), menyelesaikan job aktif...", signum)
    _STOP = True


signal.signal(signal.SIGINT, _sig_handler)
signal.signal(signal.SIGTERM, _sig_handler)


def startup_check() -> bool:
    """Pengecekan dependensi dan konfigurasi saat startup (F-75)."""
    print("\n" + "=" * 60)
    print("           OPENCLIP WORKER - STARTUP DIAGNOSTIC           ")
    print("=" * 60)

    all_ok = True

    # 1. Database
    try:
        conn = db.connect()
        conn.close()
        print(f"[OK] Database SQLite  : Terhubung ({config.DB_PATH})")
    except Exception as e:
        print(f"[FAIL] Database SQLite: GAGAL - {e}")
        print("  Saran: Pastikan file database tidak sedang dikunci proses lain atau izin folder terbuka.")
        all_ok = False

    # 2. FFmpeg
    try:
        ff = media.ffmpeg_path()
        print(f"[OK] FFmpeg Binary    : {ff}")
    except Exception as e:
        print(f"[FAIL] FFmpeg         : GAGAL - {e}")
        print("  Saran: Pastikan paket imageio-ffmpeg terpasang atau jalankan: uv sync")
        all_ok = False

    # 3. Storage & Fonts
    config.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    (config.STORAGE_DIR / "projects").mkdir(parents=True, exist_ok=True)
    (config.STORAGE_DIR / "exports").mkdir(parents=True, exist_ok=True)
    fonts_exist = list(config.FONTS_DIR.glob("*.ttf")) if config.FONTS_DIR.exists() else []
    print(f"[OK] Storage Dir      : {config.STORAGE_DIR}")
    if fonts_exist:
        print(f"[OK] Fonts Available  : {len(fonts_exist)} TTF files di {config.FONTS_DIR}")
    else:
        print(f"[PERINGATAN] Font TTF : Belum ada font di {config.FONTS_DIR}")
        print("  Catatan: Subtitle akan menggunakan font sistem. Jalankan 'scripts/download_fonts.py' untuk mengunduh font bawaan.")

    # 4. Settings & Mode
    settings = db.get_settings()
    t_mode = settings.get("transcribe_mode", "local")
    t_prov = settings.get("transcribe_api_provider", "groq")
    l_model = settings.get("local_model", "small")
    llm_prov = settings.get("llm_provider", "auto")

    print("\n--- Pengaturan Aktif (Database) ---")
    print(f"  Mode Transkrip      : {t_mode} (API: {t_prov} | Lokal: {l_model})")
    print(f"  LLM Viral Provider  : {llm_prov}")

    # 5. Status API Key (.env atau Settings UI)
    keys_info = config.key_info()
    keys = {k: v["available"] for k, v in keys_info.items()}

    print("\n--- Status Kunci API (Database Settings / .env) ---")
    provider_labels = [
        ("groq", "Groq API Key        "),
        ("openai", "OpenAI API Key      "),
        ("anthropic", "Anthropic API Key   "),
        ("gemini", "Gemini API Key      "),
    ]
    for prov_name, label in provider_labels:
        info = keys_info[prov_name]
        if info["available"]:
            status_text = f"TERSEDIA [{info['masked']}] (dari {info['source']})"
        else:
            status_text = "KOSONG"
        print(f"  {label}: {status_text}")
        logger.info("Kunci API %s: %s", prov_name.upper(), status_text)

    if t_mode == "api":
        active_key = keys.get(t_prov, False)
        if not active_key:
            warn_msg = f"Mode transkrip API ({t_prov}) dipilih tetapi API key kosong di Database / .env!"
            print(f"\n[PERINGATAN] {warn_msg}")
            print("  Saran: Isi API key di Pengaturan Web UI atau file worker/.env.")
            print("  Catatan: Sistem akan otomatis fallback ke Transkrip Lokal (faster-whisper) jika kunci belum diisi.")
            logger.warning(warn_msg)
        else:
            info = keys_info.get(t_prov, {})
            ok_msg = f"Mode transkrip API ({t_prov}) siap digunakan dengan kunci [{info.get('masked', '***')}]."
            print(f"\n[INFO] {ok_msg}")
            logger.info(ok_msg)
    else:
        print("\n[INFO] Mode transkrip lokal (faster-whisper) aktif. Transkrip berjalan gratis di CPU/GPU.")

    if not any(keys.values()):
        print("[INFO] Semua API key LLM kosong -> Analisis viral akan otomatis menggunakan")
        print("       Heuristic Analyzer cerdas (berbasis hook kata, deteksi emosi audio, dan ritme bicara).")
    else:
        active_names = [p.upper() for p, k in keys.items() if k]
        logger.info("AI Providers siap digunakan: %s", ", ".join(active_names))

    print("=" * 60 + "\n")
    return all_ok


def _project_worker_loop() -> None:
    """Loop worker independen khusus menangani antrean project (Download, Whisper STT, AI Analisis)."""
    p_logger = logging.getLogger("worker.project")
    p_logger.info("Project Worker aktif. Memantau antrean transkrip & analisis AI...")

    while not _STOP:
        job_done = False
        try:
            # Klaim secara atomic agar tidak bentrok dengan instance worker lain
            claimed_proj = db.claim(
                "SELECT id FROM projects WHERE status = 'queued' ORDER BY id ASC LIMIT 1",
                "UPDATE projects SET status = 'downloading', progress = 5, progress_message = 'Menyiapkan folder dan unduhan video...' WHERE id = %s",
            )
            if claimed_proj:
                job_done = True
                pid = claimed_proj["id"]
                p_logger.info("Mengklaim Project #%d untuk diproses...", pid)
                pipeline.process_project(pid)
        except Exception as e:
            p_logger.error("Error di loop Project Worker: %s", e)

        if not job_done:
            time.sleep(config.POLL_INTERVAL)

    p_logger.info("Project Worker berhenti.")


def _export_worker_loop() -> None:
    """Loop worker independen khusus menangani antrean render video & burn-in FFmpeg."""
    e_logger = logging.getLogger("worker.export")
    e_logger.info("Export Worker aktif. Memantau antrean render video & burn-in FFmpeg...")

    while not _STOP:
        job_done = False
        try:
            # Klaim secara atomic agar tidak bentrok dengan instance worker lain
            claimed_exp = db.claim(
                "SELECT id FROM exports WHERE status = 'queued' ORDER BY id ASC LIMIT 1",
                "UPDATE exports SET status = 'rendering', progress = 5, error = NULL WHERE id = %s",
            )
            if claimed_exp:
                job_done = True
                eid = claimed_exp["id"]
                e_logger.info("Mengklaim Export #%d untuk dirender...", eid)
                pipeline.process_export_job(eid)
        except Exception as e:
            e_logger.error("Error di loop Export Worker: %s", e)

        if not job_done:
            # Polling lebih responsif (1 detik) agar render ekspor langsung jalan instan
            time.sleep(min(1.0, config.POLL_INTERVAL))

    e_logger.info("Export Worker berhenti.")


def run_daemon(mode: str = "all") -> None:
    """Menjalankan daemon worker.
    
    Mode:
      - 'all'     : Menjalankan Project Worker & Export Worker secara paralel di thread terpisah.
      - 'project' : Hanya menjalankan Project Worker (Transkrip & Analisis).
      - 'export'  : Hanya menjalankan Export Worker (Render Video FFmpeg).
    """
    if not startup_check():
        logger.error("Startup check gagal. Perbaiki masalah di atas lalu jalankan ulang.")
        sys.exit(1)

    logger.info("Worker daemon aktif (Mode: %s)...", mode.upper())
    # Tampilkan status ringkas API key yang aktif saat daemon berjalan
    keys_info = config.key_info()
    active_str = ", ".join([f"{p.upper()} [{i['masked']}]" for p, i in keys_info.items() if i["available"]])
    if active_str:
        logger.info("Kunci API Terdeteksi & Aktif: %s", active_str)
    else:
        logger.info("Kunci API Cloud: Tidak ada (Menggunakan Mode Heuristik Offline)")

    threads: list[threading.Thread] = []

    if mode in ("all", "project"):
        t_proj = threading.Thread(target=_project_worker_loop, name="ProjectWorker", daemon=True)
        t_proj.start()
        threads.append(t_proj)

    if mode in ("all", "export"):
        t_exp = threading.Thread(target=_export_worker_loop, name="ExportWorker", daemon=True)
        t_exp.start()
        threads.append(t_exp)

    last_retention_check = 0.0

    while not _STOP:
        # Update heartbeat
        try:
            db.set_setting("worker_heartbeat", datetime.now().isoformat())
            db.set_setting("worker_status", "running")
        except Exception:
            pass

        # Retensi berkala (tiap 1 jam)
        if time.time() - last_retention_check > 3600:
            last_retention_check = time.time()
            try:
                days = int(db.get_settings().get("retention_days", 7))
                cleaned = export.clean_retention(days)
                if cleaned > 0:
                    logger.info("Retensi: %d file export lama dibersihkan.", cleaned)
            except Exception as e:
                logger.warning("Gagal membersihkan retensi: %s", e)

        time.sleep(2.0)

    logger.info("Menunggu semua worker menyelesaikan job aktif...")
    for t in threads:
        t.join(timeout=5.0)

    logger.info("Worker daemon berhenti dengan rapi.")
    try:
        db.set_setting("worker_status", "stopped")
    except Exception:
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenClip Worker")
    parser.add_argument("--check", action="store_true", help="Jalankan diagnostic check lalu keluar")
    parser.add_argument("--project", type=int, help="Proses project ID tertentu")
    parser.add_argument("--export", type=int, help="Proses export ID tertentu")
    parser.add_argument(
        "--mode",
        choices=["all", "project", "export"],
        default="all",
        help="Mode worker: 'all' (project + export paralel), 'project' (hanya project), 'export' (hanya ekspor)",
    )
    parser.add_argument("--project-worker", action="store_true", help="Jalankan khusus Project Worker")
    parser.add_argument("--export-worker", action="store_true", help="Jalankan khusus Export Worker")
    args = parser.parse_args()

    if args.check:
        ok = startup_check()
        sys.exit(0 if ok else 1)
    elif args.project:
        pipeline.process_project(args.project)
    elif args.export:
        pipeline.process_export_job(args.export)
    else:
        mode = "project" if args.project_worker else "export" if args.export_worker else args.mode
        run_daemon(mode=mode)


if __name__ == "__main__":
    main()
