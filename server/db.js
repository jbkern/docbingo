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

  /* Migrations additives (idempotentes) */
  const cols = async (table) => (await db.execute(`PRAGMA table_info(${table})`)).rows.map(r => r.name);
  const addCol = async (table, col, def) => { if (!(await cols(table)).includes(col)) await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); };
  await addCol('questions', 'difficulty', "INTEGER DEFAULT 2");          // 1 facile · 2 moyen · 3 difficile
  await addCol('questions', 'case_id', "INTEGER");                        // cas clinique (clinical_cases.id)
  await addCol('questions', 'case_order', "INTEGER DEFAULT 0");           // ordre dans le cas
  await addCol('sessions', 'slides', "TEXT DEFAULT '[]'");                // diapositives libres [{afterIndex, type, title, text}]
  await db.execute(`CREATE TABLE IF NOT EXISTS clinical_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    intro TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  /* Sprint 2 : boîtier de vote, bonus, statistiques */
  await addCol('sessions', 'join_code', "TEXT");                          // code de session participant (6 car.)
  await addCol('sessions', 'live_state', "TEXT DEFAULT '{}'");            // état diffusé aux participants {idx, phase, deadline, slide, bonus}
  await db.execute(`CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    grid_id INTEGER,                    -- grille numérique attribuée (grids.id) ou NULL (papier)
    grid_code TEXT,
    marks TEXT DEFAULT '[]',            -- numéros cochés (mode numérique)
    jokers INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    bingo_at INTEGER,                   -- n° de question du bingo validé automatiquement
    joined_at TEXT DEFAULT (datetime('now')),
    last_seen TEXT DEFAULT (datetime('now'))
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS answers (
    session_id INTEGER NOT NULL,
    participant_id INTEGER NOT NULL,
    q_index INTEGER NOT NULL,           -- index de la question dans la session (0-based) ; -1 = bonus
    question_id INTEGER,
    answer TEXT NOT NULL,               -- lettres, ex. "B" ou "BD"
    correct INTEGER NOT NULL,           -- 0/1
    ms INTEGER,                         -- temps de réponse
    at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (session_id, participant_id, q_index)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS question_stats (
    question_id INTEGER PRIMARY KEY,
    asked INTEGER DEFAULT 0,
    answered INTEGER DEFAULT 0,
    correct INTEGER DEFAULT 0
  )`);
  /* Sprint 3 : comptes, flux éditorial */
  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'author',   -- admin | author
    pass_hash TEXT NOT NULL,               -- scrypt: salt:hex
    active INTEGER DEFAULT 1,
    must_change INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT
  )`);
  await addCol('questions', 'source', "TEXT DEFAULT 'manual'");     // manual | import | ai | collection
  await addCol('questions', 'deleted_at', 'TEXT');
  await addCol('questions', 'origin_author', 'TEXT');                  // nom de l'auteur·e d'origine (collection importée)                     // corbeille (soft delete)
  await addCol('users', 'charter_at', 'TEXT');                     // date d'acceptation de la charte d'utilisation
  await addCol('users', 'charter_v', 'INTEGER DEFAULT 0');         // version acceptée
  await addCol('questions', 'author_id', 'INTEGER');
  await addCol('questions', 'status', "TEXT DEFAULT 'published'");   // draft | proposed | published
  await addCol('questions', 'review_note', 'TEXT');
  await addCol('sessions', 'owner_id', 'INTEGER');
  await addCol('sessions', 'thematic_rows', "TEXT");                 // JSON: [tag par ligne] si grilles thématiques
  await db.execute(`CREATE TABLE IF NOT EXISTS remote_codes (
    session_id INTEGER PRIMARY KEY,
    code TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
}

export async function getSetting(key, fallback = null) {
  const row = await get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? JSON.parse(row.value) : fallback;
}
export async function setSetting(key, value) {
  await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, JSON.stringify(value)]);
}
