// The kid's sketches (SPEC 12.4): every thing in the notebook drawn as a pencil sketch, a few wobbly
// graphite strokes gone over twice, with a touch of coloured pencil where colour is the point (berries,
// embers, a red cross). Each sketch wobbles the same way every time: the wobble is hashed from its name.

type G = CanvasRenderingContext2D;
type Pt = [number, number];

/** Sketches are drawn on a SIZE × SIZE canvas (shown at about two and a half lines of the page). */
export const SIZE = 48;
const LEAD = 'rgba(58,56,62,0.78)';
const SOFT = 'rgba(58,56,62,0.35)';

const TINT: Record<string, string> = {
  red: '#b8342c',
  blue: '#4a64a8',
  white: '#c9c6b8',
  pale: '#d6c98a',
  purple: '#6e3c86',
  green: '#4f8a3c',
  brown: '#7a5434',
  orange: '#d77a2a',
};

function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A pencil: lines that wobble a little and are gone over twice, as a kid sketches. */
class Pen {
  readonly g: G;
  private seed: number;
  constructor(g: G, name: string) {
    this.g = g;
    this.seed = hashOf(name) || 1;
  }

  private r(): number {
    // xorshift: the wobble, the same for the same sketch.
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296 - 0.5;
  }

  /** A stroke through the points; `close` joins it up. */
  path(pts: Pt[], close = false, style = LEAD, width = 1.2): void {
    const g = this.g;
    g.strokeStyle = style;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      const j = pass ? 0.9 : 0.5;
      g.beginPath();
      const all = close ? [...pts, pts[0]!] : pts;
      all.forEach(([x, y], i) => {
        const px = x + this.r() * j;
        const py = y + this.r() * j;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.stroke();
    }
  }

  line(x1: number, y1: number, x2: number, y2: number, style = LEAD, width = 1.2): void {
    // A long line wobbles in the middle too.
    this.path([[x1, y1], [(x1 + x2) / 2 + this.r(), (y1 + y2) / 2 + this.r()], [x2, y2]], false, style, width);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0, from = 0, to = Math.PI * 2, style = LEAD): void {
    const pts: Pt[] = [];
    const n = Math.max(8, Math.round((Math.max(rx, ry) * Math.abs(to - from)) / 2.2));
    for (let i = 0; i <= n; i++) {
      const a = from + ((to - from) * i) / n;
      const x = Math.cos(a) * rx;
      const y = Math.sin(a) * ry;
      pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
    }
    this.path(pts, false, style);
  }

  circle(cx: number, cy: number, r: number, style = LEAD): void {
    this.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2, style);
  }

  /** Shading: short parallel strokes across a box. */
  hatch(x: number, y: number, w: number, h: number, style = SOFT): void {
    for (let k = 0; k < w + h; k += 3) this.line(x + Math.max(0, k - h), y + Math.min(h, k), x + Math.min(w, k), y + Math.max(0, k - w), style, 1);
  }

  /** Coloured pencil: a filled blob, rubbed in unevenly. */
  colour(cx: number, cy: number, r: number, c: string): void {
    const g = this.g;
    g.fillStyle = c;
    g.globalAlpha = 0.55;
    g.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const rr = r * (0.85 + this.r() * 0.3);
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.fill();
    g.globalAlpha = 1;
  }

  jitter(): number {
    return this.r();
  }
}

// ---- The sketches ----

function stick(p: Pen): void {
  p.line(8, 38, 40, 12);
  p.line(9, 40, 41, 14, SOFT);
  p.line(27, 23, 31, 13);
}

function log(p: Pen, x = 0, y = 0): void {
  p.line(8 + x, 30 + y, 32 + x, 16 + y);
  p.line(12 + x, 38 + y, 36 + x, 24 + y);
  p.ellipse(34 + x, 20 + y, 3.5, 5, -0.5);
  p.ellipse(34 + x, 20 + y, 1.4, 2, -0.5);
  p.ellipse(10 + x, 34 + y, 3.5, 5, -0.5, Math.PI * 0.5, Math.PI * 1.5);
  p.line(16 + x, 31 + y, 26 + x, 25 + y, SOFT);
}

function stone(p: Pen, tint?: string): void {
  if (tint) p.colour(24, 27, 11, tint);
  p.path([[12, 30], [14, 20], [22, 15], [32, 17], [37, 25], [34, 34], [24, 37], [15, 35]], true);
  p.hatch(26, 27, 9, 7);
  p.line(19, 22, 24, 20, SOFT);
}

