import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Production (Render + Turso) : TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
   Local : fichier SQLite dans data/ (aucune configuration nécessaire). */
let url = process.env.TURSO_DATABASE_URL;
let authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  const DATA_DIR = process.env.DOCBINGO_DATA || path.join(__dirname, '..', 'data');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  url = 'file:' + path.join(DATA_DIR, 'docbingo.db');
}

export const db = createClient({ url, authToken });

/* ---------- Helpers (async) ---------- */
export async function all(sql, args = []) {
  const rs = await db.execute({ sql, args });
  return rs.rows;
}
export async function get(sql, args = []) {
  const rows = await all(sql, args);
  return rows[0] || null;
}
export async function run(sql, args = []) {
  const rs = await db.execute({ sql, args });
  return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid ? Number(rs.lastInsertRowid) : null };
}

export async function initSchema() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement TEXT NOT NULL,
      options TEXT NOT NULL,
      correct TEXT NOT NULL,
      image TEXT,
      explanation TEXT,
      lang TEXT DEFAULT 'fr',
      used_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )`,
    `CREATE TABLE IF NOT EXISTS question_tags (
      question_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (question_id, tag_id)
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      params TEXT NOT NULL,
      status TEXT DEFAULT 'ready',
      question_order TEXT NOT NULL,
      questions_snapshot TEXT,
      current_index INTEGER DEFAULT -1,
      state TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      started_at TEXT,
      finished_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS grids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      cells TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS images (
      name TEXT PRIMARY KEY,
      mime TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`
  ];
  for (const sql of stmts) await db.execute(sql);
}

export async function getSetting(key, fallback = null) {
  const row = await get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? JSON.parse(row.value) : fallback;
}
export async function setSetting(key, value) {
  await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, JSON.stringify(value)]);
}
