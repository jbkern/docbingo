import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:3001';
const OUT = '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1360, height: 850 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

async function shot(hash, name, wait = 700) {
  await page.goto(BASE + '/#' + hash);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}

await shot('/questions', '01-questions');
await shot('/question/1', '02-question-edit');
await shot('/session-new', '03-session-new', 1400);
await shot('/session/1', '04-session-detail');

// Animation : reprise de la session en cours (q9)
await page.goto(BASE + '/#/play/1');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/05-play-question.png` });
// reveal
await page.keyboard.press(' ');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/06-play-revealed.png` });
// verify bingo modal
await page.click('button.bingo');
await page.fill('.modal input', 'G-001');
await page.click('.modal .btn:not(.secondary)');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/07-play-verify.png` });
console.log('shot 05-07 play');

await shot('/settings', '08-settings');

// Thème néon sur l'écran d'animation
await page.click('.theme-opt:nth-child(2)');
await page.waitForTimeout(400);
await page.goto(BASE + '/#/play/1');
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/09-play-neon.png` });
// retour au thème suisse
await page.goto(BASE + '/#/settings');
await page.waitForTimeout(500);
await page.click('.theme-opt:nth-child(1)');
await page.waitForTimeout(300);
console.log('shot 09 neon');

// Mobile
await page.setViewportSize({ width: 390, height: 780 });
await shot('/questions', '10-mobile-questions');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO JS ERRORS');
await browser.close();
