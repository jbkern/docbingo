import { chromium } from 'playwright';
import fs from 'fs';
const BASE = 'http://localhost:3001'; const OUT = '/tmp/s2'; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const hook = (p, tag) => { p.on('pageerror', e => errors.push(tag + ' PAGEERROR: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(tag + ' CONSOLE: ' + m.text().slice(0, 200)); }); };

// Session de test : 3x3, 12 questions, mode "correct"
const plan = await (await fetch(BASE + '/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Sprint 2 — boîtier', params: { mode: 'random', tags: [], tagLogic: 'or', questionCount: 12, secondsPerQuestion: 20, participants: 3, gridSize: 3, marking: 'correct', afterBingoDefault: 'continue', excludeRecent: false, reservePct: 10, sounds: false, animations: true, difficultyMode: 'any' } }) })).json();
const sid = plan.id; console.log('session', sid);

// Console
const cctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const con = await cctx.newPage(); hook(con, 'console');
await con.goto(BASE + '/#/play/' + sid); await con.waitForTimeout(1500);
const code = (await (await fetch(BASE + '/api/sessions/' + sid + '/join-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()).code;
console.log('join code', code);
await con.screenshot({ path: OUT + '/intro-code.png' });

// 3 participants (contextes séparés = téléphones différents)
const phones = [];
for (const name of ['Camille', 'Noah', 'Léa']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const p = await ctx.newPage(); hook(p, name);
  await p.goto(BASE + '/#/join/' + code); await p.waitForTimeout(500);
  await p.fill('input[placeholder="Ex. Camille"]', name);
  await p.click('button:has-text("Rejoindre")'); await p.waitForTimeout(900);
  phones.push({ name, p });
}
await con.waitForTimeout(800);
console.log('participants connectés (console):', await con.textContent('.joinbox').then(t => t.match(/(\d+) connecté/)?.[1]));
await phones[0].p.screenshot({ path: OUT + '/phone-grid.png', fullPage: true });

// Lancer, passer en présentateur
await con.keyboard.press(' '); await con.waitForTimeout(1200);
const pp = cctx.waitForEvent('page'); await con.click('text=Mode présentateur'); const disp = await pp; hook(disp, 'display'); await disp.setViewportSize({ width: 1200, height: 760 }); await con.waitForTimeout(1200);

// Jouer 12 questions : Camille répond juste, Noah faux, Léa au hasard
const session = await (await fetch(BASE + '/api/sessions/' + sid)).json();
for (let i = 0; i < 12; i++) {
  await con.waitForTimeout(700);
  const q = session.questions[i];
  const good = 'ABCDE'[q.correct[0]]; const bad = 'ABCDE'.split('').find(l => l !== good && 'ABCDE'.indexOf(l) < q.options.length);
  const answers = [good, bad, Math.random() < .6 ? good : bad];
  for (let k = 0; k < 3; k++) {
    const p = phones[k].p;
    const btn = p.locator('.opt', { hasText: new RegExp('^' + answers[k]) }).first();
    try { await btn.click({ timeout: 2500 }); } catch (e) { console.log('click fail', phones[k].name, i, e.message.split('\n')[0]); }
    if (q.correct.length > 1) { /* multi : valider */ try { await p.click('button:has-text("Valider")', { timeout: 1000 }); } catch {} }
  }
  await con.waitForTimeout(500);
  if (i === 1) { await phones[0].p.screenshot({ path: OUT + '/phone-answered.png', fullPage: true }); }
  await con.keyboard.press(' '); // révéler
  await con.waitForTimeout(1200);
  if (i === 1) { await con.screenshot({ path: OUT + '/console-dist.png' }); await disp.screenshot({ path: OUT + '/display-dist.png' }); await phones[0].p.screenshot({ path: OUT + '/phone-revealed.png', fullPage: true }); }
  if (i === 3) { // bonus
    await con.click('button:has-text("Bonus")'); await con.waitForTimeout(1000);
    await disp.screenshot({ path: OUT + '/display-bonus.png' });
    await phones[0].p.screenshot({ path: OUT + '/phone-bonus.png', fullPage: true });
    // Camille répond au bonus (bonne réponse inconnue côté client → on lit via API interne du test)
    const live = (await (await fetch(BASE + '/api/sessions/' + sid)).json());
    const bq = await con.evaluate(() => null);
    // clique la première option puis on verra
    try { await phones[0].p.locator('.opt').first().click({ timeout: 2000 }); } catch {}
    await con.click('button:has-text("Fermer le bonus")'); await con.waitForTimeout(500);
  }
  await con.keyboard.press(' '); // suivante (peut afficher annonce bingo)
  await con.waitForTimeout(400);
  const ann = await con.locator('.announce').count();
  if (ann) { await disp.screenshot({ path: OUT + '/display-autobingo.png' }); await con.click('.announce button >> nth=0'); await con.waitForTimeout(400); }
}
await con.waitForTimeout(1500);
await con.screenshot({ path: OUT + '/console-done.png' });
await disp.screenshot({ path: OUT + '/display-podium.png' });
await phones[0].p.screenshot({ path: OUT + '/phone-done.png', fullPage: true });

const board = await (await fetch(BASE + '/api/sessions/' + sid + '/leaderboard')).json();
console.log('leaderboard:', board.map(b => `${b.name} ${b.score}pts ${b.correct}/${b.answered}${b.bingoAt ? ' 🏆Q' + b.bingoAt : ''}`).join(' | '));
const stats = await (await fetch(BASE + '/api/stats/questions')).json();
console.log('stats questions:', stats.questions.length, '| byTag:', stats.byTag.length);

// pages stats + détail
await con.goto(BASE + '/#/stats'); await con.waitForTimeout(1000); await con.screenshot({ path: OUT + '/stats.png', fullPage: true });
await con.goto(BASE + '/#/session/' + sid); await con.waitForTimeout(1000); await con.screenshot({ path: OUT + '/session-results.png' });
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'NO JS ERRORS');
await browser.close();
