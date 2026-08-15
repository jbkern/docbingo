import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { all, get, run, initSchema, getSetting, setSetting } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '4mb' }));

await initSchema();

/* ---------- Keep-alive (Render free : évite l'endormissement pendant l'utilisation) ---------- */
app.get('/api/ping', (req, res) => res.json({ ok: true, at: Date.now() }));

/* ---------- Auth (simple password, active only if DOCBINGO_PASSWORD is set) ---------- */
const PASSWORD = process.env.DOCBINGO_PASSWORD || null;
/* Jeton sans état (dérivé du mot de passe) : survit aux redémarrages du serveur,
   l'utilisateur n'a pas à se reconnecter après chaque réveil de l'hébergement. */
const SESSION_TOKEN = PASSWORD ? crypto.createHmac('sha256', 'docbingo-session').update(PASSWORD).digest('hex') : null;
const safeEqual = (a, b) => typeof a === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
app.post('/api/login', (req, res) => {
  if (!PASSWORD) return res.json({ ok: true, token: null });
  if (typeof req.body?.password === 'string' && safeEqual(req.body.password, PASSWORD)) {
    return res.json({ ok: true, token: SESSION_TOKEN });
  }
  res.status(401).json({ ok: false });
});
app.use('/api', (req, res, next) => {
  if (!PASSWORD || req.path === '/login' || req.path === '/ping' || req.path.startsWith('/remote/')) return next();
  const token = req.headers['x-docbingo-token'];
  if (token && safeEqual(String(token), SESSION_TOKEN)) return next();
  res.status(401).json({ error: 'auth_required' });
});

/* Wrapper: route async avec gestion d'erreur */
const h = (fn) => (req, res) => fn(req, res).catch(e => {
  console.error(e);
  if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
});

/* ---------- Helpers ---------- */
const j = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

async function rowToQuestion(row) {
  if (!row) return null;
  const tags = (await all(
    'SELECT t.name FROM tags t JOIN question_tags qt ON qt.tag_id = t.id WHERE qt.question_id = ? ORDER BY t.name', [row.id]
  )).map(r => r.name);
  return {
    id: row.id, statement: row.statement,
    options: j(row.options, []), correct: j(row.correct, []),
    image: row.image, explanation: row.explanation, lang: row.lang,
    difficulty: row.difficulty ?? 2, caseId: row.case_id ?? null, caseOrder: row.case_order ?? 0,
    usedCount: row.used_count, createdAt: row.created_at, updatedAt: row.updated_at, tags
  };
}
async function allQuestions() {
  const rows = await all('SELECT * FROM questions ORDER BY updated_at DESC');
  return Promise.all(rows.map(rowToQuestion));
}

async function setQuestionTags(questionId, tags) {
  await run('DELETE FROM question_tags WHERE question_id = ?', [questionId]);
  for (const raw of tags || []) {
    const name = String(raw).trim().replace(/^#/, '').toLowerCase();
    if (!name) continue;
    await run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [name]);
    const tag = await get('SELECT id FROM tags WHERE name = ?', [name]);
    await run('INSERT OR IGNORE INTO question_tags (question_id, tag_id) VALUES (?, ?)', [questionId, tag.id]);
  }
  await run('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM question_tags)');
}

/* Similarity (Dice coefficient on bigrams) for duplicate detection */
function bigrams(s) {
  const t = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const set = new Map();
  for (let i = 0; i < t.length - 1; i++) {
    const b = t.slice(i, i + 2);
    set.set(b, (set.get(b) || 0) + 1);
  }
  return set;
}
function similarity(a, b) {
  const A = bigrams(a), B = bigrams(b);
  let inter = 0, total = 0;
  for (const [k, v] of A) { total += v; if (B.has(k)) inter += Math.min(v, B.get(k)); }
  for (const v of B.values()) total += v;
  return total === 0 ? 0 : (2 * inter) / total;
}

/* ---------- Questions ---------- */
app.get('/api/questions', h(async (req, res) => {
  const { search = '', tags = '', logic = 'or', difficulty = '', caseId = '' } = req.query;
  let rows = await allQuestions();
  if (difficulty) rows = rows.filter(q => String(q.difficulty) === String(difficulty));
  if (caseId) rows = rows.filter(q => String(q.caseId) === String(caseId));
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter(q =>
      q.statement.toLowerCase().includes(s) ||
      q.options.some(o => o.toLowerCase().includes(s)) ||
      (q.explanation || '').toLowerCase().includes(s));
  }
  const wanted = String(tags).split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  if (wanted.length) {
    rows = rows.filter(q => logic === 'and'
      ? wanted.every(t => q.tags.includes(t))
      : wanted.some(t => q.tags.includes(t)));
  }
  res.json(rows);
}));

app.get('/api/questions/:id', h(async (req, res) => {
  const q = await rowToQuestion(await get('SELECT * FROM questions WHERE id = ?', [req.params.id]));
  q ? res.json(q) : res.status(404).json({ error: 'not_found' });
}));

