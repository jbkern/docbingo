import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const A4 = { w: 595.28, h: 841.89 }; // portrait, points
const INK = rgb(0.09, 0.196, 0.31);    // ardoise #16324F
const RED = rgb(0.902, 0.224, 0.275);  // #E63946
const GREY = rgb(0.55, 0.58, 0.62);
/* Décor de fêtes (thème « Chalet de Noël ») : cadre vert sapin, liseré rouge, flocons et petits sapins vectoriels */
const XMAS = { green: rgb(0.122, 0.373, 0.271), red: rgb(0.702, 0.125, 0.169), gold: rgb(0.788, 0.635, 0.153), cream: rgb(0.965, 0.937, 0.902) };
function drawSnowflake(page, cx, cy, r, color, thickness = 0.8) {
  for (let i = 0; i < 3; i++) {
    const a = (Math.PI / 3) * i; const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
    page.drawLine({ start: { x: cx - dx, y: cy - dy }, end: { x: cx + dx, y: cy + dy }, thickness, color });
    // petites branches
    for (const sgn of [1, -1]) {
      const bx = cx + dx * 0.6 * sgn, by = cy + dy * 0.6 * sgn;
      for (const t of [a + Math.PI / 6, a - Math.PI / 6]) {
        page.drawLine({ start: { x: bx, y: by }, end: { x: bx + Math.cos(t) * r * 0.32 * sgn, y: by + Math.sin(t) * r * 0.32 * sgn }, thickness: thickness * 0.8, color });
      }
    }
  }
}
function drawTree(page, x, y, h, color) {
  // trois triangles superposés + tronc (x,y = base centre)
  const w = h * 0.7;
  for (let i = 0; i < 3; i++) {
    const ty = y + h * 0.15 + i * h * 0.22, tw = w * (1 - i * 0.22), th = h * 0.42;
    page.drawSvgPath(`M ${-tw / 2} 0 L ${tw / 2} 0 L 0 ${-th} Z`, { x, y: ty, color, borderWidth: 0 });
  }
  page.drawRectangle({ x: x - h * 0.06, y, width: h * 0.12, height: h * 0.16, color: rgb(0.45, 0.3, 0.18) });
  drawStar(page, x, y + h * 0.15 + 2 * h * 0.22 + h * 0.42 + 1.5, 2.6, XMAS.gold);
}
function drawStar(page, cx, cy, r, color) {
  let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.45 : r; d += (i ? 'L' : 'M') + ` ${Math.cos(a) * rr} ${-Math.sin(a) * rr} `; }
  page.drawSvgPath(d + 'Z', { x: cx, y: cy, color, borderWidth: 0 });
}
function drawXmasDecor(page, yBase, W, H) {
  const m = 12;
  page.drawRectangle({ x: m, y: yBase + m, width: W - 2 * m, height: H - 2 * m, borderColor: XMAS.green, borderWidth: 2.2, color: undefined });
  page.drawRectangle({ x: m + 4, y: yBase + m + 4, width: W - 2 * m - 8, height: H - 2 * m - 8, borderColor: XMAS.red, borderWidth: 0.9, borderDashArray: [4, 3] });
  // flocons le long des bords haut et bas
  for (let i = 0; i < 9; i++) {
    const x = m + 30 + i * ((W - 2 * m - 60) / 8);
    drawSnowflake(page, x, yBase + H - m - 1, 4.5, XMAS.green, 0.7);
    if (i % 2 === 0) drawSnowflake(page, x + 20, yBase + m + 1, 3.5, XMAS.red, 0.6);
  }
  // petit bosquet de sapins dans la marge gauche (zone libre), à mi-hauteur
  drawTree(page, m + 26, yBase + H * 0.42, 34, XMAS.green);
  drawTree(page, m + 48, yBase + H * 0.42 - 2, 24, XMAS.green);
  drawTree(page, m + 12, yBase + H * 0.42 - 3, 20, XMAS.green);
  drawSnowflake(page, m + 40, yBase + H * 0.42 + 46, 5, XMAS.red, 0.7);
}

