import { chromium } from 'playwright';
import fs from 'fs';
const BASE = 'http://localhost:3001'; const OUT = '/tmp/tuto'; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const go = async (h, ms=800) => { await page.goto(BASE + '/#' + h); await page.waitForTimeout(ms); };
await go('/questions'); await page.screenshot({ path: OUT + '/questions.png' });
await go('/question/new'); await page.fill('#st', 'Devant une douleur thoracique avec sus-décalage de ST en inférieur, quel territoire coronaire est le plus probablement en cause ?');
await page.fill('input[placeholder="Proposition A"]', 'Coronaire droite'); await page.fill('input[placeholder="Proposition B"]', 'IVA proximale');
await page.fill('input[placeholder="Proposition C"]', 'Circonflexe'); await page.fill('input[placeholder="Proposition D"]', 'Tronc commun');
await page.click('.correct-toggle >> nth=0'); await page.fill('#ex', 'DII, DIII, aVF : territoire inférieur, coronaire droite dans ~80 % des cas.');
await page.fill('#tg', 'cardiologie'); await page.keyboard.press('Enter'); await page.fill('#tg', 'ecg'); await page.keyboard.press('Enter');
await page.waitForTimeout(400); await page.screenshot({ path: OUT + '/question-form.png', fullPage: true });
await go('/session-new', 1500); await page.fill('#nm', 'Séminaire cardiologie — septembre'); await page.fill('#qc', '20'); await page.waitForTimeout(900);
await page.screenshot({ path: OUT + '/session-new.png', fullPage: true });
await go('/session/1'); await page.screenshot({ path: OUT + '/session-detail.png' });
await go('/sessions'); await page.screenshot({ path: OUT + '/sessions.png' });
// animation
await go('/play/2', 1200); await page.screenshot({ path: OUT + '/play-intro.png' });
await page.keyboard.press(' '); await page.waitForTimeout(1200); await page.screenshot({ path: OUT + '/play-question.png' });
await page.keyboard.press(' '); await page.waitForTimeout(700); await page.screenshot({ path: OUT + '/play-revealed.png' });
await page.click('button.bingo'); await page.fill('.modal input', 'G-003'); await page.click('.modal .btn:not(.secondary)'); await page.waitForTimeout(600);
await page.screenshot({ path: OUT + '/play-verify.png' }); await page.click('text=Fermer et reprendre');
// présentateur
const pp = ctx.waitForEvent('page'); await page.click('text=Mode présentateur'); const disp = await pp; await disp.setViewportSize({ width: 1200, height: 760 }); await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/presenter.png' }); await disp.screenshot({ path: OUT + '/display.png' });
await go('/settings'); await page.screenshot({ path: OUT + '/settings.png' });
// remettre la session 2 à zéro (état ready)
await fetch(BASE + '/api/sessions/2/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentIndex: -1, state: {}, status: 'ready' }) });
console.log('done'); await browser.close();
