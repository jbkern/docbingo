import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:3001';
const OUT = '/tmp/shots2';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 850 } });
const page = await ctx.newPage();
const errors = [];
for (const p of [page]) {
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
}

// 1. Reprendre la session 1 (en cours) et passer en mode présentateur
await page.goto(BASE + '/#/play/1');
await page.waitForTimeout(1200);
const popupPromise = ctx.waitForEvent('page');
await page.click('text=Mode présentateur');
const display = await popupPromise;
display.on('pageerror', e => errors.push('DISPLAY PAGEERROR: ' + e.message));
display.on('console', m => { if (m.type() === 'error') errors.push('DISPLAY CONSOLE: ' + m.text()); });
await display.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/01-presenter-console.png' });
await display.screenshot({ path: OUT + '/02-public-display.png' });
console.log('shots 01-02');

// 2. Avancer d'une question depuis la console → vérifier la synchro sur l'écran public
const before = await display.textContent('.p-head');
await page.keyboard.press(' ');   // reveal ou next
await page.waitForTimeout(900);
await page.keyboard.press(' ');
await page.waitForTimeout(1200);
const after = await display.textContent('.p-head');
console.log('sync check:', before.replace(/\s+/g, ' ').trim(), '→', after.replace(/\s+/g, ' ').trim());
await display.screenshot({ path: OUT + '/03-display-synced.png' });

// 3. Vérification de bingo depuis la console
await page.click('text=Vérifier un bingo');
await page.fill('.modal input', 'G-002');
await page.click('.modal .btn:not(.secondary)');
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + '/04-presenter-verify.png' });
await page.click('text=Fermer et reprendre');
console.log('shots 03-04');

// 4. Langues : EN puis DE
await page.goto(BASE + '/#/settings');
await page.waitForTimeout(600);
await page.selectOption('#lg', 'en');
await page.waitForTimeout(500);
await page.goto(BASE + '/#/session-new');
await page.waitForTimeout(1300);
await page.screenshot({ path: OUT + '/05-session-new-EN.png' });
await page.goto(BASE + '/#/settings');
await page.waitForTimeout(500);
await page.selectOption('#lg', 'de');
await page.waitForTimeout(500);
await page.goto(BASE + '/#/questions');
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/06-questions-DE.png' });
// retour FR
await page.goto(BASE + '/#/settings');
await page.waitForTimeout(400);
await page.selectOption('#lg', 'fr');
await page.waitForTimeout(400);
console.log('shots 05-06');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO JS ERRORS');
await browser.close();
