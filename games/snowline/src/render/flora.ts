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

/**
 * Aspen sizes: crown radius and trunk height. A slim tree, a little under two tiles at its tallest: about
 * 80% of a conifer of the same size, so grown spruce and fir stand over it as they do in a real stand.
 */
const ASPEN: [number, number][] = [
  [3.2, 4.8],
  [4.4, 9.6],
  [5.6, 13.6],
  [6.4, 18.4],
];

/** An aspen's leaves through the season: green, turning (some leaves gold), gold, and thinning. */
export type AspenLeaf = 0 | 1 | 2 | 3;
const ASPEN_LEAVES: [string, string, string][] = [
  ['#5f7a3a', '#7f9a4a', '#a3bb63'],
  ['#5f7a3a', '#7f9a4a', '#a3bb63'],
  ['#a88f3a', '#d4b94e', '#efdc84'],
  ['#9a7a34', '#c79f45', '#e2c46c'],
];
const ASPEN_GOLD = ASPEN_LEAVES[2]!;

/**
 * An aspen: a slim white trunk with black marks running up into an upright, airy crown of small leaf
 * clusters, with branches showing between them. `leaf` is the season (`AspenLeaf`). The crown sits
 * inside the canvas with room above, so it's never cut off.
 */
export function aspen(size: number, v: number, leaf: AspenLeaf = 0): Tall {
  const [R, trunk] = ASPEN[size]!;
  const rx = R * 0.8;
  const ry = R * 1.7;
  const top = 1;
  const cy = top + ry;
  const H = Math.ceil(top + ry * 2 + trunk * 0.45 + 1);
  const [c, g] = canvas(26, H);
  const cx = 12.5;
  const thick = size === 0 ? 1 : 2;
  // The trunk, from the base up into the crown: white, shaded on the right, with black marks.
  for (let y = Math.floor(cy - ry * 0.4); y < H; y++) {
    for (let k = 0; k < thick; k++) {
      const mark = rh(12 + k, y, 130 + v) < 0.16;
      px(g, 12 + k, y, mark ? '#3b3b36' : k === 0 ? '#e4ddc6' : '#b8b19a');
    }
  }
  px(g, 11, H - 1, '#8f8a78', thick + 2, 1);
  // Branches up and out into the crown.
  for (let b = 0; b < 3 + size; b++) {
    const side = b % 2 ? 1 : -1;
    let x = 12.5 + (side > 0 ? thick - 1 : 0);
    let y = cy + ry * (0.1 + rh(b, v, 136) * 0.5);
    const len = rx * (0.5 + rh(v, b, 137) * 0.4);
    for (let k = 0; k < len; k++) {
      x += side * 0.8;
      y -= 0.7;
      px(g, Math.round(x), Math.round(y), '#a8a18a');
    }
  }
  // Leaf clusters, scattered through the crown's ellipse, lit from the upper left.
  const [dark, mid, lit] = ASPEN_LEAVES[leaf]!;
  const clusters = Math.round((8 + size * 8) * (leaf === 3 ? 0.45 : 1));
  for (let b = 0; b < clusters; b++) {
    const a = rh(b, v, 131) * 6.283;
    const d = Math.sqrt(rh(v, b, 132));
    const bx = cx + Math.cos(a) * d * (rx - 1.5);
    const by = cy + Math.sin(a) * d * (ry - 1.5);
    const br = 1.4 + rh(b, b + v, 133) * (size === 0 ? 0.8 : 1.4);
    // Turning: some clusters have gone gold before the rest.
    const cols = leaf === 1 && rh(b, v, 138) < 0.35 ? ASPEN_GOLD : [dark, mid, lit];
    for (let y = Math.floor(by - br); y <= by + br; y++) {
      for (let x = Math.floor(bx - br); x <= bx + br; x++) {
        const dx = x + 0.5 - bx;
        const dy = y + 0.5 - by;
        if (dx * dx + dy * dy > br * br || y < 0) continue;
        // Shade by where the cluster sits in the crown as well as by its own roundness.
        const light = (dx + dy) / br + ((bx - cx) / rx + (by - cy) / ry) * 0.8;
        let col = light < -0.5 ? cols[2] : light > 0.6 ? cols[0] : cols[1];
        if (rh(x, y, 134 + v) < 0.1) col = cols[light < 0 ? 2 : 0];
        px(g, x, y, col!);
      }
    }
  }
  return { c, crown: Math.ceil(top + ry * 2) };
}

/** The deadfall canvas is this square; the trunk is centred in it. */
export const LOG_SIZE = 40;

/**
 * Deadfall: a fallen trunk lying at `angle` (eighths of a half-turn, 0 lying left to right, clockwise),
 * `len` pixels long, tapering from the butt to the top. The butt is a tipped-up root plate or a broken,
 * splintered end; dead branch stubs along it. Charred black in a burn; mossy on top in old forest.
 */
