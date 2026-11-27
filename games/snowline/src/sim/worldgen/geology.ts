// Pipeline steps 1–2 (SPEC 6.3): the valley made by its history. The rock is lifted into a ring of
// peaks, higher on one side; glaciers flow from cirques under the high side and carve a U-shaped trough
// down the valley, with side glaciers that leave hanging valleys; the ice leaves a terminal moraine that
// dams the lake, and lateral moraines along the trough; rain erodes gullies and carries sediment down;
// steep soft rock sheds talus. Then the water: every depression fills, the main one behind the moraine
// is the lake, small ones up high are tarns, the lake drains through a gorge in the rim, and flow
// accumulation finds the streams. Only + − × ÷, Math.sqrt, and the in-repo noise (SPEC 11.3, rule 5).

import { T, WATER } from '../../content/terrain.ts';
import { hash2f, makeRng, nextFloat, nextRange, pick, type RngState } from '../rng.ts';
import { SIZE } from '../world.ts';
import { type Gen, xOf, yOf } from './gen.ts';
import { DX8, DY8, N, TileHeap, bfs, forNeighbours4 } from './grid.ts';
import { fbm, perlin } from './noise.ts';

export const MIN_LAKE = 600;
/** The lake's size the moraine is raised or lowered toward, in tiles. */
const LAKE_TARGET = [1500, 3000] as const;
const MIN_STREAM = 30;
/** A channel: at least this much rain (tiles' worth, more up high) drains through the tile. */
const CHANNEL = 600;
/** Raindrops for the erosion, per tile of the map. */
const DROPS_PER_TILE = 1.3;
/** Depth below which filled ground is a puddle, not water. */
const WET = 0.002;

const S = 0.7071067811865476;
const HIGH_SIDES: readonly [number, number][] = [
  [0, -1],
  [S, -S],
  [1, 0],
  [S, S],
  [0, 1],
  [-S, S],
  [-1, 0],
  [-S, -S],
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth01 = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
/** A soft bump: 1 at 0, falling to 0 at |u| = 1. */
const bump = (u: number) => {
  const a = 1 - u * u;
  return a > 0 ? a * a : 0;
};

/** Ridged noise: sharp crests where the noise crosses zero, for spurs and arêtes. Roughly [0, 1]. */
function ridged(seed: number, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let weight = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(perlin((seed + o * 7919) | 0, x * freq, y * freq) * 1.4);
    n = n * n * weight;
    weight = clamp01(n * 1.5);
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** A line sampled along its length (tile units). */
interface Line {
  x: number[];
  y: number[];
}

/** A glacier: its centre line, and its bed height and half-width at each sample. */
interface Ice extends Line {
  bed: number[];
  half: number[];
}

function iceLine(rng: RngState, word: number, from: [number, number], to: [number, number], wander: number, samples: number): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const salt = Math.floor(nextFloat(rng) * 1000);
  for (let k = 0; k < samples; k++) {
    const t = k / (samples - 1);
    // Bends, fading to nothing at both ends so the line meets its cirque and its junction.
    const m = perlin((word + 911 + salt) | 0, t * 2.3, salt * 0.37) * wander * 4 * t * (1 - t);
    x.push(from[0] + dx * t + px * m);
    y.push(from[1] + dy * t + py * m);
  }
  return { x, y };
}

/** Nearest point on a glacier's line to (x, y): the distance and the position along it (0–1). */
function nearestOn(ice: Line, x: number, y: number): { d: number; t: number } {
  let best = Infinity;
  let bt = 0;
  const n = ice.x.length;
  for (let k = 0; k < n - 1; k++) {
    const ax = ice.x[k]!;
    const ay = ice.y[k]!;
    const sx = ice.x[k + 1]! - ax;
    const sy = ice.y[k + 1]! - ay;
    const l2 = sx * sx + sy * sy || 1;
    let u = ((x - ax) * sx + (y - ay) * sy) / l2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = ax + sx * u - x;
    const qy = ay + sy * u - y;
    const d2 = qx * qx + qy * qy;
    if (d2 < best) {
      best = d2;
      bt = (k + u) / (n - 1);
    }
  }
  return { d: Math.sqrt(best), t: bt };
}

/** A line's bounding box, padded. */
function boxOf(ice: Line, pad: number): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let k = 0; k < ice.x.length; k++) {
    x0 = Math.min(x0, ice.x[k]!);
    x1 = Math.max(x1, ice.x[k]!);
    y0 = Math.min(y0, ice.y[k]!);
    y1 = Math.max(y1, ice.y[k]!);
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}
const nearBox = (b: [number, number, number, number], x: number, y: number) => x >= b[0] && y >= b[1] && x <= b[2] && y <= b[3];

