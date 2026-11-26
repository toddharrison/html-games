// Loose things on the ground (SPEC 6.7) and things washed up or put down, drawn in code. Each has a few
// variants and, except tracks, a soft dark outline so it reads against the drawn ground detail, which
// never has one. Tracks are drawn faint on purpose: they are for a careful eye.

import { L } from '../content/loose.ts';
import { rh } from './tiles.ts';

type G = CanvasRenderingContext2D;

function px(g: G, x: number, y: number, c: string, w = 1, h = 1): void {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

/** A one-pixel line from (x0, y0) to (x1, y1). */
function line(g: G, x0: number, y0: number, x1: number, y1: number, c: string): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let k = 0; k <= n; k++) px(g, Math.round(x0 + ((x1 - x0) * k) / Math.max(1, n)), Math.round(y0 + ((y1 - y0) * k) / Math.max(1, n)), c);
}

/** Paint rows of characters, '.' clear, at (x, y). */
function grid(g: G, x: number, y: number, legend: Record<string, string>, rows: string[]): void {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const c = legend[row[dx]!];
      if (c) px(g, x + dx, y + dy, c);
    }
  });
}

function outline(c: HTMLCanvasElement, colour: string): void {
  const g = c.getContext('2d')!;
  const d = g.getImageData(0, 0, c.width, c.height);
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= c.width || y >= c.height ? 0 : d.data[(y * c.width + x) * 4 + 3]!);
  const ring: [number, number][] = [];
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (!a(x, y) && (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1))) ring.push([x, y]);
  g.fillStyle = colour;
  for (const [x, y] of ring) g.fillRect(x, y, 1, 1);
}

function stone(g: G, x: number, y: number, w: number, h: number, body: string, lit: string, dark: string): void {
  px(g, x + 1, y, body, w - 2, 1);
  px(g, x, y + 1, body, w, h - 2);
  px(g, x + 1, y + h - 1, dark, w - 2, 1);
  px(g, x + 1, y + 1, lit, Math.max(1, w - 3), 1);
  px(g, x + w - 1, y + 1, dark, 1, h - 2);
}

const STONE_TINT: [string, string, string][] = [
  ['#2a2d36', '#5d6a96', '#14161a'],
  ['#6f736f', '#c4c9c4', '#3b4350'],
  ['#8a4a32', '#c4552b', '#4a2a1e'],
  ['#9a9a92', '#e9ece6', '#5f666c'],
  ['#77746b', '#b3afa3', '#3b3a33'],
];