export function log(angle: number, len: number, burnt: boolean, v: number): HTMLCanvasElement {
  const [c, g] = canvas(LOG_SIZE, LOG_SIZE);
  const cx = LOG_SIZE / 2;
  const a = (angle * Math.PI) / 8;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  // The side that faces up the screen (and the light).
  let nx = uy;
  let ny = -ux;
  if (ny > 0 || (ny === 0 && nx > 0)) [nx, ny] = [-nx, -ny];
  const [dark, mid, lit] = burnt ? ['#1c1918', '#2e2926', '#4a423b'] : ['#3d2f22', '#5e4a36', '#7c6142'];
  const half = len / 2;
  const at = (t: number, s: number): [number, number] => [Math.round(cx + ux * t + nx * s), Math.round(cx + uy * t + ny * s)];
  // The root plate first, so the trunk lies over it.
  if (v !== 1) {
    const [rx, ry] = at(-half - 1, 0);
    const r = 3.5 + (v % 2);
    for (let y = -5; y <= 5; y++)
      for (let x = -5; x <= 5; x++) {
        if (x * x + y * y > r * r || rh(x, y, 140 + v) < 0.15) continue;
        px(g, rx + x, ry + y, x * nx + y * ny > 1 ? '#6b5a45' : rh(x, y, 141) < 0.3 ? '#2b241d' : '#4a3c2e');
      }
  }
  for (let t = -half; t <= half; t += 0.5) {
    const k = (t + half) / len;
    const w = 3.8 - k * 1.8;
    for (let s = -w / 2; s <= w / 2; s += 0.5) {
      const [x, y] = at(t, s);
      let col = s > w / 2 - 1 ? lit : s < -w / 2 + 1 ? dark : mid;
      const n = rh(x, y, 142 + v);
      if (burnt) col = n < 0.25 ? '#0f0d0c' : n > 0.93 ? '#6d655c' : col;
      else if (n < 0.12) col = dark;
      else if (v === 0 && s > w / 2 - 1 && k < 0.6 && n > 0.6) col = '#4f6a3a';
      px(g, x, y, col);
    }
  }
  // Dead branch stubs, and the broken top.
  for (const [t, side, l] of [[-half * 0.2, 1, 2], [half * 0.3, -1, 3], [half * 0.7, 1, 2]] as const) {
    for (let s = 1; s <= l; s++) {
      const [x, y] = at(t + s * 0.6, side * (1.5 + s));
      px(g, x, y, burnt ? '#2e2926' : '#5e4a36');
    }
  }
  if (v === 1) {
    const [x, y] = at(-half, 0);
    px(g, x, y, burnt ? '#5a524a' : '#b89a6c');
    const [x2, y2] = at(-half - 1, rh(v, len, 143) < 0.5 ? 1 : -1);
    px(g, x2, y2, burnt ? '#3b352f' : '#9c7a52');
  }
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

/** One rounded mass of a rock: centre, half-width, half-height, and how square its shoulders are (2 round, 4+ blocky). */
interface Lump {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  p: number;
}

/** Light from the upper left, a little toward the viewer. */
const LIGHT = (() => {
  const l = Math.hypot(-0.55, -0.7, 0.45);
  return [-0.55 / l, -0.7 / l, 0.45 / l] as const;
})();
/** A 4×4 ordered dither, so tones blend in a pixel-art way instead of banding. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * Paint a rock from its lumps: each pixel belongs to the front-most lump over it (lumps lower on the
 * canvas stand in front), shaded by that lump's surface turned to the light, in five tones of the
 * stone's colour, dithered; a dark crease where one lump meets another, a dark line along its foot and
 * shaded edge, grain, specks of the stone's own mark, and lichen on the lit tops. `joints` adds the
 * upright cracks of a crag.
 */
function paintRock(W: number, H: number, lumps: Lump[], body: string, mark: string, v: number, joints: number): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const tones = [shade(body, 0.42), shade(body, 0.62), shade(body, 0.82), body, shade(body, 1.22), shade(body, 1.45)];
  const order = lumps.map((_, k) => k).sort((a, b) => lumps[a]!.cy + lumps[a]!.ry - (lumps[b]!.cy + lumps[b]!.ry) || a - b);
  const owner = new Int8Array(W * H).fill(-1);
  const light = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (const k of order) {
        const l = lumps[k]!;
        const u = (x + 0.5 - l.cx) / l.rx;
        const w = (y + 0.5 - l.cy) / l.ry;
        const f = Math.abs(u) ** l.p + Math.abs(w) ** l.p;
        if (f >= 1) continue;
        // The surface's slope: steep at the shoulders, flat on top, by the shape's own curve.
        const gx = Math.sign(u) * Math.abs(u) ** (l.p - 1);
        const gy = Math.sign(w) * Math.abs(w) ** (l.p - 1);
        const gz = Math.sqrt(1 - f) * 1.4;
        const n = Math.hypot(gx, gy, gz) || 1;
        owner[y * W + x] = k;
        light[y * W + x] = (gx * LIGHT[0] + gy * LIGHT[1] + gz * LIGHT[2]) / n;
      }
    }
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : owner[y * W + x]!);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = at(x, y);
      if (k < 0) continue;
      const grain = (rh(x, y, 190 + v) - 0.5) * 0.08;
      const dither = (BAYER[(y % 4) * 4 + (x % 4)]! / 16 - 0.5) * 0.16;
      const b = light[y * W + x]! + grain + dither;
      let col = tones[Math.max(0, Math.min(5, Math.floor((b + 0.35) * 4)))]!;
      // A crease where this lump meets one behind it (above or beside), and the shaded outline.
      const above = at(x, y - 1);
      const left = at(x - 1, y);
      if ((above >= 0 && above !== k) || (left >= 0 && left !== k && light[y * W + x]! < 0.35)) col = tones[1]!;
      if (at(x, y + 1) < 0 || at(x + 1, y) < 0) col = tones[0]!;
      else if (above < 0 && b > 0.2) col = tones[5]!;
      const r = rh(x, y, 191 + v);
      if (r < 0.035) col = mark;
      else if (b > 0.5 && r > 0.955) col = r > 0.99 ? '#c4a24f' : '#94a066';
      px(g, x, y, col);
    }
  }
  // A crag's joints: upright cracks, wandering a little, darker where they're in shade.
  for (let j = 0; j < joints; j++) {
    let x = Math.floor(W * (0.2 + rh(j, v, 192) * 0.6));
    let y = 0;
    while (y < H && at(x, y) < 0) y++;
    for (y += 2; y < H - 2; y++) {
      if (at(x, y) < 0 || at(x, y + 1) < 0) break;
      px(g, x, y, light[y * W + x]! < 0.3 ? tones[0]! : tones[1]!);
      if (rh(y, j + v, 193) < 0.2) x += rh(y, j, 194) < 0.5 ? -1 : 1;
      if (at(x, y) < 0) break;
    }
  }
  return c;
}

