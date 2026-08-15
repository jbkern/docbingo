/* Enregistre une vidéo de démonstration de DocBingo (Playwright, 1280x720) + sous-titres WebVTT. */
import { chromium } from 'playwright';
import fs from 'fs';
const BASE = 'http://localhost:3001';
const OUT = '/tmp/demo'; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const SID = process.argv[2] || '17';
const cues = []; const t0 = Date.now();
const cue = (text) => cues.push({ at: (Date.now() - t0) / 1000, text });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const TK = (await (await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@docbingo.local', password: 'test123' }) })).json()).token;
const H = { 'Content-Type': 'application/json', 'X-DocBingo-Token': TK };
// remise à zéro de la session de démo
await fetch(BASE + '/api/sessions/' + SID + '/state', { method: 'POST', headers: H, body: JSON.stringify({ currentIndex: 0, state: {}, status: 'ready' }) });
await fetch(BASE + '/api/sessions/' + SID + '/live', { method: 'POST', headers: H, body: JSON.stringify({ phase: 'lobby', idx: -1 }) }).catch(() => {});
for (const pt of (await (await fetch(BASE + '/api/sessions/' + SID + '/participants', { headers: H })).json().catch(() => [])) || []) await fetch(BASE + '/api/sessions/' + SID + '/participants/' + pt.id, { method: 'DELETE', headers: H });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
// curseur visible pour la démo
await page.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div'); c.id = '__cur';
    c.style.cssText = 'position:fixed;z-index:99999;width:18px;height:18px;border-radius:50%;background:rgba(230,57,70,.55);border:2px solid #fff;pointer-events:none;transform:translate(-50%,-50%);transition:left .25s ease,top .25s ease;box-shadow:0 0 0 4px rgba(230,57,70,.2)';
    document.body.appendChild(c);
    document.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; });
  });
});
const moveClick = async (sel, ms = 900) => { const el = page.locator(sel).first(); await el.scrollIntoViewIfNeeded(); const b = await el.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await wait(350); await el.click(); await wait(ms); };
const type = async (sel, text) => { const el = page.locator(sel).first(); await el.click(); for (const ch of text) { await el.type(ch, { delay: 0 }); await wait(28); } };

// 1. Connexion
await page.goto(BASE + '/#/home'); await wait(1200);
cue('DocBingo — le bingo QCM médical. Connectez-vous avec votre email et votre mot de passe.');
await type('input[type="email"]', 'admin@docbingo.local'); await type('input[type="password"]', 'test123'); await wait(400);
await moveClick('button:has-text("Se connecter")', 1800);
cue("L'accueil : session en cours, indicateurs de la banque, dernières sessions et actions rapides.");
await page.mouse.move(640, 400, { steps: 20 }); await wait(2600);

// 2. Banque de questions
await moveClick('nav a:has-text("Questions")', 1500);
cue('La banque de questions : recherche, filtres par mots-clés, niveau de difficulté, statut de validation.');
await page.mouse.move(400, 300, { steps: 20 }); await wait(1400);
await moveClick('button.tag:has-text("#cardiologie")', 1600);
cue('Un clic sur un mot-clé filtre la banque — par exemple #cardiologie.');
await wait(1200);
await moveClick('a:has-text("Nouvelle question")', 1400);
cue('Créer une question : énoncé, propositions A à E, bonne(s) réponse(s), image, explication, difficulté, cas clinique, mots-clés.');
await type('#st', 'Devant un choc anaphylactique, quel est le traitement de première intention ?');
await type('input[placeholder="Proposition A"]', 'Corticoïdes IV'); await type('input[placeholder="Proposition B"]', 'Adrénaline IM'); await type('input[placeholder="Proposition C"]', 'Antihistaminiques'); await type('input[placeholder="Proposition D"]', 'Remplissage seul');
await moveClick('.correct-toggle >> nth=1', 500);
await type('#ex', "L'adrénaline IM 0,5 mg est le traitement de première intention, sans délai.");
await type('#tg', 'urgences'); await page.keyboard.press('Enter'); await wait(300);
await page.locator('#tg').scrollIntoViewIfNeeded(); await wait(600);
cue('Un administrateur publie directement ; un auteur propose, et la question passe par la file de validation.');
await moveClick('button:has-text("Publier")', 1600);

// 3. Import
await moveClick('a:has-text("Importer")', 1200);
cue('Importez des questions depuis Excel, Word ou un texte collé — ou générez des QCM par IA à partir d\'un article, toujours avec relecture avant enregistrement.');
await moveClick('button:has-text("Générer par IA")', 2600);

// 4. Nouvelle session
await moveClick('nav a:has-text("Sessions")', 1200);
await moveClick('a:has-text("Nouvelle session")', 1600);
cue('Créer une session : thème ou aléatoire, nombre de questions ou durée, temps par question, participants, papier et/ou smartphone…');
await type('#nm', 'Séminaire cardio — octobre'); await wait(400);
await page.mouse.move(900, 300, { steps: 15 }); await wait(1200);
cue('DocBingo recommande la taille de grille par simulation et alerte si la banque est insuffisante.');
await page.locator('label:has-text("Mode de marquage")').scrollIntoViewIfNeeded(); await wait(1800);
cue('Deux modes de jeu : bonne réponse requise (serious game) ou pur hasard (détente).');
await page.locator('label:has-text("Participation")').scrollIntoViewIfNeeded(); await wait(2200);

