// Trees and boulders in sizes (SPEC 6.8, 12.1): drawn in code, a few variants of each size, built once
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

/** Conifer sizes: crown height and half-width. 0 is a sapling, 4 a giant. */
const CONIFER: [number, number][] = [
  [7, 2.6],
  [12, 4.4],
  [17, 6.2],
  [23, 7.8],
  [29, 9.2],
];

export function conifer(size: number, v: number, palette: 'green' | 'grey' = 'green'): Tall {
  const [H, half] = CONIFER[size]!;
  const trunk = size === 0 ? 2 : 3;
  const W = 22;
  const [c, g] = canvas(W, H + trunk + 1);
  const cx = 10.5;
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

/** Aspen sizes: crown radius and trunk height. */
const ASPEN: [number, number][] = [
  [3, 4],
  [4.2, 6],
  [5.4, 8],
];

export function aspen(size: number, v: number): Tall {
  const [R, trunk] = ASPEN[size]!;
  const H = Math.ceil(R * 2 + trunk + 1);
  const [c, g] = canvas(18, H);
  const cx = 8.5;
  for (let y = Math.floor(R * 2) - 1; y < H; y++) {
    px(g, 8, y, '#ddd6bf');
    if (rh(8, y, 130 + v) < 0.3) px(g, 8, y, '#3b3b36');
  }
  px(g, 9, H - 2, '#b8b19a', 1, 2);
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

/** A boulder: 0 small, 1 large. Drawn within one tile. */
export function boulder(size: number, v: number): HTMLCanvasElement {
  const [c, g] = canvas(16, 16);
  const w = size ? 14 : 10;
  const h = size ? 11 : 8;
  const x0 = Math.floor((16 - w) / 2) + (v % 2);
  const y0 = 15 - h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2);
      const dy = (y + 0.5 - h * 0.55) / (h * 0.55);
      if (dx * dx + dy * dy > 1 + rh(x, y, 140 + v) * 0.12) continue;
      const lit = dx + dy < -0.5;
      const dark = dx * 0.6 + dy > 0.55;
      let col = lit ? '#b9b6aa' : dark ? '#4f4d47' : '#7f7c71';
      if (y < h * 0.35 && v === 2 && rh(x, y, 141) < 0.5) col = '#6a7a4a';
      if (rh(x, y, 142 + v) < 0.07) col = '#5f5d56';
      px(g, x0 + x, y0 + y, col);
    }
  }
  return c;
}

/** An outcrop: a broken crag of the dealt stone, tinted body and mark, angular where a boulder is round. */
export function crag(body: string, mark: string, v: number): HTMLCanvasElement {
  const [c, g] = canvas(16, 16);
  const tops = [4 + (v % 2), 2, 3 + ((v + 1) % 3), 5, 6 - (v % 2)];
  for (let col = 0; col < 5; col++) {
    const x0 = 1 + col * 3 - (col > 2 ? 1 : 0);
    const top = tops[col]!;
    for (let y = top; y < 15; y++) {
      for (let x = x0; x < x0 + 3 + (col === 2 ? 1 : 0); x++) {
        if (x > 15) continue;
        const face = x === x0;
        let col2 = face ? mark : body;
        if (y === top) col2 = '#d0cec4';
        else if (y > 12) col2 = '#2a2d33';
        else if (rh(x, y, 150 + v) < 0.12) col2 = mark;
        px(g, x, y, col2);
      }
    }
  }
  px(g, 1, 15, 'rgba(0,0,0,0.3)', 14, 1);
  return c;
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
