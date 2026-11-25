/**
 * Fire as a field of heat (render-only, no Phaser): the way flames are drawn (SPEC §11.3).
 *
 * Whatever burns drops heat into a grid of game pixels. Each step the heat rises a pixel, spreads a
 * little sideways, and cools by a noise map that rises with it, so it breaks into tongues that lick
 * upward, lean, split, and gutter out the way a flame does. `paint` then maps heat to a short ramp
 * of colors (white-hot, yellow, orange, red, a dark fringe), which gives chunky banded pixel flames
 * with a hot core. Sources only say where the fire is and how fierce; the field does the rest, so a
 * flamethrower's stream, a burning wood, and a burning tank all move like the same stuff.
 */

/** The cooling map: a square of smooth noise (0–255) that tiles, sized to a power of two. */
const NOISE = 64;

/** A small fast generator for the per-cell jitter (not the sim's: this is render-only). */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
}

/** Smooth tiling noise: three octaves of value noise, stretched to the full 0–255. */
function coolingMap(seed: number): Uint8Array {
  const rand = lcg(seed);
  const out = new Float32Array(NOISE * NOISE);
  for (const [cell, weight] of [
    [16, 0.5],
    [8, 0.32],
    [4, 0.18],
  ] as const) {
    const n = NOISE / cell;
    const grid = new Float32Array(n * n);
    for (let i = 0; i < grid.length; i++) grid[i] = (rand() & 0xffff) / 0xffff;
    const at = (gx: number, gy: number) => grid[(((gy % n) + n) % n) * n + (((gx % n) + n) % n)]!;
    for (let y = 0; y < NOISE; y++) {
      for (let x = 0; x < NOISE; x++) {
        const fx = x / cell;
        const fy = y / cell;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        out[y * NOISE + x]! += (top + (bottom - top) * sy) * weight;
      }
    }
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of out) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return Uint8Array.from(out, (v) => Math.round(((v - min) / (max - min)) * 255));
}

export interface HeatOptions {
  /** Heat every cell loses a step, and how much more the cooling map takes where it's strongest. */
  cool: number;
  coolNoise: number;
  /** Odds (0–1) a cell draws its heat from a pixel to one side of straight below: ragged edges. */
  jitter: number;
  /** Seeds the cooling map and the jitter. */
  seed: number;
}

export const HEAT_DEFAULTS: HeatOptions = { cool: 2, coolNoise: 27, jitter: 0.3, seed: 0x51f15e };

export class HeatField {
  readonly width: number;
  readonly height: number;
  /** Heat per game pixel, 0–255, row by row from the top; two spare rows of cold below. */
  readonly heat: Uint8Array;
  /** Heat dropped in since the last step; it joins the field at the next one. */
  private readonly pending: Uint8Array;
  private readonly noise: Uint8Array;
  private readonly rand: () => number;
  private readonly opts: HeatOptions;
  /** Rows that hold any heat (`top > bottom`: none), and rows with heat waiting to go in. */
  private top: number;
  private bottom = -1;
  private pendTop: number;
  private pendBottom = -1;
  /** How far the cooling map has risen (it climbs a row a step, with the flames). */
  private drift = 0;
  /** Which way the flames lean this moment (-1, 0, 1), and steps until that changes. */
  private lean = 0;
  private leanFor = 0;

  constructor(width: number, height: number, opts: Partial<HeatOptions> = {}) {
    this.width = width;
    this.height = height;
    this.opts = { ...HEAT_DEFAULTS, ...opts };
    this.heat = new Uint8Array(width * (height + 2));
    this.pending = new Uint8Array(width * height);
    this.noise = coolingMap(this.opts.seed);
    this.rand = lcg(this.opts.seed ^ 0x9e3779b9);
    this.top = height;
    this.pendTop = height;
  }

  /** Whether anything is alight or about to be. */
  get alight(): boolean {
    return this.bottom >= this.top || this.pendBottom >= this.pendTop;
  }

  /**
   * Drop a round patch of heat at (x, y): `heat` (0–255) at its center, falling off to its edge.
   * `soft`: falling away from the middle on (a puff of smoke), not nearly flat with a rim (a flame).
   */
  add(x: number, y: number, r: number, heat: number, soft = false): void {
    const { width, height, pending } = this;
    const x0 = Math.max(1, Math.ceil(x - r));
    const x1 = Math.min(width - 2, Math.floor(x + r));
    const y0 = Math.max(0, Math.ceil(y - r));
    const y1 = Math.min(height - 1, Math.floor(y + r));
    if (x0 > x1 || y0 > y1) return;
    const rr = r * r;
    for (let py = y0; py <= y1; py++) {
      const dy = py - y;
      for (let px = x0; px <= x1; px++) {
        const dx = px - x;
        const d = (dx * dx + dy * dy) / rr;
        if (d > 1) continue;
        // `d` is the distance squared, so `1 - d * d` is nearly flat across the middle.
        const v = Math.min(255, heat * (soft ? 1 - d : 1 - d * d)) | 0;
        const i = py * width + px;
        if (v > pending[i]!) pending[i] = v;
      }
    }
    if (y0 < this.pendTop) this.pendTop = y0;
    if (y1 > this.pendBottom) this.pendBottom = y1;
  }