function nest(p: Pen): void {
  for (let k = 0; k < 9; k++) {
    const a = k * 0.7;
    p.ellipse(24 + p.jitter() * 4, 28 + p.jitter() * 2, 11 - (k % 3), 5 + (k % 2), a * 0.15, a, a + 2.4, k % 2 ? SOFT : LEAD);
  }
}

function leaf(p: Pen, x: number, y: number, a: number, len = 7, style = LEAD): void {
  const dx = Math.cos(a) * len;
  const dy = Math.sin(a) * len;
  const nx = -dy * 0.35;
  const ny = dx * 0.35;
  p.path([[x, y], [x + dx / 2 + nx, y + dy / 2 + ny], [x + dx, y + dy], [x + dx / 2 - nx, y + dy / 2 - ny]], true, style);
}

function berries(p: Pen, tint: string): void {
  p.line(16, 10, 24, 22);
  p.line(24, 22, 33, 12);
  leaf(p, 24, 22, -2.6, 9);
  const at: Pt[] = [[22, 28], [28, 29], [25, 34], [19, 33], [31, 35], [27, 39]];
  for (const [x, y] of at) {
    p.colour(x, y, 3, tint);
    p.circle(x, y, 3);
  }
}

function fish(p: Pen, cooked = 0): void {
  p.path([[8, 24], [16, 17], [28, 16], [36, 22], [36, 26], [28, 31], [16, 31]], true);
  p.path([[36, 24], [43, 18], [42, 30]], true);
  p.circle(13, 22, 1);
  p.line(19, 19, 19, 29, SOFT);
  if (cooked) p.hatch(20, 19, 14, 10, cooked > 1 ? LEAD : SOFT);
}

function meat(p: Pen, cooked = 0): void {
  p.path([[10, 26], [14, 16], [26, 13], [37, 18], [39, 28], [30, 36], [17, 36]], true);
  p.circle(30, 24, 3);
  p.path([[15, 28], [22, 31], [28, 31]], false, SOFT);
  if (cooked) p.hatch(13, 17, 14, 14, cooked > 1 ? LEAD : SOFT);
}

function vessel(p: Pen, fill: '' | 'water' | 'steam'): void {
  p.path([[10, 20], [38, 20], [34, 38], [14, 38]], true);
  p.line(10, 20, 15, 15);
  p.line(38, 20, 33, 15);
  p.line(17, 22, 18, 36, SOFT);
  p.line(31, 22, 30, 36, SOFT);
  if (fill) p.path([[13, 25], [19, 24], [25, 26], [31, 24], [36, 25]], false, 'rgba(70,110,170,0.7)');
  if (fill === 'steam') for (const x of [18, 25, 32]) p.path([[x, 14], [x - 2, 10], [x + 1, 6], [x - 1, 2]], false, SOFT);
}

function pot(p: Pen, fill: '' | 'water' | 'steam'): void {
  p.path([[11, 18], [37, 18], [35, 37], [13, 37]], true);
  p.ellipse(24, 18, 13, 3);
  p.line(37, 21, 44, 19);
  p.hatch(27, 24, 7, 11);
  if (fill) p.path([[13, 22], [19, 21], [25, 23], [31, 21], [35, 22]], false, 'rgba(70,110,170,0.7)');
  if (fill === 'steam') for (const x of [18, 25, 32]) p.path([[x, 13], [x - 2, 9], [x + 1, 5], [x - 1, 1]], false, SOFT);
}

