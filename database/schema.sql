-- OpenClip - MySQL 8 schema (Laragon)
-- Jalankan: mysql -uroot < database/schema.sql   (atau: cd web && npm run db:init)

CREATE DATABASE IF NOT EXISTS openclip CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE openclip;

-- Dipakai penuh mulai versi 2 (auth). Versi 1 memakai user lokal id=1.
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT IGNORE INTO users (id, email) VALUES (1, 'local@openclip.dev');

CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL DEFAULT 1,
  source_url TEXT NOT NULL,
  title VARCHAR(500) NULL,
  thumbnail_path VARCHAR(1000) NULL,
  duration_sec DOUBLE NULL,
  clip_duration INT NOT NULL DEFAULT 30,
  clip_count INT NOT NULL DEFAULT 0 COMMENT '0 = otomatis',
  language VARCHAR(10) NOT NULL DEFAULT 'auto',
  transcribe_mode VARCHAR(10) NOT NULL DEFAULT 'api' COMMENT 'api | local',
  transcribe_config JSON NULL COMMENT 'provider/model/device/compute_type yang dipakai',
  llm_provider VARCHAR(20) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' COMMENT 'queued|downloading|transcribing|analyzing|cutting|ready|failed',
  progress INT NOT NULL DEFAULT 0,
  progress_message VARCHAR(500) NULL,
  error TEXT NULL,
  failed_stage VARCHAR(20) NULL,
  source_path VARCHAR(1000) NULL,
  width INT NULL,
  height INT NULL,
  rights_confirmed_at DATETIME NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_projects_user (user_id),
  INDEX idx_projects_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transcripts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL UNIQUE,
  language VARCHAR(10) NULL,
  words JSON NOT NULL COMMENT '[{word, start, end}]',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_transcripts_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS clips (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  start_sec DOUBLE NOT NULL,
  end_sec DOUBLE NOT NULL,
  preview_start_sec DOUBLE NULL COMMENT 'waktu sumber pada detik 0 file preview',
  preview_end_sec DOUBLE NULL,
  viral_score INT NOT NULL DEFAULT 0,
  score_breakdown JSON NULL,
  reason TEXT NULL,
  title VARCHAR(500) NULL,
  description TEXT NULL,
  hashtags JSON NULL,
  preview_path VARCHAR(1000) NULL,
  thumbnail_path VARCHAR(1000) NULL,
  export_path VARCHAR(1000) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending|rendering|ready|error',
  error TEXT NULL,
  is_favorite TINYINT(1) NOT NULL DEFAULT 0,
  is_manual TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_clips_project (project_id),
  INDEX idx_clips_status (status),
  CONSTRAINT fk_clips_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS clip_edits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clip_id INT NOT NULL UNIQUE,
  caption_segments JSON NULL,
  style JSON NULL,
  frame JSON NULL,
  audio JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_edits_clip FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clip_id INT NOT NULL,
  project_id INT NOT NULL,
  resolution VARCHAR(10) NOT NULL DEFAULT '1080p',
  file_path VARCHAR(1000) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' COMMENT 'queued|rendering|done|failed',
  progress INT NOT NULL DEFAULT 0,
  error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  INDEX idx_exports_status (status),
  CONSTRAINT fk_exports_clip FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Mode transkrip, model, provider LLM, default style, status worker. BUKAN API key.
CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  value MEDIUMTEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT IGNORE INTO settings (name, value) VALUES
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