  /** Slide everything `rows` down (negative: up), as the view moves over the ground. */
  scroll(rows: number): void {
    if (rows === 0 || !this.alight) return;
    const { width, height } = this;
    // The cooling map stays with the ground too.
    this.drift -= rows;
    if (Math.abs(rows) >= height) {
      this.clear();
      return;
    }
    for (const [buf, rowsHeld] of [
      [this.heat, height],
      [this.pending, height],
    ] as const) {
      const n = rowsHeld * width;
      if (rows > 0) {
        buf.copyWithin(rows * width, 0, n - rows * width);
        buf.fill(0, 0, rows * width);
      } else {
        buf.copyWithin(0, -rows * width, n);
        buf.fill(0, n + rows * width, n);
      }
    }
    const shift = (v: number) => Math.max(0, Math.min(height - 1, v + rows));
    if (this.bottom >= this.top) [this.top, this.bottom] = [shift(this.top), shift(this.bottom)];
    if (this.pendBottom >= this.pendTop) [this.pendTop, this.pendBottom] = [shift(this.pendTop), shift(this.pendBottom)];
  }

  clear(): void {
    this.heat.fill(0);
    this.pending.fill(0);
    this.top = this.pendTop = this.height;
    this.bottom = this.pendBottom = -1;
  }

  /** One step: new heat goes in, then everything rises, spreads, and cools. Returns whether anything is still alight. */
  step(): boolean {
    const { width, height, heat, pending, noise, rand } = this;
    const { cool, coolNoise, jitter } = this.opts;

    if (this.pendBottom >= this.pendTop) {
      for (let i = this.pendTop * width, end = (this.pendBottom + 1) * width; i < end; i++) {
        const v = pending[i]!;
        if (v === 0) continue;
        if (v > heat[i]!) heat[i] = v;
        pending[i] = 0;
      }
      this.top = Math.min(this.top, this.pendTop);
      this.bottom = Math.max(this.bottom, this.pendBottom);
      this.pendTop = height;
      this.pendBottom = -1;
    }
    if (this.bottom < this.top) return false;

    // The whole fire leans one way for a moment, then another: a breath of wind.
    if (--this.leanFor <= 0) {
      this.lean = (rand() % 3) - 1;
      this.leanFor = 3 + (rand() % 8);
    }
    this.drift++;
    const lean = this.lean;
    const jit = Math.floor(jitter * 0x10000);
    const y0 = Math.max(0, this.top - 1);
    const y1 = this.bottom;
    let top = height;
    let bottom = -1;
    // In place, top row first: each cell draws on its own old heat and the rows below it, which
    // haven't been touched yet.
    for (let y = y0; y <= y1; y++) {
      const row = y * width;
      const below = row + width;
      const noiseRow = ((y + this.drift) & (NOISE - 1)) * NOISE;
      let live = false;
      for (let x = 1; x < width - 1; x++) {
        // Mostly from straight below, sometimes a pixel to one side (the lean, or a flicker).
        const r = rand();
        let sx = x;
        if ((r & 0xffff) < jit) sx += r & 0x10000 ? 1 : -1;
        else if (lean !== 0 && r & 0x20000) sx -= lean;
        const from = below + (sx < 1 ? 1 : sx > width - 2 ? width - 2 : sx);
        let v = (heat[from]! * 3 + heat[below + x - 1]! + heat[below + x + 1]! + heat[below + width + x]! + heat[row + x]! * 2) >> 3;
        v -= cool + ((noise[noiseRow + (x & (NOISE - 1))]! * coolNoise) >> 8);
        if (v > 0) live = true;
        else v = 0;
        heat[row + x] = v;
      }
      if (live) {
        if (y < top) top = y;
        bottom = y;
      }
    }
    this.top = top;
    this.bottom = bottom;
    return bottom >= top;
  }