const lerpAt = (arr: number[], t: number) => {
  const f = t * (arr.length - 1);
  const k = Math.min(arr.length - 2, Math.floor(f));
  const u = f - k;
  return arr[k]! + (arr[k + 1]! - arr[k]!) * u;
};

/** Carve a U-shaped trough: a flat floor at the bed, walls rising to the old surface at the half-width. */
function carveIce(h: Float64Array, ice: Ice): void {
  let x0 = SIZE;
  let x1 = 0;
  let y0 = SIZE;
  let y1 = 0;
  let maxHalf = 0;
  for (let k = 0; k < ice.x.length; k++) {
    x0 = Math.min(x0, ice.x[k]!);
    x1 = Math.max(x1, ice.x[k]!);
    y0 = Math.min(y0, ice.y[k]!);
    y1 = Math.max(y1, ice.y[k]!);
    maxHalf = Math.max(maxHalf, ice.half[k]!);
  }
  const pad = maxHalf + 2;
  for (let y = Math.max(0, Math.floor(y0 - pad)); y <= Math.min(SIZE - 1, Math.ceil(y1 + pad)); y++) {
    for (let x = Math.max(0, Math.floor(x0 - pad)); x <= Math.min(SIZE - 1, Math.ceil(x1 + pad)); x++) {
      const { d, t } = nearestOn(ice, x + 0.5, y + 0.5);
      const half = lerpAt(ice.half, t);
      if (d >= half) continue;
      const bed = lerpAt(ice.bed, t);
      const i = y * SIZE + x;
      if (h[i]! <= bed) continue;
      const q = d / half;
      // The U: nearly flat across the floor, steepening up the walls.
      const carved = bed + (h[i]! - bed) * q * q * q;
      if (carved < h[i]!) h[i] = carved;
    }
  }
}

/** A cirque: a bowl scooped under the peaks at a glacier's head, its floor a little below the bed (a tarn's hollow). */
function carveCirque(h: Float64Array, cx: number, cy: number, r: number, floor: number): void {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(SIZE - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(SIZE - 1, Math.ceil(cx + r)); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const q = Math.sqrt(dx * dx + dy * dy) / r;
      if (q >= 1) continue;
      const i = y * SIZE + x;
      const carved = floor + (h[i]! - floor) * q * q;
      if (carved < h[i]!) h[i] = carved;
    }
  }
}

/** Droplet erosion: each drop runs downhill, picking up sediment where it speeds up and dropping it where it slows. */
function erode(h: Float64Array, hardness: Float64Array, rng: RngState, drops: number): void {
  const R = 3;
  const offs: number[] = [];
  const wts: number[] = [];
  let wsum = 0;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= R) continue;
      offs.push(dx, dy);
      wts.push(R - d);
      wsum += R - d;
    }
  }
  for (let k = 0; k < wts.length; k++) wts[k] = wts[k]! / wsum;
  const INERTIA = 0.05;
  const CAPACITY = 4;
  const MIN_CAP = 0.01;
  const DEPOSIT = 0.3;
  const ERODE = 0.3;
  const EVAPORATE = 0.015;
  const GRAVITY = 4;
  const LIFE = 40;
  /** Height under (x, y), bilinear between the four tiles round it. */
  const heightAt = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const u = x - ix;
    const v = y - iy;
    const i = iy * SIZE + ix;
    return h[i]! * (1 - u) * (1 - v) + h[i + 1]! * u * (1 - v) + h[i + SIZE]! * (1 - u) * v + h[i + SIZE + 1]! * u * v;
  };
  for (let n = 0; n < drops; n++) {
    let x = 2 + nextFloat(rng) * (SIZE - 4);
    let y = 2 + nextFloat(rng) * (SIZE - 4);
    let dirX = 0;
    let dirY = 0;
    let speed = 1;
    let water = 1;
    let sediment = 0;
    for (let life = 0; life < LIFE; life++) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const u = x - ix;
      const v = y - iy;
      const c = iy * SIZE + ix;
      const a00 = h[c]!;
      const a10 = h[c + 1]!;
      const a01 = h[c + SIZE]!;
      const a11 = h[c + SIZE + 1]!;
      const here = a00 * (1 - u) * (1 - v) + a10 * u * (1 - v) + a01 * (1 - u) * v + a11 * u * v;
      const gx = (a10 - a00) * (1 - v) + (a11 - a01) * v;
      const gy = (a01 - a00) * (1 - u) + (a11 - a10) * u;
      dirX = dirX * INERTIA - gx * (1 - INERTIA);
      dirY = dirY * INERTIA - gy * (1 - INERTIA);
      const len = Math.sqrt(dirX * dirX + dirY * dirY);
      if (len === 0) break;
      dirX /= len;
      dirY /= len;
      x += dirX;
      y += dirY;
      if (x < R + 1 || y < R + 1 || x >= SIZE - R - 2 || y >= SIZE - R - 2) break;
      const dh = heightAt(x, y) - here;
      const cap = Math.max(-dh * speed * water * CAPACITY, MIN_CAP);
      const i = iy * SIZE + ix;
      if (sediment > cap || dh > 0) {
        const amount = dh > 0 ? Math.min(dh, sediment) : (sediment - cap) * DEPOSIT;
        sediment -= amount;
        h[i] = h[i]! + amount * (1 - u) * (1 - v);
        h[i + 1] = h[i + 1]! + amount * u * (1 - v);
        h[i + SIZE] = h[i + SIZE]! + amount * (1 - u) * v;
        h[i + SIZE + 1] = h[i + SIZE + 1]! + amount * u * v;
      } else {
        const amount = Math.min((cap - sediment) * ERODE * (1 - hardness[i]! * 0.75), -dh);
        for (let k = 0; k < wts.length; k++) {
          const j = (iy + offs[2 * k + 1]!) * SIZE + ix + offs[2 * k]!;
          const take = amount * wts[k]!;
          const got = h[j]! < take ? h[j]! : take;
          h[j] = h[j]! - got;
          sediment += got;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed + dh * GRAVITY));
      water *= 1 - EVAPORATE;
    }
  }
}