function validateQuestion(b) {
  if (!b.statement?.trim()) return 'Énoncé requis';
  if (!Array.isArray(b.options) || b.options.filter(o => o?.trim()).length < 2) return 'Au moins 2 propositions';
  if (b.options.length > 5) return 'Maximum 5 propositions';
  if (!Array.isArray(b.correct) || b.correct.length < 1) return 'Au moins une bonne réponse';
  if (b.correct.some(i => i < 0 || i >= b.options.length)) return 'Bonne réponse invalide';
  return null;
}

app.post('/api/questions', h(async (req, res) => {
  const b = req.body;
  const err = validateQuestion(b);
  if (err) return res.status(400).json({ error: err });
  const info = await run(
    'INSERT INTO questions (statement, options, correct, image, explanation, lang, difficulty, case_id, case_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [b.statement.trim(), JSON.stringify(b.options), JSON.stringify(b.correct), b.image || null, b.explanation || null, b.lang || 'fr',
     [1,2,3].includes(Number(b.difficulty)) ? Number(b.difficulty) : 2, b.caseId || null, Number(b.caseOrder) || 0]);
  await setQuestionTags(info.lastInsertRowid, b.tags);
  res.json(await rowToQuestion(await get('SELECT * FROM questions WHERE id = ?', [info.lastInsertRowid])));
}));

app.put('/api/questions/:id', h(async (req, res) => {
  const b = req.body;
  const err = validateQuestion(b);
  if (err) return res.status(400).json({ error: err });
  const r = await run(
    `UPDATE questions SET statement=?, options=?, correct=?, image=?, explanation=?, lang=?, difficulty=?, case_id=?, case_order=?, updated_at=datetime('now') WHERE id=?`,
    [b.statement.trim(), JSON.stringify(b.options), JSON.stringify(b.correct), b.image || null, b.explanation || null, b.lang || 'fr',
     [1,2,3].includes(Number(b.difficulty)) ? Number(b.difficulty) : 2, b.caseId || null, Number(b.caseOrder) || 0, req.params.id]);
  if (!r.changes) return res.status(404).json({ error: 'not_found' });
  await setQuestionTags(Number(req.params.id), b.tags);
  res.json(await rowToQuestion(await get('SELECT * FROM questions WHERE id = ?', [req.params.id])));
}));

app.delete('/api/questions/:id', h(async (req, res) => {
  await run('DELETE FROM questions WHERE id = ?', [req.params.id]);
  await run('DELETE FROM question_tags WHERE question_id = ?', [req.params.id]);
  await run('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM question_tags)');
  res.json({ ok: true });
}));

app.post('/api/questions/:id/duplicate', h(async (req, res) => {
  const q = await rowToQuestion(await get('SELECT * FROM questions WHERE id = ?', [req.params.id]));
  if (!q) return res.status(404).json({ error: 'not_found' });
  const info = await run(
    'INSERT INTO questions (statement, options, correct, image, explanation, lang) VALUES (?, ?, ?, ?, ?, ?)',
    [q.statement + ' (copie)', JSON.stringify(q.options), JSON.stringify(q.correct), q.image, q.explanation, q.lang]);
  await setQuestionTags(info.lastInsertRowid, q.tags);
  res.json(await rowToQuestion(await get('SELECT * FROM questions WHERE id = ?', [info.lastInsertRowid])));
}));

app.post('/api/questions/check-duplicate', h(async (req, res) => {
  const { statement, excludeId } = req.body;
  const rows = await all('SELECT id, statement FROM questions');
  const similar = rows
    .filter(r => r.id !== excludeId)
    .map(r => ({ id: r.id, statement: r.statement, score: similarity(statement || '', r.statement) }))
    .filter(r => r.score > 0.72)
    .sort((a, b) => b.score - a.score).slice(0, 3);
  res.json(similar);
}));

app.get('/api/tags', h(async (req, res) => {
  res.json(await all(
    'SELECT t.name, COUNT(qt.question_id) AS count FROM tags t LEFT JOIN question_tags qt ON qt.tag_id = t.id GROUP BY t.id ORDER BY t.name'));
}));

/* ---------- Images (stockées en base — le disque de Render est éphémère) ---------- */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
app.post('/api/upload', upload.single('image'), h(async (req, res) => {
  const name = Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(req.file.originalname || '.jpg');
  await run('INSERT INTO images (name, mime, data) VALUES (?, ?, ?)', [name, req.file.mimetype || 'image/jpeg', req.file.buffer]);
  res.json({ filename: name });
}));
app.get('/images/:name', h(async (req, res) => {
  const row = await get('SELECT mime, data FROM images WHERE name = ?', [req.params.name]);
  if (!row) return res.status(404).end();
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.end(Buffer.from(row.data));
}));

