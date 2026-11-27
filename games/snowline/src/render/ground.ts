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
import { findFalls } from './falls.ts';
import { rh } from './tiles.ts';

const TILE = 16;
const CHUNK = 16;
const CPX = CHUNK * TILE;
const SIZE = 256;
const MAX_CHUNKS = 28;

type RGB = [number, number, number];

/** Grounds whose tiles keep their exact squares: the overhang's floor. */
const HARD = new Set<number>([T.shelter]);

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
const ICE = C('#b4ccd6');
const ICE_BAND = C('#8fadbb');
const ICE_DIRT = C('#8a877d');
const ICE_FACE = C('#6f8f9e');
const FIRN = C('#e6ecec');
/** Falling water's colour between its white streaks, and the wet rock of its ledges and banks. */
const FALL_WATER = C('#4c8890');
const FALL_ROCK = C('#3a4244');
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
  /**
   * Glacier ice per tile: how many tiles in from its edge (`iceIn`, 1 at the edge, up to 8); how far up
   * its own glacier it lies (`iceUp`, 0 at the snout, 1 at the top); how steep it is there (`iceSteep`,
   * relative to that glacier's typical slope).
   */
  private readonly iceIn: Float32Array;
  private readonly iceUp: Float32Array;
  private readonly iceSteep: Float32Array;
  /** Meltwater runnels on the bare ice: per tile, the pixels (x, y within the tile) they cross. */
  private readonly runnels = new Map<number, number[]>();
  /** Game trails as lines: per tile, the smoothed segments (world pixels x0, y0, x1, y1) near it. */
  private readonly trailSegs = new Map<number, number[]>();
  /** Per tile, 1 where the worn path shows (FLAG.trail); read smoothly, it thins the line out at the ends. */
  private readonly tread: Float32Array;
  /** The way the water runs on each tile of a waterfall. */
  private readonly fallDir: Map<number, [number, number]>;
  /** Ice caves where meltwater comes out: per ice tile, the side (0 south, 1 east, 2 west, 3 north). */
  private readonly portals = new Map<number, number>();

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
    this.iceIn = new Float32Array(n);
    this.iceUp = new Float32Array(n);
    this.iceSteep = new Float32Array(n);
    this.fallDir = findFalls(world).dir;
    this.tread = new Float32Array(n);
    for (let i = 0; i < n; i++) this.tread[i] = world.flags[i]! & FLAG.trail ? 1 : 0;
    for (const line of world.trailLines ?? []) this.indexTrail(line);
    for (let i = 0; i < n; i++) {
      this.ice[i] = world.flags[i]! & FLAG.glacier ? 1 : 0;
    }
    const slope = new Float32Array(n);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        // Downhill over a few tiles, so the crevasses don't jump at each tile's edge.
        const e = (dx: number, dy: number) => world.elev[idx(Math.max(0, Math.min(SIZE - 1, x + dx)), Math.max(0, Math.min(SIZE - 1, y + dy)))]!;
        const gx = e(-3, 0) - e(3, 0) + (e(-3, -2) - e(3, -2) + e(-3, 2) - e(3, 2)) * 0.5;
        const gy = e(0, -3) - e(0, 3) + (e(-2, -3) - e(-2, 3) + e(2, -3) - e(2, 3)) * 0.5;
        const len = Math.hypot(gx, gy);
        this.flowX[idx(x, y)] = len ? gx / len : 0;
        this.flowY[idx(x, y)] = len ? gy / len : 1;
        slope[idx(x, y)] = len;
      }
    }
    this.measureIce(slope);
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

  /** Each glacier's shape for drawing: depth in from its edge, height up it, and where it steepens. */
  private measureIce(slope: Float32Array): void {
    const n = SIZE * SIZE;
    const ice = this.ice;
    // Depth in from the edge: a breadth-first walk in from every ice tile that touches open ground.
    const q: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!ice[i]) continue;
      const x = i % SIZE;
      const y = (i - x) / SIZE;
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && !ice[idx(nx, ny)]) edge = true;
      }
      this.iceIn[i] = edge ? 1 : 99;
      if (edge) q.push(i);
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
        if (ice[j] && this.iceIn[j]! > this.iceIn[i]! + 1) {
          this.iceIn[j] = this.iceIn[i]! + 1;
          q.push(j);
        }
      }
    }
    for (let i = 0; i < n; i++) if (ice[i]) this.iceIn[i] = Math.min(8, this.iceIn[i]!);
    // Each glacier on its own: how far up it a tile lies, and its slope against the glacier's median.
    const seen = new Uint8Array(n);
    for (let s = 0; s < n; s++) {
      if (!ice[s] || seen[s]) continue;
      const part = [s];
      seen[s] = 1;
      for (let h = 0; h < part.length; h++) {
        const i = part[h]!;
        const x = i % SIZE;
        const y = (i - x) / SIZE;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
          const j = idx(nx, ny);
          if (ice[j] && !seen[j]) {
            seen[j] = 1;
            part.push(j);
          }
        }
      }
      let lo = Infinity;
      let hi = -Infinity;
      for (const i of part) {
        lo = Math.min(lo, this.w.elev[i]!);
        hi = Math.max(hi, this.w.elev[i]!);
      }
      const slopes = part.map((i) => slope[i]!).sort((a, b) => a - b);
      const median = Math.max(1, slopes[Math.floor(slopes.length / 2)]!);
      for (const i of part) {
        this.iceUp[i] = hi > lo ? (this.w.elev[i]! - lo) / (hi - lo) : 0.5;
        this.iceSteep[i] = slope[i]! / median;
      }
      // The way the ice flows: down the slope of the ice round about (a plane fitted to the ice within
      // five tiles), not off its sides, where the ground falls away to the rock.
      for (const i of part) {
        const x = i % SIZE;
        const y = (i - x) / SIZE;
        let gx = 0;
        let gy = 0;
        for (let dy = -5; dy <= 5; dy++) {
          for (let dx = -5; dx <= 5; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || !ice[idx(nx, ny)]) continue;
            const de = this.w.elev[idx(nx, ny)]! - this.w.elev[i]!;
            gx -= de * dx;
            gy -= de * dy;
          }
        }
        const len = Math.hypot(gx, gy);
        if (len) {
          this.flowX[i] = gx / len;
          this.flowY[i] = gy / len;
        }
      }
    }
    this.traceRunnels();
    // A stream's head beside the ice (no stream above it) comes out of the ice in a cave: in the
    // highest ice tile beside it.
    const SIDES = [[0, 1], [1, 0], [-1, 0], [0, -1]] as const;
    const stream = (t: number) => t === T.stream || t === T.gravel;
    for (let i = 0; i < n; i++) {
      if (!stream(this.w.terrain[i]!)) continue;
      const x = i % SIZE;
      const y = (i - x) / SIZE;
      let head = true;
      let best = -1;
      let side = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
          const j = idx(nx, ny);
          if (stream(this.w.terrain[j]!) && this.w.elev[j]! > this.w.elev[i]!) head = false;
        }
      }
      if (!head) continue;
      SIDES.forEach(([dx, dy], k) => {
        const nx = x - dx;
        const ny = y - dy;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) return;
        const j = idx(nx, ny);
        if (ice[j] && (best < 0 || this.w.elev[j]! > this.w.elev[best]!)) [best, side] = [j, k];
      });
      if (best >= 0) this.portals.set(best, side);
    }
  }

  /**
   * Meltwater runnels: from scattered heads on the bare ice, each runs downhill (the smoothed flow),
   * meandering a little, until it reaches the ice's dirty edge or joins another.
   */
  private traceRunnels(): void {
    const taken = new Set<number>();
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (!this.ice[i] || this.iceIn[i]! < 3) continue;
      const tx = i % SIZE;
      const ty = (i - tx) / SIZE;
      if (rh(tx, ty, 140) > 0.022 || this.firn(tx * TILE + 8, ty * TILE + 8) > 0.2) continue;
      let x = tx * TILE + 2 + rh(tx, ty, 141) * 12;
      let y = ty * TILE + 2 + rh(tx, ty, 142) * 12;
      let last = -1;
      for (let step = 0; step < 220; step++) {
        const fx = this.field(this.flowX, x, y);
        const fy = this.field(this.flowY, x, y);
        const turn = perlin(this.seed + 143, x / 11, y / 11) * 1.1;
        const ct = Math.cos(turn);
        const st = Math.sin(turn);
        const len = Math.hypot(fx, fy) || 1;
        x += (fx * ct - fy * st) / len;
        y += (fx * st + fy * ct) / len;
        if (this.field(this.ice, x, y) < 0.92 || this.field(this.iceIn, x, y) < 1.5) break;
        const px = Math.floor(x);
        const py = Math.floor(y);
        const key = py * SIZE * TILE + px;
        if (key === last) continue;
        if (taken.has(key) && step > 3) break;
        taken.add(key);
        last = key;
        const tile = idx(Math.floor(px / TILE), Math.floor(py / TILE));
        let list = this.runnels.get(tile);
        if (!list) this.runnels.set(tile, (list = []));
        list.push(px % TILE, py % TILE);
      }
    }
  }

  /**
   * A trail's line: its bend points' tile centres, the corners rounded (twice cut, never by more than a
   * tile and a bit, so the line stays on the tiles the trail was laid on), each segment listed on every
   * tile within a tile of it.
   */
  private indexTrail(bends: number[]): void {
    let pts = bends.map((i) => [(i % SIZE) * TILE + 8, Math.floor(i / SIZE) * TILE + 8] as [number, number]);
    for (let pass = 0; pass < 2 && pts.length > 2; pass++) {
      const next: [number, number][] = [pts[0]!];
      for (let k = 0; k + 1 < pts.length; k++) {
        const [ax, ay] = pts[k]!;
        const [bx, by] = pts[k + 1]!;
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const c = Math.min(0.25, 20 / len);
        if (k > 0) next.push([ax + (bx - ax) * c, ay + (by - ay) * c]);
        if (k + 2 < pts.length) next.push([ax + (bx - ax) * (1 - c), ay + (by - ay) * (1 - c)]);
      }
      next.push(pts[pts.length - 1]!);
      pts = next;
    }
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k]!;
      const [bx, by] = pts[k + 1]!;
      const tx0 = Math.max(0, Math.floor((Math.min(ax, bx) - TILE) / TILE));
      const ty0 = Math.max(0, Math.floor((Math.min(ay, by) - TILE) / TILE));
      const tx1 = Math.min(SIZE - 1, Math.floor((Math.max(ax, bx) + TILE) / TILE));
      const ty1 = Math.min(SIZE - 1, Math.floor((Math.max(ay, by) + TILE) / TILE));
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (segDist(tx * TILE + 8, ty * TILE + 8, ax, ay, bx, by) > TILE * 1.25) continue;
          const t = idx(tx, ty);
          let list = this.trailSegs.get(t);
          if (!list) this.trailSegs.set(t, (list = []));
          list.push(ax, ay, bx, by);
        }
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
   * patch. Water is stirred less, so a stream a tile wide stays whole. The overhang's floor (`HARD`)
   * keeps its own tiles exactly and never reaches into others.
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
        // Beside falling water the banks are wet dark rock: a little gorge.
        if (!water) {
          for (let r = 1; r <= M; r++) {
            if (own[k - r] === T.waterfall || own[k + r] === T.waterfall || own[k - r * W] === T.waterfall || own[k + r * W] === T.waterfall) {
              c = lerp(c, FALL_ROCK, r === 1 ? 0.85 : 0.55);
              break;
            }
          }
        }
        // A glacier stands up off the ground: its snout and sides facing the viewer are a low wall of ice
        // in shade, and its far edge catches the light.
        if (t === T.snow && this.field(this.ice, wx, wy) > 0.5) {
          if (own[k + W] !== T.snow || own[k + 2 * W] !== T.snow) c = lerp(c, ICE_FACE, own[k + W] !== T.snow ? 0.8 : 0.55);
          else if (own[k - W] !== T.snow) c = lerp(c, SNOW, 0.6);
        }
        // Trails: each one a worn line along its route, wherever the ground holds a tread, thinning out
        // where it doesn't. Two trails side by side are two paths, braided, never joined by rungs.
        const segs = water ? undefined : this.trailSegs.get(tile);
        if (segs) {
          const tread = this.field(this.tread, wx, wy);
          if (tread > 0.3) {
            let dist = Infinity;
            for (let q = 0; q < segs.length; q += 4) dist = Math.min(dist, segDist(wx + 0.5, wy + 0.5, segs[q]!, segs[q + 1]!, segs[q + 2]!, segs[q + 3]!));
            const width = 1.1 + Math.min(1, (tread - 0.3) / 0.4) * 1.1;
            const wob = perlin(seed + 31, wx / 3, wy / 3) * 1.2;
            if (dist + wob < width) c = lerp(c, PATH, 0.45 + rh(wx, wy, 33) * 0.15);
          }
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

  /** How snowed-over glacier ice is at a pixel: 0 bare ice (low on the glacier), 1 firn (high up), with a ragged line between. */
  private firn(wx: number, wy: number): number {
    const up = this.field(this.iceUp, wx, wy) + perlin(this.seed + 75, wx / 30, wy / 30) * 0.3 + perlin(this.seed + 78, wx / 7, wy / 7) * 0.035;
    return Math.max(0, Math.min(1, (up - 0.55) * 6));
  }

  /**
   * Glacier ice at a world pixel. Low on the glacier it's bare: blue-grey, crossed by faint bands where
   * each year's ice comes down (along the contours, so they bow downstream), with a sparkle here and
   * there. High up it's under old snow (`firn`). Toward its edges it's dirty with the rock it carries, in
   * blotches with stones in them. Crevasses and the raised edge are drawn over it (`crevasses`, `paint`).
   */
  private glacier(wx: number, wy: number, seed: number): RGB {
    // Bare ice: blue-grey, a little bluer here and there, with a sparkle now and then.
    let c = lerp(ICE, ICE_BAND, Math.max(0, perlin(seed + 76, wx / 24, wy / 24)) * 0.5);
    if (rh(wx, wy, 20) < 0.005) c = SNOW;
    // Old snow high up, its lower edge ragged and crisp, with wind ripples.
    const firn = this.firn(wx, wy);
    if (firn > 0.5) {
      c = firn < 0.6 ? lerp(FIRN, ICE, 0.35) : FIRN;
      if (rh(Math.floor(wx / 4), wy, 21) < 0.06) c = lerp(c, C('#c9d6dc'), 0.7);
    }
    // Rock carried along the sides: dirty ice in blotches, stones lying in it.
    const inside = this.field(this.iceIn, wx, wy);
    const dirt = 1.2 - inside / 1.4 + perlin(seed + 77, wx / 5, wy / 5) * 0.7;
    if (dirt > 0.45) {
      c = lerp(c, ICE_DIRT, firn > 0.5 ? 0.3 : 0.5);
      const st = rh(Math.floor(wx / 2), Math.floor(wy / 2), 19);
      if (st < (dirt - 0.45) * 0.12) c = C(st < 0.02 ? '#4e4b44' : '#77746b');
    }
    return c;
  }

  /**
   * A glacier tile's crevasses: where the ice steepens and near its sides (where it drags past the rock),
   * low on the glacier where it's bare, sets of long cracks across the way the ice flows, bowed down it;
   * each a dark blue slot with its far wall lit. Where meltwater leaves the ice, a dark cave mouth.
   */
  private crevasses(g: CanvasRenderingContext2D, tx: number, ty: number, ox: number, oy: number): void {
    const i = idx(tx, ty);
    if (!this.ice[i]) return;
    const ww = tx * TILE - ox;
    const wh = ty * TILE - oy;
    const run = this.runnels.get(i);
    if (run) {
      for (let k = 0; k < run.length; k += 2) dot(g, ox + run[k]!, oy + run[k + 1]!, '#7fa8bb');
    }
    // The meltwater's cave, where a stream comes out from under the ice.
    const side = this.portals.get(i);
    if (side !== undefined) {
      const [dx, dy] = ([[0, 1], [1, 0], [-1, 0], [0, -1]] as const)[side]!;
      const cx = ox + 8 + dx * 5;
      const cy = oy + 8 + dy * 5;
      for (let a = -3; a <= 3; a++) {
        const r = 3.5 - (a * a) / 5;
        for (let b = 0; b < r; b++) {
          const x = Math.round(cx + (dy ? a : -dx * b));
          const y = Math.round(cy + (dy ? -dy * b : a));
          dot(g, x, y, b > r - 1.2 ? '#6d93a6' : '#24394a');
        }
      }
      return;
    }
    const steep = this.iceSteep[i]!;
    const inside = this.iceIn[i]!;
    const chance = (steep - 1.15) * 1.6 + (inside === 2 || inside === 3 ? 0.4 : 0) + perlin(this.seed + 72, tx / 5, ty / 5) * 0.6;
    if (inside < 2 || this.firn(ww + 8, wh + 8) > 0.6 || rh(tx, ty, 70) > chance) return;
    const fx = this.flowX[i]!;
    const fy = this.flowY[i]!;
    // Near the sides the cracks lean up-glacier toward the middle; elsewhere they run straight across.
    const lean = inside <= 3 ? (rh(tx, ty, 74) - 0.5) * 1.2 : (rh(tx, ty, 74) - 0.5) * 0.35;
    const ax = -fy + fx * lean;
    const ay = fx + fy * lean;
    const al = Math.hypot(ax, ay) || 1;
    const sets = rh(tx, ty, 76) < 0.55 ? 2 : 1;
    for (let k = 0; k < sets; k++) {
      const cx = ox + 8 + (rh(tx, ty, 71 + k) - 0.5) * 5 + fx * (k ? 5 : -1);
      const cy = oy + 8 + (rh(tx, ty, 73 + k) - 0.5) * 5 + fy * (k ? 5 : -1);
      const half = 4 + rh(tx, ty, 75 + k) * 4;
      for (let s = -half; s <= half; s += 0.5) {
        const bow = (1 - (s * s) / (half * half)) * 0.9;
        const x = Math.round(cx + (ax / al) * s + fx * bow);
        const y = Math.round(cy + (ay / al) * s + fy * bow);
        if (this.field(this.ice, x + ww, y + wh) < 0.9 || this.field(this.iceIn, x + ww, y + wh) < 1.6) continue;
        const end = Math.abs(s) > half - 1.5;
        dot(g, x, y, end ? '#7ea3b5' : '#2e5770');
        // The far wall, lit: one pixel down the flow from the slot.
        if (!end) dot(g, Math.round(x + fx), Math.round(y + fy), '#a9c8d4');
      }
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
      // A cascade down the river's own bed: ledges of wet dark rock across the flow every few pixels, the
      // water pouring white over each (most of the way across), churned white below it, then running on
      // green-blue with white streaks along the flow.
      const [fx, fy] = this.fallDir.get(tile) ?? [0, 1];
      const along = wx * fx + wy * fy;
      const across = -wx * fy + wy * fx;
      const step = (((along + perlin(seed + 64, across / 4, 0.5) * 3) / 7) % 1 + 1) % 1;
      const pours = perlin(seed + 65, across / 3, Math.floor(along / 7)) > -0.25;
      const n = perlin(seed + 62, along / 9, across / 1.6) + perlin(seed + 63, along / 3, across / 1.1) * 0.35;
      if (step < 0.16) c = pours ? C('#f4f8f6') : FALL_ROCK;
      else if (step < 0.42) c = lerp(C('#f4f8f6'), FALL_WATER, (step - 0.16) * 1.6 + (n > 0.2 ? 0 : 0.15));
      else c = n > 0.18 ? lerp(FALL_WATER, C('#f4f8f6'), 0.75) : n > -0.05 ? lerp(FALL_WATER, C('#f4f8f6'), 0.3) : FALL_WATER;
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
          if (ice > 0.02) {
            c = lerp(c, this.glacier(wx, wy, seed), Math.min(1, ice * 1.6));
            // Ice is lit flat: the ground's broad light and dark would read on it as fog.
            return [c[0] * (1 + (bright - 1) * 0.25), c[1] * (1 + (bright - 1) * 0.25), c[2] * (1 + (bright - 1) * 0.25)];
          }
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

/** Distance from (px, py) to the segment (ax, ay)–(bx, by). */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

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
export function decorate(g: CanvasRenderingContext2D, w: World, tx: number, ty: number, ox: number, oy: number, mood: number, seed: number): void {
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