/** Steep soft rock crumbles to talus: material slides from a tile to its lower neighbours past the angle of repose. */
function slump(h: Float64Array, hardness: Float64Array, passes: number): void {
  for (let p = 0; p < passes; p++) {
    const src = h.slice();
    for (let y = 1; y < SIZE - 1; y++) {
      for (let x = 1; x < SIZE - 1; x++) {
        const i = y * SIZE + x;
        const repose = 0.012 + hardness[i]! * 0.05;
        let excess = 0;
        for (let d = 0; d < 8; d++) {
          const n = (y + DY8[d]!) * SIZE + x + DX8[d]!;
          const diff = src[i]! - src[n]! - repose * (d % 2 ? 1.414 : 1);
          if (diff > 0) excess += diff;
        }
        if (excess <= 0) continue;
        const move = Math.min(excess * 0.12, 0.01);
        for (let d = 0; d < 8; d++) {
          const n = (y + DY8[d]!) * SIZE + x + DX8[d]!;
          const diff = src[i]! - src[n]! - repose * (d % 2 ? 1.414 : 1);
          if (diff > 0) {
            const m = (move * diff) / excess;
            h[i] = h[i]! - m;
            h[n] = h[n]! + m;
          }
        }
      }
    }
  }
}

/** Fill every depression from the map's edge inward (priority flood), with a tiny slope so flats drain. Returns the filled surface and the order tiles were reached (lowest first). */
function fill(h: Float64Array): { filled: Float64Array; order: Int32Array } {
  const filled = new Float64Array(N);
  const done = new Uint8Array(N);
  const order = new Int32Array(N);
  let k = 0;
  const heap = new TileHeap();
  for (let i = 0; i < N; i++) {
    const x = xOf(i);
    const y = yOf(i);
    if (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1) {
      filled[i] = h[i]!;
      done[i] = 1;
      heap.push(h[i]!, i);
    }
  }
  while (heap.size) {
    const { tile } = heap.pop();
    order[k++] = tile;
    const x = xOf(tile);
    const y = yOf(tile);
    for (let d = 0; d < 8; d++) {
      const nx = x + DX8[d]!;
      const ny = y + DY8[d]!;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const n = ny * SIZE + nx;
      if (done[n]) continue;
      done[n] = 1;
      filled[n] = Math.max(h[n]!, filled[tile]! + 1e-7);
      heap.push(filled[n]!, n);
    }
  }
  return { filled, order };
}

/**
 * Where each tile drains: its steepest neighbour downhill on the filled surface, or -1 at the edge. With
 * `wander` (a seed word), each drop is weighed by a little per-tile chance, so channels on a smooth slope
 * meander instead of running ruler-straight (randomised D8, as rivers on real slopes do).
 */
function receivers(filled: Float64Array, wander?: number): Int32Array {
  const rec = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    const x = xOf(i);
    const y = yOf(i);
    let best = 0;
    for (let d = 0; d < 8; d++) {
      const nx = x + DX8[d]!;
      const ny = y + DY8[d]!;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const n = ny * SIZE + nx;
      let drop = (filled[i]! - filled[n]!) / (d % 2 ? 1.414 : 1);
      if (wander !== undefined && drop > 0) drop *= 0.55 + hash2f(wander, x, y, 300 + d) * 0.9;
      if (drop > best) {
        best = drop;
        rec[i] = n;
      }
    }
  }
  return rec;
}

