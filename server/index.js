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

/* Wrapper: route async avec gestion d'erreur */
const h = (fn) => (req, res) => fn(req, res).catch(e => {
  console.error(e);
  if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
});

/* ---------- Keep-alive (Render free : évite l'endormissement pendant l'utilisation) ---------- */
app.get('/api/ping', (req, res) => res.json({ ok: true, at: Date.now() }));

/* ---------- Auth : comptes utilisateurs (email + mot de passe), jetons signés ----------
   Migration douce : au premier démarrage, un compte admin est créé à partir de DOCBINGO_PASSWORD
   (email ADMIN_EMAIL ou admin@docbingo.local). Sans DOCBINGO_PASSWORD ni utilisateur → accès libre (dev). */
const SECRET = process.env.DOCBINGO_SECRET || crypto.createHash('sha256').update('docbingo:' + (process.env.DOCBINGO_PASSWORD || 'dev')).digest('hex');
const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
const checkPw = (pw, stored) => { const [salt, hex] = String(stored).split(':'); if (!salt || !hex) return false; const h = crypto.scryptSync(pw, salt, 32).toString('hex'); return h.length === hex.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hex)); };
const sign = (payload) => { const body = Buffer.from(JSON.stringify(payload)).toString('base64url'); return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url'); };
const verify = (token) => { try { const [body, sig] = String(token).split('.'); const good = crypto.createHmac('sha256', SECRET).update(body).digest('base64url'); if (sig?.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null; return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; } };

async function ensureAdmin() {
  const n = (await get('SELECT COUNT(*) AS c FROM users')).c;
  if (n === 0 && process.env.DOCBINGO_PASSWORD) {
    const email = (process.env.ADMIN_EMAIL || 'admin@docbingo.local').toLowerCase();
    await run('INSERT INTO users (email, name, role, pass_hash) VALUES (?, ?, ?, ?)', [email, process.env.ADMIN_NAME || 'Administrateur', 'admin', hashPw(process.env.DOCBINGO_PASSWORD)]);
    console.log('Compte admin initial créé :', email);
  }
}
await ensureAdmin();
async function authEnabled() { return (await get('SELECT COUNT(*) AS c FROM users WHERE active = 1')).c > 0; }
async function userFromReq(req) {
  const t = req.headers['x-docbingo-token']; if (!t) return null;
  const p = verify(t); if (!p?.uid) return null;
  const u = await get('SELECT id, email, name, role, active, must_change, charter_at, charter_v FROM users WHERE id = ?', [p.uid]);
  if (!u || !u.active) return null;
  u.mustChange = !!u.must_change; u.charterAccepted = (u.charter_v || 0) >= CHARTER_VERSION; delete u.must_change; delete u.charter_v;
  return u;
}
/* Charte d'utilisation : version courante (incrémenter pour redemander l'acceptation) */
const CHARTER_VERSION = 1;
app.get('/api/auth/mode', h(async (req, res) => res.json({ accounts: await authEnabled() })));
app.post('/api/login', h(async (req, res) => {
  if (!(await authEnabled())) return res.json({ ok: true, token: null, user: { name: 'Invité', role: 'admin' } });
  const email = String(req.body?.email || '').toLowerCase().trim();
  const pw = String(req.body?.password || '');
  // compatibilité : connexion avec le seul mot de passe (ancien écran) → admin si mot de passe global
  let u = email ? await get('SELECT * FROM users WHERE email = ? AND active = 1', [email]) : null;
  if (!u && !email && process.env.DOCBINGO_PASSWORD && pw === process.env.DOCBINGO_PASSWORD) u = await get("SELECT * FROM users WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1");
  if (!u || !checkPw(pw, u.pass_hash)) return res.status(401).json({ ok: false });
  await run("UPDATE users SET last_login = datetime('now') WHERE id = ?", [u.id]);
  res.json({ ok: true, token: sign({ uid: u.id, r: u.role, t: Date.now() }), user: { id: u.id, email: u.email, name: u.name, role: u.role, mustChange: !!u.must_change } });
}));
app.use('/api', async (req, res, next) => {
  if (req.path === '/login' || req.path === '/ping' || req.path.startsWith('/auth/') || req.path.startsWith('/demo/') || req.path.startsWith('/remote/') || req.path.startsWith('/join') || req.path.startsWith('/p/')) return next();
  if (!(await authEnabled())) { req.user = { id: null, name: 'Invité', role: 'admin' }; return next(); }
  const u = await userFromReq(req);
  if (!u) return res.status(401).json({ error: 'auth_required' });
  req.user = u; next();
});
const adminOnly = (req, res, next) => (req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'admin_only' }));

/* ---------- Mot de passe oublié (email) ----------
   Envoi via SMTP si configuré (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, APP_URL) ; sinon la fonction indique de contacter l'administrateur. */
/* Deux modes d'envoi :
   - relais GitHub Actions (GH_MAIL_TOKEN) : l'hébergeur gratuit bloque les ports SMTP sortants, on déclenche donc le
     workflow send-mail.yml qui envoie via la boîte Infomaniak ; le contenu est chiffré (AES-256-GCM, clé = SHA-256 du
     secret DOCBINGO_PASSWORD partagé) pour ne jamais transiter en clair ;
   - SMTP direct (SMTP_HOST/USER/PASS) sinon. */
const relayReady = () => !!(process.env.GH_MAIL_TOKEN && process.env.DOCBINGO_PASSWORD);
const mailReady = () => relayReady() || !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
function encryptForRelay(obj) {
  const key = crypto.createHash('sha256').update(String(process.env.DOCBINGO_PASSWORD)).digest();
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
async function sendMail(to, subject, text, html) {
  if (relayReady()) {
    const repo = process.env.GH_MAIL_REPO || 'jbkern/docbingo';
    const r = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GH_MAIL_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'docbingo-mail' },
      body: JSON.stringify({ event_type: 'send-mail', client_payload: { data: encryptForRelay({ to, subject, text, html }) } })
    });
    if (r.status !== 204) throw new Error('relais GitHub : HTTP ' + r.status);
    return;
  }
  const nodemailer = (await import('nodemailer')).default;
  // Essaie le port configuré (465 = TLS implicite) puis 587 (STARTTLS) si l'hébergeur bloque le premier ; délais courts.
  const ports = [...new Set([Number(process.env.SMTP_PORT || 465), 587, 465])];
  // L'hébergeur n'a pas d'IPv6 sortant : on résout explicitement une adresse IPv4 (le certificat TLS reste vérifié sur le nom).
  const hostName = process.env.SMTP_HOST;
  let host = hostName;
  try { const dns = await import('node:dns/promises'); const a = await dns.default.resolve4(hostName); if (a.length) host = a[0]; } catch (e) { console.error('dns resolve4', e.message); }
  let lastErr;
  for (const port of ports) {
    const tr = nodemailer.createTransport({ host, port, secure: port === 465, requireTLS: port !== 465, name: 'docbingo.ch', tls: { servername: hostName }, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000 });
    try { await tr.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html }); return; }
    catch (e) { lastErr = e; console.error(`mail port ${port}:`, e.message); }
  }
  throw new Error(ports.map(p => p).join('/') + ' : ' + (lastErr?.message || 'échec'));
}
app.get('/api/auth/mail-status', (req, res) => res.json({ enabled: mailReady() }));
app.post('/api/auth/forgot', h(async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!mailReady()) return res.status(503).json({ error: 'mail_not_configured' });
  const u = await get('SELECT * FROM users WHERE email = ? AND active = 1', [email]);
  if (u) {
    // jeton signé, valable 1 h, invalidé automatiquement dès que le mot de passe change (empreinte du hash)
    const token = sign({ rst: u.id, exp: Date.now() + 3600e3, fp: crypto.createHash('sha256').update(u.pass_hash).digest('hex').slice(0, 16) });
    const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const link = `${base}/#/reset/${token}`;
    const lang = (await getSetting('app', {})).lang || 'fr';
    const T = {
      fr: { s: 'DocBingo — réinitialisation de votre mot de passe', b: `Bonjour ${u.name},\n\nPour choisir un nouveau mot de passe DocBingo, ouvrez ce lien (valable 1 heure) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.` },
      en: { s: 'DocBingo — password reset', b: `Hello ${u.name},\n\nTo choose a new DocBingo password, open this link (valid 1 hour):\n${link}\n\nIf you did not request this, ignore this message: your password is unchanged.` },
      de: { s: 'DocBingo — Passwort zurücksetzen', b: `Hallo ${u.name},\n\nUm ein neues DocBingo-Passwort zu wählen, öffnen Sie diesen Link (1 Stunde gültig):\n${link}\n\nFalls Sie dies nicht angefordert haben, ignorieren Sie diese Nachricht.` }
    }[lang] || {};
    try { await sendMail(u.email, T.s, T.b, `<p>${T.b.replace(/\n/g, '<br>').replace(link, `<a href="${link}">${link}</a>`)}</p>`); }
    catch (e) { console.error('mail error', e.message); return res.status(502).json({ error: 'mail_failed', detail: String(e.message).slice(0, 200) }); }
  }
  // même réponse que l'email existe ou non (pas d'énumération des comptes)
  res.json({ ok: true });
}));
app.post('/api/auth/reset', h(async (req, res) => {
  const p = verify(req.body?.token);
  if (!p?.rst || !p.exp || p.exp < Date.now()) return res.status(400).json({ error: 'invalid_or_expired' });
  const u = await get('SELECT * FROM users WHERE id = ? AND active = 1', [p.rst]);
  if (!u || crypto.createHash('sha256').update(u.pass_hash).digest('hex').slice(0, 16) !== p.fp) return res.status(400).json({ error: 'invalid_or_expired' });
  const np = String(req.body?.password || '');
  if (np.length < 8) return res.status(400).json({ error: 'too_short' });
  await run('UPDATE users SET pass_hash = ?, must_change = 0 WHERE id = ?', [hashPw(np), u.id]);
  res.json({ ok: true, token: sign({ uid: u.id, r: u.role, t: Date.now() }), user: { id: u.id, email: u.email, name: u.name, role: u.role, mustChange: false } });
}));