const PDF_I18N = {
  fr: {
    rulesTitle: 'RÈGLES',
    rulesCorrect: ['Le numéro tiré est sur votre grille ?', 'Écrivez votre réponse (A-E)', 'dans la case avant la fin du', 'compte à rebours.', '', 'Réponse juste : cochez la case.', 'Réponse fausse : barrez-la.', '', 'Ligne, colonne ou diagonale', 'complète = BINGO !'],
    rulesLuck: ['Le numéro tiré est sur votre', 'grille ? Cochez la case.', '', 'Ligne, colonne ou diagonale', 'complète = BINGO !'],
    cutHere: 'couper ici',
    footer: (n, k) => `${n} questions - grille ${k}x${k}`,
    footerRight: 'En cas de bingo, annoncez-le et donnez le code de votre grille.', qrHint: 'Scannez pour jouer aussi sur smartphone'
  },
  en: {
    rulesTitle: 'RULES',
    rulesCorrect: ['Drawn number on your card?', 'Write your answer (A-E)', 'in the cell before the', 'countdown ends.', '', 'Correct answer: tick the cell.', 'Wrong answer: cross it out.', '', 'Complete row, column or', 'diagonal = BINGO!'],
    rulesLuck: ['Drawn number on your card?', 'Tick the cell.', '', 'Complete row, column or', 'diagonal = BINGO!'],
    cutHere: 'cut here',
    footer: (n, k) => `${n} questions - ${k}x${k} card`,
    footerRight: 'If you get a bingo, call it out and give your card code.', qrHint: 'Scan to also play on your phone'
  },
  de: {
    rulesTitle: 'REGELN',
    rulesCorrect: ['Gezogene Nummer auf Ihrer Karte?', 'Schreiben Sie Ihre Antwort (A-E)', 'in das Feld, bevor der', 'Countdown endet.', '', 'Richtig: Feld ankreuzen.', 'Falsch: Feld durchstreichen.', '', 'Vollständige Zeile, Spalte oder', 'Diagonale = BINGO!'],
    rulesLuck: ['Gezogene Nummer auf Ihrer Karte?', 'Feld ankreuzen.', '', 'Vollständige Zeile, Spalte oder', 'Diagonale = BINGO!'],
    cutHere: 'hier schneiden',
    footer: (n, k) => `${n} Fragen - Karte ${k}x${k}`,
    footerRight: 'Bei Bingo laut rufen und den Kartencode nennen.', qrHint: 'Scannen, um auch am Handy zu spielen'
  }
};

/**
 * Generate the grids PDF: two A5 (half-A4) grids per A4 page, dashed cut line in the middle.
 * session: { name, params: { gridSize, marking, questionCount } }
 * grids: [{ code, cells: number[][] }]
 */
import QRCode from 'qrcode';

export async function generateGridsPdf(session, grids, lang = 'fr', opts = {}) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const L = PDF_I18N[lang] || PDF_I18N.fr;

  const halfH = A4.h / 2;
  for (let i = 0; i < grids.length; i += 2) {
    const page = doc.addPage([A4.w, A4.h]);
    if (opts.theme === 'noel') { drawXmasDecor(page, halfH, A4.w, halfH); if (grids[i + 1]) drawXmasDecor(page, 0, A4.w, halfH); }
    drawGrid(page, grids[i], session, halfH, { bold, font, L, joinUrl: opts.joinUrl, xmas: opts.theme === 'noel' });          // top half
    if (grids[i + 1]) drawGrid(page, grids[i + 1], session, 0, { bold, font, L, joinUrl: opts.joinUrl, xmas: opts.theme === 'noel' }); // bottom half
    // dashed cut line
    const dash = 8;
    for (let x = 14; x < A4.w - 14; x += dash * 2) {
      page.drawLine({ start: { x, y: halfH }, end: { x: x + dash, y: halfH }, thickness: 0.7, color: GREY });
    }
    page.drawText(L.cutHere, { x: A4.w - 60, y: halfH + 4, size: 7, font, color: GREY });
  }
  return doc.save();
}