/**
 * Breaching: for each closed hollow except the one holding `keep`, cut its outlet down by up to BREACH,
 * from its spill point along the way the water would go, until the ground falls below the cut. Most
 * hollows then drain; deep ones keep a smaller pool.
 */
const BREACH = 0.2;
function breach(h: Float64Array, keep: number): void {
  const { filled } = fill(h);
  const rec = receivers(filled);
  const seen = new Uint8Array(N);
  const flooded = (i: number) => filled[i]! > h[i]! + 1e-9;
  for (let i = 0; i < N; i++) {
    if (seen[i] || !flooded(i)) continue;
    // The hollow: every flooded tile joined to this one, and its lowest point.
    const queue = [i];
    seen[i] = 1;
    let low = i;
    let spared = false;
    while (queue.length) {
      const c = queue.pop()!;
      if (c === keep) spared = true;
      if (h[c]! < h[low]!) low = c;
      forNeighbours4(c, (n) => {
        if (!seen[n] && flooded(n)) {
          seen[n] = 1;
          queue.push(n);
        }
      });
    }
    if (spared) continue;
    const level = filled[low]!;
    const cut = Math.max(h[low]!, level - BREACH);
    // Follow the water out from the bottom; past the rim, cut the ground down to the level until it falls below it.
    let c = low;
    for (let steps = 0; c >= 0 && steps < 300; steps++) {
      if (!flooded(c)) {
        if (h[c]! <= cut) break;
        h[c] = cut;
      }
      c = rec[c]!;
    }
  }
}