app.get('/api/me', (req, res) => res.json(req.user));
app.post('/api/me/charter', h(async (req, res) => {
  if (!req.user?.id) return res.json({ ok: true });
  await run("UPDATE users SET charter_at = datetime('now'), charter_v = ? WHERE id = ?", [CHARTER_VERSION, req.user.id]);
  res.json({ ok: true, version: CHARTER_VERSION });
}));
/* Les routes qui créent du contenu exigent l'acceptation de la charte (comptes individuels uniquement) */
const charterRequired = (req, res, next) => (!req.user?.id || req.user.charterAccepted ? next() : res.status(403).json({ error: 'charter_required' }));

/* ---------- Vidéo de démonstration (réservée aux utilisateurs connectés) ----------
   Fichiers : private/demo.mp4, private/demo.vtt, private/demo-chapters.json, private/demo-poster.jpg.
   La balise <video> ne peut pas envoyer d'en-tête : le jeton passe en paramètre ?t= (vérifié comme un en-tête). */
const DEMO_DIR = path.join(__dirname, '..', 'private');
async function demoAuth(req, res, next) {
  if (!(await authEnabled())) return next();
  const t = req.query.t || req.headers['x-docbingo-token'];
  const p = verify(t); const u = p?.uid ? await get('SELECT id FROM users WHERE id = ? AND active = 1', [p.uid]) : null;
  if (!u) return res.status(401).json({ error: 'auth_required' });
  next();
}
app.get('/api/demo/video', demoAuth, (req, res) => {
  const file = path.join(DEMO_DIR, 'demo.mp4');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'no_video' });
  const size = fs.statSync(file).size; const range = req.headers.range;
  res.setHeader('Content-Type', 'video/mp4'); res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Cache-Control', 'private, max-age=86400');
  if (range) {
    const [s, e] = range.replace('bytes=', '').split('-'); const start = Number(s); const end = e ? Number(e) : Math.min(start + 2 * 1024 * 1024, size - 1);
    res.status(206); res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`); res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(file, { start, end }).pipe(res);
  } else { res.setHeader('Content-Length', size); fs.createReadStream(file).pipe(res); }
});
app.get('/api/demo/subtitles', demoAuth, (req, res) => { const lang = ['en', 'de'].includes(req.query.lang) ? '-' + req.query.lang : ''; const f = path.join(DEMO_DIR, `demo${lang}.vtt`); if (!fs.existsSync(f)) return res.status(404).end(); res.setHeader('Content-Type', 'text/vtt; charset=utf-8'); fs.createReadStream(f).pipe(res); });
app.get('/api/demo/chapters', demoAuth, (req, res) => { const f = path.join(DEMO_DIR, 'demo-chapters.json'); if (!fs.existsSync(f)) return res.json([]); const d = JSON.parse(fs.readFileSync(f, 'utf8')); res.json(Array.isArray(d) ? d : (d[req.query.lang] || d.fr || [])); });
app.get('/api/demo/poster', (req, res) => { const f = path.join(DEMO_DIR, 'demo-poster.jpg'); if (!fs.existsSync(f)) return res.status(404).end(); res.setHeader('Content-Type', 'image/jpeg'); fs.createReadStream(f).pipe(res); });
app.get('/api/demo/available', (req, res) => res.json({ available: fs.existsSync(path.join(DEMO_DIR, 'demo.mp4')) }));
app.post('/api/me/password', h(async (req, res) => {
  const { current, next: np } = req.body || {};
  const u = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!u || !checkPw(String(current || ''), u.pass_hash)) return res.status(400).json({ error: 'bad_current' });
  if (String(np || '').length < 8) return res.status(400).json({ error: 'too_short' });
  await run('UPDATE users SET pass_hash = ?, must_change = 0 WHERE id = ?', [hashPw(np), u.id]);
  res.json({ ok: true });
}));
/* Gestion des comptes (admin) */
app.get('/api/users', adminOnly, h(async (req, res) => res.json(await all('SELECT id, email, name, role, active, must_change, created_at, last_login, (SELECT COUNT(*) FROM questions q WHERE q.author_id = users.id) AS questions FROM users ORDER BY role, name'))));
app.post('/api/users', adminOnly, h(async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim(); const name = String(req.body?.name || '').trim();
  const role = req.body?.role === 'admin' ? 'admin' : 'author';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) return res.status(400).json({ error: 'invalid' });
  if (await get('SELECT id FROM users WHERE email = ?', [email])) return res.status(400).json({ error: 'exists' });
  const temp = req.body?.password || crypto.randomBytes(6).toString('base64url');
  const info = await run('INSERT INTO users (email, name, role, pass_hash, must_change) VALUES (?, ?, ?, ?, 1)', [email, name, role, hashPw(temp)]);
  res.json({ id: info.lastInsertRowid, email, name, role, tempPassword: temp });
}));
app.put('/api/users/:id', adminOnly, h(async (req, res) => {
  const u = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : u.name;
  const role = req.body?.role ? (req.body.role === 'admin' ? 'admin' : 'author') : u.role;
  const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : u.active;
  if (u.id === req.user.id && (role !== 'admin' || !active)) return res.status(400).json({ error: 'self' });
  await run('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?', [name, role, active, u.id]);
  let tempPassword = null;
  if (req.body?.resetPassword) { tempPassword = crypto.randomBytes(6).toString('base64url'); await run('UPDATE users SET pass_hash = ?, must_change = 1 WHERE id = ?', [hashPw(tempPassword), u.id]); }
  res.json({ ok: true, tempPassword });
}));


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
    status: row.status || 'published', authorId: row.author_id ?? null, authorName: row.origin_author ?? row.author_name ?? null, reviewNote: row.review_note ?? null,
    source: row.source || 'manual', deletedAt: row.deleted_at ?? null,
    usedCount: row.used_count, createdAt: row.created_at, updatedAt: row.updated_at, tags
  };
}
const Q_SELECT = 'SELECT q.*, u.name AS author_name FROM questions q LEFT JOIN users u ON u.id = q.author_id';
async function allQuestions(onlyPublished = false) {
  const rows = await all(Q_SELECT + ' WHERE q.deleted_at IS NULL' + (onlyPublished ? " AND COALESCE(q.status, 'published') = 'published'" : '') + ' ORDER BY q.updated_at DESC');
  return Promise.all(rows.map(rowToQuestion));
}
async function getQuestion(id) { return rowToQuestion(await get(Q_SELECT + ' WHERE q.id = ?', [id])); }
function statusForCreate(user, wanted) {
  if (user.role === 'admin') return wanted === 'draft' ? 'draft' : 'published';
  return wanted === 'draft' ? 'draft' : 'proposed';
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
  const { search = '', tags = '', logic = 'or', difficulty = '', caseId = '', status = '', mine = '' } = req.query;
  let rows = await allQuestions();
  if (req.user.role !== 'admin') rows = rows.filter(q => q.status === 'published' || q.authorId === req.user.id);
  if (status) rows = rows.filter(q => q.status === status);
  if (mine) rows = rows.filter(q => q.authorId === req.user.id);
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

app.get('/api/questions/trash', h(async (req, res) => {
  const rows = await all(Q_SELECT + ' WHERE q.deleted_at IS NOT NULL ORDER BY q.deleted_at DESC');
  let qs = await Promise.all(rows.map(rowToQuestion));
  if (req.user.role !== 'admin') qs = qs.filter(q => q.authorId === req.user.id);
  res.json(qs);
}));
app.get('/api/questions/:id', h(async (req, res) => {
  const q = await getQuestion(req.params.id);
  if (q && req.user.role !== 'admin' && q.status !== 'published' && q.authorId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
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

app.post('/api/questions', charterRequired, h(async (req, res) => {
  const b = req.body;
  const err = validateQuestion(b);
  if (err) return res.status(400).json({ error: err });
  const status = statusForCreate(req.user, b.status);
  const info = await run(
    'INSERT INTO questions (statement, options, correct, image, explanation, lang, difficulty, case_id, case_order, author_id, status, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [b.statement.trim(), JSON.stringify(b.options), JSON.stringify(b.correct), b.image || null, b.explanation || null, b.lang || 'fr',
     [1,2,3].includes(Number(b.difficulty)) ? Number(b.difficulty) : 2, b.caseId || null, Number(b.caseOrder) || 0, req.user.id, status, b.source === 'ai' ? 'ai' : 'manual']);
  await setQuestionTags(info.lastInsertRowid, b.source === 'ai' ? [...(b.tags || []), 'ia'] : b.tags);
  res.json(await getQuestion(info.lastInsertRowid));
}));

app.put('/api/questions/:id', h(async (req, res) => {
  const b = req.body;
  const err = validateQuestion(b);
  if (err) return res.status(400).json({ error: err });
  const cur = await getQuestion(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  if (req.user.role !== 'admin' && cur.authorId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  // auteur : une question publiée modifiée repasse en "proposée" ; brouillon → proposée si demandé
  let status = cur.status;
  if (req.user.role === 'admin') status = b.status === 'draft' ? 'draft' : (b.status === 'proposed' ? 'proposed' : 'published');
  else status = b.status === 'draft' ? 'draft' : 'proposed';
  const r = await run(
    `UPDATE questions SET statement=?, options=?, correct=?, image=?, explanation=?, lang=?, difficulty=?, case_id=?, case_order=?, status=?, updated_at=datetime('now') WHERE id=?`,
    [b.statement.trim(), JSON.stringify(b.options), JSON.stringify(b.correct), b.image || null, b.explanation || null, b.lang || 'fr',
     [1,2,3].includes(Number(b.difficulty)) ? Number(b.difficulty) : 2, b.caseId || null, Number(b.caseOrder) || 0, status, req.params.id]);
  if (!r.changes) return res.status(404).json({ error: 'not_found' });
  await setQuestionTags(Number(req.params.id), b.tags);
  res.json(await getQuestion(req.params.id));
}));

/* Validation éditoriale (admin) */
app.get('/api/review/pending', h(async (req, res) => {
  if (req.user.role !== 'admin') return res.json({ count: 0 });
  res.json({ count: (await get("SELECT COUNT(*) AS c FROM questions WHERE status = 'proposed'")).c });
}));
app.post('/api/questions/:id/review', adminOnly, h(async (req, res) => {
  const action = req.body?.action; const note = String(req.body?.note || '').slice(0, 500) || null;
  if (!['publish', 'return'].includes(action)) return res.status(400).json({ error: 'bad_action' });
  await run(`UPDATE questions SET status = ?, review_note = ?, updated_at = datetime('now') WHERE id = ?`, [action === 'publish' ? 'published' : 'draft', note, req.params.id]);
  res.json(await getQuestion(req.params.id));
}));

/* Corbeille : la suppression est d'abord logique (deleted_at) ; les questions en corbeille n'entrent jamais dans une session. */
const canTrash = (user, q) => user.role === 'admin' || (q.authorId === user.id && q.status !== 'published');
app.delete('/api/questions/trash', h(async (req, res) => {
  const where = req.user.role === 'admin' ? 'deleted_at IS NOT NULL' : 'deleted_at IS NOT NULL AND author_id = ?';
  const args = req.user.role === 'admin' ? [] : [req.user.id];
  const n = (await get(`SELECT COUNT(*) AS c FROM questions WHERE ${where}`, args)).c;
  await run(`DELETE FROM question_tags WHERE question_id IN (SELECT id FROM questions WHERE ${where})`, args);
  await run(`DELETE FROM questions WHERE ${where}`, args);
  await run('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM question_tags)');
  res.json({ ok: true, deleted: n });
}));
app.post('/api/questions/:id/restore', h(async (req, res) => {
  const cur = await rowToQuestion(await get(Q_SELECT + ' WHERE q.id = ?', [req.params.id]));
  if (!cur) return res.status(404).json({ error: 'not_found' });
  if (req.user.role !== 'admin' && cur.authorId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  await run(`UPDATE questions SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?`, [req.params.id]);
  res.json(await getQuestion(req.params.id));
}));
app.delete('/api/questions/:id', h(async (req, res) => {
  const cur = await getQuestion(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  if (!canTrash(req.user, cur)) return res.status(403).json({ error: 'forbidden' });
  await run(`UPDATE questions SET deleted_at = datetime('now') WHERE id = ?`, [req.params.id]);
  res.json({ ok: true, trashed: true });
}));
/* Édition en lot des mots-clés */
app.post('/api/questions/bulk-tags', h(async (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean);
  const norm = (a) => (Array.isArray(a) ? a : []).map(t => String(t).trim().toLowerCase().replace(/^#/, '')).filter(Boolean);
  const add = norm(req.body?.add), remove = norm(req.body?.remove);
  if (!ids.length || (!add.length && !remove.length)) return res.status(400).json({ error: 'nothing_to_do' });
  let n = 0;
  for (const id of ids) {
    const q = await getQuestion(id);
    if (!q || (req.user.role !== 'admin' && q.authorId !== req.user.id)) continue;
    const tags = [...new Set([...q.tags.filter(t => !remove.includes(t)), ...add])];
    await setQuestionTags(id, tags);
    await run(`UPDATE questions SET updated_at = datetime('now') WHERE id = ?`, [id]);
    n++;
  }
  await run('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM question_tags)');
  res.json({ ok: true, updated: n });
}));

app.post('/api/questions/:id/duplicate', h(async (req, res) => {
  const q = await getQuestion(req.params.id);
  if (!q) return res.status(404).json({ error: 'not_found' });
  const info = await run(
    'INSERT INTO questions (statement, options, correct, image, explanation, lang, difficulty, author_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [q.statement + ' (copie)', JSON.stringify(q.options), JSON.stringify(q.correct), q.image, q.explanation, q.lang, q.difficulty, req.user.id, statusForCreate(req.user, 'draft')]);
  await setQuestionTags(info.lastInsertRowid, q.tags);
  res.json(await getQuestion(info.lastInsertRowid));
}));

app.post('/api/questions/check-duplicate', h(async (req, res) => {
  const { statement, excludeId } = req.body;
  const rows = await all('SELECT id, statement FROM questions WHERE deleted_at IS NULL');
  const similar = rows
    .filter(r => r.id !== excludeId)
    .map(r => ({ id: r.id, statement: r.statement, score: similarity(statement || '', r.statement) }))
    .filter(r => r.score > 0.72)
    .sort((a, b) => b.score - a.score).slice(0, 3);
  res.json(similar);
}));

app.get('/api/tags', h(async (req, res) => {
  res.json(await all(
    'SELECT t.name, COUNT(q.id) AS count FROM tags t LEFT JOIN question_tags qt ON qt.tag_id = t.id LEFT JOIN questions q ON q.id = qt.question_id AND q.deleted_at IS NULL GROUP BY t.id ORDER BY t.name'));
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
app.post('/api/cases', charterRequired, h(async (req, res) => {
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
      if (name.endsWith('.gift') || /(^|\n)\s*(::|\$CATEGORY)/.test(text.slice(0, 4000)) && /\{[^}]*[~=][^}]*\}/s.test(text)) {
        const gq = parseGift(text);
        if (gq.length) return res.json({ questions: gq, count: gq.length, format: 'gift' });
      }
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

app.post('/api/import/commit', charterRequired, h(async (req, res) => {
  const list = Array.isArray(req.body?.questions) ? req.body.questions : [];
  const existing = new Set((await all('SELECT statement FROM questions')).map(r => r.statement.trim().toLowerCase()));
  let created = 0, skipped = 0;
  for (const b of list) {
    if (validateQuestion(b) || existing.has(b.statement.trim().toLowerCase())) { skipped++; continue; }
    const info = await run(
      'INSERT INTO questions (statement, options, correct, image, explanation, lang, difficulty, case_id, case_order, author_id, status, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [b.statement.trim(), JSON.stringify(b.options), JSON.stringify(b.correct), b.image || null, b.explanation || null, b.lang || 'fr',
       [1,2,3].includes(Number(b.difficulty)) ? Number(b.difficulty) : 2, b.caseId || null, Number(b.caseOrder) || 0, req.user.id, statusForCreate(req.user, req.body?.status),
       (b.source === 'ai' || req.body?.source === 'ai') ? 'ai' : 'import']);
    // provenance IA : mot-clé #ia ajouté automatiquement
    await setQuestionTags(info.lastInsertRowid, (b.source === 'ai' || req.body?.source === 'ai') ? [...(b.tags || []), 'ia'] : b.tags);
    existing.add(b.statement.trim().toLowerCase());
    created++;
  }
  res.json({ created, skipped });
}));

/* ---------- Génération IA (clé stockée côté serveur dans settings, ou env ANTHROPIC_API_KEY) ---------- */
async function aiKey() { return process.env.ANTHROPIC_API_KEY || (await getSetting('ai', {})).key || null; }
app.get('/api/ai/status', h(async (req, res) => res.json({ enabled: !!(await aiKey()) })));
app.put('/api/ai/key', adminOnly, h(async (req, res) => {
  const key = String(req.body?.key || '').trim();
  await setSetting('ai', key ? { key } : {});
  res.json({ enabled: !!(await aiKey()) });
}));
app.post('/api/ai/generate', charterRequired, h(async (req, res) => {
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
    .map(q => ({ ...q, tags: [...new Set([...(q.tags || []), ...tags, 'ia'])], difficulty: Number(q.difficulty) || Number(difficulty) || 2, lang, source: 'ai' }));
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

/* ====================================================================
   BOÎTIER DE VOTE (participants sur smartphone)
   ==================================================================== */
const liveStreams = new Map();  // sessionId -> Set(res)  (participants)
const consoleStreams = new Map(); // sessionId -> Set(res) (console : événements participants)
function sse(res) {
  res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders();
  const ka = setInterval(() => res.write(': ping\n\n'), 25000);
  return () => clearInterval(ka);
}
function pushTo(map, id, event, data) {
  for (const r of map.get(String(id)) || []) r.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
const JOIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function joinCode() { let c = ''; for (let i = 0; i < 6; i++) c += JOIN_ALPHABET[Math.floor(Math.random() * JOIN_ALPHABET.length)]; return c; }

/* Activer/consulter le code de session (console) */
app.post('/api/sessions/:id/join-code', h(async (req, res) => {
  const row = await get('SELECT join_code FROM sessions WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  let code = row.join_code;
  if (!code || req.body?.renew) {
    do { code = joinCode(); } while (await get('SELECT id FROM sessions WHERE join_code = ?', [code]));
    await run('UPDATE sessions SET join_code = ? WHERE id = ?', [code, req.params.id]);
  }
  res.json({ code });
}));

/* Participants (console) */
async function participantsOf(sid) {
  const rows = await all('SELECT id, name, grid_code, marks, jokers, score, bingo_at, last_seen FROM participants WHERE session_id = ? ORDER BY score DESC, name', [sid]);
  return rows.map(r => ({ id: r.id, name: r.name, gridCode: r.grid_code, marks: j(r.marks, []), jokers: r.jokers, score: r.score, bingoAt: r.bingo_at, lastSeen: r.last_seen }));
}
app.get('/api/sessions/:id/participants', h(async (req, res) => res.json(await participantsOf(req.params.id))));
app.delete('/api/sessions/:id/participants/:pid', h(async (req, res) => {
  await run('DELETE FROM participants WHERE id = ? AND session_id = ?', [req.params.pid, req.params.id]);
  await run('DELETE FROM answers WHERE participant_id = ? AND session_id = ?', [req.params.pid, req.params.id]);
  res.json({ ok: true });
}));

/* Répartition des réponses d'une question (console + public) */
async function distribution(sid, qIndex) {
  const rows = await all('SELECT answer, correct FROM answers WHERE session_id = ? AND q_index = ?', [sid, qIndex]);
  const counts = { A: 0, B: 0, C: 0, D: 0, E: 0 }; let correct = 0;
  for (const r of rows) { for (const l of r.answer) if (counts[l] !== undefined) counts[l]++; if (r.correct) correct++; }
  return { total: rows.length, correct, counts };
}
app.get('/api/sessions/:id/distribution/:q', h(async (req, res) => res.json(await distribution(req.params.id, Number(req.params.q)))));

/* Console : diffuse l'état courant aux participants (appelé par Play à chaque changement) */
app.post('/api/sessions/:id/live', h(async (req, res) => {
  const st = req.body || {};
  await run('UPDATE sessions SET live_state = ? WHERE id = ?', [JSON.stringify(st), req.params.id]);
  // à l'affichage d'une question : compter "asked" pour les stats
  if (st.phase === 'question' && st.event === 'newq' && st.questionId) {
    await run('INSERT INTO question_stats (question_id, asked) VALUES (?, 1) ON CONFLICT(question_id) DO UPDATE SET asked = asked + 1', [st.questionId]);
  }
  const row = await get('SELECT questions_snapshot FROM sessions WHERE id = ?', [req.params.id]);
  const qs = j(row?.questions_snapshot, []);
  const enriched = { ...st, question: st.idx >= 0 && qs[st.idx] ? publicQuestion(qs[st.idx], st.phase === 'revealed') : null };
  if (enriched.bonus?.q) enriched.bonus = { ...enriched.bonus, q: publicQuestion(enriched.bonus.q, !!enriched.bonus.revealed) };
  pushTo(liveStreams, req.params.id, 'state', enriched);
  if (st.phase === 'revealed' && st.idx >= 0) pushTo(liveStreams, req.params.id, 'dist', await distribution(req.params.id, st.idx));
  res.json({ ok: true, listeners: (liveStreams.get(String(req.params.id)) || new Set()).size });
}));
/* Console : flux des événements participants (arrivées, réponses, bingos) */
app.get('/api/sessions/:id/console-events', (req, res) => {
  const stop = sse(res); const id = String(req.params.id);
  if (!consoleStreams.has(id)) consoleStreams.set(id, new Set());
  consoleStreams.get(id).add(res);
  res.write('event: hello\ndata: {}\n\n');
  req.on('close', () => { stop(); consoleStreams.get(id)?.delete(res); });
});

/* ---- Participant : rejoindre ---- */
app.post('/api/join', h(async (req, res) => {
  const code = String(req.body?.code || '').toUpperCase().trim();
  const name = String(req.body?.name || '').trim().slice(0, 40);
  const paper = String(req.body?.paper || '').toUpperCase().trim(); // code de grille papier (optionnel)
  if (!code || !name) return res.status(400).json({ error: 'code_and_name_required' });
  const row = await get('SELECT * FROM sessions WHERE join_code = ?', [code]);
  if (!row) return res.status(404).json({ error: 'session_not_found' });
  if (row.status === 'done') return res.status(400).json({ error: 'session_done' });
  if (j(row.params, {}).participation === 'paper') return res.status(400).json({ error: 'paper_only' });
  const sid = row.id;
  // grille : papier déclarée, sinon attribuer une grille numérique libre (grille non attribuée à un autre participant)
  let gridId = null, gridCode = null;
  if (paper) {
    const g = await get('SELECT id, code FROM grids WHERE session_id = ? AND code = ?', [sid, paper.startsWith('G') ? paper : 'G-' + paper.padStart(3, '0')]);
    if (!g) return res.status(404).json({ error: 'grid_not_found' });
    gridId = g.id; gridCode = g.code;
  } else {
    // Mode mixte : les grilles pré-générées sont supposées imprimées et distribuées sur papier → un smartphone sans code
    // de grille reçoit toujours une grille NOUVELLE (jamais une grille imprimée), pour éviter tout doublon papier/écran.
    // Mode smartphone seul : on réutilise les grilles pré-générées non attribuées (personne ne les imprime).
    const mode = j(row.params, {}).participation || 'mixed';
    const g = mode === 'digital'
      ? await get('SELECT id, code FROM grids WHERE session_id = ? AND id NOT IN (SELECT grid_id FROM participants WHERE session_id = ? AND grid_id IS NOT NULL) ORDER BY id LIMIT 1', [sid, sid])
      : await get("SELECT id, code FROM grids WHERE session_id = ? AND digital = 1 AND id NOT IN (SELECT grid_id FROM participants WHERE session_id = ? AND grid_id IS NOT NULL) ORDER BY id LIMIT 1", [sid, sid]);
    if (!g) {
      // générer une nouvelle grille, unique par rapport à toutes les grilles de la session (mêmes numéros = doublon)
      const params = j(row.params, {}); const N = j(row.question_order, []).length; const k = params.gridSize;
      const existing = new Set((await all('SELECT cells FROM grids WHERE session_id = ?', [sid])).map(r => j(r.cells, []).flat().sort((a, b) => a - b).join(',')));
      let cells;
      for (let attempt = 0; attempt < 50; attempt++) {
        const nums = shuffle([...Array(N).keys()].map(i => i + 1)).slice(0, k * k);
        cells = []; for (let r = 0; r < k; r++) cells.push(nums.slice(r * k, (r + 1) * k));
        if (!existing.has(nums.slice().sort((a, b) => a - b).join(','))) break;
      }
      const cnt = (await get('SELECT COUNT(*) AS c FROM grids WHERE session_id = ?', [sid])).c;
      const codeG = 'G-' + String(cnt + 1).padStart(3, '0');
      const info = await run('INSERT INTO grids (session_id, code, cells, digital) VALUES (?, ?, ?, 1)', [sid, codeG, JSON.stringify(cells)]);
      gridId = info.lastInsertRowid; gridCode = codeG;
    } else { gridId = g.id; gridCode = g.code; }
  }
  const token = crypto.randomBytes(16).toString('hex');
  const info = await run('INSERT INTO participants (session_id, token, name, grid_id, grid_code) VALUES (?, ?, ?, ?, ?)', [sid, token, name, gridId, gridCode]);
  pushTo(consoleStreams, sid, 'joined', { id: info.lastInsertRowid, name, gridCode });
  res.json({ token, sessionId: sid, sessionName: row.name, gridCode });
}));

async function participantByToken(token) { return get('SELECT * FROM participants WHERE token = ?', [token]); }
async function sessionForParticipant(p) { return get('SELECT * FROM sessions WHERE id = ?', [p.session_id]); }
function questionsOf(row) { return j(row.questions_snapshot, []); }

/* ---- Participant : état + grille (au chargement / reconnexion) ---- */
app.get('/api/p/:token/state', h(async (req, res) => {
  const p = await participantByToken(req.params.token);
  if (!p) return res.status(404).json({ error: 'unknown' });
  const row = await sessionForParticipant(p);
  const grid = await get('SELECT code, cells FROM grids WHERE id = ?', [p.grid_id]);
  const qs = questionsOf(row);
  const live = j(row.live_state, {});
  const params = j(row.params, {});
  const myAnswers = (await all('SELECT q_index, answer, correct FROM answers WHERE participant_id = ?', [p.id])).map(a => ({ q: a.q_index, answer: a.answer, correct: !!a.correct }));
  await run("UPDATE participants SET last_seen = datetime('now') WHERE id = ?", [p.id]);
  // question courante (sans la bonne réponse tant que non révélée)
  const cur = live.idx >= 0 && qs[live.idx] ? publicQuestion(qs[live.idx], live.phase === 'revealed') : null;
  if (live.bonus?.q) live.bonus = { ...live.bonus, q: publicQuestion(live.bonus.q, !!live.bonus.revealed) };
  res.json({
    name: p.name, sessionName: row.name, status: row.status, marking: params.marking, gridSize: params.gridSize, total: qs.length,
    grid: grid ? { code: grid.code, cells: j(grid.cells, []) } : null,
    marks: j(p.marks, []), jokers: p.jokers, score: p.score, bingoAt: p.bingo_at,
    live: { ...live, question: cur }, myAnswers
  });
}));
function publicQuestion(q, revealed) {
  return { id: q.id, statement: q.statement, options: q.options, image: q.image, multi: q.correct.length > 1,
    ...(revealed ? { correct: q.correct, explanation: q.explanation } : {}) };
}
/* ---- Participant : flux temps réel ---- */
app.get('/api/p/:token/events', h(async (req, res) => {
  const p = await participantByToken(req.params.token);
  if (!p) return res.status(404).end();
  const row = await sessionForParticipant(p);
  const stop = sse(res); const id = String(p.session_id);
  if (!liveStreams.has(id)) liveStreams.set(id, new Set());
  liveStreams.get(id).add(res);
  const live = j(row.live_state, {}); const qs = questionsOf(row);
  res.write(`event: state\ndata: ${JSON.stringify({ ...live, question: live.idx >= 0 && qs[live.idx] ? publicQuestion(qs[live.idx], live.phase === 'revealed') : null })}\n\n`);
  req.on('close', () => { stop(); liveStreams.get(id)?.delete(res); });
}));

/* ---- Participant : répondre ---- */
app.post('/api/p/:token/answer', h(async (req, res) => {
  const p = await participantByToken(req.params.token);
  if (!p) return res.status(404).json({ error: 'unknown' });
  const row = await sessionForParticipant(p);
  const live = j(row.live_state, {}); const qs = questionsOf(row); const params = j(row.params, {});
  const qIndex = Number(req.body?.qIndex);
  const isBonus = qIndex === -1;
  if (!isBonus && (qIndex !== live.idx || live.phase !== 'question')) return res.status(400).json({ error: 'closed' });
  if (isBonus && !(live.bonus && live.bonus.open)) return res.status(400).json({ error: 'closed' });
  const q = isBonus ? live.bonus.q : qs[qIndex];
  if (!q) return res.status(400).json({ error: 'no_question' });
  const answer = [...new Set(String(req.body?.answer || '').toUpperCase().replace(/[^A-E]/g, '').split(''))].sort().join('');
  if (!answer) return res.status(400).json({ error: 'empty' });
  const good = q.correct.map(i => 'ABCDE'[i]).sort().join('');
  const correct = answer === good ? 1 : 0;
  const ms = live.startedAt ? Math.max(0, Date.now() - live.startedAt) : null;
  const dup = await get('SELECT 1 FROM answers WHERE session_id = ? AND participant_id = ? AND q_index = ?', [row.id, p.id, qIndex]);
  if (dup) return res.status(400).json({ error: 'already' });
  await run('INSERT INTO answers (session_id, participant_id, q_index, question_id, answer, correct, ms) VALUES (?, ?, ?, ?, ?, ?, ?)', [row.id, p.id, qIndex, q.id || null, answer, correct, ms]);
  if (!isBonus && q.id) await run('INSERT INTO question_stats (question_id, answered, correct) VALUES (?, 1, ?) ON CONFLICT(question_id) DO UPDATE SET answered = answered + 1, correct = correct + excluded.correct', [q.id, correct]);
  // score : 100 pts par bonne réponse + bonus rapidité (jusqu'à 50) ; joker si bonus réussi
  let addScore = 0;
  if (correct) addScore = 100 + (ms != null && params.secondsPerQuestion ? Math.round(50 * Math.max(0, 1 - ms / (params.secondsPerQuestion * 1000))) : 0);
  let jokers = p.jokers;
  if (isBonus && correct) jokers++;
  // marquage automatique (mode numérique) : la case du numéro courant
  let marks = j(p.marks, []); let bingoAt = p.bingo_at;
  if (!isBonus) {
    const num = qIndex + 1;
    const grid = await get('SELECT cells FROM grids WHERE id = ?', [p.grid_id]);
    const cells = j(grid?.cells, []);
    const has = cells.some(r => r.includes(num));
    if (has && (params.marking === 'luck' || correct)) marks = [...new Set([...marks, num])];
    if (!bingoAt && hasBingo(cells, marks)) { bingoAt = num; pushTo(consoleStreams, row.id, 'bingo', { id: p.id, name: p.name, gridCode: p.grid_code, atQuestion: num }); }
  }
  await run('UPDATE participants SET score = score + ?, jokers = ?, marks = ?, bingo_at = ? WHERE id = ?', [addScore, jokers, JSON.stringify(marks), bingoAt, p.id]);
  pushTo(consoleStreams, row.id, 'answer', { id: p.id, qIndex, correct: !!correct });
  res.json({ ok: true, correct: !!correct, addScore, marks, jokers, bingoAt, joker: isBonus && correct });
}));
function hasBingo(cells, marks) {
  const k = cells.length; if (!k) return false;
  const m = cells.map(r => r.map(n => marks.includes(n)));
  for (let r = 0; r < k; r++) if (m[r].every(Boolean)) return true;
  for (let c = 0; c < k; c++) if (m.every(rw => rw[c])) return true;
  if ([...Array(k).keys()].every(i => m[i][i])) return true;
  if ([...Array(k).keys()].every(i => m[i][k - 1 - i])) return true;
  return false;
}
/* ---- Participant : utiliser un joker (case libre) ---- */
app.post('/api/p/:token/joker', h(async (req, res) => {
  const p = await participantByToken(req.params.token);
  if (!p) return res.status(404).json({ error: 'unknown' });
  if (p.jokers < 1) return res.status(400).json({ error: 'no_joker' });
  const num = Number(req.body?.num);
  const grid = await get('SELECT cells FROM grids WHERE id = ?', [p.grid_id]);
  const cells = j(grid?.cells, []);
  if (!cells.some(r => r.includes(num))) return res.status(400).json({ error: 'not_on_grid' });
  const marks = [...new Set([...j(p.marks, []), num])];
  let bingoAt = p.bingo_at;
  const row = await sessionForParticipant(p); const live = j(row.live_state, {});
  if (!bingoAt && hasBingo(cells, marks)) { bingoAt = Math.max(1, (live.idx ?? 0) + 1); pushTo(consoleStreams, row.id, 'bingo', { id: p.id, name: p.name, gridCode: p.grid_code, atQuestion: bingoAt, joker: true }); }
  await run('UPDATE participants SET jokers = jokers - 1, marks = ?, bingo_at = ? WHERE id = ?', [JSON.stringify(marks), bingoAt, p.id]);
  res.json({ ok: true, marks, jokers: p.jokers - 1, bingoAt });
}));
/* ---- Classement (console + participants) ---- */
app.get('/api/sessions/:id/leaderboard', h(async (req, res) => {
  const ps = await participantsOf(req.params.id);
  const answered = await all('SELECT participant_id, COUNT(*) AS n, SUM(correct) AS c FROM answers WHERE session_id = ? AND q_index >= 0 GROUP BY participant_id', [req.params.id]);
  const map = Object.fromEntries(answered.map(a => [a.participant_id, a]));
  res.json(ps.map(p => ({ ...p, answered: map[p.id]?.n || 0, correct: map[p.id]?.c || 0 })).sort((a, b) => b.score - a.score || b.correct - a.correct));
}));
app.get('/api/p/:token/leaderboard', h(async (req, res) => {
  const p = await participantByToken(req.params.token);
  if (!p) return res.status(404).json({ error: 'unknown' });
  const ps = await participantsOf(p.session_id);
  res.json(ps.slice(0, 10).map(x => ({ name: x.name, score: x.score, me: x.id === p.id })));
}));

/* ---- Statistiques ---- */
app.get('/api/stats/questions', h(async (req, res) => {
  const rows = await all('SELECT q.id, q.statement, q.difficulty, s.asked, s.answered, s.correct FROM questions q JOIN question_stats s ON s.question_id = q.id WHERE s.answered > 0 AND q.deleted_at IS NULL ORDER BY (CAST(s.correct AS REAL) / s.answered) ASC');
  const out = [];
  for (const r of rows) {
    const tags = (await all('SELECT t.name FROM tags t JOIN question_tags qt ON qt.tag_id = t.id WHERE qt.question_id = ?', [r.id])).map(x => x.name);
    out.push({ id: r.id, statement: r.statement, difficulty: r.difficulty, asked: r.asked, answered: r.answered, correct: r.correct, rate: r.answered ? r.correct / r.answered : null, tags });
  }
  // par mot-clé
  const byTag = {};
  for (const q of out) for (const t of q.tags) { byTag[t] = byTag[t] || { answered: 0, correct: 0 }; byTag[t].answered += q.answered; byTag[t].correct += q.correct; }
  res.json({ questions: out, byTag: Object.entries(byTag).map(([tag, v]) => ({ tag, ...v, rate: v.answered ? v.correct / v.answered : null })).sort((a, b) => a.rate - b.rate) });
}));
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
    if (best === k) bingoNow++; else if (best === k - 1) oneAway++;
  }
  // stats par question de cette session (réponses numériques)
  const perQ = await all('SELECT q_index, COUNT(*) AS n, SUM(correct) AS c FROM answers WHERE session_id = ? AND q_index >= 0 GROUP BY q_index', [req.params.id]);
  const nP = (await get('SELECT COUNT(*) AS c FROM participants WHERE session_id = ?', [req.params.id])).c;
  res.json({ total: s.grids.length, bingoNow, oneAway, askedCount, participants: nP, perQuestion: perQ.map(x => ({ q: x.q_index, answered: x.n, correct: x.c })) });
}));

/* ---------- Collections : export / import (partage entre instances) ---------- */
/* ---------- Formats standards : GIFT (Moodle) et QTI 2.1 ---------- */
function giftEscape(t) { return String(t || '').replace(/\\/g, '\\\\').replace(/([~=#{}:])/g, '\\$1').replace(/\n/g, ' '); }
function toGift(qs) {
  let out = '// DocBingo — export GIFT (' + new Date().toISOString().slice(0, 10) + ') — ' + qs.length + ' questions\n';
  out += '// Licence des contenus : CC BY-NC-SA 4.0 — auteur·es de l\'instance DocBingo (docbingo.ch → À propos)\n\n';
  let lastCat = null;
  for (const q of qs) {
    const cat = 'DocBingo/' + (q.tags[0] || 'divers');
    if (cat !== lastCat) { out += '$CATEGORY: $course$/' + cat + '\n\n'; lastCat = cat; }
    const multi = q.correct.length > 1;
    out += '::' + giftEscape(q.statement.slice(0, 60)) + '::' + giftEscape(q.statement) + ' {\n';
    for (let i = 0; i < q.options.length; i++) {
      const good = q.correct.includes(i);
      if (multi) out += (good ? '\t~%' + (100 / q.correct.length).toFixed(5) + '%' : '\t~%-100%') + giftEscape(q.options[i]) + '\n';
      else out += (good ? '\t=' : '\t~') + giftEscape(q.options[i]) + '\n';
    }
    if (q.explanation) out += '\t#### ' + giftEscape(q.explanation) + '\n';
    out += '}\n\n';
  }
  return out;
}
async function selectForExport(req) {
  const tags = String(req.query.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  let qs = await allQuestions(true);
  if (tags.length) qs = qs.filter(q => tags.some(t => q.tags.includes(t)));
  return { qs, tags };
}
app.get('/api/collections/export-gift', h(async (req, res) => {
  const { qs, tags } = await selectForExport(req);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="docbingo-${tags.join('-') || 'complete'}.gift"`);
  res.send(toGift(qs));
}));
const xmlEsc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function qtiItem(q, id) {
  const multi = q.correct.length > 1;
  const ids = q.options.map((_, i) => 'C' + (i + 1));
  return `<?xml version="1.0" encoding="UTF-8"?>
<assessmentItem xmlns="http://www.imsglobal.org/xsd/imsqti_v2p1" identifier="${id}" title="${xmlEsc(q.statement.slice(0, 80))}" adaptive="false" timeDependent="false">
  <responseDeclaration identifier="RESPONSE" cardinality="${multi ? 'multiple' : 'single'}" baseType="identifier">
    <correctResponse>${q.correct.map(i => `<value>${ids[i]}</value>`).join('')}</correctResponse>
  </responseDeclaration>
  <outcomeDeclaration identifier="SCORE" cardinality="single" baseType="float"><defaultValue><value>0</value></defaultValue></outcomeDeclaration>
  <itemBody>
    <choiceInteraction responseIdentifier="RESPONSE" shuffle="false" maxChoices="${multi ? q.options.length : 1}">
      <prompt>${xmlEsc(q.statement)}</prompt>
      ${q.options.map((o, i) => `<simpleChoice identifier="${ids[i]}">${xmlEsc(o)}</simpleChoice>`).join('\n      ')}
    </choiceInteraction>
  </itemBody>
  ${q.explanation ? `<modalFeedback outcomeIdentifier="FEEDBACK" identifier="general" showHide="show">${xmlEsc(q.explanation)}</modalFeedback>` : ''}
  <responseProcessing template="http://www.imsglobal.org/question/qti_v2p1/rptemplates/match_correct"/>
</assessmentItem>`;
}
app.get('/api/collections/export-qti', h(async (req, res) => {
  const { qs, tags } = await selectForExport(req);
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const resources = [];
  qs.forEach((q, i) => {
    const id = 'docbingo-q' + q.id, file = 'items/' + id + '.xml';
    zip.file(file, qtiItem(q, id));
    resources.push(`<resource identifier="${id}" type="imsqti_item_xmlv2p1" href="${file}"><file href="${file}"/></resource>`);
  });
  zip.file('imsmanifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" identifier="docbingo-export">
  <metadata><schema>IMS Content</schema><schemaversion>1.1.3</schemaversion></metadata>
  <organizations/>
  <resources>
    ${resources.join('\n    ')}
  </resources>
</manifest>`);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="docbingo-qti-${tags.join('-') || 'complete'}.zip"`);
  res.send(buf);
}));
/* Import GIFT : questions à choix (simple et multiple) uniquement ; le reste est ignoré */
function parseGift(text) {
  const out = [];
  // retirer les commentaires et les catégories
  const cleaned = text.replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\$CATEGORY:.*$/gm, '');
  const re = /(?:::((?:[^:]|:(?!:))*)::)?([^{}]*?)\{([^}]*)\}/gs;
  let m;
  while ((m = re.exec(cleaned))) {
    let rawStatement = (m[2] || m[1] || '');
    // titre ::…:: éventuellement resté collé à l'énoncé (titres contenant des « : » échappés)
    const tm = /^\s*::(.*?)::(.*)$/s.exec(rawStatement);
    if (tm) rawStatement = tm[2].trim() || tm[1];
    const statement = rawStatement.replace(/\\([~=#{}:])/g, '$1').replace(/\s+/g, ' ').trim();
    const body = m[3];
    if (!statement || !/[~=]/.test(body)) continue;
    const answers = [];
    const are = /([~=])(%(-?[\d.]+)%)?((?:[^~=#\\]|\\.)+)(?:#((?:[^~=\\]|\\.)*))?/g;
    let a; let feedbackGeneral = '';
    const gi = body.indexOf('####');
    let choicesPart = body;
    if (gi >= 0) { feedbackGeneral = body.slice(gi + 4).replace(/\\([~=#{}:])/g, '$1').trim(); choicesPart = body.slice(0, gi); }
    while ((a = are.exec(choicesPart))) {
      const txt = a[4].replace(/\\([~=#{}:])/g, '$1').trim();
      if (!txt) continue;
      const pct = a[3] !== undefined ? parseFloat(a[3]) : null;
      const good = a[1] === '=' || (pct !== null && pct > 0);
      answers.push({ text: txt, good });
    }
    if (answers.length < 2 || !answers.some(x => x.good)) continue; // vrai/faux, texte, numérique… ignorés
    out.push({
      statement,
      options: answers.map(x => x.text).slice(0, 5),
      correct: answers.map((x, i) => (x.good ? i : -1)).filter(i => i >= 0 && i < 5),
      explanation: feedbackGeneral || null, tags: [], difficulty: 2
    });
  }
  return out;
}

app.get('/api/collections/export', h(async (req, res) => {
  const tags = String(req.query.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  let qs = await allQuestions(true);
  if (tags.length) qs = qs.filter(q => tags.some(t => q.tags.includes(t)));
  const images = {};
  for (const q of qs) if (q.image && !images[q.image]) { const im = await get('SELECT mime, data FROM images WHERE name = ?', [q.image]); if (im) images[q.image] = { mime: im.mime, data: Buffer.from(im.data).toString('base64') }; }
  const cases = {}; for (const q of qs) if (q.caseId && !cases[q.caseId]) { const c = await get('SELECT * FROM clinical_cases WHERE id = ?', [q.caseId]); if (c) cases[q.caseId] = { title: c.title, intro: c.intro }; }
  res.setHeader('Content-Disposition', `attachment; filename="docbingo-collection-${tags.join('-') || 'complete'}.json"`);
  res.json({ format: 'docbingo-collection', version: 1, exportedAt: new Date().toISOString(), tags, count: qs.length,
    questions: qs.map(q => ({ statement: q.statement, options: q.options, correct: q.correct, explanation: q.explanation, tags: q.tags, difficulty: q.difficulty, lang: q.lang, image: q.image, caseKey: q.caseId ? String(q.caseId) : null, caseOrder: q.caseOrder, authorName: q.authorName, source: q.source })),
    cases, images });
}));
const collUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
app.post('/api/collections/import', collUpload.single('file'), h(async (req, res) => {
  let data; try { data = JSON.parse(req.file.buffer.toString('utf8')); } catch { return res.status(400).json({ error: 'invalid_json' }); }
  if (data?.format !== 'docbingo-collection' || !Array.isArray(data.questions)) return res.status(400).json({ error: 'not_a_collection' });
  const existing = new Set((await all('SELECT statement FROM questions')).map(r => r.statement.trim().toLowerCase()));
  const caseMap = {};
  for (const [key, c] of Object.entries(data.cases || {})) { const info = await run('INSERT INTO clinical_cases (title, intro) VALUES (?, ?)', [c.title, c.intro || null]); caseMap[key] = info.lastInsertRowid; }
  const imgMap = {};
  for (const [name, im] of Object.entries(data.images || {})) { const nn = Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(name); await run('INSERT INTO images (name, mime, data) VALUES (?, ?, ?)', [nn, im.mime, Buffer.from(im.data, 'base64')]); imgMap[name] = nn; }
  let created = 0, skipped = 0;
  const status = statusForCreate(req.user, req.body?.status);
  for (const b of data.questions) {
    if (validateQuestion(b) || existing.has(b.statement.trim().toLowerCase())) { skipped++; continue; }
    const info = await run(
      'INSERT INTO questions (statement, options, correct, image, explanation, lang, difficulty, case_id, case_order, author_id, status, source, origin_author) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [b.statement.trim(), JSON.stringify(b.options), JSON.stringify(b.correct), b.image ? imgMap[b.image] || null : null, b.explanation || null, b.lang || 'fr',
       [1,2,3].includes(Number(b.difficulty)) ? Number(b.difficulty) : 2, b.caseKey ? caseMap[b.caseKey] || null : null, Number(b.caseOrder) || 0, req.user.id, status,
       b.source === 'ai' ? 'ai' : 'collection', b.authorName || null]);
    await setQuestionTags(info.lastInsertRowid, b.source === 'ai' ? [...(b.tags || []), 'ia'] : b.tags);
    existing.add(b.statement.trim().toLowerCase()); created++;
  }
  res.json({ created, skipped, cases: Object.keys(caseMap).length, images: Object.keys(imgMap).length });
}));

/* ---------- Sauvegarde complète / restauration (admin) ---------- */
const BACKUP_TABLES = ['users', 'questions', 'tags', 'question_tags', 'clinical_cases', 'sessions', 'grids', 'participants', 'answers', 'question_stats', 'settings', 'remote_codes'];
app.get('/api/backup', adminOnly, h(async (req, res) => {
  const out = { format: 'docbingo-backup', version: 2, exportedAt: new Date().toISOString(), tables: {}, images: [] };
  for (const t of BACKUP_TABLES) out.tables[t] = await all(`SELECT * FROM ${t}`);
  const imgs = await all('SELECT name, mime, data FROM images');
  out.images = imgs.map(i => ({ name: i.name, mime: i.mime, data: Buffer.from(i.data).toString('base64') }));
  res.setHeader('Content-Disposition', `attachment; filename="docbingo-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(out);
}));
const backupUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
app.post('/api/restore', adminOnly, backupUpload.single('file'), h(async (req, res) => {
  if (req.body?.confirm !== 'RESTAURER') return res.status(400).json({ error: 'confirm_required' });
  let data; try { data = JSON.parse(req.file.buffer.toString('utf8')); } catch { return res.status(400).json({ error: 'invalid_json' }); }
  if (data?.format !== 'docbingo-backup') return res.status(400).json({ error: 'not_a_backup' });
  for (const t of [...BACKUP_TABLES].reverse()) await run(`DELETE FROM ${t}`);
  await run('DELETE FROM images');
  let rows = 0;
  for (const t of BACKUP_TABLES) {
    for (const r of data.tables?.[t] || []) {
      const cols = Object.keys(r); await run(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map(c => r[c])); rows++;
    }
  }
  for (const im of data.images || []) await run('INSERT INTO images (name, mime, data) VALUES (?, ?, ?)', [im.name, im.mime, Buffer.from(im.data, 'base64')]);
  res.json({ ok: true, rows, images: (data.images || []).length });
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
  let pool = await allQuestions(true);
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
function pickSessionQuestions(pool, N, difficultyMode = 'any', doShuffle = true) {
  // grouper par cas clinique
  const cases = new Map(); const singles = [];
  for (const q of pool) { if (q.caseId) { if (!cases.has(q.caseId)) cases.set(q.caseId, []); cases.get(q.caseId).push(q); } else singles.push(q); }
  const units = [...cases.values()].map(g => g.sort((a, b) => a.caseOrder - b.caseOrder)).concat(singles.map(q => [q]));
  if (doShuffle) shuffle(units);
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
  if (Array.isArray(req.body.thematicTags) && req.body.thematicTags.length) {
    for (const t of req.body.thematicTags) {
      const n = pool.filter(q => q.tags.includes(String(t).toLowerCase())).length;
      if (n < 3) alerts.push({ type: 'thematic_tag_short', tag: t, available: n });
    }
  }
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
    joinCode: row.join_code || null, thematicRows: j(row.thematic_rows, null), ownerId: row.owner_id ?? null,
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
  let pool = await filteredPool(params);
  const N = params.questionCount;
  if (pool.length < N) return res.status(400).json({ error: `Pas assez de questions : ${pool.length} disponibles pour ${N} demandées.` });
  const k = params.gridSize;
  let chosen; let thematicRows = null;
  if (params.thematic && Array.isArray(params.thematicTags) && params.thematicTags.length === k) {
    // Grilles thématiques : chaque ligne de la grille = un mot-clé ; les questions sont réparties par thème
    thematicRows = params.thematicTags.map(t => String(t).toLowerCase());
    let perRow = Math.ceil(N / k);
    // Traiter d'abord les thèmes les plus rares pour éviter qu'ils soient vidés par les chevauchements
    const order = thematicRows.map((t, i) => ({ t, i, n: pool.filter(q => q.tags.includes(t)).length })).sort((a, b) => a.n - b.n);
    const blocks = Array(k).fill(null); const taken = new Set();
    for (const { t, i } of order) {
      const cand = shuffle(pool.filter(q => q.tags.includes(t) && !taken.has(q.id)));
      // préférer les questions exclusives au thème (moins de conflits)
      cand.sort((a, b) => a.tags.filter(x => thematicRows.includes(x)).length - b.tags.filter(x => thematicRows.includes(x)).length);
      const sub = cand.slice(0, perRow); sub.forEach(q => taken.add(q.id)); blocks[i] = sub;
    }
    perRow = Math.min(...blocks.map(b => b.length));
    if (perRow < k) { const short = thematicRows[blocks.findIndex(b => b.length === perRow)]; return res.status(400).json({ error: `Pas assez de questions publiées pour le thème #${short} (${perRow}, minimum ${k}).` }); }
    chosen = blocks.flatMap(b => b.slice(0, perRow));
  } else {
    // Révisions espacées : privilégier les questions les moins réussies (stats) si demandé
    if (params.spaced) {
      const st = Object.fromEntries((await all('SELECT question_id, answered, correct FROM question_stats')).map(r => [r.question_id, r]));
      const weight = q => { const x = st[q.id]; if (!x || !x.answered) return 1; return 1 + 3 * (1 - x.correct / x.answered); }; // ratées → poids jusqu'à 4
      const weighted = []; for (const q of pool) { const w = weight(q); for (let i = 0; i < Math.round(w * 2); i++) weighted.push(q); }
      shuffle(weighted); const seenIds = new Set(); const prio = [];
      for (const q of weighted) { if (!seenIds.has(q.id)) { seenIds.add(q.id); prio.push(q); } }
      pool = prio; // ordre pondéré, pickSessionQuestions ne re-mélange que les unités... on force l'ordre en désactivant le shuffle interne
      chosen = pickSessionQuestions(pool, N, params.difficultyMode || 'any', false);
    } else {
      chosen = pickSessionQuestions(pool, N, params.difficultyMode || 'any');
    }
  }
  const total = params.participants + Math.max(2, Math.ceil(params.participants * (params.reservePct ?? 10) / 100));
  const seen = new Set();
  const gridsCells = [];
  let guard = 0;
  const NN = chosen.length;
  while (gridsCells.length < total && guard < total * 50) {
    guard++;
    let cells = [];
    if (thematicRows) {
      // ligne r = numéros des questions du thème r (positions perRow*r+1 .. perRow*(r+1))
      const perRow = NN / k;
      for (let r = 0; r < k; r++) {
        const nums = shuffle([...Array(perRow).keys()].map(i => r * perRow + i + 1)).slice(0, k);
        cells.push(nums);
      }
    } else {
      const nums = shuffle([...Array(NN).keys()].map(i => i + 1)).slice(0, k * k);
      for (let r = 0; r < k; r++) cells.push(nums.slice(r * k, (r + 1) * k));
    }
    const key = cells.flat().slice().sort((a, b) => a - b).join(',') + '|' + cells.map(r => r.join('-')).join('/');
    if (seen.has(key) && NN > k * k) continue;
    seen.add(key);
    gridsCells.push(cells);
  }
  const info = await run(
    'INSERT INTO sessions (name, params, question_order, questions_snapshot, owner_id, thematic_rows) VALUES (?, ?, ?, ?, ?, ?)',
    [name.trim(), JSON.stringify(params), JSON.stringify(chosen.map(q => q.id)), JSON.stringify(chosen), req.user?.id || null, thematicRows ? JSON.stringify(thematicRows) : null]);
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
app.put('/api/settings', adminOnly, h(async (req, res) => {
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
