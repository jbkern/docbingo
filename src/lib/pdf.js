import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const A4 = { w: 595.28, h: 841.89 }; // portrait, points
const INK = rgb(0.09, 0.196, 0.31);    // ardoise #16324F
const RED = rgb(0.902, 0.224, 0.275);  // #E63946
const GREY = rgb(0.55, 0.58, 0.62);

const PDF_I18N = {
  fr: {
    rulesTitle: 'RÈGLES',
    rulesCorrect: ['Le numéro tiré est sur votre grille ?', 'Écrivez votre réponse (A-E)', 'dans la case avant la fin du', 'compte à rebours.', '', 'Réponse juste : cochez la case.', 'Réponse fausse : barrez-la.', '', 'Ligne, colonne ou diagonale', 'complète = BINGO !'],
    rulesLuck: ['Le numéro tiré est sur votre', 'grille ? Cochez la case.', '', 'Ligne, colonne ou diagonale', 'complète = BINGO !'],
    cutHere: 'couper ici',
    footer: (n, k) => `${n} questions - grille ${k}x${k}`,
    footerRight: 'En cas de bingo, annoncez-le et donnez le code de votre grille.'
  },
  en: {
    rulesTitle: 'RULES',
    rulesCorrect: ['Drawn number on your card?', 'Write your answer (A-E)', 'in the cell before the', 'countdown ends.', '', 'Correct answer: tick the cell.', 'Wrong answer: cross it out.', '', 'Complete row, column or', 'diagonal = BINGO!'],
    rulesLuck: ['Drawn number on your card?', 'Tick the cell.', '', 'Complete row, column or', 'diagonal = BINGO!'],
    cutHere: 'cut here',
    footer: (n, k) => `${n} questions - ${k}x${k} card`,
    footerRight: 'If you get a bingo, call it out and give your card code.'
  },
  de: {
    rulesTitle: 'REGELN',
    rulesCorrect: ['Gezogene Nummer auf Ihrer Karte?', 'Schreiben Sie Ihre Antwort (A-E)', 'in das Feld, bevor der', 'Countdown endet.', '', 'Richtig: Feld ankreuzen.', 'Falsch: Feld durchstreichen.', '', 'Vollständige Zeile, Spalte oder', 'Diagonale = BINGO!'],
    rulesLuck: ['Gezogene Nummer auf Ihrer Karte?', 'Feld ankreuzen.', '', 'Vollständige Zeile, Spalte oder', 'Diagonale = BINGO!'],
    cutHere: 'hier schneiden',
    footer: (n, k) => `${n} Fragen - Karte ${k}x${k}`,
    footerRight: 'Bei Bingo laut rufen und den Kartencode nennen.'
  }
};

/**
 * Generate the grids PDF: two A5 (half-A4) grids per A4 page, dashed cut line in the middle.
 * session: { name, params: { gridSize, marking, questionCount } }
 * grids: [{ code, cells: number[][] }]
 */
export async function generateGridsPdf(session, grids, lang = 'fr') {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const L = PDF_I18N[lang] || PDF_I18N.fr;

  const halfH = A4.h / 2;
  for (let i = 0; i < grids.length; i += 2) {
    const page = doc.addPage([A4.w, A4.h]);
    drawGrid(page, grids[i], session, halfH, { bold, font, L });          // top half
    if (grids[i + 1]) drawGrid(page, grids[i + 1], session, 0, { bold, font, L }); // bottom half
    // dashed cut line
    const dash = 8;
    for (let x = 14; x < A4.w - 14; x += dash * 2) {
      page.drawLine({ start: { x, y: halfH }, end: { x: x + dash, y: halfH }, thickness: 0.7, color: GREY });
    }
    page.drawText(L.cutHere, { x: A4.w - 60, y: halfH + 4, size: 7, font, color: GREY });
  }
  return doc.save();
}

function drawGrid(page, grid, session, yBase, { bold, font, L }) {
  const k = grid.cells.length;
  const W = A4.w, H = A4.h / 2;
  const margin = 30;

  // Header
  page.drawText('DocBingo', { x: margin, y: yBase + H - 40, size: 16, font: bold, color: INK });
  const name = session.name.length > 52 ? session.name.slice(0, 52) + '...' : session.name;
  page.drawText(name, { x: margin, y: yBase + H - 56, size: 10, font, color: GREY });
  // Grid code badge (top right)
  const codeText = grid.code;
  const cw = bold.widthOfTextAtSize(codeText, 13);
  page.drawRectangle({ x: W - margin - cw - 18, y: yBase + H - 47, width: cw + 18, height: 22, color: RED, borderRadius: 4 });
  page.drawText(codeText, { x: W - margin - cw - 9, y: yBase + H - 41, size: 13, font: bold, color: rgb(1, 1, 1) });

  // Grid geometry: centered, sized to fit
  const availH = H - 105;
  const cell = Math.min(64, Math.floor(Math.min((W - 2 * margin - 160) / k, availH / k)));
  const gw = cell * k;
  const gx = (W - gw) / 2 - 40;
  const gy = yBase + 44 + (availH - cell * k) / 2;

  for (let r = 0; r <= k; r++) {
    const heavy = r === 0 || r === k;
    page.drawLine({ start: { x: gx, y: gy + r * cell }, end: { x: gx + gw, y: gy + r * cell }, thickness: heavy ? 1.6 : 0.8, color: INK });
  }
  for (let c = 0; c <= k; c++) {
    const heavy = c === 0 || c === k;
    page.drawLine({ start: { x: gx + c * cell, y: gy }, end: { x: gx + c * cell, y: gy + cell * k }, thickness: heavy ? 1.6 : 0.8, color: INK });
  }
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      const n = String(grid.cells[r][c]);
      // number in the top-left corner, space below to write the answer
      page.drawText(n, { x: gx + c * cell + 5, y: gy + (k - r) * cell - 15, size: 11, font: bold, color: RED });
    }
  }

  // Rules (right column)
  const rx = gx + gw + 22;
  const rules = session.params.marking === 'correct' ? L.rulesCorrect : L.rulesLuck;
  let ry = gy + cell * k - 8;
  page.drawText(L.rulesTitle, { x: rx, y: ry, size: 8.5, font: bold, color: RED });
  ry -= 14;
  for (const line of rules) {
    page.drawText(line, { x: rx, y: ry, size: 8, font, color: INK });
    ry -= 11;
  }
  page.drawText(L.footer(session.params.questionCount, k), { x: margin, y: yBase + 18, size: 8, font, color: GREY });
  page.drawText(L.footerRight, { x: W - margin - font.widthOfTextAtSize(L.footerRight, 8), y: yBase + 18, size: 8, font, color: GREY });
}