function drawGrid(page, grid, session, yBase, { bold, font, L, joinUrl, xmas }) {
  const k = grid.cells.length;
  const RED_ = xmas ? XMAS.red : RED, INK_ = xmas ? XMAS.green : INK;
  const W = A4.w, H = A4.h / 2;
  const margin = 30;

  // Header
  page.drawText('DocBingo', { x: margin, y: yBase + H - 40, size: 16, font: bold, color: INK_ });
  const name = session.name.length > 52 ? session.name.slice(0, 52) + '...' : session.name;
  page.drawText(name, { x: margin, y: yBase + H - 56, size: 10, font, color: GREY });
  // Grid code badge (top right)
  const codeText = grid.code;
  const cw = bold.widthOfTextAtSize(codeText, 13);
  page.drawRectangle({ x: W - margin - cw - 18, y: yBase + H - 47, width: cw + 18, height: 22, color: RED_, borderRadius: 4 });
  page.drawText(codeText, { x: W - margin - cw - 9, y: yBase + H - 41, size: 13, font: bold, color: rgb(1, 1, 1) });

  // Grid geometry: centered, sized to fit
  const availH = H - 105;
  const cell = Math.min(64, Math.floor(Math.min((W - 2 * margin - 160) / k, availH / k)));
  const gw = cell * k;
  const gx = (W - gw) / 2 - 40;
  const gy = yBase + 44 + (availH - cell * k) / 2;

  for (let r = 0; r <= k; r++) {
    const heavy = r === 0 || r === k;
    page.drawLine({ start: { x: gx, y: gy + r * cell }, end: { x: gx + gw, y: gy + r * cell }, thickness: heavy ? 1.6 : 0.8, color: INK_ });
  }
  for (let c = 0; c <= k; c++) {
    const heavy = c === 0 || c === k;
    page.drawLine({ start: { x: gx + c * cell, y: gy }, end: { x: gx + c * cell, y: gy + cell * k }, thickness: heavy ? 1.6 : 0.8, color: INK_ });
  }
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      const n = String(grid.cells[r][c]);
      // number in the top-left corner, space below to write the answer
      page.drawText(n, { x: gx + c * cell + 5, y: gy + (k - r) * cell - 15, size: 11, font: bold, color: RED_ });
    }
  }

  // Rules (right column)
  const rx = gx + gw + 22;
  const rules = session.params.marking === 'correct' ? L.rulesCorrect : L.rulesLuck;
  let ry = gy + cell * k - 8;
  page.drawText(L.rulesTitle, { x: rx, y: ry, size: 8.5, font: bold, color: RED_ });
  ry -= 14;
  for (const line of rules) {
    page.drawText(line, { x: rx, y: ry, size: 8, font, color: INK_ });
    ry -= 11;
  }
  // QR code (mode smartphone/mixte) : ouvre la session avec le code de cette grille → cochage automatique sur le téléphone
  if (joinUrl) {
    try {
      const qr = QRCode.create(joinUrl + '?g=' + grid.code, { errorCorrectionLevel: 'M' });
      const n = qr.modules.size, data = qr.modules.data; const px = 1.55; const qx = W - margin - n * px, qy = yBase + 44;
      page.drawRectangle({ x: qx - 3, y: qy - 3, width: n * px + 6, height: n * px + 6, color: rgb(1, 1, 1) });
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (data[r * n + c]) page.drawRectangle({ x: qx + c * px, y: qy + (n - 1 - r) * px, width: px, height: px, color: INK_ });
      page.drawText(L.qrHint, { x: qx - 6 - font.widthOfTextAtSize(L.qrHint, 7), y: qy + 20, size: 7, font, color: GREY });
    } catch {}
  }
  page.drawText(L.footer(session.params.questionCount, k), { x: margin, y: yBase + 18, size: 8, font, color: GREY });
  page.drawText(L.footerRight, { x: W - margin - font.widthOfTextAtSize(L.footerRight, 8), y: yBase + 18, size: 8, font, color: GREY });
}