/** Steps 1–2: shape the valley and its water. Returns a problem, or null. */
export function shapeValley(g: Gen): string | null {
  const rng = makeRng(g.genSeed, 'geology');
  const w = g.word;
  const [hx, hy] = pick(g.rng, HIGH_SIDES);
  g.high = { x: hx, y: hy };
  const px = -hy;
  const py = hx;
  const C = SIZE / 2;

  // Rock hardness in tilted beds, so harder layers stand out as steps and cliffs.
  const hardness = new Float64Array(N);
  const dipX = (nextFloat(rng) - 0.5) * 0.8;
  const dipY = (nextFloat(rng) - 0.5) * 0.8;
  for (let i = 0; i < N; i++) {
    const x = xOf(i);
    const y = yOf(i);
    const layer = perlin((w + 501) | 0, (x * dipX + y * dipY) / 9 + x / 60, y / 60);
    hardness[i] = clamp01(0.5 + layer * 1.1 + perlin((w + 502) | 0, x / 25, y / 25) * 0.4);
  }

  // The valley's line: the main glacier from its head under the high side down to its snout, then the
  // river on out through the rim. The land is laid out from it: low along the line, falling from the head
  // to the gorge, rising to the ridges either side.
  const head: [number, number] = [C + hx * 96 + px * (nextFloat(rng) - 0.5) * 50, C + hy * 96 + py * (nextFloat(rng) - 0.5) * 50];
  const end: [number, number] = [C - hx * 30 + px * (nextFloat(rng) - 0.5) * 40, C - hy * 30 + py * (nextFloat(rng) - 0.5) * 40];
  const mainLine = iceLine(rng, w, head, end, 26, 72);
  const fx = end[0] - mainLine.x[64]!;
  const fy = end[1] - mainLine.y[64]!;
  const fl = Math.sqrt(fx * fx + fy * fy) || 1;
  const snoutR = 27;
  const outStart: [number, number] = [end[0] + (fx / fl) * snoutR * 1.35, end[1] + (fy / fl) * snoutR * 1.35];
  // On down the valley until well past the map's edge, bending toward the low side.
  const outEnd: [number, number] = [outStart[0] + ((fx / fl) * 0.6 - hx * 0.4) * 200, outStart[1] + ((fy / fl) * 0.6 - hy * 0.4) * 200];
  const outLine = iceLine(rng, w, outStart, outEnd, 14, 40);
  const axis: Line = { x: [...mainLine.x, ...outLine.x], y: [...mainLine.y, ...outLine.y] };

  // 1. Uplift: the valley's floor falling along its line, its sides rising to ridges, peaks and spurs
  // from ridged noise, and the rim high all round the map's edge.
  const h = new Float64Array(N);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const { d, t } = nearestOn(axis, x + 0.5, y + 0.5);
      const floor = 0.7 - 0.62 * t;
      const sides = 0.75 * smooth01(d / 78) + 0.15 * smooth01(d / 20);
      const edge = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y) / C;
      const ring = 0.4 * (1 - smooth01(edge / 0.22));
      const crests = ridged((w + 503) | 0, x / 42, y / 42, 5) * (0.1 + sides * 0.5 + ring * 0.4);
      h[y * SIZE + x] = 0.08 + floor + sides + ring + crests + fbm((w + 504) | 0, x / 60, y / 60, 4) * 0.05;
    }
  }
  const surface = (x: number, y: number) => h[Math.max(0, Math.min(SIZE - 1, Math.floor(y))) * SIZE + Math.max(0, Math.min(SIZE - 1, Math.floor(x)))]!;

  // 2. Ice. The main glacier carves its trough below the old floor, deepest a little above the snout (the
  // lake's basin); two or three side glaciers from cirques on the flanks join it high above its bed.
  const main: Ice = { ...mainLine, bed: [], half: [] };
  for (let k = 0; k < 72; k++) {
    const t = k / 71;
    main.bed.push(surface(main.x[k]!, main.y[k]!) - 0.1 - 0.1 * bump((t - 0.8) / 0.24));
    main.half.push(14 + 10 * t);
  }
  // Keep the bed falling down the valley, apart from the gouge above the snout.
  for (let k = 1; k < 72; k++) if (k / 71 < 0.6) main.bed[k] = Math.min(main.bed[k]!, main.bed[k - 1]! - 0.001);
  // Each cirque: its centre, radius, and which way its ice flowed out (toward the valley it fed).
  const towards = (ax: number, ay: number, bx: number, by: number): [number, number] => {
    const l = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)) || 1;
    return [(bx - ax) / l, (by - ay) / l];
  };
  const cirques: [number, number, number, number, number][] = [[head[0], head[1], 20, ...towards(head[0], head[1], mainLine.x[6]!, mainLine.y[6]!)]];
  carveCirque(h, head[0], head[1], 20, main.bed[0]! - 0.04);
  carveIce(h, main);
  const sides = nextRange(rng, 2, 3);
  for (let k = 0; k < sides; k++) {
    const t = 0.2 + nextFloat(rng) * 0.45;
    const sign = k % 2 === 0 ? 1 : -1;
    const jx = lerpAt(main.x, t);
    const jy = lerpAt(main.y, t);
    const reach = 58 + nextFloat(rng) * 30;
    let sx = jx + px * sign * reach + hx * (10 + nextFloat(rng) * 26);
    let sy = jy + py * sign * reach + hy * (10 + nextFloat(rng) * 26);
    sx = Math.max(16, Math.min(SIZE - 17, sx));
    sy = Math.max(16, Math.min(SIZE - 17, sy));
    const line = iceLine(rng, w, [sx, sy], [jx, jy], 12, 40);
    const hang = 0.07 + nextFloat(rng) * 0.06;
    const junctionBed = lerpAt(main.bed, t) + hang;
    const startBed = Math.max(junctionBed + 0.06, surface(sx, sy) - 0.16);
    const ice: Ice = { ...line, bed: [], half: [] };
    for (let q = 0; q < 40; q++) {
      const u = q / 39;
      ice.bed.push(startBed + (junctionBed - startBed) * u);
      ice.half.push(7 + 4 * u);
    }
    cirques.push([sx, sy, 12, ...towards(sx, sy, line.x[4]!, line.y[4]!)]);
    carveCirque(h, sx, sy, 12, startBed - 0.03);
    carveIce(h, ice);
  }

  // Moraines: what the ice pushed and dropped. A ring at the snout (it dams the lake), kept apart so it can
  // be raised or lowered to give the lake its size, and ridges along the trough's lower sides.
  const moraine = new Float64Array(N);
  const mainBox = boxOf(main, 30);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const dx = x + 0.5 - end[0];
      const dy = y + 0.5 - end[1];
      const r = Math.sqrt(dx * dx + dy * dy);
      const ahead = (dx * fx + dy * fy) / fl;
      if (ahead > -snoutR * 0.45) moraine[i] = bump((r - snoutR) / 6) * (0.8 + hash2f(w, x, y, 61) * 0.4);
      if (!nearBox(mainBox, x, y)) continue;
      const { d, t } = nearestOn(main, x + 0.5, y + 0.5);
      if (t > 0.35 && t < 0.97) {
        const half = lerpAt(main.half, t);
        h[i] = h[i]! + 0.03 * bump((d - half * 0.92) / 3) * smooth01((t - 0.35) / 0.2);
      }
    }
  }
  let mHeight = 0.05;
  for (let i = 0; i < N; i++) h[i] = h[i]! + moraine[i]! * mHeight;

  // The outlet: below the moraine the river cuts a gorge down through the rim and out of the valley.
  const outBedTop = surface(outStart[0], outStart[1]) - 0.02;
  const outBox = boxOf(outLine, 6);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      if (!nearBox(outBox, x, y)) continue;
      const { d, t } = nearestOn(outLine, x + 0.5, y + 0.5);
      if (d > 5) continue;
      const cut = outBedTop - 0.35 * t + d * 0.012;
      if (cut < h[i]!) h[i] = cut;
    }
  }

  // 3. Rain and frost: erosion, then talus slumping off steep soft rock.
  erode(h, hardness, rng, Math.floor(N * DROPS_PER_TILE));
  slump(h, hardness, 6);

  // The ice left the floor knobbly, and the few thousand years since haven't worn it smooth: it plucked and polished it into knobs and hollows (rock knolls,
  // basins between them). Where the lake will lie, that makes points and bays, and here and there an island.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const { d, t } = nearestOn(main, x + 0.5, y + 0.5);
      const half = lerpAt(main.half, t);
      if (d > half * 1.15 || t < 0.3) continue;
      const fade = 1 - smooth01((d - half * 0.85) / (half * 0.3));
      // Spurs and bays a dozen tiles across, knobs of a few: enough to push a waterline in and out.
      const spur = fbm((w + 508) | 0, x / 13, y / 13, 3);
      const knob = ridged((w + 509) | 0, x / 5, y / 5, 2) - 0.45;
      const i = y * SIZE + x;
      h[i] = h[i]! + (spur * 0.22 + knob * 0.06) * fade;
    }
  }


  // 4. Water. Fill; the lake is the filled hollow behind the moraine. Raise or lower the moraine until
  // the lake is a good size (the ice left what it left; this picks which valley we're looking at).
  const lowestNear = (): number => {
    let best = -1;
    for (let y = Math.max(0, Math.floor(end[1] - 30)); y < Math.min(SIZE, end[1] + 30); y++) {
      for (let x = Math.max(0, Math.floor(end[0] - 30)); x < Math.min(SIZE, end[0] + 30); x++) {
        const i = y * SIZE + x;
        const { d, t } = nearestOn(main, x + 0.5, y + 0.5);
        if (d > lerpAt(main.half, t) * 0.7 || t < 0.55) continue;
        if (best < 0 || h[i]! < h[best]!) best = i;
      }
    }
    return best;
  };
  // Streams cut down through what dams the side hollows, so most drain; only the lake's basin is spared.
  // What's left of a hollow fills in later (a bog, or a tarn up high).
  for (let pass = 0; pass < 3; pass++) breach(h, lowestNear());
  let filled: Float64Array = new Float64Array(N);
  let order: Int32Array = new Int32Array(N);
  let lake: Int32Array = new Int32Array(N);
  let size = 0;
  for (let attempt = 0; ; attempt++) {
    ({ filled, order } = fill(h));
    const seed = lowestNear();
    if (seed < 0) return 'no lake basin';
    lake = bfs([seed], (i) => filled[i]! > h[i]!);
    size = 0;
    for (let i = 0; i < N; i++) if (lake[i]! >= 0) size++;
    if ((size >= LAKE_TARGET[0] && size <= LAKE_TARGET[1]) || attempt === 10) break;
    // Too small: raise the dam. Too big: lower it, down to a notch in the old bed.
    const step = size < LAKE_TARGET[0] ? (size < LAKE_TARGET[0] / 3 ? 0.04 : 0.015) : size > LAKE_TARGET[1] * 2 ? -0.04 : -0.012;
    if (mHeight + step < -0.1) break;
    mHeight += step;
    for (let i = 0; i < N; i++) h[i] = h[i]! + moraine[i]! * step;
  }
  if (size < MIN_LAKE) return `lake too small (${size})`;

  // Other hollows: high ones are tarns; the rest are filled in (bogs, for the ground to come).
  const lakeSeed = lowestNear();
  const lakeLevel = filled[lakeSeed]!;
  const isLake = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (lake[i]! >= 0) isLake[i] = 1;
  const tarn = new Uint8Array(N);
  const seen = new Uint8Array(N);
  const bog = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (seen[i] || isLake[i] || filled[i]! <= h[i]!) continue;
    const members: number[] = [];
    const queue = [i];
    seen[i] = 1;
    let deep = 0;
    let top = 0;
    while (queue.length) {
      const c = queue.pop()!;
      members.push(c);
      deep = Math.max(deep, filled[c]! - h[c]!);
      top = Math.max(top, h[c]!);
      forNeighbours4(c, (n) => {
        if (!seen[n] && !isLake[n] && filled[n]! > h[n]!) {
          seen[n] = 1;
          queue.push(n);
        }
      });
    }
    const high = top > lakeLevel + 0.3;
    if (high && members.length >= 5 && members.length <= 140 && deep > 0.006) for (const m of members) tarn[m] = 1;
    else {
      // Filled level: sediment and peat. A deep one is a bog that holds water in spring.
      for (const m of members) {
        h[m] = filled[m]!;
        if (deep > WET) bog[m] = 1;
      }
    }
  }

  // What's left of the ice: a small glacier in each cirque, where the bowl's back wall shades it, and
  // snowpack lying on high ground that faces north. Their meltwater is where the rivers begin.
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < N; i++) {
    lo = Math.min(lo, h[i]!);
    hi = Math.max(hi, h[i]!);
  }
  const rel = (i: number) => (h[i]! - lo) / (hi - lo);
  for (const [cx, cy, r, ox, oy] of cirques) {
    // The glacier lies in the bowl against its back wall, wider than long, with a tongue pushing out
    // toward the valley it once filled; its edge is ragged where the ice has melted back unevenly.
    const bx = cx - ox * r * 0.3;
    const by = cy - oy * r * 0.3;
    const R = r * 1.6;
    for (let y = Math.max(0, Math.floor(by - R)); y <= Math.min(SIZE - 1, Math.ceil(by + R)); y++) {
      for (let x = Math.max(0, Math.floor(bx - R)); x <= Math.min(SIZE - 1, Math.ceil(bx + R)); x++) {
        const dx = x + 0.5 - bx;
        const dy = y + 0.5 - by;
        const along = dx * ox + dy * oy;
        const across = -dx * oy + dy * ox;
        const a = along > 0 ? r * (0.75 + 0.5 * smooth01(1 - Math.abs(across) / (r * 0.35))) : r * 0.55;
        const b = r * 0.72;
        const q = (along / a) * (along / a) + (across / b) * (across / b);
        const i = y * SIZE + x;
        const ragged = fbm((w + 506) | 0, x / 6, y / 6, 3) * 0.45;
        if (q < 1 + ragged && filled[i]! - h[i]! <= WET) g.snow[i] = 2;
      }
    }
  }
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const i = y * SIZE + x;
      if (g.snow[i] || filled[i]! - h[i]! > WET) continue;
      const north = h[i + SIZE]! - h[i - SIZE]!; // rising to the south: the slope faces north
      const steep = Math.abs(h[i + 1]! - h[i - 1]!) + Math.abs(north);
      const edge = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y);
      if (edge > 9 && rel(i) + north * 3 > 0.8 + fbm((w + 505) | 0, x / 10, y / 10, 3) * 0.06 && steep < 0.08) g.snow[i] = 1;
    }
  }
  // Snow lies in fields, not flecks: twice, keep a snow tile only where most of its neighbours are snow too.
  for (let pass = 0; pass < 2; pass++) {
    const was = g.snow.slice();
    for (let y = 1; y < SIZE - 1; y++) {
      for (let x = 1; x < SIZE - 1; x++) {
        const i = y * SIZE + x;
        if (was[i] !== 1) continue;
        let near = 0;
        for (let d = 0; d < 8; d++) if (was[(y + DY8[d]!) * SIZE + x + DX8[d]!]) near++;
        if (near < 5) g.snow[i] = 0;
      }
    }
  }

  // Flow: where each tile drains on the filled surface, and how much water passes through it: rain
  // (more up high) and meltwater, a great deal from the glaciers and some from the snow.
  const rec = receivers(filled, (w + 507) | 0);
  const acc = new Float64Array(N);
  for (let i = 0; i < N; i++) acc[i] = 0.6 + rel(i) * 0.8 + (g.snow[i] === 2 ? 30 : g.snow[i] === 1 ? 2 : 0);
  for (let k = N - 1; k >= 0; k--) {
    const i = order[k]!;
    const r = rec[i]!;
    if (r >= 0) acc[r] = acc[r]! + acc[i]!;
  }
  g.flow = acc;
  g.bog = bog;

  // Streams into the lake: the two that carry the most water, A and B, each a main stem and its
  // tributaries. Channels that reach the lake some other way are left dry (a spring trickle at most).
  const inflows: number[] = [];
  for (let i = 0; i < N; i++) if (!isLake[i] && rec[i]! >= 0 && isLake[rec[i]!] && acc[i]! >= CHANNEL) inflows.push(i);
  inflows.sort((a, b) => acc[b]! - acc[a]! || a - b);
  if (inflows.length < 2) return 'fewer than two streams reach the lake';
  const mouthA = inflows[0]!;
  const mouthB = inflows.find((i) => (xOf(i) - xOf(mouthA)) * (xOf(i) - xOf(mouthA)) + (yOf(i) - yOf(mouthA)) * (yOf(i) - yOf(mouthA)) >= 400) ?? -1;
  if (mouthB < 0) return 'no second stream apart from the first';
  // Which mouth each channel tile drains to (memo: -2 unknown, -1 none).
  const goesTo = new Int32Array(N).fill(-2);
  const trace = (i: number): number => {
    const path: number[] = [];
    let c = i;
    let out = -1;
    while (c >= 0) {
      if (goesTo[c] !== -2) {
        out = goesTo[c]!;
        break;
      }
      if (c === mouthA || c === mouthB) {
        out = c;
        break;
      }
      if (isLake[c]) break;
      path.push(c);
      c = rec[c]!;
    }
    for (const p of path) goesTo[p] = out;
    return out;
  };
  const stem = (mouth: number): number[] => {
    // Up from the mouth, always to the donor carrying the most water.
    const up: number[] = [mouth];
    let c = mouth;
    for (;;) {
      let best = -1;
      for (let d = 0; d < 8; d++) {
        const nx = xOf(c) + DX8[d]!;
        const ny = yOf(c) + DY8[d]!;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const n = ny * SIZE + nx;
        if (rec[n] !== c || acc[n]! < CHANNEL || isLake[n]) continue;
        if (best < 0 || acc[n]! > acc[best]! || (acc[n] === acc[best] && n < best)) best = n;
      }
      if (best < 0) break;
      up.push(best);
      c = best;
    }
    return up.reverse();
  };
  // Lay a channel as four-connected water: a diagonal step gets a corner tile so it can be waded along.
  const lay = (i: number, id: number) => {
    // Under the ice the water runs unseen: the stream comes out at the glacier's toe.
    if (g.snow[i]) return;
    g.water[i] = id;
    g.terrain[i] = T.stream;
    const r = rec[i]!;
    if (r >= 0 && xOf(r) !== xOf(i) && yOf(r) !== yOf(i)) {
      const corner = yOf(i) * SIZE + xOf(r);
      if (!isLake[corner] && g.water[corner] === WATER.none) {
        g.water[corner] = id;
        g.terrain[corner] = T.stream;
      }
    }
  };
  for (let i = 0; i < N; i++) {
    if (isLake[i] || acc[i]! < CHANNEL) continue;
    const m = trace(i);
    if (m === mouthA) lay(i, WATER.streamA);
    else if (m === mouthB) lay(i, WATER.streamB);
  }
  g.streamA = stem(mouthA);
  g.streamB = stem(mouthB);
  if (g.streamA.length < MIN_STREAM || g.streamB.length < MIN_STREAM) return `stream too short (${g.streamA.length}, ${g.streamB.length})`;
  g.mouth = mouthA;

  // The outlet: from the lake's spill point down to the map's edge, lake water running out.
  // Every lake tile drains, across the filled surface, to the same spill point over the moraine.
  let spill = lakeSeed;
  while (spill >= 0 && isLake[spill]) spill = rec[spill]!;
  g.outlet = [];
  for (let c = spill; c >= 0 && g.outlet.length < 400; c = rec[c]!) {
    if (isLake[c] || g.water[c] === WATER.streamA || g.water[c] === WATER.streamB) break;
    g.outlet.push(c);
    lay(c, WATER.lake);
  }

  // The lake: surface level across it; shallows where it's shallow and all along the shore, deep beyond.
  for (let i = 0; i < N; i++) {
    if (isLake[i]) {
      g.water[i] = WATER.lake;
      const depth = filled[i]! - h[i]!;
      let shore = false;
      forNeighbours4(i, (n) => {
        if (!isLake[n]) shore = true;
      });
      g.terrain[i] = shore || depth < 0.012 ? T.shallows : T.deep;
      h[i] = filled[i]!;
    } else if (tarn[i]) {
      g.water[i] = WATER.tarn;
      const depth = filled[i]! - h[i]!;
      let shore = false;
      forNeighbours4(i, (n) => {
        if (!tarn[n]) shore = true;
      });
      g.terrain[i] = shore || depth < 0.01 ? T.shallows : T.deep;
      h[i] = filled[i]!;
    }
  }
  g.lakeSize = size;

  // Heights to 0–1 and the byte elevation.
  lo = Infinity;
  hi = -Infinity;
  for (let i = 0; i < N; i++) {
    lo = Math.min(lo, h[i]!);
    hi = Math.max(hi, h[i]!);
  }
  for (let i = 0; i < N; i++) {
    const v = (h[i]! - lo) / (hi - lo);
    g.h[i] = v;
    g.elev[i] = Math.round(v * 255);
  }

  // The rim: headwalls 3–7 tiles deep all round, so the survivor can't walk out (SPEC 6.1). Where the
  // outlet crosses it, it falls away through the gorge.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const edge = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y);
      const margin = 3 + Math.floor((perlin((w + 77) | 0, x / 10, y / 10) + 0.7) * 2.9);
      if (edge >= margin) continue;
      if (g.water[i] !== WATER.none) {
        g.terrain[i] = T.waterfall;
        continue;
      }
      g.terrain[i] = T.headwall;
    }
  }
  return null;
}

