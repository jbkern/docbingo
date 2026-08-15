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
  if (!PASSWORD || req.path === '/login' || req.path === '/ping') return next();
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
  const { search = '', tags = '', logic = 'or' } = req.query;
  let rows = await allQuestions();
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
    'INSERT INTO questions (statement, options, correct, image, explanation, lang) VALUES (?, ?, ?, ?, ?, ?)',
    [b.statement.trim(), JSON.stringify(b.options), JSON.stringify(b.correct), b.image || null, b.explanation || null, b.lang || 'fr']);
  await setQuestionTags(info.lastInsertRowid, b.tags);
  res.json(await rowToQuestion(await get('SELECT * FROM questions WHERE id = ?', [info.lastInsertRowid])));
}));

app.put('/api/questions/:id', h(async (req, res) => {
  const b = req.body;
  const err = validateQuestion(b);
  if (err) return res.status(400).json({ error: err });
  const r = await run(
    `UPDATE questions SET statement=?, options=?, correct=?, image=?, explanation=?, lang=?, updated_at=datetime('now') WHERE id=?`,
    [b.statement.trim(), JSON.stringify(b.options), JSON.stringify(b.correct), b.image || null, b.explanation || null, b.lang || 'fr', req.params.id]);
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
  return pool;
}

app.post('/api/sessions/plan', h(async (req, res) => {
  const { tags = [], logic = 'or', count, durationMin, secondsPerQuestion = 60, marking = 'correct', excludeRecent = false, participants = 20 } = req.body;
  const pool = await filteredPool({ tags, logic, excludeRecent });
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
  res.json({ available: pool.length, questionCount: N, estimatedMinutes: Math.round(N * (secondsPerQuestion + overheadPerQuestion) / 60), recommended, simulations: sims, alerts });
}));

/* ---------- Sessions CRUD ---------- */
async function rowToSession(row, withDetails = false) {
  if (!row) return null;
  const s = {
    id: row.id, name: row.name, params: j(row.params, {}), status: row.status,
    questionOrder: j(row.question_order, []), currentIndex: row.current_index,
    state: j(row.state, {}), createdAt: row.created_at, startedAt: row.started_at, finishedAt: row.finished_at,
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
  const chosen = shuffle([...pool]).slice(0, N);
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