function box(p: Pen, x: number, y: number, w: number, h: number): void {
  p.path([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true);
}

const SKETCHES: Record<string, (p: Pen) => void> = {
  stick,
  firewood: (p) => log(p),
  bark: (p) => {
    p.path([[10, 16], [36, 13], [38, 32], [12, 35]], true);
    p.ellipse(12, 25, 3, 9, 0, Math.PI * 0.5, Math.PI * 1.5);
    for (const y of [19, 24, 29]) p.line(16, y, 34, y - 2, SOFT);
  },
  fibre: (p) => {
    for (let k = 0; k < 5; k++) p.path([[10, 14 + k * 4], [18, 12 + k * 4], [26, 16 + k * 4], [34, 12 + k * 4], [40, 15 + k * 4]], false, k % 2 ? SOFT : LEAD);
  },
  cord: (p) => {
    for (let k = 0; k < 3; k++) p.ellipse(22, 26, 8 + k * 3, 5 + k * 2);
    p.path([[33, 26], [38, 20], [42, 22]]);
  },
  tinder: nest,
  stone: (p) => stone(p),
  boughs: (p) => {
    p.line(8, 38, 40, 10);
    for (let k = 0; k < 9; k++) {
      const x = 11 + k * 3.4;
      const y = 35 - k * 3;
      p.line(x, y, x - 4, y - 5, 'rgba(60,100,60,0.75)');
      p.line(x, y, x + 5, y + 3, 'rgba(60,100,60,0.75)');
    }
  },
  feathers: (p) => {
    p.line(12, 40, 36, 8);
    p.path([[34, 10], [40, 16], [36, 24], [28, 30], [20, 34]], false);
    p.path([[33, 9], [26, 12], [20, 20], [16, 28], [14, 36]], false);
    for (let k = 0; k < 5; k++) p.line(17 + k * 4, 34 - k * 5, 22 + k * 4, 33 - k * 5, SOFT);
  },
  hide: (p) => {
    p.path([[12, 14], [20, 16], [28, 12], [36, 16], [34, 24], [40, 32], [30, 34], [26, 40], [18, 34], [8, 34], [14, 24]], true);
    p.hatch(18, 20, 10, 8);
  },
  'sharp-stick': (p) => {
    p.line(8, 38, 36, 14);
    p.path([[34, 12], [42, 8], [38, 16]], true);
  },
  spear: (p) => {
    p.line(6, 42, 34, 14);
    for (const [x, y] of [[40, 4], [42, 10], [36, 6]] as Pt[]) p.line(34, 14, x, y);
    for (let k = 0; k < 3; k++) p.line(29 + k * 1.5, 17 - k * 1.5, 33 + k * 1.5, 21 - k * 1.5, SOFT);
  },
  'hard-spear': (p) => {
    SKETCHES.spear!(p);
    p.hatch(34, 4, 8, 10, LEAD);
  },
  'bow-drill': (p) => {
    p.ellipse(24, 30, 18, 10, 0, Math.PI * 1.05, Math.PI * 1.95);
    p.line(7, 28, 41, 28, SOFT);
    p.line(24, 12, 24, 38);
    box(p, 12, 38, 26, 5);
  },
  'bark-vessel': (p) => vessel(p, ''),
  'water-vessel': (p) => vessel(p, 'water'),
  'boiled-water': (p) => vessel(p, 'steam'),
  'ember-pouch': (p) => {
    p.ellipse(24, 28, 14, 8);
    p.ellipse(12, 28, 3, 8);
    p.colour(30, 26, 3, TINT.orange!);
    p.colour(25, 30, 2, '#c43a1e');
    for (const x of [26, 31]) p.path([[x, 18], [x - 2, 13], [x + 1, 9]], false, SOFT);
  },
  basket: (p) => {
    p.path([[10, 22], [38, 22], [34, 40], [14, 40]], true);
    p.ellipse(24, 22, 14, 10, 0, Math.PI, Math.PI * 2);
    for (let k = 0; k < 5; k++) p.line(13 + k * 6, 23, 15 + k * 5, 39, SOFT);
    for (const y of [27, 32, 36]) p.line(12, y, 36, y, SOFT);
  },
  snare: (p) => {
    p.circle(20, 28, 9);
    p.path([[29, 28], [36, 24], [38, 10]]);
    p.line(36, 10, 40, 10);
  },
  bow: (p) => {
    p.ellipse(30, 24, 10, 20, 0, Math.PI * 0.55, Math.PI * 1.45);
    p.line(26, 5, 26, 43, SOFT);
  },
  arrows: (p) => {
    for (const d of [0, 6]) {
      p.line(8, 34 + d, 38, 14 + d);
      p.path([[36, 12 + d], [42, 11 + d], [39, 17 + d]], true);
      p.line(9, 33 + d, 7, 29 + d, SOFT);
      p.line(11, 32 + d, 9, 28 + d, SOFT);
    }
  },
  splint: (p) => {
    p.line(14, 8, 14, 40);
    p.line(30, 8, 30, 40);
    for (const y of [14, 24, 34]) p.ellipse(22, y, 10, 2);
  },
  'warm-layers': (p) => {
    p.path([[14, 10], [34, 10], [42, 18], [36, 22], [34, 40], [14, 40], [12, 22], [6, 18]], true);
    for (let k = 0; k < 5; k++) p.line(24, 12 + k * 6, 24, 15 + k * 6, SOFT);
    p.hatch(16, 26, 14, 10);
  },
  fish: (p) => fish(p),
  'cooked-fish': (p) => fish(p, 1),
  'smoked-fish': (p) => fish(p, 2),
  meat: (p) => meat(p),
  'cooked-meat': (p) => meat(p, 1),
  'smoked-meat': (p) => meat(p, 2),
  game: (p) => {
    p.ellipse(22, 30, 13, 8);
    p.circle(36, 23, 5);
    p.ellipse(37, 13, 2, 6, 0.2);
    p.ellipse(41, 14, 2, 6, 0.5);
    p.circle(9, 30, 2);
    p.line(16, 37, 30, 37, SOFT);
  },
  crayfish: (p) => {
    p.ellipse(24, 30, 6, 11);
    for (const y of [24, 29, 34]) p.line(18, y, 30, y, SOFT);
    p.path([[19, 20], [12, 12], [8, 6], [14, 9]]);
    p.path([[29, 20], [36, 12], [40, 6], [34, 9]]);
    p.path([[22, 41], [24, 45], [26, 41]]);
  },
  mussels: (p) => {
    p.ellipse(18, 26, 7, 12, 0.4);
    p.ellipse(31, 25, 7, 12, -0.4);
    p.hatch(26, 18, 8, 14);
  },
  'cattail-root': (p) => {
    p.line(8, 30, 40, 22);
    for (const x of [16, 25, 34]) p.line(x, 29 - (x - 8) / 4, x + 1, 25 - (x - 8) / 4, LEAD, 1.6);
    for (const x of [12, 20, 30]) p.line(x, 30 - (x - 8) / 4, x - 3, 38 - (x - 8) / 4, SOFT);
  },
  'pine-nuts': (p) => {
    for (const [x, y] of [[16, 24], [26, 20], [22, 32], [32, 30], [36, 22]] as Pt[]) p.ellipse(x, y, 3, 5, 0.6);
  },
  'rose-hips': (p) => {
    for (const [x, y] of [[18, 28], [30, 26], [24, 35]] as Pt[]) {
      p.colour(x, y, 4, TINT.red!);
      p.ellipse(x, y, 4, 5);
      p.line(x - 1, y - 5, x + 1, y - 8);
    }
  },
  herb: (p) => {
    p.line(24, 42, 24, 10);
    for (let k = 0; k < 4; k++) {
      leaf(p, 24, 36 - k * 7, -0.6, 8, 'rgba(60,110,60,0.8)');
      leaf(p, 24, 33 - k * 7, -2.5, 8, 'rgba(60,110,60,0.8)');
    }
  },
  hatchet: (p) => {
    p.line(12, 42, 30, 12, LEAD, 2.4);
    p.path([[26, 10], [38, 6], [42, 14], [36, 20], [30, 16]], true);
    p.hatch(33, 9, 6, 8);
  },
  knife: (p) => {
    p.path([[22, 24], [40, 8], [42, 10], [28, 28]], true);
    box(p, 10, 28, 14, 7);
    p.line(14, 30, 14, 33, SOFT);
    p.line(19, 30, 19, 33, SOFT);
  },
  multitool: (p) => {
    p.path([[10, 18], [34, 18], [38, 22], [34, 28], [10, 28]], true);
    p.line(34, 22, 44, 16);
    p.line(34, 24, 44, 28);
    p.circle(14, 23, 1.5);
    p.line(16, 21, 32, 21, SOFT);
  },
  'candy-bar': (p) => {
    box(p, 10, 18, 28, 12);
    p.path([[10, 18], [6, 16], [7, 24], [6, 32], [10, 30]]);
    p.path([[38, 18], [42, 16], [41, 24], [42, 32], [38, 30]]);
    p.colour(24, 24, 4, TINT.red!);
  },
  granola: (p) => {
    p.path([[10, 20], [36, 17], [38, 29], [12, 32]], true);
    for (const [x, y] of [[16, 25], [22, 23], [29, 26], [33, 22]] as Pt[]) p.circle(x, y, 1.2);
  },
  gum: (p) => {
    box(p, 12, 16, 24, 16);
    for (const x of [18, 24, 30]) p.line(x, 17, x, 31, SOFT);
  },
  bandana: (p) => {
    p.path([[10, 12], [38, 12], [38, 38], [10, 38]], true);
    p.line(10, 12, 38, 38, SOFT);
    for (const [x, y] of [[16, 30], [30, 18], [20, 20], [32, 32]] as Pt[]) p.colour(x, y, 1.6, TINT.red!);
  },
  watch: (p) => {
    p.circle(24, 24, 9);
    box(p, 19, 4, 10, 10);
    box(p, 19, 34, 10, 10);
    p.line(24, 24, 24, 18);
    p.line(24, 24, 29, 26);
  },
  paperclip: (p) => {
    p.path([[16, 38], [16, 12], [20, 8], [28, 8], [32, 12], [32, 34], [28, 38], [22, 34], [22, 16]]);
  },
  pencil: (p) => {
    p.path([[8, 30], [34, 14], [37, 19], [11, 35]], true);
    p.path([[34, 14], [42, 12], [37, 19]], true);
    p.colour(10, 33, 2.5, '#d97a8a');
  },
  mirror: (p) => {
    p.ellipse(24, 22, 11, 13);
    p.line(18, 16, 22, 12, SOFT);
    p.line(18, 21, 26, 13, SOFT);
  },
  // The fire and the builds, for the Make page.
  fire: (p) => {
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      p.circle(24 + Math.cos(a) * 14, 34 + Math.sin(a) * 6, 2.4);
    }
    for (const [x, y] of [[14, 34], [34, 34], [20, 37], [28, 37]] as Pt[]) p.line(x, y, 24, 14);
    p.colour(24, 30, 4, TINT.orange!);
  },
  'build:lean-to': (p) => {
    p.line(6, 16, 42, 16, LEAD, 1.8);
    p.line(8, 16, 8, 40);
    p.line(40, 16, 40, 40);
    for (let k = 0; k < 6; k++) p.line(10 + k * 6, 16, 4 + k * 6, 40, SOFT);
    for (let k = 0; k < 5; k++) p.path([[6 + k * 7, 22], [9 + k * 7, 26], [12 + k * 7, 22]], false, 'rgba(60,100,60,0.75)');
  },
  'build:bed': (p) => {
    p.path([[8, 22], [40, 18], [42, 32], [10, 36]], true);
    for (let k = 0; k < 8; k++) p.line(12 + k * 4, 33 - k * 0.5, 14 + k * 4, 22 - k * 0.5, 'rgba(60,100,60,0.75)');
  },
  'build:wall': (p) => {
    for (const x of [8, 18, 28, 38]) p.line(x, 10, x, 40);
    for (const y of [16, 24, 32]) p.path([[6, y], [13, y + 2], [23, y - 2], [33, y + 2], [42, y]], false, SOFT);
    box(p, 20, 26, 8, 14);
  },
  'build:woodpile': (p) => {
    p.path([[6, 18], [24, 10], [42, 18]], false, LEAD);
    p.hatch(10, 14, 28, 4);
    for (const [x, y] of [[14, 34], [22, 34], [30, 34], [18, 27], [26, 27], [34, 34]] as Pt[]) {
      p.circle(x, y, 4);
      p.circle(x, y, 1.2, SOFT);
    }
  },
  'build:cache': (p) => {
    p.line(4, 10, 44, 6, LEAD, 1.8);
    p.line(32, 7, 32, 26);
    p.path([[26, 26], [38, 26], [36, 38], [28, 38]], true);
    p.line(8, 9, 8, 44, SOFT);
  },
  'build:weir': (p) => {
    for (const y of [12, 20, 40]) p.path([[4, y], [14, y - 2], [24, y + 1], [34, y - 2], [44, y]], false, 'rgba(70,110,170,0.6)');
    for (let k = 0; k < 8; k++) {
      const a = Math.PI * (0.1 + (k / 7) * 0.8);
      p.circle(24 + Math.cos(a) * 16, 22 + Math.sin(a) * 12, 2.6);
    }
  },
  'build:signal': (p) => {
    for (let k = 0; k < 7; k++) p.line(8 + k * 5, 40, 24, 6);
    for (let k = 0; k < 4; k++) p.path([[14 + k * 5, 30 - k * 4], [18 + k * 4, 26 - k * 4], [22 + k * 3, 30 - k * 4]], false, 'rgba(60,100,60,0.75)');
  },
  'build:reflector': (p) => {
    SKETCHES.fire!(p);
    for (const x of [8, 16, 24, 32, 40]) box(p, x - 3, 16, 6, 12);
  },
  pot: (p) => pot(p, ''),
  'pot-water': (p) => pot(p, 'water'),
  'pot-boiled': (p) => pot(p, 'steam'),
  matches: (p) => {
    box(p, 8, 22, 22, 14);
    p.hatch(9, 33, 20, 2);
    p.line(26, 18, 42, 8);
    p.colour(42, 8, 2.4, '#c43a1e');
  },
  'fishing-line': (p) => {
    for (let k = 0; k < 3; k++) p.ellipse(18, 24, 6 + k * 2, 6 + k * 2);
    p.path([[30, 20], [36, 20], [36, 34], [33, 37], [30, 34]]);
  },
  'first-aid': (p) => {
    box(p, 8, 14, 32, 22);
    p.line(20, 10, 28, 10);
    p.colour(24, 25, 5, TINT.red!);
    p.line(24, 19, 24, 31);
    p.line(18, 25, 30, 25);
  },
  'ration-pack': (p) => {
    p.path([[10, 14], [38, 14], [36, 36], [12, 36]], true);
    p.line(10, 18, 38, 18, SOFT);
    for (const y of [24, 28, 32]) p.line(16, y, 32, y, SOFT);
  },
  beacon: (p) => {
    box(p, 12, 18, 22, 22);
    p.line(30, 18, 38, 4);
    p.colour(23, 25, 3, TINT.orange!);
    p.circle(23, 25, 3);
    p.line(16, 34, 30, 34, SOFT);
  },
  peanuts: (p) => {
    p.path([[12, 12], [36, 12], [38, 38], [10, 38]], true);
    p.path([[12, 12], [16, 8], [20, 12], [24, 8], [28, 12], [32, 8], [36, 12]]);
    for (const [x, y] of [[20, 26], [28, 24], [24, 32]] as Pt[]) p.ellipse(x, y, 4, 2.4, 0.4);
  },
  'metal-scrap': (p) => {
    p.path([[8, 28], [18, 14], [34, 12], [40, 22], [30, 30], [36, 36], [16, 38]], true);
    p.line(20, 20, 30, 16, SOFT);
    p.line(18, 26, 34, 20, SOFT);
  },
};

