import { chromium } from 'playwright';
import fs from 'fs';
const BASE = 'http://localhost:3001'; const OUT = '/tmp/s3'; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const hook = (p, tag) => { p.on('pageerror', e => errors.push(tag + ' PAGEERROR: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(tag + ' CONSOLE: ' + m.text().slice(0, 200)); }); };
const J = { 'Content-Type': 'application/json' };

// --- API level : admin login (compte migré depuis DOCBINGO_PASSWORD), création auteur
let r = await fetch(BASE + '/api/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'admin@docbingo.local', password: 'test123' }) });
const admin = await r.json(); console.log('admin login:', admin.ok, admin.user?.role);
const AH = { ...J, 'X-DocBingo-Token': admin.token };
r = await fetch(BASE + '/api/login', { method: 'POST', headers: J, body: JSON.stringify({ email: '', password: 'test123' }) });
console.log('legacy login (email vide):', (await r.json()).ok);
r = await fetch(BASE + '/api/users', { method: 'POST', headers: AH, body: JSON.stringify({ email: 'anna@hopital.ch', name: 'Anna', role: 'author', password: 'anna12345' }) });
const anna = await r.json(); console.log('auteur créé:', anna.email, '| temp:', anna.tempPassword);
r = await fetch(BASE + '/api/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'anna@hopital.ch', password: 'anna12345' }) });
const annaL = await r.json(); const AN = { ...J, 'X-DocBingo-Token': annaL.token }; console.log('anna login:', annaL.ok, annaL.user.role, 'mustChange', annaL.user.mustChange);
// anna propose une question
r = await fetch(BASE + '/api/questions', { method: 'POST', headers: AN, body: JSON.stringify({ statement: 'Question proposée par Anna : quel est le seuil de transfusion en réanimation (Hb) ?', options: ['10 g/dL', '9 g/dL', '7 g/dL', '5 g/dL'], correct: [2], explanation: 'Stratégie restrictive.', tags: ['reanimation', 'hematologie'], difficulty: 2, status: 'proposed' }) });
const pq = await r.json(); console.log('proposée:', pq.status, 'auteur', pq.authorName);
// anna interdite d'admin
r = await fetch(BASE + '/api/users', { headers: AN }); console.log('anna → /api/users:', r.status);
// la question proposée n'entre pas dans les sessions
r = await fetch(BASE + '/api/sessions/plan', { method: 'POST', headers: AH, body: JSON.stringify({ tags: ['reanimation'], count: 5, participants: 5 }) });
console.log('pool #reanimation (publiées):', (await r.json()).available);
// pending
console.log('pending:', (await (await fetch(BASE + '/api/review/pending', { headers: AH })).json()).count);

// --- UI : login admin, page validation
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await ctx.newPage(); hook(page, 'ui');
await page.goto(BASE + '/#/questions'); await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/login.png' });
await page.fill('input[type="email"]', 'admin@docbingo.local'); await page.fill('input[type="password"]', 'test123'); await page.click('button:has-text("Se connecter")'); await page.waitForTimeout(1200);
await page.goto(BASE + '/#/review'); await page.waitForTimeout(1000);
await page.screenshot({ path: OUT + '/review.png' });
await page.fill('input[placeholder*="Commentaire"]', 'Parfait, publié.'); await page.click('button:has-text("Publier")'); await page.waitForTimeout(800);
console.log('après publication:', (await (await fetch(BASE + '/api/questions/' + pq.id, { headers: AH })).json()).status);

// --- Settings : comptes + collections
await page.goto(BASE + '/#/settings'); await page.waitForTimeout(1000);
await page.screenshot({ path: OUT + '/settings-users.png', fullPage: true });

// --- Session thématique 3x3 : cardiologie / urgences / neurologie
await page.goto(BASE + '/#/session-new'); await page.waitForTimeout(1200);
await page.fill('#nm', 'Sprint 3 — grilles thématiques'); await page.fill('#qc', '12'); await page.click('button:has-text("3×3")'); await page.waitForTimeout(400);
await page.click('label:has-text("Grilles thématiques") input');
await page.waitForTimeout(300);
for (const tg of ['cardiologie', 'urgences', 'neurologie']) { await page.click(`button.tag:has-text("#${tg}")`); await page.waitForTimeout(200); }
await page.waitForTimeout(900);
await page.screenshot({ path: OUT + '/session-thematic.png', fullPage: true });
await page.click('button:has-text("Créer la session")'); await page.waitForTimeout(1500);
const sid = page.url().split('/').pop();
const s = await (await fetch(BASE + '/api/sessions/' + sid, { headers: AH })).json();
console.log('session thématique:', sid, 'thematicRows', s.thematicRows, '| grille G-001', JSON.stringify(s.grids[0].cells), '| questions', s.questions.length);
// vérif : ligne r ne contient que des numéros du bloc r
const perRow = s.questions.length / 3; const ok = s.grids.every(g => g.cells.every((row, r) => row.every(n => n > r * perRow && n <= (r + 1) * perRow)));
console.log('lignes thématiques cohérentes:', ok, '| thèmes des questions:', s.questions.slice(0, 4).map(q => q.tags.join('/')).join(', '), '…');

// --- Session révisions espacées
r = await fetch(BASE + '/api/sessions', { method: 'POST', headers: AH, body: JSON.stringify({ name: 'Sprint 3 — révisions', params: { mode: 'random', tags: [], questionCount: 8, secondsPerQuestion: 30, participants: 5, gridSize: 3, marking: 'correct', afterBingoDefault: 'continue', excludeRecent: false, reservePct: 10, difficultyMode: 'any', spaced: true } }) });
const sp = await r.json(); console.log('révisions espacées: session', sp.id, '| premières questions:', sp.questions.slice(0, 3).map(q => q.statement.slice(0, 40)).join(' | '));

// --- Collections export/import
r = await fetch(BASE + '/api/collections/export?tags=cardiologie', { headers: AH }); const coll = await r.json(); console.log('export collection cardiologie:', coll.count, 'questions');
const fd = new FormData(); fd.append('file', new Blob([JSON.stringify(coll)], { type: 'application/json' }), 'coll.json');
r = await fetch(BASE + '/api/collections/import', { method: 'POST', headers: { 'X-DocBingo-Token': admin.token }, body: fd }); console.log('import (doublons attendus):', await r.json());

// --- Formulaire question auteur (statut)
const actx = await browser.newContext({ viewport: { width: 1200, height: 800 } }); const ap = await actx.newPage(); hook(ap, 'anna');
await ap.goto(BASE + '/#/question/new'); await ap.waitForTimeout(700);
await ap.fill('input[type="email"]', 'anna@hopital.ch'); await ap.fill('input[type="password"]', 'anna12345'); await ap.click('button:has-text("Se connecter")'); await ap.waitForTimeout(1200);
await ap.goto(BASE + '/#/question/new'); await ap.waitForTimeout(800);
await ap.screenshot({ path: OUT + '/author-form.png', fullPage: true });
await ap.goto(BASE + '/#/questions'); await ap.waitForTimeout(800);
await ap.screenshot({ path: OUT + '/author-list.png' });

console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO JS ERRORS');
await browser.close();
