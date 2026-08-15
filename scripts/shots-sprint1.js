import { chromium } from 'playwright';
import fs from 'fs';
const BASE = 'http://localhost:3001'; const OUT = '/tmp/s1'; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await ctx.newPage();
const errors = [];
const hook = p => { p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); }); };
hook(page);
const go = async (h, ms = 800) => { await page.goto(BASE + '/#' + h); await page.waitForTimeout(ms); };

// 1. Import texte
await go('/import');
await page.click('text=Texte collé');
await page.fill('textarea', `Quel est le traitement de première intention de la crise de goutte ?
A) Allopurinol
B) Colchicine
C) Amoxicilline
D) Paracétamol seul
Réponse : B
Explication : L'allopurinol est un traitement de fond.
#rhumatologie

Quelle est la dose maximale de paracétamol chez l'adulte ?
A. 2 g/j
B. 3 g/j
C. 4 g/j
D. 6 g/j
Bonne réponse : C
Difficulté : facile
#pharmacologie`);
await page.click('text=Analyser'); await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/import-preview.png', fullPage: true });
await page.click('button:has-text("Enregistrer 2 question")'); await page.waitForTimeout(800);
console.log('import done:', await page.textContent('.alert.ok'));

// 2. Import IA (désactivé) view
await go('/import'); await page.click('text=Générer par IA'); await page.waitForTimeout(300);
await page.screenshot({ path: OUT + '/import-ai.png' });

// 3. Question form with difficulty + case
await go('/question/new'); await page.waitForTimeout(500);
await page.screenshot({ path: OUT + '/question-form.png', fullPage: true });

// 4. Session new with difficulty modes
await go('/session-new', 1500); await page.fill('#nm', 'Sprint 1 test'); await page.fill('#qc', '12'); await page.waitForTimeout(700);
await page.click('button:has-text("Progressif")'); await page.waitForTimeout(700);
await page.screenshot({ path: OUT + '/session-new.png', fullPage: true });
await page.click('button:has-text("Créer la session")'); await page.waitForTimeout(1500);
const sid = location => location; const url = page.url(); const newId = url.split('/').pop();
console.log('session créée', newId);

// 5. Session editor: reorder, slide
await page.click('text=Modifier l\'ordre'); await page.waitForTimeout(300);
await page.click('.qrow >> nth=1 >> button[title="↓"]'); await page.waitForTimeout(600);
await page.click('.addslide >> nth=1'); await page.waitForTimeout(300);
await page.click('button:has-text("☕")');
await page.fill('.modal input', 'Pause café — reprise dans 10 minutes');
await page.click('.modal button:has-text("Enregistrer")'); await page.waitForTimeout(600);
await page.screenshot({ path: OUT + '/session-editor.png', fullPage: true });

// 6. Play with slide + remote panel
await go('/play/' + newId, 1200);
await page.keyboard.press(' '); await page.waitForTimeout(1200);
const pp = ctx.waitForEvent('page'); await page.click('text=Mode présentateur'); const disp = await pp; hook(disp); await disp.setViewportSize({ width: 1200, height: 760 }); await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/presenter-remote.png' });
const code = (await (await fetch(BASE + '/api/sessions/' + newId + '/remote-code')).json()).code;
console.log('remote code', code);
// smartphone remote
const phone = await ctx.newPage({ viewport: { width: 390, height: 780 } }); hook(phone);
await phone.setViewportSize({ width: 390, height: 780 });
await phone.goto(BASE + '/#/remote/' + newId); await phone.waitForTimeout(600);
await phone.fill('input', code); await phone.click('text=Se connecter'); await phone.waitForTimeout(800);
await phone.screenshot({ path: OUT + '/remote-phone.png' });
// phone: reveal Q1, then next → the "Pause café" slide (inserted after Q1) must appear on the display
await phone.click('button:has-text("Réponse")'); await phone.waitForTimeout(900);
await phone.click('button:has-text("Suivante")'); await phone.waitForTimeout(1500);
await disp.screenshot({ path: OUT + '/display-slide.png' });
await page.screenshot({ path: OUT + '/presenter-slide.png' });
console.log('slide visible on display:', (await disp.textContent('body')).includes('Pause café'));
// phone: next → closes the slide and moves to Q2
const before = await page.textContent('.c-topbar');
await phone.click('button:has-text("Suivante")'); await phone.waitForTimeout(1500);
const after = await page.textContent('.c-topbar');
console.log('remote sync:', before.match(/Question \d+ \/ \d+/)?.[0], '→', after.match(/Question \d+ \/ \d+/)?.[0]);

// 7. Settings
await go('/settings'); await page.waitForTimeout(500);
await page.screenshot({ path: OUT + '/settings.png', fullPage: true });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO JS ERRORS');
await browser.close();
