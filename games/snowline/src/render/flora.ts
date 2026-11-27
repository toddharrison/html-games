// Trees, the snag, and rock formations in sizes (SPEC 6.8, 12.1): drawn in code, a few variants of each size, built once
// into canvases. Tall ones rise above their tile; the renderer anchors each at its tile's foot.

import { rh } from './tiles.ts';

export interface Tall {
  c: HTMLCanvasElement;
  /** Rows from the top that move in the wind. */
  crown: number;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function px(g: CanvasRenderingContext2D, x: number, y: number, col: string, w = 1, h = 1): void {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
}

/** Conifer sizes: crown height and half-width. 0 is a sapling, 2 two tiles tall, 4 a giant of three. */
const CONIFER: [number, number][] = [
  [10, 3.4],
  [19, 5.8],
  [28, 8.2],
  [36, 10],
  [44, 11.6],
];

export function conifer(size: number, v: number, palette: 'green' | 'grey' = 'green'): Tall {
  const [H, half] = CONIFER[size]!;
  const trunk = size === 0 ? 2 : 4;
  const W = 28;
  const [c, g] = canvas(W, H + trunk + 1);
  const cx = 13.5;
  const dark = palette === 'grey' ? '#26362a' : '#1d3222';
  const mid = palette === 'grey' ? '#344536' : '#26422b';
  const lit = palette === 'grey' ? '#4a5c48' : '#3a5d3e';
  const shine = palette === 'grey' ? '#62705a' : '#52784f';
  const shadow = '#132017';
  px(g, Math.floor(cx) - 1, H - 1, '#4a3a2b', 2, trunk + 1);
  px(g, Math.floor(cx), H - 1, '#6b5440', 1, trunk);
  const tier = size <= 1 ? 3 : 4;
  for (let r = 0; r < H; r++) {
    const env = ((r + 1) / H) * half;
    const pos = r % tier;
    const hw = Math.max(0.6, env * (0.6 + 0.4 * (pos / (tier - 1))));
    const x0 = Math.round(cx - hw);
    const x1 = Math.round(cx + hw);
    for (let x = x0; x < x1; x++) {
      const edge = x === x0 || x === x1 - 1;
      if (edge && rh(x, r, 90 + v) < 0.35 && r > 1) continue;
      const side = (x - cx) / Math.max(1, hw);
      let col = side < -0.25 ? lit : side > 0.35 ? dark : mid;
      if (pos === tier - 1 && r < H - 1) col = side > -0.4 ? shadow : mid;
      if (side < -0.3 && rh(x, r, 93 + v) < 0.18) col = shine;
      px(g, x, r, col);
    }
  }
  return { c, crown: Math.floor(H * 0.6) };
}

export function stunted(v: number): Tall {
  const H = 9 + (v % 2) * 2;
  const [c, g] = canvas(18, H + 3);
  const lean = v === 1 ? -1 : 1;
  px(g, 8, H - 1, '#4a3a2b', 1, 4);
  px(g, 9, H, '#4a3a2b');
  for (let r = 0; r < H; r++) {
    const cx = 8.5 + lean * Math.floor((H - r) / 4);
    const hw = Math.max(0.6, ((r + 1) / H) * 3.4 * (r % 3 === 2 ? 0.7 : 1));
    for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) {
      if (rh(x, r, 120 + v) < 0.25) continue;
      px(g, x, r, x < cx ? '#3f5440' : '#24342a');
    }
  }
  return { c, crown: Math.floor(H * 0.6) };
}

/** Aspen sizes: crown radius and trunk height (a tall, slim tree: two tiles at size 2, nearly three at 3). */
const ASPEN: [number, number][] = [
  [4, 6],
  [5.5, 12],
  [7, 17],
  [8, 23],
];

export function aspen(size: number, v: number): Tall {
  const [R, trunk] = ASPEN[size]!;
  const H = Math.ceil(R * 2 + trunk + 1);
  const [c, g] = canvas(26, H);
  const cx = 12.5;
  for (let y = Math.floor(R * 2) - 1; y < H; y++) {
    px(g, 12, y, '#ddd6bf');
    if (rh(12, y, 130 + v) < 0.3) px(g, 12, y, '#3b3b36');
    // A few twigs off the white trunk.
    if (y > R * 2 + 2 && y < H - 4 && rh(y, v, 135) < 0.08) px(g, rh(y, v, 136) < 0.5 ? 11 : 13, y - 1, '#8f8a78');
  }
  px(g, 13, H - 2, '#b8b19a', 1, 2);
  const blobs = 3 + (size > 0 ? 2 : 0);
  for (let b = 0; b < blobs; b++) {
    const bx = cx + (rh(b, v, 131) - 0.5) * R * 1.2;
    const by = R + (rh(v, b, 132) - 0.6) * R * 1.1;
    const br = R * (0.55 + rh(b, b + v, 133) * 0.35);
    for (let y = Math.floor(by - br); y <= by + br; y++) {
      for (let x = Math.floor(bx - br); x <= bx + br; x++) {
        const dx = x + 0.5 - bx;
        const dy = y + 0.5 - by;
        if (dx * dx + dy * dy > br * br || y < 0) continue;
        const lit = dx + dy < -br * 0.3;
        const shade = dx + dy > br * 0.6;
        let col = lit ? '#c9c070' : shade ? '#7d7840' : '#a9a356';
        if (rh(x, y, 134 + v) < 0.12) col = lit ? '#ddd58a' : '#8a8344';
        px(g, x, y, col);
      }
    }
  }
  return { c, crown: Math.floor(R * 2) };
}