/* ---------- Cas cliniques ---------- */
app.get('/api/cases', h(async (req, res) => {
  const rows = await all('SELECT c.*, (SELECT COUNT(*) FROM questions q WHERE q.case_id = c.id) AS count FROM clinical_cases c ORDER BY c.title');
  res.json(rows);
}));
app.post('/api/cases', h(async (req, res) => {
  const { title, intro } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Titre requis' });
  const info = await run('INSERT INTO clinical_cases (title, intro) VALUES (?, ?)', [title.trim(), intro || null]);
  res.json(await get('SELECT * FROM clinical_cases WHERE id = ?', [info.lastInsertRowid]));
}));
app.put('/api/cases/:id', h(async (req, res) => {
  const { title, intro } = req.body;
  await run('UPDATE clinical_cases SET title = ?, intro = ? WHERE id = ?', [title.trim(), intro || null, req.params.id]);
  res.json(await get('SELECT * FROM clinical_cases WHERE id = ?', [req.params.id]));
}));
app.delete('/api/cases/:id', h(async (req, res) => {
  await run('UPDATE questions SET case_id = NULL, case_order = 0 WHERE case_id = ?', [req.params.id]);
  await run('DELETE FROM clinical_cases WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* ---------- Import (CSV / XLSX / DOCX / texte) → aperçu, puis validation par lot ---------- */
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
app.post('/api/import/parse', importUpload.single('file'), h(async (req, res) => {
  let text = req.body?.text || '';
  let rows = null;
  if (req.file) {
    const name = (req.file.originalname || '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      const XLSX = (await import('xlsx')).default;
      const wb = XLSX.read(req.file.buffer, { type: 'buffer', codepage: 65001 });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    } else if (name.endsWith('.docx')) {
      const mammoth = (await import('mammoth')).default;
      text = (await mammoth.extractRawText({ buffer: req.file.buffer })).value;
    } else {
      text = req.file.buffer.toString('utf8');
    }
  }
  const questions = rows ? parseTabular(rows) : parseFreeText(text);
  res.json({ questions, count: questions.length });
}));

/* Tableau : colonnes reconnues par en-tête (énoncé, A..E, réponse, explication, mots-clés, difficulté) ou par position */
function parseTabular(rows) {
  if (!rows.length) return [];
  const header = rows[0].map(c => String(c).toLowerCase().trim());
  const find = (...names) => header.findIndex(hh => names.some(n => hh.startsWith(n)));
  let iS = find('énoncé', 'enonce', 'question', 'statement', 'frage');
  const hasHeader = iS >= 0;
  const idx = hasHeader ? {
    s: iS,
    opts: ['a', 'b', 'c', 'd', 'e'].map(l => header.findIndex(hh => hh === l || hh.startsWith('proposition ' + l) || hh.startsWith('option ' + l) || hh === 'réponse ' + l)),
    correct: find('bonne', 'correct', 'réponse correcte', 'reponse correcte', 'solution', 'richtig', 'answer'),
    expl: find('explication', 'explanation', 'commentaire', 'erklärung'),
    tags: find('mots', 'tags', 'mot-clé', 'keywords', 'stichw'),
    diff: find('difficult', 'niveau', 'level', 'schwier')
  } : { s: 0, opts: [1, 2, 3, 4, 5], correct: 6, expl: 7, tags: 8, diff: 9 };
  const out = [];
  for (const r of rows.slice(hasHeader ? 1 : 0)) {
    const statement = String(r[idx.s] ?? '').trim();
    if (!statement) continue;
    const options = idx.opts.map(i => i >= 0 ? String(r[i] ?? '').trim() : '').filter(Boolean);
    if (options.length < 2) continue;
    const correctRaw = String(idx.correct >= 0 ? r[idx.correct] ?? '' : '').toUpperCase().replace(/[^A-E]/g, '');
    const correct = [...new Set(correctRaw.split(''))].map(l => 'ABCDE'.indexOf(l)).filter(i => i >= 0 && i < options.length);
    out.push({
      statement, options, correct,
      explanation: idx.expl >= 0 ? String(r[idx.expl] ?? '').trim() || null : null,
      tags: idx.tags >= 0 ? String(r[idx.tags] ?? '').split(/[,;#\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean) : [],
      difficulty: idx.diff >= 0 ? diffFromText(String(r[idx.diff] ?? '')) : 2
    });
  }
  return out;
}
function diffFromText(t) {
  t = t.toLowerCase();
  if (/^1|facile|easy|leicht/.test(t)) return 1;
  if (/^3|difficile|hard|schwer/.test(t)) return 3;
  return 2;
}
/* Texte libre : blocs séparés par une ligne vide ; 1re ligne = énoncé ; lignes "A) …" ; "Réponse : B" ; "Explication : …" ; "#tags" */
function parseFreeText(text) {
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
  const out = [];
  for (const b of blocks) {
    const lines = b.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 3) continue;
    const q = { statement: '', options: [], correct: [], explanation: null, tags: [], difficulty: 2 };
    let stmtLines = [];
    for (const l of lines) {
      let m;
      if ((m = l.match(/^\(?([A-Ea-e])[\)\.\:\-]\s*(.+)$/)) && q.options.length < 5) { q.options.push(m[2].trim()); continue; }
      if ((m = l.match(/^(?:r[ée]ponse|bonne r[ée]ponse|solution|answer|correct)\s*[:\-]\s*(.+)$/i))) {
        q.correct = [...new Set(m[1].toUpperCase().replace(/[^A-E]/g, '').split(''))].map(x => 'ABCDE'.indexOf(x)); continue;
      }
      if ((m = l.match(/^(?:explication|explanation|commentaire)\s*[:\-]\s*(.+)$/i))) { q.explanation = m[1].trim(); continue; }
      if ((m = l.match(/^(?:difficult[ée]|niveau)\s*[:\-]\s*(.+)$/i))) { q.difficulty = diffFromText(m[1]); continue; }
      if (/^#/.test(l) || /^(?:mots?-cl[ée]s?|tags)\s*[:\-]/i.test(l)) {
        q.tags = l.replace(/^(?:mots?-cl[ée]s?|tags)\s*[:\-]/i, '').split(/[,;#\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean); continue;
      }
      if (!q.options.length) stmtLines.push(l);
    }
    q.statement = stmtLines.join(' ').replace(/^\d+[\.\)]\s*/, '').trim();
    q.correct = q.correct.filter(i => i >= 0 && i < q.options.length);
    if (q.statement && q.options.length >= 2) out.push(q);
  }
  return out;
}

app.post('/api/import/commit', h(async (req, res) => {
  const list = Array.isArray(req.body?.questions) ? req.body.questions : [];
  const existing = new Set((await all('SELECT statement FROM questions')).map(r => r.statement.trim().toLowerCase()));
  let created = 0, skipped = 0;
  for (const b of list) {
    if (validateQuestion(b) || existing.has(b.statement.trim().toLowerCase())) { skipped++; continue; }
    const info = await run(
      'INSERT INTO questions (statement, options, correct, image, explanation, lang, difficulty, case_id, case_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [b.statement.trim(), JSON.stringify(b.options), JSON.stringify(b.correct), null, b.explanation || null, b.lang || 'fr',
       [1,2,3].includes(Number(b.difficulty)) ? Number(b.difficulty) : 2, b.caseId || null, Number(b.caseOrder) || 0]);
    await setQuestionTags(info.lastInsertRowid, b.tags);
    existing.add(b.statement.trim().toLowerCase());
    created++;
  }
  res.json({ created, skipped });
}));

/* ---------- Génération IA (clé stockée côté serveur dans settings, ou env ANTHROPIC_API_KEY) ---------- */
async function aiKey() { return process.env.ANTHROPIC_API_KEY || (await getSetting('ai', {})).key || null; }
app.get('/api/ai/status', h(async (req, res) => res.json({ enabled: !!(await aiKey()) })));
app.put('/api/ai/key', h(async (req, res) => {
  const key = String(req.body?.key || '').trim();
  await setSetting('ai', key ? { key } : {});
  res.json({ enabled: !!(await aiKey()) });
}));
app.post('/api/ai/generate', h(async (req, res) => {
  const key = await aiKey();
  if (!key) return res.status(400).json({ error: 'Aucune clé API configurée (Réglages).' });
  const { source = '', count = 5, tags = [], difficulty = 2, lang = 'fr', multi = false } = req.body;
  if (!source.trim()) return res.status(400).json({ error: 'Texte source requis' });
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: key });
  const langName = { fr: 'français', en: 'English', de: 'Deutsch' }[lang] || 'français';
  const diffName = { 1: 'facile (connaissances de base)', 2: 'moyen (interne / jeune médecin)', 3: 'difficile (spécialiste)' }[difficulty] || 'moyen';
  const prompt = `Tu es un enseignant en médecine. À partir du texte source ci-dessous, rédige ${Math.min(20, Math.max(1, Number(count)))} questions à choix multiples (QCM) en ${langName}, de niveau ${diffName}, destinées à un serious game de formation continue pour jeunes médecins.
Exigences : chaque question a 4 propositions (A–D) plausibles, ${multi ? 'une ou plusieurs bonnes réponses' : 'exactement une bonne réponse'}, une explication pédagogique courte (1–2 phrases, avec la référence si présente dans le texte), et 1 à 3 mots-clés en minuscules sans accents (spécialité, thème). Ne pas inventer de données absentes du texte ; rester factuel et à jour des recommandations mentionnées.
Réponds UNIQUEMENT avec un tableau JSON, sans texte autour, au format :
[{"statement":"…","options":["…","…","…","…"],"correct":[1],"explanation":"…","tags":["cardiologie"],"difficulty":${Number(difficulty) || 2}}]
("correct" = indices 0-based des bonnes réponses.)

TEXTE SOURCE :
"""
${source.slice(0, 60000)}
"""`;
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5', max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }]
  });
  const raw = msg.content.map(c => c.text || '').join('');
  const jsonText = raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1);
  let questions = [];
  try { questions = JSON.parse(jsonText); } catch { return res.status(502).json({ error: 'Réponse IA illisible, réessayez.' }); }
  questions = questions.filter(q => q?.statement && Array.isArray(q.options) && q.options.length >= 2)
    .map(q => ({ ...q, tags: [...new Set([...(q.tags || []), ...tags])], difficulty: Number(q.difficulty) || Number(difficulty) || 2, lang }));
  res.json({ questions, usage: msg.usage });
}));