// 5. Session détail + PDF
await page.goto(BASE + '/#/session/' + SID); await wait(1500);
cue('Le détail de la session : paramètres, grilles uniques à imprimer (2 par A4), ordre des questions modifiable, diapositives libres.');
await page.mouse.move(800, 350, { steps: 20 }); await wait(2600);

// 6. Animation
await moveClick('a[href="#/play/' + SID + '"]', 1600);
cue("L'animation : les participants rejoignent sur smartphone avec le code de session — ou jouent sur papier.");
await wait(1800);
// participants simulés
const phones = [];
const code = (await (await fetch(BASE + '/api/sessions/' + SID + '/join-code', { method: 'POST', headers: H, body: '{}' })).json()).code;
for (const name of ['Camille', 'Noah', 'Léa', 'Sam', 'Inès']) {
  const c = await browser.newContext({ viewport: { width: 390, height: 800 } }); const p = await c.newPage();
  await p.goto(BASE + '/#/join/' + code); await p.waitForTimeout(400);
  await p.fill('input[placeholder="Ex. Camille"]', name); await p.click('button:has-text("Rejoindre")'); await p.waitForTimeout(400);
  phones.push(p);
}
await wait(1500);
await moveClick('button:has-text("Lancer la première question")', 1600);
cue('Le numéro tiré s\'affiche en grand, le compte à rebours tourne, la réponse apparaît automatiquement à zéro.');
const session = await (await fetch(BASE + '/api/sessions/' + SID, { headers: H })).json();
const answer = async (i) => { const q = session.questions[i]; const good = 'ABCDE'[q.correct[0]]; const bad = 'ABCDE'.split('').find(l => l !== good && 'ABCDE'.indexOf(l) < q.options.length);
  for (let k = 0; k < phones.length; k++) { const a = Math.random() < .7 ? good : bad; try { await phones[k].locator('.opt', { hasText: new RegExp('^' + a) }).first().click({ timeout: 800 }); if (q.correct.length > 1) await phones[k].click('button:has-text("Valider")', { timeout: 500 }).catch(() => {}); } catch {} } };
await wait(2500); await answer(0); await wait(1500);
await page.keyboard.press(' '); await wait(1200);
cue('La bonne réponse s\'illumine avec l\'explication ; la répartition des réponses de la salle s\'affiche.');
await wait(2600);
await page.keyboard.press(' '); await wait(2000); await answer(1); await wait(1200); await page.keyboard.press(' '); await wait(2000);
// mode présentateur
cue('Mode présentateur : votre écran devient une console (bonne réponse, question suivante, commandes, participants, télécommande) et l\'écran public se projette à part.');
const pp = ctx.waitForEvent('page'); await moveClick('button:has-text("Mode présentateur")', 500); const disp = await pp; await disp.setViewportSize({ width: 1280, height: 720 }); await wait(2600);
await page.mouse.move(1000, 400, { steps: 20 }); await wait(1800);
// avancer avec bingo probable
for (let i = 2; i < 12; i++) { await page.keyboard.press(' '); await wait(700); await answer(i); await wait(600); await page.keyboard.press(' '); await wait(700);
  const ann = await page.locator('.announce').count(); if (ann) { cue('Sur smartphone, les grilles se cochent automatiquement et le bingo est détecté et annoncé par le serveur — sur papier, la vérification par code de grille prend quelques secondes.'); await wait(3000); await page.click('.announce button >> nth=0'); await wait(500); } }
await wait(1500);
cue('Fin de session : bingos, podium et fiche de synthèse PDF pour les participants.');
await wait(3000);
// stats
await page.goto(BASE + '/#/stats'); await wait(1600);
cue('Les statistiques : questions les plus ratées, réussite par mot-clé, palmarès — pour ajuster votre enseignement.');
await page.mouse.move(600, 500, { steps: 20 }); await wait(2800);
await page.goto(BASE + '/#/settings'); await wait(1400);
cue('Réglages : trois thèmes visuels, français / anglais / allemand, ambiances sonores, comptes, collections partageables, sauvegardes.');
await moveClick('.theme-opt >> nth=1', 1800);
await moveClick('.theme-opt >> nth=2', 1800);
await moveClick('.theme-opt >> nth=0', 1200);
await page.goto(BASE + '/#/home'); await wait(1200);
cue('DocBingo — apprendre en jouant. Bonne session !');
await wait(2500);

const video = page.video();
await ctx.close();
const path = await video.path();
fs.renameSync(path, OUT + '/demo.webm');
// VTT
let vtt = 'WEBVTT\n\n';
const fmt = s => new Date(s * 1000).toISOString().substr(11, 12);
cues.forEach((c, i) => { const end = cues[i + 1] ? cues[i + 1].at - 0.2 : c.at + 4; vtt += `${i + 1}\n${fmt(c.at)} --> ${fmt(end)}\n${c.text}\n\n`; });
fs.writeFileSync(OUT + '/demo.vtt', vtt);
fs.writeFileSync(OUT + '/cues.json', JSON.stringify(cues, null, 1));
await browser.close();
console.log('video ok, cues', cues.length, 'durée', ((Date.now() - t0) / 1000).toFixed(0), 's');
