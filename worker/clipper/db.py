"""Helper akses SQLite bawaan Python (sqlite3).
Thread-safe dan hemat resource, tanpa memerlukan Laragon/MySQL.
"""
from __future__ import annotations

import json
import re
import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator

from . import config


def _adapt_sql(sql: str) -> str:
    """Mengubah sintaks MySQL (%s, NOW, ON DUPLICATE) ke standar SQLite (?)."""
    # 1. Ganti NOW() -> CURRENT_TIMESTAMP
    s = re.sub(r"\bNOW\(\)", "CURRENT_TIMESTAMP", sql, flags=re.IGNORECASE)
    
    # 2. Ganti ON DUPLICATE KEY UPDATE spesifik
    s = re.sub(
        r"ON DUPLICATE KEY UPDATE\s+value\s*=\s*VALUES\(value\)",
        "ON CONFLICT(name) DO UPDATE SET value = excluded.value",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(
        r"ON DUPLICATE KEY UPDATE\s+language\s*=\s*VALUES\(language\),\s*words\s*=\s*VALUES\(words\)",
        "ON CONFLICT(project_id) DO UPDATE SET language = excluded.language, words = excluded.words",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(
        r"ON DUPLICATE KEY UPDATE[\s\S]*?caption_segments\s*=\s*VALUES\(caption_segments\)[\s\S]*?audio\s*=\s*VALUES\(audio\)",
        "ON CONFLICT(clip_id) DO UPDATE SET caption_segments = excluded.caption_segments, style = excluded.style, frame = excluded.frame, audio = excluded.audio",
        s,
        flags=re.IGNORECASE,
    )
    
    # 3. Ganti parameter placeholder %s -> ?
    s = re.sub(r"%s", "?", s)
    return s


def _find_schema_file() -> Path | None:
    candidates = [
        config.DB_PATH.parent / "schema_sqlite.sql",
        config.ROOT_DIR / "database" / "schema_sqlite.sql",
        config.WORKER_DIR.parent / "database" / "schema_sqlite.sql",
    ]
    for c in candidates:
        if c.exists() and c.is_file():
            return c
    return None


def connect() -> sqlite3.Connection:
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(config.DB_PATH), timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA foreign_keys = ON")

    # Inisialisasi schema otomatis jika tabel projects belum ada
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
        if not cur.fetchone():
            schema_file = _find_schema_file()
            if schema_file and schema_file.exists():
                conn.executescript(schema_file.read_text(encoding="utf-8"))
                conn.commit()
    except Exception:
        pass

    return conn


@contextmanager
def cursor() -> Iterator[sqlite3.Cursor]:
    conn = connect()
    try:
        cur = conn.cursor()
        yield cur
        conn.commit()
    finally:
        conn.close()


def query(sql: str, params: Any = None) -> list[dict]:
    clean_sql = _adapt_sql(sql)
    p = params or ()
    conn = connect()
    try:
        cur = conn.cursor()
        cur.execute(clean_sql, p)
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def one(sql: str, params: Any = None) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: Any = None) -> int:
    """Eksekusi statement; mengembalikan lastrowid (INSERT) atau rowcount (UPDATE/DELETE)."""
    clean_sql = _adapt_sql(sql)
    p = params or ()
    conn = connect()
    try:
        cur = conn.cursor()
        cur.execute(clean_sql, p)
        conn.commit()
        return cur.lastrowid or cur.rowcount
    finally:
        conn.close()


def claim(sql_select: str, sql_update: str, params_select: Any = None) -> dict | None:
    """Ambil satu baris antrian lalu tandai secara atomic dalam transaksi SQLite."""
    conn = connect()
    try:
        with conn:
            cur = conn.cursor()
            # Hapus sintaks 'FOR UPDATE' MySQL jika ada
            clean_select = _adapt_sql(re.sub(r"\s+FOR\s+UPDATE\b", "", sql_select, flags=re.IGNORECASE))
            cur.execute(clean_select, params_select or ())
            row = cur.fetchone()
            if row:
                row_dict = dict(row)
                clean_update = _adapt_sql(sql_update)
                cur.execute(clean_update, (row_dict["id"],))
                return row_dict
            return None
    finally:
        conn.close()


def to_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def from_json(value: Any, default: Any = None) -> Any:
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default


# ---------- settings ----------

def get_settings() -> dict[str, str]:
    return {r["name"]: r["value"] for r in query("SELECT name, value FROM settings")}


def set_setting(name: str, value: str) -> None:
    execute(
        "INSERT INTO settings (name, value) VALUES (?, ?) "
        "ON CONFLICT(name) DO UPDATE SET value = excluded.value",
        (name, value),
    )


# ---------- project helpers ----------

def update_project(project_id: int, **fields: Any) -> None:
    if not fields:
        return
    cols = ", ".join(f"{k} = ?" for k in fields)
    execute(f"UPDATE projects SET {cols} WHERE id = ?", (*fields.values(), project_id))


def set_progress(project_id: int, status: str, progress: int, message: str | None = None) -> None:
    update_project(project_id, status=status, progress=max(0, min(100, int(progress))), progress_message=message)
