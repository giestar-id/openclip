-- OpenClip - SQLite 3 Schema
-- File DB: database/clipper.db

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO users (id, email) VALUES (1, 'local@openclip.dev');

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  source_url TEXT NOT NULL,
  title TEXT NULL,
  thumbnail_path TEXT NULL,
  duration_sec REAL NULL,
  clip_duration INTEGER NOT NULL DEFAULT 30,
  clip_count INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'auto',
  transcribe_mode TEXT NOT NULL DEFAULT 'api',
  transcribe_config TEXT NULL,
  llm_provider TEXT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  progress_message TEXT NULL,
  error TEXT NULL,
  failed_stage TEXT NULL,
  source_path TEXT NULL,
  width INTEGER NULL,
  height INTEGER NULL,
  rights_confirmed_at DATETIME NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects (user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);

CREATE TABLE IF NOT EXISTS transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL UNIQUE,
  language TEXT NULL,
  words TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  start_sec REAL NOT NULL,
  end_sec REAL NOT NULL,
  preview_start_sec REAL NULL,
  preview_end_sec REAL NULL,
  viral_score INTEGER NOT NULL DEFAULT 0,
  score_breakdown TEXT NULL,
  reason TEXT NULL,
  title TEXT NULL,
  description TEXT NULL,
  hashtags TEXT NULL,
  preview_path TEXT NULL,
  thumbnail_path TEXT NULL,
  export_path TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT NULL,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_manual INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clips_project ON clips (project_id);
CREATE INDEX IF NOT EXISTS idx_clips_status ON clips (status);

CREATE TABLE IF NOT EXISTS clip_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clip_id INTEGER NOT NULL UNIQUE,
  caption_segments TEXT NULL,
  style TEXT NULL,
  frame TEXT NULL,
  audio TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clip_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  resolution TEXT NOT NULL DEFAULT '1080p',
  file_path TEXT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exports_status ON exports (status);
CREATE INDEX IF NOT EXISTS idx_exports_clip_id ON exports (clip_id);
CREATE INDEX IF NOT EXISTS idx_exports_project_id ON exports (project_id);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  value TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO settings (name, value) VALUES
  ('transcribe_mode', 'local'),
  ('transcribe_api_provider', 'groq'),
  ('local_model', 'small'),
  ('local_device', 'cpu'),
  ('local_compute_type', 'int8'),
  ('llm_provider', 'auto'),
  ('default_language', 'auto'),
  ('default_clip_duration', '30'),
  ('default_clip_count', '0'),
  ('retention_days', '7');