/**
 * A boulder: one rounded rock, or two or three grown together, sitting on the ground. Size 0 a stone
 * you could step over, up to 3 as high as the survivor. `v` (0–5) picks the variant.
 */
export function boulder(size: number, v: number, body: string, mark: string): Tall {
  const rx = [3.6, 5.2, 7.2, 9.5][size]!;
  const ry = rx * (0.62 + rh(v, size, 195) * 0.2);
  const W = Math.ceil(rx * 2 + 6);
  const H = Math.ceil(ry * 2 + 3);
  const base = H - 1;
  const lumps: Lump[] = [{ cx: W / 2 + (rh(v, 1, 196) - 0.5) * 2, cy: base - ry, rx, ry, p: 2.2 + rh(v, 2, 196) * 0.8 }];
  const more = size === 0 ? 0 : Math.floor(rh(v, size, 197) * 3);
  for (let k = 0; k < more; k++) {
    const side = rh(k, v, 198) < 0.5 ? -1 : 1;
    const r2 = rx * (0.45 + rh(k, v, 199) * 0.25);
    const h2 = r2 * 0.7;
    lumps.push({ cx: W / 2 + side * rx * (0.55 + rh(v, k, 200) * 0.3), cy: base - h2 + (rh(k, v, 201) < 0.5 ? 0 : -1), rx: r2, ry: h2, p: 2.4 });
  }
  return { c: paintRock(W, H, lumps, body, mark, v, 0), crown: 0 };
}

/**
 * A crag: rock standing up out of the ground in a few jointed buttresses, the tallest near the middle,
 * square-shouldered and flat-topped, with rubble at its foot. Size 1 a tile high, 2 a tile and a half,
 * 3 two tiles. For outcrops, the overhang, and cliff edges.
 */
export function crag(size: number, v: number, body: string, mark: string): Tall {
  const s = Math.max(1, size);
  const W = [0, 20, 26, 32][s]!;
  const H = [0, 17, 24, 31][s]!;
  const base = H - 1;
  const lumps: Lump[] = [];
  const n = 2 + Math.floor(rh(v, s, 202) * 2);
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0.5 : k / (n - 1);
    const mid = 1 - Math.abs(t - 0.5) * 1.4;
    const rx = (W / (n + 0.6)) * (0.75 + rh(k, v, 203) * 0.35);
    const ry = ((H - 3) / 2) * (0.55 + mid * 0.4) * (0.85 + rh(v, k, 204) * 0.25);
    lumps.push({ cx: 3 + rx * 0.8 + (W - 6 - rx * 1.6) * t, cy: base - ry - (k % 2) * 1.5, rx, ry, p: 3.2 + rh(k, v, 205) * 2 });
  }
  // Rubble fallen at its foot.
  const rubble = 1 + Math.floor(rh(v, s, 206) * 2);
  for (let k = 0; k < rubble; k++) {
    const r = 2 + rh(k, v, 207) * 2;
    lumps.push({ cx: 3 + rh(v, k, 208) * (W - 6), cy: base - r * 0.6, rx: r, ry: r * 0.6, p: 2.2 });
  }
  return { c: paintRock(W, H, lumps, body, mark, v, s), crown: 0 };
}
