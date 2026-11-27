// The ground (SPEC 6.8, 12.1, the beauty pass): every pixel of terrain drawn from the world, in chunks of
// 16×16 tiles that are built when first seen and cached. Ground types overlap each other along ragged
// edges, water darkens with depth and has a foam line at the shore, colour drifts across the map with
// smooth noise fields, and small things that are only drawn (grass clumps, flowers, ferns, pebbles,
// rocks of several sizes) are scattered by position hash and noise. All of it is the renderer's own: the
// same for a seed and a tile every time, and never read by the simulation.

import { BAND, F, FLAG, T, TERRAIN } from '../content/terrain.ts';
import { perlin } from '../sim/worldgen/noise.ts';
import { idx, type World } from '../sim/world.ts';
import { PALETTE, TERRAIN_COLOR, rgb } from './palette.ts';
import { rh } from './tiles.ts';

const TILE = 16;
const CHUNK = 16;
const CPX = CHUNK * TILE;
const SIZE = 256;
const MAX_CHUNKS = 28;

type RGB = [number, number, number];

/** Grounds whose tiles keep their exact squares: the falls and the overhang's floor. */
const HARD = new Set<number>([T.waterfall, T.shelter]);

const C = (hex: string): RGB => rgb(hex);
const BASE: RGB[] = TERRAIN_COLOR.map((k) => C(PALETTE[k]));
// Each ground's two moods, which the large noise field moves between (lush/dry, mossy/needled, ...).
const MOOD: Partial<Record<number, [RGB, RGB]>> = {
  [T.meadow]: [C('#6f9049'), C('#8c9152')],
  [T.highMeadow]: [C('#879f57'), C('#a3a067')],
  [T.forest]: [C('#34502f'), C('#3d4331')],
  [T.scrub]: [C('#66724a'), C('#7a7656')],
  [T.reeds]: [C('#748646'), C('#8f8a4c')],
  [T.marsh]: [C('#58733f'), C('#667145')],
  [T.sand]: [C('#c9b98b'), C('#b9a77a')],
  [T.talus]: [C('#8e8a7f'), C('#7c7a72')],
  [T.rock]: [C('#7a776d'), C('#6c6e6a')],
  [T.boulders]: [C('#78776c'), C('#6e6c62')],
  [T.cliff]: [C('#6e716c'), C('#646660')],
  [T.headwall]: [C('#6a6d69'), C('#5f625e')],
};
const SHALLOW = C('#55888c');
const DEEP = C('#2b5163');
const STREAM = C('#3a6a74');
const FOAM = C('#a9c6bf');
const SNOW = C('#e9ece6');
const PATH = C('#7d6c52');
const WET: RGB = [52, 50, 40];