/** Deadfall: a fallen trunk across the tile, bark and a pale cut end, moss on top. */
export function log(v: number): HTMLCanvasElement {
  const [c, g] = canvas(16, 16);
  const y = 8 + (v % 2);
  px(g, 1, y, '#5e4a36', 13, 4);
  px(g, 1, y, '#7c6142', 13, 1);
  px(g, 1, y + 3, '#3d2f22', 13, 1);
  for (let x = 2; x < 13; x += 3) px(g, x + (v % 2), y + 1, '#4a3a2b', 2, 1);
  if (v !== 1) px(g, 3, y - 1, '#4f6a3a', 5, 1);
  px(g, 14, y, '#c9a878', 2, 4);
  px(g, 14, y + 1, '#9c7a52', 1, 2);
  px(g, 9, y - 2, '#5e4a36', 1, 2);
  px(g, 10, y - 3, '#5e4a36');
  return c;
}

/** A shade of a colour: f below 1 darker, above 1 lighter. */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (k: number) => {
    const v = (n >> k) & 255;
    return Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1))));
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** The split snag: a tall dead trunk, grey and bare, split at the top and scorched down one side. */
export function snag(v: number): Tall {
  const H = 38 + (v % 2) * 4;
  const [c, g] = canvas(20, H);
  const cx = 9;
  for (let y = 6; y < H; y++) {
    const w = y > H - 4 ? 4 : y > H * 0.5 ? 3 : 2;
    for (let k = 0; k < w; k++) px(g, cx - (w >> 1) + k, y, k === 0 ? '#b3b4ab' : k === w - 1 ? '#5e625f' : '#8f979a');
    // The lightning's scorch, down the right side.
    if (y > 10 && y < H - 6 && rh(y, v, 170) < 0.7) px(g, cx + (w >> 1) - (w > 2 ? 1 : 0), y, '#2a2a28');
  }
  // The split: two forks leaning apart, jagged ends.
  for (let k = 0; k < 7; k++) {
    px(g, cx - 1 - Math.floor(k / 2), 6 - k, '#a3a59d');
    px(g, cx + 1 + Math.floor(k / 3), 6 - k, '#6e726c');
  }
  // Dead branch stubs.
  for (const [y, d, len] of [[14, -1, 3], [20, 1, 4], [27, -1, 2], [31, 1, 2]] as const) {
    for (let k = 1; k <= len; k++) px(g, cx + d * (k + 1), y - Math.floor(k / 2), '#7d827d');
  }
  px(g, cx - 3, H - 1, '#4a4c48', 7, 1);
  return { c, crown: 0 };
}

/**
 * A rock formation: blocky ledges of stone with strata, a lit face and a shadowed one, cracks, and lichen.
 * Size 0 a small boulder's worth, 1 a tile high, 2 a tile and a half, 3 two tiles. Neighbouring ones overlap
 * into one outcropping.
 */
export function rockMass(size: number, v: number, body: string, mark: string): Tall {
  const W = [16, 20, 26, 30][size]!;
  const H = [12, 17, 25, 33][size]!;
  const [c, g] = canvas(W, H);
  // Blocks across the width, each with a top that slants one way or the other.
  const tops: number[] = new Array(W).fill(H);
  const edges = new Set<number>();
  let x = 0;
  let b = 0;
  while (x < W) {
    const bw = 3 + Math.floor(rh(b, v, 180 + size) * 4);
    const centre = 1 - Math.abs((x + bw / 2) / W - 0.5) * 2;
    const peak = Math.max(3, Math.round((H - 2) * (0.45 + 0.55 * centre) * (0.75 + rh(v, b, 181) * 0.35)));
    const slope = rh(b, b + v, 182) < 0.5 ? -1 : 1;
    for (let k = 0; k < bw && x + k < W; k++) {
      // Rounded off at the two ends of the formation.
      const end = Math.min(x + k, W - 1 - (x + k));
      const cut = end < 2 ? (2 - end) * 3 : 0;
      tops[x + k] = Math.max(1, H - peak + Math.floor((slope * (k - bw / 2)) / 2) + cut);
    }
    edges.add(x);
    x += bw;
    b++;
  }
  const lit = shade(body, 1.35);
  const top = shade(body, 1.6);
  const dark = shade(body, 0.62);
  const deep = shade(body, 0.42);
  for (let xx = 0; xx < W; xx++) {
    const t = tops[xx]!;
    for (let y = t; y < H; y++) {
      let col = body;
      const fromTop = y - t;
      const rightFace = xx > 0 && tops[xx - 1]! < t - 1; // the face under a higher block to the left is shaded
      if (fromTop === 0) col = top;
      else if (fromTop === 1) col = lit;
      else if (edges.has(xx)) col = dark;
      else if (rightFace || xx > W * 0.62) col = dark;
      else if (xx < W * 0.3) col = lit;
      // Strata: a darker line every few rows, broken.
      if (fromTop > 2 && (y + v) % 6 === 0 && rh(xx, y, 183) < 0.75) col = deep;
      if (fromTop > 1 && rh(xx, y, 184 + v) < 0.06) col = mark;
      // Lichen on the upper faces.
      if (fromTop > 0 && fromTop < 4 && rh(xx, y, 185 + v) < 0.08) col = '#7f8a58';
      if (y >= H - 2) col = deep;
      px(g, xx, y, col);
    }
  }
  // A crack or two down the face.
  for (let k = 0; k < size; k++) {
    let cx = Math.floor(W * (0.3 + rh(k, v, 186) * 0.4));
    for (let y = tops[cx]! + 2; y < H - 3; y++) {
      px(g, cx, y, deep);
      if (rh(y, k, 187) < 0.25) cx += rh(y, k, 188) < 0.5 ? -1 : 1;
      cx = Math.max(1, Math.min(W - 2, cx));
    }
  }
  return { c, crown: 0 };
}
