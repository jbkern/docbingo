/* Ambiances sonores synthétisées (WebAudio, aucun fichier) : classique, quiz TV, zen, casino. */
let ctx = null;
function ac() { return ctx || (ctx = new (window.AudioContext || window.webkitAudioContext)()); }

function tone({ f = 440, t = 0, d = .15, type = 'triangle', g = .22, slide = 0 }) {
  const c = ac(); const o = c.createOscillator(), gn = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, c.currentTime + t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), c.currentTime + t + d);
  gn.gain.setValueAtTime(0.0001, c.currentTime + t);
  gn.gain.exponentialRampToValueAtTime(g, c.currentTime + t + .01);
  gn.gain.exponentialRampToValueAtTime(.0001, c.currentTime + t + d + .12);
  o.connect(gn).connect(c.destination); o.start(c.currentTime + t); o.stop(c.currentTime + t + d + .2);
}
function noise({ t = 0, d = .3, g = .12 }) {
  const c = ac(); const buf = c.createBuffer(1, c.sampleRate * d, c.sampleRate);
  const data = buf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource(); src.buffer = buf; const gn = c.createGain(); gn.gain.value = g;
  const flt = c.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 1500;
  src.connect(flt).connect(gn).connect(c.destination); src.start(c.currentTime + t);
}

export const AMBIANCES = {
  classic: {
    name: { fr: 'Classique', en: 'Classic', de: 'Klassisch' },
    draw: () => tone({ f: 440, d: .08 }),
    reveal: () => { tone({ f: 660, d: .12 }); tone({ f: 880, t: .13, d: .12 }); },
    tick: () => tone({ f: 1200, d: .03, g: .08, type: 'sine' }),
    bingo: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone({ f, t: i * .14, d: .15 })),
    end: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f, t: i * .18, d: .3 }))
  },
  quiz: {
    name: { fr: 'Quiz TV', en: 'TV quiz', de: 'TV-Quiz' },
    draw: () => { tone({ f: 200, d: .25, type: 'sawtooth', g: .18, slide: 600 }); noise({ d: .15, g: .05 }); },
    reveal: () => { tone({ f: 392, d: .1, type: 'square', g: .12 }); tone({ f: 523, t: .1, d: .1, type: 'square', g: .12 }); tone({ f: 784, t: .2, d: .28, type: 'square', g: .12 }); },
    tick: () => tone({ f: 800, d: .04, g: .1, type: 'square' }),
    bingo: () => { [392, 494, 587, 784, 988, 1175].forEach((f, i) => tone({ f, t: i * .09, d: .2, type: 'square', g: .12 })); tone({ f: 1175, t: .6, d: .6, type: 'sawtooth', g: .12 }); noise({ t: .6, d: .6, g: .1 }); },
    end: () => [784, 988, 1175, 1568].forEach((f, i) => tone({ f, t: i * .16, d: .35, type: 'square', g: .12 }))
  },
  zen: {
    name: { fr: 'Zen', en: 'Zen', de: 'Zen' },
    draw: () => tone({ f: 523, d: .5, type: 'sine', g: .16 }),
    reveal: () => { tone({ f: 659, d: .7, type: 'sine', g: .14 }); tone({ f: 988, t: .05, d: .9, type: 'sine', g: .06 }); },
    tick: () => {},
    bingo: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f, t: i * .3, d: 1.2, type: 'sine', g: .14 })),
    end: () => [392, 523, 659].forEach((f, i) => tone({ f, t: i * .4, d: 1.5, type: 'sine', g: .14 }))
  },
  casino: {
    name: { fr: 'Casino', en: 'Casino', de: 'Casino' },
    draw: () => { for (let i = 0; i < 6; i++) tone({ f: 900 + i * 120, t: i * .05, d: .04, type: 'square', g: .08 }); tone({ f: 1500, t: .32, d: .12, type: 'sine', g: .15 }); },
    reveal: () => { tone({ f: 1046, d: .1, type: 'sine', g: .18 }); tone({ f: 1318, t: .1, d: .1, type: 'sine', g: .18 }); tone({ f: 1568, t: .2, d: .25, type: 'sine', g: .18 }); },
    tick: () => tone({ f: 1400, d: .02, g: .06, type: 'square' }),
    bingo: () => { for (let i = 0; i < 14; i++) tone({ f: 800 + (i % 4) * 200 + Math.random() * 60, t: i * .07, d: .06, type: 'square', g: .1 }); [1046, 1318, 1568, 2093].forEach((f, i) => tone({ f, t: 1 + i * .12, d: .3, type: 'sine', g: .16 })); },
    end: () => [1046, 1318, 1568, 2093, 1568, 2093].forEach((f, i) => tone({ f, t: i * .13, d: .3, type: 'sine', g: .16 }))
  }
};

export function play(ambiance, event) {
  try { (AMBIANCES[ambiance] || AMBIANCES.classic)[event]?.(); } catch {}
}