/* ---------- Télécommande (SSE) ---------- */
const remoteStreams = new Map(); // sessionId -> Set(res)
function remoteCode() { return String(Math.floor(1000 + Math.random() * 9000)); }
app.post('/api/sessions/:id/remote-code', h(async (req, res) => {
  const code = remoteCode();
  await run('INSERT INTO remote_codes (session_id, code) VALUES (?, ?) ON CONFLICT(session_id) DO UPDATE SET code = excluded.code, created_at = datetime(\'now\')', [req.params.id, code]);
  res.json({ code });
}));
app.get('/api/sessions/:id/remote-code', h(async (req, res) => {
  const row = await get('SELECT code FROM remote_codes WHERE session_id = ?', [req.params.id]);
  res.json({ code: row?.code || null });
}));
/* Flux d'événements écouté par la console (auth normale) */
app.get('/api/sessions/:id/remote-events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const id = String(req.params.id);
  if (!remoteStreams.has(id)) remoteStreams.set(id, new Set());
  remoteStreams.get(id).add(res);
  res.write('event: hello\ndata: {}\n\n');
  const ka = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ka); remoteStreams.get(id)?.delete(res); });
});
/* Commande envoyée par le smartphone (auth par code court, hors mot de passe global) */
app.post('/api/remote/:id/:code/cmd', h(async (req, res) => {
  const row = await get('SELECT code FROM remote_codes WHERE session_id = ?', [req.params.id]);
  if (!row || row.code !== String(req.params.code)) return res.status(403).json({ error: 'bad_code' });
  const payload = JSON.stringify({ cmd: req.body?.cmd, arg: req.body?.arg ?? null, at: Date.now() });
  for (const r of remoteStreams.get(String(req.params.id)) || []) r.write(`event: cmd\ndata: ${payload}\n\n`);
  res.json({ ok: true, listeners: (remoteStreams.get(String(req.params.id)) || new Set()).size });
}));
app.get('/api/remote/:id/:code/info', h(async (req, res) => {
  const row = await get('SELECT code FROM remote_codes WHERE session_id = ?', [req.params.id]);
  if (!row || row.code !== String(req.params.code)) return res.status(403).json({ error: 'bad_code' });
  const s = await get('SELECT name, current_index, status, question_order FROM sessions WHERE id = ?', [req.params.id]);
  res.json({ name: s?.name, currentIndex: s?.current_index, status: s?.status, total: j(s?.question_order, []).length });
}));