  /**
   * Draw the field: each pixel takes `ramp[heat]` (a 256-entry table of packed pixels, in the byte
   * order of the buffer `out` is a view on). Rows with no heat are cleared.
   */
  paint(out: Uint32Array, ramp: Uint32Array): void {
    const { width, height, heat } = this;
    out.fill(0);
    if (this.bottom < this.top) return;
    for (let i = this.top * width, end = Math.min(height, this.bottom + 1) * width; i < end; i++) {
      const v = heat[i]!;
      if (v !== 0) out[i] = ramp[v]!;
    }
  }

  /**
   * The fire's light on the ground, at 1/`cell` scale: for each block of `cell`×`cell` pixels, its
   * hottest pixel, spread to the blocks round it. `out` is (width/cell)×(height/cell), 0–255.
   */
  glow(out: Uint8Array, cell: number): void {
    const { width, height, heat } = this;
    const gw = Math.floor(width / cell);
    const gh = Math.floor(height / cell);
    out.fill(0);
    if (this.bottom < this.top) return;
    const peak = new Uint8Array(gw * gh);
    for (let y = this.top; y <= Math.min(this.bottom, gh * cell - 1); y++) {
      const gy = Math.floor(y / cell);
      for (let x = 0; x < gw * cell; x++) {
        const v = heat[y * width + x]!;
        const g = gy * gw + Math.floor(x / cell);
        if (v > peak[g]!) peak[g] = v;
      }
    }
    // A blur over the blocks round each one: the light falls off over a couple of cells.
    const g0 = Math.max(0, Math.floor(this.top / cell) - 2);
    const g1 = Math.min(gh - 1, Math.floor(this.bottom / cell) + 2);
    for (let gy = g0; gy <= g1; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        let sum = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const yy = gy + dy;
          if (yy < 0 || yy >= gh) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const xx = gx + dx;
            if (xx < 0 || xx >= gw) continue;
            sum += peak[yy * gw + xx]! * (3 - Math.max(Math.abs(dx), Math.abs(dy)));
          }
        }
        // Weights: 3 (center) + 8×2 + 16×1 = 35.
        out[gy * gw + gx] = Math.min(255, Math.round(sum / 35));
      }
    }
  }
}

/** A color stop on the flame ramp: from this heat up, this color (0xRRGGBB) at this opacity. */
export interface RampStop {
  heat: number;
  color: number;
  alpha: number;
}

/**
 * The flame's colors, coolest first. Banded on purpose (no blending between stops): each band is a
 * flat color, like hand-drawn pixel fire. Below the first stop nothing is drawn.
 */
export const FLAME_RAMP: readonly RampStop[] = [
  { heat: 22, color: 0x5a1c14, alpha: 0.55 },
  { heat: 44, color: 0x9c2c16, alpha: 0.9 },
  { heat: 70, color: 0xd9481c, alpha: 1 },
  { heat: 104, color: 0xf2792a, alpha: 1 },
  { heat: 142, color: 0xffb03a, alpha: 1 },
  { heat: 186, color: 0xffe07a, alpha: 1 },
  { heat: 230, color: 0xfff8dc, alpha: 1 },
];

/**
 * A hotter flame, heat for heat: blue through to a white core, the color of a cutting torch. It's
 * what can burn the Behemoth's armor (an enemy's flame projector, SPEC §6 "Fire"), so it has to
 * read apart from every fire that can't.
 */
export const HOT_RAMP: readonly RampStop[] = [
  { heat: 22, color: 0x14205e, alpha: 0.55 },
  { heat: 44, color: 0x1a38a4, alpha: 0.9 },
  { heat: 70, color: 0x2060dc, alpha: 1 },
  { heat: 104, color: 0x2e8cf4, alpha: 1 },
  { heat: 142, color: 0x52b8ff, alpha: 1 },
  { heat: 186, color: 0x96e0ff, alpha: 1 },
  { heat: 230, color: 0xeafcff, alpha: 1 },
];

/** The ramp as a table of packed pixels for `HeatField.paint`, in this machine's byte order (as canvas `ImageData` wants them). */
export function rampTable(stops: readonly RampStop[] = FLAME_RAMP): Uint32Array {
  const table = new Uint32Array(256);
  const bytes = new Uint8Array(table.buffer);
  for (let h = 0; h < 256; h++) {
    let stop: RampStop | undefined;
    for (const s of stops) if (h >= s.heat) stop = s;
    if (!stop) continue;
    bytes[h * 4] = (stop.color >> 16) & 0xff;
    bytes[h * 4 + 1] = (stop.color >> 8) & 0xff;
    bytes[h * 4 + 2] = stop.color & 0xff;
    bytes[h * 4 + 3] = Math.round(stop.alpha * 255);
  }
  return table;
}
