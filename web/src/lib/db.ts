import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

declare global {
  // eslint-disable-next-line no-var
  var __clipperDb: Database.Database | undefined;
}

function getDbPath(): string {
  if (process.env.DB_PATH && fs.existsSync(process.env.DB_PATH)) {
    return process.env.DB_PATH;
  }
  const rootPath = path.resolve(process.cwd(), '..', 'database', 'clipper.db');
  if (fs.existsSync(rootPath)) return rootPath;
  const localPath = path.resolve(process.cwd(), 'database', 'clipper.db');
  if (fs.existsSync(localPath)) return localPath;
  return rootPath;
}

function getDatabase(): Database.Database {
  if (global.__clipperDb) {
    return global.__clipperDb;
  }

  const dbFile = getDbPath();
  const dbDir = path.dirname(dbFile);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbFile);

  // Optimasi performa dan concurrency SQLite
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 30000');
  db.pragma('foreign_keys = ON');

  // Pastikan tabel sudah terbuat
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get();
  if (!tableCheck) {
    const possibleSchemaPaths = [
      path.join(dbDir, 'schema_sqlite.sql'),
      path.resolve(process.cwd(), '..', 'database', 'schema_sqlite.sql'),
      path.resolve(process.cwd(), 'database', 'schema_sqlite.sql'),
    ];
    for (const schemaSql of possibleSchemaPaths) {
      if (fs.existsSync(/*turbopackIgnore: true*/ schemaSql)) {
        const sql = fs.readFileSync(/*turbopackIgnore: true*/ schemaSql, 'utf-8');
        db.exec(sql);
        break;
      }
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    global.__clipperDb = db;
  }

  return db;
}

export const db = getDatabase();

function sanitizeParams(params: any[]): any[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString().replace('T', ' ').slice(0, 19);
    return p;
  });
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  try {
    const stmt = db.prepare(sql);
    const rows = stmt.all(...sanitizeParams(params));
    return rows as T[];
  } catch (err) {
    console.error('SQLite query error:', sql, params, err);
    throw err;
  }
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  try {
    const stmt = db.prepare(sql);
    const row = stmt.get(...sanitizeParams(params));
    return (row as T) || null;
  } catch (err) {
    console.error('SQLite queryOne error:', sql, params, err);
    throw err;
  }
}

export async function execute(sql: string, params: any[] = []): Promise<number> {
  try {
    const stmt = db.prepare(sql);
    const info = stmt.run(...sanitizeParams(params));
    return Number(info.lastInsertRowid) || info.changes;
  } catch (err) {
    console.error('SQLite execute error:', sql, params, err);
    throw err;
  }
}

export function fromJson<T = any>(val: any, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val as T;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

export function toJson(val: any): string {
  return JSON.stringify(val);
}

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await query<{ name: string; value: string }>('SELECT name, value FROM settings');
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.name] = r.value;
  }
  return map;
}

export async function setSetting(name: string, value: string): Promise<void> {
  await execute(
    'INSERT INTO settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value',
    [name, value]
  );
}