/* ---------- Export ---------- */
app.get('/api/export', h(async (req, res) => {
  const questions = await allQuestions();
  res.setHeader('Content-Disposition', 'attachment; filename="docbingo-export.json"');
  res.json({ exportedAt: new Date().toISOString(), questions });
}));

/* ---------- Session planning ---------- */
function firstBingoSimulation(N, k, successRate, nGrids = 25, iterations = 300) {
  const results = [];
  for (let it = 0; it < iterations; it++) {
    const grids = [];
    for (let g = 0; g < Math.min(nGrids, 60); g++) {
      const nums = shuffle([...Array(N).keys()]).slice(0, k * k);
      grids.push(nums.map(n => ({ n, dead: successRate < 1 && Math.random() > successRate })));
    }
    let first = null;
    const asked = new Set();
    const order = shuffle([...Array(N).keys()]);
    for (let qi = 0; qi < N && first === null; qi++) {
      asked.add(order[qi]);
      for (const grid of grids) {
        if (gridWins(grid, asked, k)) { first = qi + 1; break; }
      }
    }
    if (first !== null) results.push(first);
  }
  if (!results.length) return { median: null, winRate: 0 };
  results.sort((a, b) => a - b);
  return { median: results[Math.floor(results.length / 2)], winRate: results.length / iterations };
}
function gridWins(cells, asked, k) {
  const ok = i => asked.has(cells[i].n) && !cells[i].dead;
  for (let r = 0; r < k; r++) if ([...Array(k).keys()].every(c => ok(r * k + c))) return true;
  for (let c = 0; c < k; c++) if ([...Array(k).keys()].every(r => ok(r * k + c))) return true;
  if ([...Array(k).keys()].every(i => ok(i * k + i))) return true;
  if ([...Array(k).keys()].every(i => ok(i * k + (k - 1 - i)))) return true;
  return false;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function filteredPool(params) {
  let pool = await allQuestions();
  const wanted = (params.tags || []).map(t => t.trim().toLowerCase()).filter(Boolean);
  if (wanted.length) {
    pool = pool.filter(q => (params.tagLogic || params.logic) === 'and'
      ? wanted.every(t => q.tags.includes(t))
      : wanted.some(t => q.tags.includes(t)));
  }
  if (params.excludeRecent) pool = pool.filter(q => q.usedCount === 0);
  const dm = params.difficultyMode || 'any';
  if (['1', '2', '3'].includes(String(dm))) pool = pool.filter(q => q.difficulty === Number(dm));
  return pool;
}

/* Sélection des questions d'une session : respecte les cas cliniques (bloc consécutif, dans l'ordre)
   et le mode de difficulté ('any' | 'progressive' | 'balanced' | '1'|'2'|'3'). */
function pickSessionQuestions(pool, N, difficultyMode = 'any') {
  // grouper par cas clinique
  const cases = new Map(); const singles = [];
  for (const q of pool) { if (q.caseId) { if (!cases.has(q.caseId)) cases.set(q.caseId, []); cases.get(q.caseId).push(q); } else singles.push(q); }
  const units = [...cases.values()].map(g => g.sort((a, b) => a.caseOrder - b.caseOrder)).concat(singles.map(q => [q]));
  shuffle(units);
  let chosen = [];
  if (difficultyMode === 'balanced') {
    // ~ 1/3 de chaque niveau si possible : ordonner les unités par niveau moyen puis piocher en alternance
    const buckets = { 1: [], 2: [], 3: [] };
    for (const u of units) buckets[Math.round(u.reduce((a, q) => a + q.difficulty, 0) / u.length)].push(u);
    const order = [1, 2, 3]; let i = 0;
    while (chosen.length < N && (buckets[1].length || buckets[2].length || buckets[3].length)) {
      const b = buckets[order[i % 3]]; i++;
      if (b.length) chosen.push(...b.shift());
    }
  } else {
    for (const u of units) { if (chosen.length >= N) break; chosen.push(...u); }
  }
  chosen = chosen.slice(0, N);
  if (difficultyMode === 'progressive') {
    // ordre croissant de difficulté en gardant les cas groupés : trier les unités par niveau moyen
    const cs = new Map(); const out = [];
    for (const q of chosen) { const k = q.caseId ? 'c' + q.caseId : 's' + q.id; if (!cs.has(k)) cs.set(k, []); cs.get(k).push(q); }
    const us = [...cs.values()].sort((a, b) => a.reduce((x, q) => x + q.difficulty, 0) / a.length - b.reduce((x, q) => x + q.difficulty, 0) / b.length);
    for (const u of us) out.push(...u);
    chosen = out;
  }
  return chosen;
}

app.post('/api/sessions/plan', h(async (req, res) => {
  const { tags = [], logic = 'or', count, durationMin, secondsPerQuestion = 60, marking = 'correct', excludeRecent = false, participants = 20, difficultyMode = 'any' } = req.body;
  const pool = await filteredPool({ tags, logic, excludeRecent, difficultyMode });
  const byDiff = { 1: pool.filter(q => q.difficulty === 1).length, 2: pool.filter(q => q.difficulty === 2).length, 3: pool.filter(q => q.difficulty === 3).length };
  const overheadPerQuestion = 15;
  const N = count || Math.max(1, Math.floor((durationMin * 60) / (secondsPerQuestion + overheadPerQuestion)));
  const alerts = [];
  if (pool.length < N) alerts.push({ type: 'not_enough_questions', available: pool.length, needed: N });
  const incomplete = pool.filter(q => q.options.filter(o => o?.trim()).length < 2 || !q.correct.length);
  if (incomplete.length) alerts.push({ type: 'incomplete_questions', ids: incomplete.map(q => q.id) });
  const successRate = marking === 'correct' ? 0.7 : 1;
  const sims = {};
  for (const k of [3, 4, 5]) {
    sims[k] = k * k > Math.max(1, N)
      ? { median: null, winRate: 0 }
      : firstBingoSimulation(N, k, successRate, participants);
  }
  const candidates = [3, 4, 5].filter(k => N >= 1.5 * k * k && sims[k].winRate > 0.9 && sims[k].median);
  let recommended = 3;
  if (candidates.length) {
    recommended = candidates.reduce((best, k) =>
      Math.abs(sims[k].median - 0.7 * N) < Math.abs(sims[best].median - 0.7 * N) ? k : best, candidates[0]);
  }
  if (N < 2 * recommended * recommended) alerts.push({ type: 'few_questions_for_grid', gridSize: recommended });
  res.json({ available: pool.length, byDifficulty: byDiff, questionCount: N, estimatedMinutes: Math.round(N * (secondsPerQuestion + overheadPerQuestion) / 60), recommended, simulations: sims, alerts });
}));

/* ---------- Sessions CRUD ---------- */
async function rowToSession(row, withDetails = false) {
  if (!row) return null;
  const s = {
    id: row.id, name: row.name, params: j(row.params, {}), status: row.status,
    questionOrder: j(row.question_order, []), currentIndex: row.current_index,
    state: j(row.state, {}), createdAt: row.created_at, startedAt: row.started_at, finishedAt: row.finished_at,
    slides: j(row.slides, []),
    gridCount: (await get('SELECT COUNT(*) AS c FROM grids WHERE session_id = ?', [row.id])).c
  };
  if (withDetails) {
    s.questions = j(row.questions_snapshot, []);
    s.grids = (await all('SELECT * FROM grids WHERE session_id = ? ORDER BY id', [row.id]))
      .map(g => ({ id: g.id, code: g.code, cells: j(g.cells, []) }));
  }
  return s;
}

app.get('/api/sessions', h(async (req, res) => {
  const rows = await all('SELECT * FROM sessions ORDER BY created_at DESC');
  res.json(await Promise.all(rows.map(r => rowToSession(r))));
}));
app.get('/api/sessions/:id', h(async (req, res) => {
  const s = await rowToSession(await get('SELECT * FROM sessions WHERE id = ?', [req.params.id]), true);
  s ? res.json(s) : res.status(404).json({ error: 'not_found' });
}));

app.post('/api/sessions', h((req, res) => createSession(req, res)));
async function createSession(req, res) {
  const { name, params } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nom requis' });
  const pool = await filteredPool(params);
  const N = params.questionCount;
  if (pool.length < N) return res.status(400).json({ error: `Pas assez de questions : ${pool.length} disponibles pour ${N} demandées.` });
  const chosen = pickSessionQuestions(pool, N, params.difficultyMode || 'any');
  const k = params.gridSize;
  const total = params.participants + Math.max(2, Math.ceil(params.participants * (params.reservePct ?? 10) / 100));
  const seen = new Set();
  const gridsCells = [];
  let guard = 0;
  while (gridsCells.length < total && guard < total * 50) {
    guard++;
    const nums = shuffle([...Array(N).keys()].map(i => i + 1)).slice(0, k * k);
    const key = [...nums].sort((a, b) => a - b).join(',');
    if (seen.has(key) && N > k * k) continue;
    seen.add(key);
    const cells = [];
    for (let r = 0; r < k; r++) cells.push(nums.slice(r * k, (r + 1) * k));
    gridsCells.push(cells);
  }
  const info = await run(
    'INSERT INTO sessions (name, params, question_order, questions_snapshot) VALUES (?, ?, ?, ?)',
    [name.trim(), JSON.stringify(params), JSON.stringify(chosen.map(q => q.id)), JSON.stringify(chosen)]);
  const sid = info.lastInsertRowid;
  for (let i = 0; i < gridsCells.length; i++) {
    await run('INSERT INTO grids (session_id, code, cells) VALUES (?, ?, ?)',
      [sid, 'G-' + String(i + 1).padStart(3, '0'), JSON.stringify(gridsCells[i])]);
  }
  await run('UPDATE questions SET used_count = used_count + 1 WHERE id IN (' + chosen.map(() => '?').join(',') + ')',
    chosen.map(q => q.id));
  res.json(await rowToSession(await get('SELECT * FROM sessions WHERE id = ?', [sid]), true));
}

app.delete('/api/sessions/:id', h(async (req, res) => {
  await run('DELETE FROM grids WHERE session_id = ?', [req.params.id]);
  await run('DELETE FROM sessions WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

/* Éditeur de session (avant lancement) : réordonner / remplacer les questions, diapositives libres */
app.put('/api/sessions/:id/order', h(async (req, res) => {
  const row = await get('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.status !== 'ready') return res.status(400).json({ error: 'Session déjà lancée' });
  const snap = j(row.questions_snapshot, []);
  const order = req.body?.order; // array of question ids (must be a permutation of current)
  const ids = snap.map(q => q.id);
  if (!Array.isArray(order) || order.length !== ids.length || [...order].sort().join() !== [...ids].sort().join())
    return res.status(400).json({ error: 'Ordre invalide' });
  const newSnap = order.map(id => snap.find(q => q.id === id));
  await run('UPDATE sessions SET question_order = ?, questions_snapshot = ? WHERE id = ?', [JSON.stringify(order), JSON.stringify(newSnap), req.params.id]);
  res.json({ ok: true });
}));
app.post('/api/sessions/:id/replace', h(async (req, res) => {
  const row = await get('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.status !== 'ready') return res.status(400).json({ error: 'Session déjà lancée' });
  const params = j(row.params, {}); const snap = j(row.questions_snapshot, []);
  const idx = snap.findIndex(q => q.id === Number(req.body?.questionId));
  if (idx < 0) return res.status(404).json({ error: 'question_not_in_session' });
  let replacement = null;
  if (req.body?.withId) replacement = await rowToQuestion(await get('SELECT * FROM questions WHERE id = ?', [req.body.withId]));
  else {
    const pool = (await filteredPool(params)).filter(q => !snap.some(x => x.id === q.id));
    replacement = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }
  if (!replacement) return res.status(400).json({ error: 'Aucune question de remplacement disponible' });
  snap[idx] = replacement;
  await run('UPDATE sessions SET question_order = ?, questions_snapshot = ? WHERE id = ?', [JSON.stringify(snap.map(q => q.id)), JSON.stringify(snap), req.params.id]);
  await run('UPDATE questions SET used_count = used_count + 1 WHERE id = ?', [replacement.id]);
  res.json(await rowToSession(await get('SELECT * FROM sessions WHERE id = ?', [req.params.id]), true));
}));
app.put('/api/sessions/:id/slides', h(async (req, res) => {
  const slides = Array.isArray(req.body?.slides) ? req.body.slides.map(sl => ({
    afterIndex: Number(sl.afterIndex),           // -1 = avant la 1re question ; i = après la question i (0-based)
    type: ['pause', 'case', 'title'].includes(sl.type) ? sl.type : 'title',
    title: String(sl.title || '').slice(0, 200), text: String(sl.text || '').slice(0, 2000)
  })) : [];
  await run('UPDATE sessions SET slides = ? WHERE id = ?', [JSON.stringify(slides), req.params.id]);
  res.json({ ok: true, slides });
}));

/* Autosave animation state */
app.post('/api/sessions/:id/state', h(async (req, res) => {
  const { currentIndex, state, status } = req.body;
  const row = await get('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const sets = ['current_index = ?', 'state = ?'];
  const vals = [currentIndex, JSON.stringify(state || {})];
  if (status && status !== row.status) {
    sets.push('status = ?'); vals.push(status);
    if (status === 'running' && !row.started_at) sets.push(`started_at = datetime('now')`);
    if (status === 'done') sets.push(`finished_at = datetime('now')`);
  }
  vals.push(req.params.id);
  await run(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`, vals);
  res.json({ ok: true });
}));

/* Race stats */
app.get('/api/sessions/:id/stats', h(async (req, res) => {
  const row = await get('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const s = await rowToSession(row, true);
  const askedCount = s.currentIndex + 1;
  let bingoNow = 0, oneAway = 0;
  for (const grid of s.grids) {
    const k = grid.cells.length;
    const marked = grid.cells.map(rw => rw.map(n => n <= askedCount));
    const lines = [];
    for (let r = 0; r < k; r++) lines.push([...Array(k).keys()].map(c => marked[r][c]));
    for (let c = 0; c < k; c++) lines.push([...Array(k).keys()].map(r => marked[r][c]));
    lines.push([...Array(k).keys()].map(i => marked[i][i]));
    lines.push([...Array(k).keys()].map(i => marked[i][k - 1 - i]));
    const best = Math.max(...lines.map(l => l.filter(Boolean).length));
    if (best === k) bingoNow++;
    else if (best === k - 1) oneAway++;
  }
  res.json({ total: s.grids.length, bingoNow, oneAway, askedCount });
}));

/* Duplicate session */
app.post('/api/sessions/:id/duplicate', h(async (req, res) => {
  const row = await get('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  req.body = { name: row.name + ' (2)', params: JSON.parse(row.params) };
  await createSession(req, res);
}));

/* Bingo verification */
app.get('/api/sessions/:id/verify/:code', h(async (req, res) => {
  const row = await get('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const s = await rowToSession(row, true);
  const grid = s.grids.find(g => g.code.toLowerCase() === String(req.params.code).toLowerCase().trim());
  if (!grid) return res.status(404).json({ error: 'grid_not_found' });
  const askedCount = s.currentIndex + 1;
  const k = grid.cells.length;
  const asked = grid.cells.map(rw => rw.map(n => n <= askedCount));
  const lines = [];
  for (let r = 0; r < k; r++) if (asked[r].every(Boolean)) lines.push({ type: 'row', index: r, nums: grid.cells[r] });
  for (let c = 0; c < k; c++) if (asked.every(rw => rw[c])) lines.push({ type: 'col', index: c, nums: grid.cells.map(rw => rw[c]) });
  if ([...Array(k).keys()].every(i => asked[i][i])) lines.push({ type: 'diag', index: 0, nums: grid.cells.map((rw, i) => rw[i]) });
  if ([...Array(k).keys()].every(i => asked[i][k - 1 - i])) lines.push({ type: 'diag', index: 1, nums: grid.cells.map((rw, i) => rw[k - 1 - i]) });
  const withAnswers = lines.map(l => ({
    ...l,
    answers: l.nums.map(n => {
      const q = s.questions[n - 1];
      return { num: n, correct: q ? q.correct.map(i => 'ABCDE'[i]).join('') : '?', statement: q ? q.statement : '' };
    })
  }));
  res.json({ code: grid.code, cells: grid.cells, asked, lines: withAnswers, askedCount });
}));

/* ---------- Settings ---------- */
app.get('/api/settings', h(async (req, res) => {
  res.json(await getSetting('app', { lang: 'fr', theme: 'suisse', sounds: true, animations: true }));
}));
app.put('/api/settings', h(async (req, res) => {
  await setSetting('app', req.body);
  res.json({ ok: true });
}));

/* ---------- Static (production) ---------- */
const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api|\/images).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`DocBingo server on :${PORT}`));