function plant(p: Pen, kind: string, tint: string): void {
  if (kind === 'berry') return berries(p, tint);
  if (kind === 'bulb') {
    p.colour(24, 34, 7, tint);
    p.path([[24, 26], [16, 32], [18, 40], [30, 40], [32, 32]], true);
    for (const a of [-1.9, -1.3, -1.6]) leaf(p, 24, 26, a, 16);
    return;
  }
  if (kind === 'mushroom') {
    p.colour(24, 18, 8, tint);
    p.ellipse(24, 20, 13, 8, 0, Math.PI, Math.PI * 2);
    p.line(11, 20, 37, 20);
    p.path([[20, 20], [19, 38], [29, 38], [28, 20]]);
    return;
  }
  p.line(24, 42, 24, 14);
  for (let k = 0; k < 3; k++) {
    leaf(p, 24, 38 - k * 8, -0.5 - k * 0.2, 11);
    leaf(p, 24, 35 - k * 8, -2.6 + k * 0.2, 11);
  }
  p.colour(24, 16, 3, tint);
}

function unknown(p: Pen): void {
  p.ellipse(24, 18, 8, 8, 0, Math.PI, Math.PI * 2.3);
  p.path([[29, 24], [24, 29], [24, 32]]);
  p.circle(24, 38, 1);
}

/** What a sketch is of: an item kind, or a dealt thing seen in the valley (its row and look). */
export interface SketchOf {
  k: string;
  /** A plant's kind and colour, or a stone's colour hint. */
  plant?: { kind: string; tint: string };
  tint?: string;
}

const cache = new Map<string, HTMLCanvasElement>();

/** The sketch, on a SIZE × SIZE canvas with a clear background (it sits on the page's paper). */
export function sketch(of: SketchOf): HTMLCanvasElement {
  const key = `${of.k}:${of.plant?.kind ?? ''}:${of.plant?.tint ?? of.tint ?? ''}`;
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    const p = new Pen(c.getContext('2d')!, key);
    if (of.plant) plant(p, of.plant.kind, TINT[of.plant.tint] ?? TINT.green!);
    else if (of.k === 'stone') stone(p, of.tint ? TINT[of.tint] : undefined);
    else (SKETCHES[of.k] ?? unknown)(p);
    cache.set(key, c);
  }
  return c;
}

/** A copy of the sketch for a page (the cached one may already be on it elsewhere), with these classes. */
export function sketchCopy(of: SketchOf, cls: string): HTMLCanvasElement {
  const src = sketch(of);
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.className = cls;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}