function paintLoose(g: G, l: number, v: number, stoneTint: number): void {
  const r = (k: number) => rh(v, k, 200 + l);
  switch (l) {
    case L.twigs:
      for (let k = 0; k < 3; k++) {
        const x = 3 + Math.floor(r(k) * 6);
        const y = 8 + Math.floor(r(k + 5) * 5);
        line(g, x, y + (k % 2) * 2, x + 5 + Math.floor(r(k + 9) * 3), y + 2 - (k % 2) * 2, k === 1 ? '#8a6d4c' : '#5e4a36');
      }
      break;
    case L.branch: {
      line(g, 1, 12, 14, 7 + (v % 2), '#5e4a36');
      line(g, 1, 13, 14, 8 + (v % 2), '#3d2f22');
      line(g, 6, 11, 9, 14, '#5e4a36');
      line(g, 10, 9, 12, 5, '#5e4a36');
      for (const [x, y] of [[11, 4], [12, 5], [13, 4], [8, 14], [9, 15], [15, 7]] as const) px(g, x, y, v === 2 ? '#7a6a3a' : '#3d5a36');
      break;
    }
    case L.stones:
      stone(g, 3 + (v % 3), 9, 5, 4, '#8b877b', '#c4c3b8', '#56544d');
      stone(g, 8, 11, 4, 3, '#77746b', '#b3afa3', '#4a4842');
      if (v !== 1) stone(g, 10 - (v % 2) * 6, 7, 3, 3, '#9a978c', '#d0cec4', '#5f5d56');
      break;
    case L.chip: {
      const [body, lit, dark] = STONE_TINT[stoneTint] ?? STONE_TINT[1]!;
      for (let k = 0; k < 3; k++) {
        const x = 3 + Math.floor(r(k) * 9);
        const y = 8 + Math.floor(r(k + 3) * 5);
        px(g, x, y, lit, 2, 1);
        px(g, x, y + 1, body, 3, 1);
        px(g, x + 1, y + 2, dark, 2, 1);
      }
      break;
    }
    case L.grass:
      // A tuft of dead, pale straw: blades of different heights, leaning out of a matted base.
      grid(g, v % 2 ? 3 : 2, 7, { a: '#e0d3a0', b: '#c8b47a', c: '#9c8656' }, [
        '....a....a..',
        '..a..b..b...',
        '...bab.ab.a.',
        '.a.babbab.b.',
        '..bbabbabb..',
        '.cbbbbbbbbc.',
        '..cccccccc..',
      ]);
      break;
    case L.fluff:
      // Cattail heads gone to seed: brown spikes on green stalks, bursting into white fluff.
      grid(g, v % 2 ? 3 : 2, 3, { w: '#ffffff', f: '#e6e0d0', s: '#6a4a30', g: '#6e7440' }, [
        '..w.....w...',
        '.wfw...wfw..',
        '..s.....s...',
        '.wsf...fs...',
        '..s..w..s...',
        '..s.wfw.sw..',
        '..g..s..g...',
        '..g..s..g...',
        '..g..g..g...',
        '..g..g..g...',
      ]);
      break;
    case L.driftwood:
      line(g, 2, 11 + (v % 2), 12, 9, '#c9c2ad');
      line(g, 2, 12 + (v % 2), 12, 10, '#9d9584');
      line(g, 9, 9, 12, 6, '#c9c2ad');
      break;
    case L.driftlog:
      px(g, 1, 9, '#d4ccb6', 13, 2);
      px(g, 1, 11, '#a59d89', 13, 2);
      px(g, 0, 10, '#8a8270', 1, 2);
      px(g, 14, 9, '#b8af98', 1, 4);
      px(g, 14, 10, '#8a7f66', 1, 2);
      px(g, 4, 10, '#a59d89', 3, 1);
      px(g, 10, 9, '#ece6d4', 2, 1);
      break;
    case L.stalks:
      // A clump of tall fibrous stalks, leaning out, with rusty seed tops.
      for (let k = 0; k < 4; k++) {
        const lean = k - 1.5;
        const top = 3 + ((k * 3 + v) % 3);
        line(g, 8, 13, Math.round(8 + lean * 2), top + 2, k % 2 ? '#7d7a44' : '#66683a');
        px(g, Math.round(8 + lean * 2), top, '#9a5a3a', 1, 2);
      }
      break;
    case L.cones:
      for (let k = 0; k < 2 + (v % 2); k++) {
        const x = 3 + k * 4 + Math.floor(r(k) * 2);
        const y = 9 + Math.floor(r(k + 4) * 3);
        px(g, x, y, '#7a5a3a', 3, 4);
        px(g, x + 1, y - 1, '#5e4430');
        px(g, x, y + 1, '#a07850');
        px(g, x + 2, y + 2, '#4a3424');
      }
      break;
    case L.feather: {
      // A grey-white feather lying on its side: dark quill, a soft vane, a dark tip.
      const rows = ['...........k', '.........wwk', '.......wwwg.', '.....wwwgg..', '....wwgg....', '...wgg......', '..kg........', '.k..........'];
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const ch = row[x];
          if (ch === '.') continue;
          px(g, x + 2 + (v % 2), y + 6, ch === 'k' ? '#3b3b36' : ch === 'w' ? '#eceee8' : '#bfc4bf');
        }
      });
      break;
    }
    case L.tracksHare:
      for (const [x, y] of [[5, 4], [6, 6], [9, 9], [10, 11], [6, 13]] as const) {
        px(g, x, y, 'rgba(40,32,24,0.35)', 2, 1);
        px(g, x + 3, y, 'rgba(40,32,24,0.35)', 1, 1);
      }
      break;
    case L.tracksElk:
      for (const [x, y] of [[4, 3], [9, 7], [5, 11]] as const) {
        px(g, x, y, 'rgba(40,32,24,0.4)', 1, 3);
        px(g, x + 2, y, 'rgba(40,32,24,0.4)', 1, 3);
      }
      break;
    case L.tracksBear:
      for (const [x, y] of [[3, 3], [9, 9]] as const) {
        px(g, x, y + 2, 'rgba(40,32,24,0.4)', 4, 3);
        for (let k = 0; k < 5; k++) px(g, x + k - 0.5, y, 'rgba(40,32,24,0.4)', 1, 1);
      }
      break;
    case L.tracksCougar:
      for (const [x, y] of [[4, 2], [8, 7], [5, 12]] as const) {
        px(g, x, y + 2, 'rgba(40,32,24,0.38)', 3, 2);
        for (let k = 0; k < 4; k++) px(g, x - 1 + k + (k > 1 ? 1 : 0) - 1, y, 'rgba(40,32,24,0.38)', 1, 1);
      }
      break;
  }
}

export class LooseArt {
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private readonly undrawn = new Set<string>();

  /** A loose thing's drawing, variant `v`; `stone` tints a chip. */
  get(l: number, v: number, stone = 1): HTMLCanvasElement {
    const key = `${l}:${v}:${stone}`;
    let c = this.cache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = 16;
      c.height = 16;
      paintLoose(c.getContext('2d')!, l, v, stone);
      if (l < L.tracksHare) outline(c, 'rgba(18,20,24,0.55)');
      this.cache.set(key, c);
    }
    return c;
  }

  /** Something put down or washed up, drawn as what it is when there's a drawing for it. */
  item(k: string): HTMLCanvasElement | null {
    const key = `item:${k}`;
    if (this.undrawn.has(key)) return null;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const g = c.getContext('2d')!;
    if (k === 'cord') {
      for (let a = 0; a < 3; a++) {
        const r = 2 + a;
        for (let t = 0; t < 12; t++) px(g, Math.round(8 + Math.cos(t / 1.9) * r), Math.round(11 + Math.sin(t / 1.9) * r * 0.6), a % 2 ? '#2a2d36' : '#5a5f6a');
      }
      line(g, 12, 11, 15, 8, '#2a2d36');
    } else if (k === 'peanuts') {
      px(g, 5, 8, '#d8a23a', 7, 6);
      px(g, 5, 7, '#c4552b', 7, 1);
      px(g, 6, 10, '#9a3a32', 4, 2);
      px(g, 11, 9, '#e8c070', 1, 4);
      px(g, 4, 13, '#c9a06a', 2, 1);
    } else if (k === 'metal-scrap') {
      for (let y = 0; y < 5; y++) px(g, 3 + y, 8 + y, '#c4c9c4', 8 - y, 1);
      px(g, 4, 9, '#e9ece6', 3, 1);
      px(g, 9, 12, '#8f979a', 3, 1);
    } else {
      this.undrawn.add(key);
      return null;
    }
    outline(c, 'rgba(18,20,24,0.55)');
    this.cache.set(key, c);
    return c;
  }
}