/* ---------- Fiche de synthèse de session (questions, réponses, explications, résultats) ---------- */
const SUMMARY_I18N = {
  fr: { title: 'Synthèse de session', questions: 'questions', participants: 'participants', winners: 'Bingos', answer: 'Réponse', rate: 'réussite', podium: 'Podium', noData: '—', page: 'page' },
  en: { title: 'Session summary', questions: 'questions', participants: 'participants', winners: 'Bingos', answer: 'Answer', rate: 'success', podium: 'Podium', noData: '—', page: 'page' },
  de: { title: 'Sitzungszusammenfassung', questions: 'Fragen', participants: 'Teilnehmende', winners: 'Bingos', answer: 'Antwort', rate: 'richtig', podium: 'Podium', noData: '—', page: 'Seite' }
};
export async function generateSummaryPdf(session, stats, leaderboard, lang = 'fr') {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const L = SUMMARY_I18N[lang] || SUMMARY_I18N.fr;
  const W = A4.w, H = A4.h, M = 40;
  let page = doc.addPage([W, H]); let y = H - M; let pageNo = 1;
  const clean = (t) => String(t ?? '').replace(/[—–]/g, '-').replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/…/g, '...').replace(/[≤]/g, '<=').replace(/[≥]/g, '>=').replace(/[^\x00-\xFF]/g, '?');
  const wrap = (text, size, f, maxW) => {
    const words = clean(text).split(/\s+/); const lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (f.widthOfTextAtSize(t, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); return lines;
  };
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; pageNo++; };
  const text = (t, size, f = font, color = INK, x = M) => { for (const line of wrap(t, size, f, W - 2 * M - (x - M))) { if (y < M + 20) newPage(); page.drawText(line, { x, y, size, font: f, color }); y -= size * 1.35; } };
  const gap = (n) => { y -= n; };

  page.drawRectangle({ x: 0, y: H - 78, width: W, height: 78, color: INK });
  page.drawText('DocBingo', { x: M, y: H - 34, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText(clean(L.title + ' - ' + session.name), { x: M, y: H - 58, size: 12, font, color: rgb(1, 1, 1) });
  y = H - 100;
  const perQ = Object.fromEntries((stats?.perQuestion || []).map(x => [x.q, x]));
  const dateStr = session.finishedAt ? new Date(session.finishedAt + 'Z').toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'de' ? 'de-CH' : 'fr-CH') : '';
  text(`${dateStr}  ·  ${session.questions.length} ${L.questions}  ·  ${stats?.participants || 0} ${L.participants}  ·  ${session.params.gridSize}x${session.params.gridSize}`, 10, font, GREY);
  gap(4);
  const winners = session.state?.winners || [];
  if (winners.length) text(L.winners + ' : ' + winners.map(w => (w.name ? w.name + ' ' : '') + '(' + w.code + ', Q' + w.atQuestion + ')').join(' · '), 10.5, bold, RED);
  if (leaderboard?.length) { gap(2); text(L.podium + ' : ' + leaderboard.slice(0, 5).map((p, i) => `${i + 1}. ${p.name} ${p.score} pts`).join('  ·  '), 10.5, bold, INK); }
  gap(10);
  session.questions.forEach((q, i) => {
    if (y < M + 90) newPage();
    const st = perQ[i];
    page.drawRectangle({ x: M, y: y - 4, width: 22, height: 16, color: INK, borderRadius: 3 });
    page.drawText(String(i + 1), { x: M + 6, y, size: 9.5, font: bold, color: rgb(1, 1, 1) });
    const rateTxt = st && st.answered ? `  [${Math.round(100 * st.correct / st.answered)} % ${L.rate}, ${st.answered}]` : '';
    for (const line of wrap(q.statement + rateTxt, 10.5, bold, W - 2 * M - 30)) { page.drawText(line, { x: M + 28, y, size: 10.5, font: bold, color: INK }); y -= 14; }
    q.options.forEach((o, k) => {
      const good = q.correct.includes(k);
      for (const line of wrap('ABCDE'[k] + ') ' + o, 9.5, good ? bold : font, W - 2 * M - 40)) { if (y < M + 20) newPage(); page.drawText(line, { x: M + 34, y, size: 9.5, font: good ? bold : font, color: good ? rgb(0.16, 0.62, 0.56) : INK }); y -= 12.5; }
    });
    if (q.explanation) { for (const line of wrap('> ' + q.explanation, 9, font, W - 2 * M - 40)) { if (y < M + 20) newPage(); page.drawText(line, { x: M + 34, y, size: 9, font, color: GREY }); y -= 12; } }
    y -= 8;
  });
  const pages = doc.getPages();
  pages.forEach((pg, i) => pg.drawText(`DocBingo - ${clean(session.name)} - ${L.page} ${i + 1}/${pages.length}`, { x: M, y: 22, size: 8, font, color: GREY }));
  return doc.save();
}