function lerp(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const isWater = (t: number) => TERRAIN[t]!.water;

export class Ground {
  private readonly w: World;
  private readonly seed: number;
  private readonly chunks = new Map<string, HTMLCanvasElement>();
  /** Per tile: distance to land (water depth), hill shade, the large mood field, the small brightness field. */
  private readonly depth: Float32Array;
  private readonly shade: Float32Array;
  private readonly mood: Float32Array;
  private readonly bright: Float32Array;
  /** Per tile, 1 on glacier ice; and the way the ice flows (downhill), smoothed. */
  private readonly ice: Float32Array;
  private readonly flowX: Float32Array;
  private readonly flowY: Float32Array;

  constructor(world: World, seed: number) {
    this.w = world;
    this.seed = seed;
    const n = SIZE * SIZE;
    this.depth = new Float32Array(n);
    this.shade = new Float32Array(n);
    this.mood = new Float32Array(n);
    this.bright = new Float32Array(n);
    this.ice = new Float32Array(n);
    this.flowX = new Float32Array(n);
    this.flowY = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.ice[i] = world.flags[i]! & FLAG.glacier ? 1 : 0;
    }
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        // Downhill over a few tiles, so the crevasses don't jump at each tile's edge.
        const e = (dx: number, dy: number) => world.elev[idx(Math.max(0, Math.min(SIZE - 1, x + dx)), Math.max(0, Math.min(SIZE - 1, y + dy)))]!;
        const gx = e(-3, 0) - e(3, 0) + (e(-3, -2) - e(3, -2) + e(-3, 2) - e(3, 2)) * 0.5;
        const gy = e(0, -3) - e(0, 3) + (e(-2, -3) - e(-2, 3) + e(2, -3) - e(2, 3)) * 0.5;
        const len = Math.hypot(gx, gy);
        this.flowX[idx(x, y)] = len ? gx / len : 0;
        this.flowY[idx(x, y)] = len ? gy / len : 1;
      }
    }
    // Water depth: steps from the nearest dry tile, by a breadth-first walk.
    const q: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!isWater(world.terrain[i]!)) {
        this.depth[i] = 0;
        q.push(i);
      } else this.depth[i] = 99;
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h]!;
      const x = i % SIZE;
      const y = (i - x) / SIZE;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const j = idx(nx, ny);
        if (this.depth[j]! > this.depth[i]! + 1) {
          this.depth[j] = this.depth[i]! + 1;
          q.push(j);
        }
      }
    }
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = idx(x, y);
        const d = x > 0 && y > 0 ? world.elev[i]! - world.elev[idx(x - 1, y - 1)]! : 0;
        this.shade[i] = Math.max(-0.18, Math.min(0.18, d * 0.045));
        this.mood[i] = Math.max(0, Math.min(1, 0.5 + perlin(seed + 11, x / 11, y / 11) * 0.9 + perlin(seed + 12, x / 4, y / 4) * 0.35));
        this.bright[i] = perlin(seed + 13, x / 5, y / 5) * 0.09 + perlin(seed + 14, x / 2.2, y / 2.2) * 0.03;
      }
    }
  }

  /** Draw the ground under a view whose top-left is (camX, camY) in world pixels. */
  draw(g: CanvasRenderingContext2D, camX: number, camY: number, width: number, height: number, snow: number): void {
    const cx0 = Math.floor(camX / CPX);
    const cy0 = Math.floor(camY / CPX);
    const cx1 = Math.floor((camX + width - 1) / CPX);
    const cy1 = Math.floor((camY + height - 1) / CPX);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunk(cx, cy, snow);
        g.drawImage(c, cx * CPX - camX, cy * CPX - camY);
      }
    }
  }

  /** Build the chunks around a point ahead of time (a spare moment), so walking never waits on one. */
  warm(camX: number, camY: number, width: number, height: number, snow: number): void {
    const cx = Math.floor((camX + width / 2) / CPX);
    const cy = Math.floor((camY + height / 2) / CPX);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const key = `${cx + dx},${cy + dy},${snow}`;
      if (!this.chunks.has(key) && cx + dx >= 0 && cy + dy >= 0 && cx + dx < SIZE / CHUNK && cy + dy < SIZE / CHUNK) {
        this.chunk(cx + dx, cy + dy, snow);
        return;
      }
    }
  }

  private chunk(cx: number, cy: number, snow: number): HTMLCanvasElement {
    const key = `${cx},${cy},${snow}`;
    let c = this.chunks.get(key);
    if (c) {
      this.chunks.delete(key);
      this.chunks.set(key, c);
      return c;
    }
    c = document.createElement('canvas');
    c.width = CPX;
    c.height = CPX;
    const g = c.getContext('2d')!;
    this.paint(g, cx * CHUNK, cy * CHUNK, snow);
    this.chunks.set(key, c);
    if (this.chunks.size > MAX_CHUNKS) this.chunks.delete(this.chunks.keys().next().value!);
    return c;
  }

  private terrainAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return T.headwall;
    return this.w.terrain[idx(x, y)]!;
  }

  /**
   * Which ground owns world pixel (wx, wy). The four tiles whose centres surround the pixel each vote
   * for their ground with its bilinear weight; votes for the same ground add up, each ground's total is
   * stirred by its own noise, and the most wins. So outlines run in smooth, wandering curves through
   * the tiles, never along the grid: a staircase of tiles reads as a slope, a lone tile as a rounded
   * patch. Water is stirred less, so a stream a tile wide stays whole. The falls and the overhang's floor
   * (`HARD`) keep their own tiles exactly and never reach into others.
   */
  private owner(wx: number, wy: number): number {
    const own = this.terrainAt(Math.floor(wx / TILE), Math.floor(wy / TILE));
    if (HARD.has(own)) return own;
    const fx = wx / TILE - 0.5;
    const fy = wy / TILE - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const u = fx - x0;
    const v = fy - y0;
    const ts = [this.terrainAt(x0, y0), this.terrainAt(x0 + 1, y0), this.terrainAt(x0, y0 + 1), this.terrainAt(x0 + 1, y0 + 1)];
    const ws = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
    for (let k = 0; k < 4; k++) if (HARD.has(ts[k]!)) ts[k] = own;
    if (ts[0] === ts[1] && ts[1] === ts[2] && ts[2] === ts[3]) return ts[0]!;
    let best = own;
    let top = -Infinity;
    for (let k = 0; k < 4; k++) {
      const t = ts[k]!;
      if (ts.indexOf(t) !== k) continue;
      let share = 0;
      for (let j = 0; j < 4; j++) if (ts[j] === t) share += ws[j]!;
      const stir = perlin(this.seed + 300 + t * 5, wx / 7, wy / 7) * 0.3 + perlin(this.seed + 301 + t * 5, wx / 2.5, wy / 2.5) * 0.1;
      const score = share + stir * (isWater(t) ? 0.35 : 1);
      if (score > top) [top, best] = [score, t];
    }
    return best;
  }

  /** A per-tile field read smoothly at a pixel (bilinear between tile centres). */
  private field(f: Float32Array, wx: number, wy: number): number {
    const fx = wx / TILE - 0.5;
    const fy = wy / TILE - 0.5;
    const x0 = Math.max(0, Math.min(SIZE - 1, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(SIZE - 1, Math.floor(fy)));
    const x1 = Math.min(SIZE - 1, x0 + 1);
    const y1 = Math.min(SIZE - 1, y0 + 1);
    const u = Math.max(0, Math.min(1, fx - x0));
    const v = Math.max(0, Math.min(1, fy - y0));
    const a = f[idx(x0, y0)]! + (f[idx(x1, y0)]! - f[idx(x0, y0)]!) * u;
    const b = f[idx(x0, y1)]! + (f[idx(x1, y1)]! - f[idx(x0, y1)]!) * u;
    return a + (b - a) * v;
  }

  private paint(g: CanvasRenderingContext2D, tx0: number, ty0: number, snow: number): void {
    // Who owns each pixel, with a 2 px margin so the shore can look across a chunk's edge.
    const M = 2;
    const W = CPX + 2 * M;
    const own = new Uint8Array(W * W);
    const px0 = tx0 * TILE - M;
    const py0 = ty0 * TILE - M;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) own[y * W + x] = this.owner(px0 + x, py0 + y);
    const img = g.createImageData(CPX, CPX);
    const d = img.data;
    const seed = this.seed;
    for (let y = 0; y < CPX; y++) {
      for (let x = 0; x < CPX; x++) {
        const wx = tx0 * TILE + x;
        const wy = ty0 * TILE + y;
        const k = (y + M) * W + (x + M);
        const t = own[k]!;
        const tile = idx(Math.floor(wx / TILE), Math.floor(wy / TILE));
        const water = isWater(t);
        // How close the nearest pixel of the other kind (water or land) is, up to 2.
        let near = 99;
        for (let r = 1; r <= 2 && near === 99; r++) {
          if (isWater(own[k - r]!) !== water || isWater(own[k + r]!) !== water || isWater(own[k - r * W]!) !== water || isWater(own[k + r * W]!) !== water) near = r;
        }
        let c = this.colour(t, wx, wy, tile, seed);
        if (water && near === 1) c = lerp(c, FOAM, 0.75);
        else if (water && near === 2) c = lerp(c, FOAM, 0.25);
        else if (!water && near <= 2 && t !== T.cliff && t !== T.headwall) c = lerp(c, WET, near === 1 ? 0.28 : 0.14);
        // Trails: a worn line joining the trail tiles.
        if (!water && this.w.flags[tile]! & FLAG.trail) {
          const lx = wx % TILE - 7.5;
          const ly = wy % TILE - 7.5;
          const tx = Math.floor(wx / TILE);
          const ty = Math.floor(wy / TILE);
          const tr = (dx: number, dy: number) => (this.w.flags[idx(tx + dx, ty + dy)] ?? 0) & FLAG.trail;
          const e = tr(1, 0);
          const wv = tr(-1, 0);
          const s = tr(0, 1);
          const n = tr(0, -1);
          let dist: number;
          if ((e ? 1 : 0) + (wv ? 1 : 0) + (s ? 1 : 0) + (n ? 1 : 0) === 2 && (e || wv) && (n || s)) {
            // A turn (one step of a trail running on a slant): cut across the corner, edge to edge, so a
            // staircase of tiles reads as one slanting line.
            const hx = e ? 1 : -1;
            const hy = s ? 1 : -1;
            dist = Math.abs(lx * hy + ly * hx - 8 * hx * hy) / Math.SQRT2;
          } else {
            dist = Math.hypot(lx, ly);
            if (e && lx > 0) dist = Math.min(dist, Math.abs(ly));
            if (wv && lx < 0) dist = Math.min(dist, Math.abs(ly));
            if (s && ly > 0) dist = Math.min(dist, Math.abs(lx));
            if (n && ly < 0) dist = Math.min(dist, Math.abs(lx));
          }
          const wob = perlin(seed + 31, wx / 3, wy / 3) * 1.5;
          if (dist + wob < 2.2) c = lerp(c, PATH, 0.45 + rh(wx, wy, 33) * 0.15);
        }
        // Snow lying where the snowline has come down to.
        if (this.w.band[tile]! >= snow && !water && t !== T.cliff && t !== T.headwall) {
          const patch = 0.6 + perlin(seed + 35, wx / 9, wy / 9) * 0.6;
          c = lerp(c, SNOW, Math.max(0, Math.min(0.92, patch)));
        }
        const s = 1 + this.field(this.shade, wx, wy);
        const o = (y * CPX + x) * 4;
        d[o] = Math.max(0, Math.min(255, c[0] * s));
        d[o + 1] = Math.max(0, Math.min(255, c[1] * s));
        d[o + 2] = Math.max(0, Math.min(255, c[2] * s));
        d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    for (let ty = ty0; ty < ty0 + CHUNK; ty++) {
      for (let tx = tx0; tx < tx0 + CHUNK; tx++) {
        const tile = idx(tx, ty);
        if (this.w.band[tile]! >= snow) continue;
        decorate(g, this.w, tx, ty, (tx - tx0) * TILE, (ty - ty0) * TILE, this.mood[tile]!, seed);
        this.crevasses(g, tx, ty, (tx - tx0) * TILE, (ty - ty0) * TILE);
      }
    }
  }

  /**
   * Glacier ice at a world pixel: blue-white, whiter where snow lies on it, and dirty with the rock it
   * carries toward its edges. `ice` is how deep inside the glacier the pixel is (1 well inside).
   * Crevasses are drawn over it afterwards (`crevasses`).
   */
  private glacier(wx: number, wy: number, ice: number, seed: number): RGB {
    let c = lerp(C('#c9d9df'), SNOW, Math.max(0, perlin(seed + 74, wx / 18, wy / 18) + 0.15));
    const grit = rh(wx, wy, 19);
    if (ice < 0.85 && grit < (0.85 - ice) * 1.2) c = lerp(c, C(grit < 0.1 ? '#5e5a52' : '#8f8a7e'), 0.6);
    return c;
  }

  /**
   * A glacier tile's crevasses: soft blue cracks across the way the ice flows (so they run along its
   * contours, bowed downstream), only in a few fields where the ice bends; most of the ice is smooth.
   */
  private crevasses(g: CanvasRenderingContext2D, tx: number, ty: number, ox: number, oy: number): void {
    const i = idx(tx, ty);
    if (!this.ice[i] || perlin(this.seed + 72, tx / 6, ty / 6) < 0.18 || rh(tx, ty, 70) < 0.35) return;
    const fx = this.flowX[i]!;
    const fy = this.flowY[i]!;
    const cx = ox + 4 + rh(tx, ty, 71) * 8;
    const cy = oy + 4 + rh(tx, ty, 73) * 8;
    const half = 2 + rh(tx, ty, 75) * 2.5;
    for (let s = -half; s <= half; s += 0.5) {
      // Across the flow, bowed a little down it toward the middle.
      const bow = (1 - (s * s) / (half * half)) * 1.2;
      const x = Math.round(cx - fy * s + fx * bow);
      const y = Math.round(cy + fx * s + fy * bow);
      // (x, y) are chunk pixels; the chunk's corner is at world pixel (tx * TILE - ox, ty * TILE - oy).
      if (this.field(this.ice, x + tx * TILE - ox, y + ty * TILE - oy) < 0.85) continue;
      dot(g, x, y, Math.abs(s) > half - 1 ? '#9cb9c6' : '#6b8fa2');
    }
  }

  /** The colour of ground `t` at a world pixel, before shore, trail, snow, and shade. */
  private colour(t: number, wx: number, wy: number, tile: number, seed: number): RGB {
    const h = rh(wx, wy, 3);
    const mottle = perlin(seed + 41, wx / 6, wy / 6) * 0.07;
    const bright = 1 + this.field(this.bright, wx, wy) + mottle;
    let c: RGB;
    if (t === T.shallows || t === T.deep) {
      const dep = Math.min(1, Math.max(0, (this.field(this.depth, wx, wy) - 0.6) / 5));
      c = lerp(SHALLOW, DEEP, dep * dep * (3 - 2 * dep));
      // Wind lines on open water: short pale dashes, and slow swells of darker and lighter.
      const swell = perlin(seed + 47, wx / 14, wy / 7) * 0.08;
      c = [c[0] * (1 + swell), c[1] * (1 + swell), c[2] * (1 + swell)];
      if (rh(Math.floor(wx / 4), wy, 49) < 0.012) c = lerp(c, SHALLOW, 0.6);
    } else if (t === T.stream || t === T.gravel) {
      c = STREAM;
      // Ripples across the current, and stones showing through on the gravel.
      if (rh(wx, Math.floor(wy / 2), 5) < 0.04) c = lerp(c, FOAM, 0.45);
      if (t === T.gravel && h < 0.22) c = lerp(c, C(h < 0.1 ? '#9c8c62' : '#6f706a'), 0.55);
    } else if (t === T.waterfall) {
      c = lerp(FOAM, SNOW, rh(wx, 0, 7) * 0.6);
    } else {
      const m = MOOD[t];
      c = m ? lerp(m[0], m[1], this.mood[tile]!) : BASE[t]!;
      switch (t) {
        case T.meadow:
        case T.highMeadow: {
          // Grass: short vertical strokes, light and dark.
          const blade = rh(wx, Math.floor(wy / 3), 9);
          if (blade < 0.12) c = lerp(c, C('#a9b86a'), 0.35);
          else if (blade > 0.9) c = lerp(c, C('#3f5a2c'), 0.35);
          break;
        }
        case T.forest:
          if (h < 0.06) c = lerp(c, C('#5a4634'), 0.6);
          else if (h > 0.93) c = lerp(c, C('#4f6a3a'), 0.5);
          break;
        case T.reeds: {
          const stalk = rh(wx, Math.floor(wy / 5), 11);
          if (stalk < 0.16) c = lerp(c, C('#a3a560'), 0.5);
          else if (stalk > 0.9) c = lerp(c, C('#3e4a2a'), 0.4);
          break;
        }
        case T.sand:
          if (h < 0.08) c = lerp(c, C('#9c8c62'), 0.5);
          else if ((wy + Math.floor(perlin(seed + 43, wx / 10, wy / 10) * 6)) % 7 === 0) c = lerp(c, C('#ad9d70'), 0.35);
          break;
        case T.marsh: {
          // A wet meadow: sedge in tussocks, and small pools of standing water with a glint of sky.
          const sedge = rh(wx, Math.floor(wy / 3), 15);
          if (sedge < 0.14) c = lerp(c, C('#9aa35c'), 0.4);
          else if (sedge > 0.9) c = lerp(c, C('#34432a'), 0.4);
          const pool = perlin(seed + 45, wx / 4, wy / 4) + perlin(seed + 46, wx / 1.7, wy / 1.7) * 0.18;
          if (pool > 0.4) c = lerp(C('#4f6d6c'), C('#7d9a98'), rh(wx, wy, 16) < 0.06 ? 0.8 : 0.1);
          else if (pool > 0.33) c = lerp(c, C('#3d4a30'), 0.5);
          break;
        }
        case T.snow: {
          const ice = this.field(this.ice, wx, wy);
          // Snowfield: wind-packed, faintly rippled, with blue in its hollows.
          const hollow = perlin(seed + 73, wx / 10, wy / 10);
          c = lerp(c, C('#c4d0d8'), Math.max(0, hollow) * 0.5);
          if (rh(Math.floor(wx / 5), wy, 17) < 0.05) c = lerp(c, C('#d3dbe0'), 0.6);
          if (ice > 0.02) c = lerp(c, this.glacier(wx, wy, ice, seed), Math.min(1, ice * 1.6));
          break;
        }
        case T.cliff:
        case T.headwall: {
          // Weathered rock: mottled light and dark, with a few broken fractures (each with a lit lip
          // above), and lichen here and there. The rocks standing on it give the relief.
          const mott = perlin(seed + 80, wx / 9, wy / 9) * 0.5 + perlin(seed + 83, wx / 3, wy / 3) * 0.2;
          c = lerp(c, mott > 0 ? C('#8c8f8a') : C('#4c5052'), Math.abs(mott) * 0.9);
          if (perlin(seed + 82, wx / 14, wy / 14) > 0.12) {
            if (Math.abs(perlin(seed + 81, wx / 10, wy / 10)) < 0.01) c = lerp(c, C('#2b2e31'), 0.45);
            else if (Math.abs(perlin(seed + 81, wx / 10, (wy + 1) / 10)) < 0.01) c = lerp(c, C('#b3b5ad'), 0.25);
          }
          if (h < 0.025) c = lerp(c, C(h < 0.008 ? '#b58f4a' : '#8f9a66'), 0.5);
          break;
        }
        case T.talus:
        case T.scree:
        case T.boulders:
          if (h < 0.1) c = lerp(c, C('#c4c9c4'), 0.35);
          else if (h > 0.88) c = lerp(c, C('#3b4350'), 0.35);
          break;
        case T.rock:
          if (h < 0.03) c = lerp(c, C('#b5864a'), 0.4);
          else if (h > 0.97) c = lerp(c, C('#8f9a6a'), 0.4);
          break;
        case T.shelter:
          if (h < 0.1) c = lerp(c, C('#3b4350'), 0.4);
          break;
      }
    }
    return [c[0] * bright, c[1] * bright, c[2] * bright];
  }
}

// ---- Ground detail: drawn only, in sizes (SPEC 6.8) ----

function dot(g: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1): void {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

const FLOWERS = ['#e7e2cf', '#e4c24e', '#9b7fb8', '#c9604a', '#7fa0c9'];

function grassClump(g: CanvasRenderingContext2D, x: number, y: number, size: number, dark: string, light: string): void {
  const n = 2 + size * 2;
  for (let k = 0; k < n; k++) {
    const bx = x + k - Math.floor(n / 2);
    const h = 2 + size + ((k * 7) % 3);
    const lean = k < n / 2 ? -1 : k > n / 2 ? 1 : 0;
    dot(g, bx, y - h + 1, k % 2 ? light : dark, 1, h - 1);
    dot(g, bx + lean, y - h, k % 2 ? light : dark);
  }
}

function rock(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, body: string, lit: string, dark: string): void {
  dot(g, x + 1, y + h, 'rgba(0,0,0,0.25)', w, 1);
  dot(g, x, y + 1, body, w, h - 1);
  dot(g, x + 1, y, body, w - 2, 1);
  dot(g, x + 1, y + 1, lit, Math.max(1, w - 3), 1);
  dot(g, x + w - 1, y + 2, dark, 1, Math.max(1, h - 2));
  dot(g, x + 1, y + h - 1, dark, w - 1, 1);
}

function fern(g: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const c = '#4f7a3e';
  const d = '#2f4a28';
  const len = 3 + size * 2;
  for (const dir of [-1, 1]) {
    for (let k = 0; k < len; k++) {
      dot(g, x + dir * k, y - Math.floor(k / 2) - (k > len - 2 ? 1 : 0), k % 2 ? c : d);
      if (k % 2 === 0 && k > 0) dot(g, x + dir * k, y - Math.floor(k / 2) + 1, c);
    }
  }
  dot(g, x, y - len + 1, d, 1, len - 1);
}

/** Scatter a tile's drawn detail: what, how big, and how much, from its ground, hash, and the mood field. */
function decorate(g: CanvasRenderingContext2D, w: World, tx: number, ty: number, ox: number, oy: number, mood: number, seed: number): void {
  const t = w.terrain[idx(tx, ty)]!;
  const f = w.feature[idx(tx, ty)]!;
  const blocked = f !== F.none && f !== F.plant && f !== F.herb;
  const r = (k: number) => rh(tx, ty, 60 + k);
  const at = (k: number) => [ox + 2 + Math.floor(r(k) * 12), oy + 3 + Math.floor(r(k + 50) * 12)] as const;
  const flowerField = perlin(seed + 51, tx / 6, ty / 6);
  switch (t) {
    case T.meadow:
    case T.highMeadow: {
      const clumps = (r(1) < 0.55 ? 1 : 0) + (r(2) < 0.25 ? 1 : 0);
      for (let k = 0; k < clumps; k++) {
        const [x, y] = at(3 + k);
        grassClump(g, x, y, r(5 + k) < 0.2 ? 2 : r(5 + k) < 0.6 ? 1 : 0, '#4e6a35', mood < 0.5 ? '#8fae5a' : '#a3a862');
      }
      // Flowers come in drifts, where the flower field is high.
      if (flowerField > 0.12 || (t === T.highMeadow && flowerField > -0.05)) {
        const col = FLOWERS[Math.floor((perlin(seed + 52, tx / 9, ty / 9) + 0.7) * 3.5) % FLOWERS.length]!;
        const n = 1 + Math.floor(r(7) * 4);
        for (let k = 0; k < n; k++) {
          const [x, y] = at(8 + k);
          dot(g, x, y + 1, '#3f5a2c');
          dot(g, x, y, col);
          if (r(20 + k) < 0.3) dot(g, x + 1, y, col);
        }
      }
      if (!blocked && r(9) < 0.06) {
        const [x, y] = at(10);
        rock(g, x, y, 3, 3, '#8b877b', '#b9b6aa', '#5f5d56');
      }
      break;
    }
    case T.forest: {
      // Ferns grow in damp hollows: where the mood field is lush.
      if (!blocked && r(1) < 0.12 + (1 - mood) * 0.3) {
        const [x, y] = at(2);
        fern(g, x, y, r(3) < 0.3 ? 2 : r(3) < 0.7 ? 1 : 0);
      }
      if (r(4) < 0.35) {
        const [x, y] = at(5);
        dot(g, x, y, 'rgba(70,100,55,0.55)', 3 + Math.floor(r(6) * 3), 2);
      }
      if (!blocked && r(7) < 0.07) {
        const [x, y] = at(8);
        rock(g, x, y, 4, 3, '#6f706a', '#9a9a92', '#3b4350');
      }
      break;
    }
    case T.scrub: {
      if (r(1) < 0.6) {
        const [x, y] = at(2);
        const s = r(3) < 0.3 ? 2 : 1;
        dot(g, x - s, y - s, '#4f5a38', 2 * s + 2, s + 1);
        dot(g, x - s + 1, y - s - 1, '#66724a', 2 * s, 1);
      }
      break;
    }
    case T.sand: {
      for (let k = 0; k < 3; k++) {
        if (r(k) < 0.35) {
          const [x, y] = at(4 + k);
          dot(g, x, y, r(9 + k) < 0.5 ? '#8f8a7d' : '#d8cba3', 1 + (r(12 + k) < 0.3 ? 1 : 0), 1);
        }
      }
      break;
    }
    case T.marsh: {
      // Sedge tussocks, and here and there the white tufts of a cotton sedge.
      const n = (r(1) < 0.6 ? 1 : 0) + (r(2) < 0.3 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const [x, y] = at(3 + k);
        grassClump(g, x, y, r(5 + k) < 0.3 ? 2 : 1, '#3e4a2a', '#8d9450');
      }
      if (r(9) < 0.25) {
        const [x, y] = at(10);
        dot(g, x, y + 1, '#55603a', 1, 2);
        dot(g, x, y, '#eeeee4');
      }
      break;
    }
    case T.talus:
    case T.scree:
    case T.boulders: {
      const n = t === T.boulders ? 2 : 3;
      for (let k = 0; k < n; k++) {
        if (r(k) > 0.7) continue;
        const [x, y] = at(4 + k);
        const big = t === T.boulders ? r(10 + k) < 0.45 : r(10 + k) < 0.15;
        const sw = big ? 6 + Math.floor(r(14 + k) * 3) : 2 + Math.floor(r(14 + k) * 3);
        rock(g, Math.min(x, ox + TILE - sw - 1), Math.min(y, oy + TILE - 5), sw, big ? 5 : 2 + Math.floor(sw / 2), '#8f8b80', '#c4c3b8', '#56544d');
      }
      break;
    }
    case T.rock: {
      if (r(1) < 0.5) {
        const [x, y] = at(2);
        dot(g, x, y, '#5a5850', 1 + Math.floor(r(3) * 4), 1);
        dot(g, x + 2, y + 1, '#5a5850', 1, 1 + Math.floor(r(4) * 2));
      }
      if (r(5) < 0.25) {
        const [x, y] = at(6);
        dot(g, x, y, r(7) < 0.5 ? '#b5864a' : '#97a06a', 2, 1);
      }
      break;
    }
  }
  if (w.band[idx(tx, ty)] === BAND.alpine && (t === T.highMeadow || t === T.rock) && r(30) < 0.3) {
    const [x, y] = at(31);
    dot(g, x, y, '#e7e2cf');
  }
}
