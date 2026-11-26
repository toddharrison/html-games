// Pipeline steps 1–3 (SPEC 6.3): the height map shaped into a basin with one high side, the lake, two
// streams, the elevation bands, and the cliff bands with their scramble routes.

import { BAND, T, WATER } from '../../content/terrain.ts';
import { hash2f, nextFloat, pick, shuffle } from '../rng.ts';
import { SIZE } from '../world.ts';
import { type Gen, dist2, forBox, tilesWhere, xOf, yOf } from './gen.ts';
import { DX4, DY4, N, bfs, cheapestPath, floodFill, forNeighbours4 } from './grid.ts';
import { fbm, perlin } from './noise.ts';

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

/** Fractions of the dry interior below each band's top: floor, montane, subalpine (the rest is alpine). */
const BAND_QUANTILES = [0.22, 0.58, 0.8];
/** The lake is the lowest part of the basin: this fraction of the interior, if it all joins up. */
const LAKE_QUANTILE = 0.085;
export const MIN_LAKE = 600;
const MIN_STREAM = 30;
/** Bands smaller than this are merged into their surroundings. */
const MIN_BAND_PATCH = 40;
/** Scramble routes through each cliff band, and how far apart they must be. */
const ROUTES = { [BAND.subalpine]: 4, [BAND.alpine]: 3 } as Record<number, number>;
const ROUTE_SPACING = 26;

function smooth01(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Step 1, plus the headwall rim and the lake (step 2's first half). Returns a problem, or null. */
export function shapeBasin(g: Gen): string | null {
  const [hx, hy] = pick(g.rng, HIGH_SIDES);
  g.high = { x: hx, y: hy };
  const px = -hy;
  const py = hx;
  const off = (nextFloat(g.rng) - 0.5) * 0.5;
  const lx = -0.36 * hx + off * px;
  const ly = -0.36 * hy + off * py;
  const w = g.word;

  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const nx = (x + 0.5) / 128 - 1;
      const ny = (y + 0.5) / 128 - 1;
      const s = nx * hx + ny * hy;
      const dx = nx - lx;
      const dy = ny - ly;
      const bowl = 0.6 * (dx * dx + dy * dy);
      const up = smooth01((s + 0.25) / 1.25);
      const tilt = 0.55 * up;
      const n = fbm(w, x / 52, y / 52, 5);
      const crags = perlin(w ^ 0x5bd1e995, x / 18, y / 18) * 0.1 * up;
      const v = bowl + tilt + n * 0.28 + crags;
      const i = y * SIZE + x;
      g.h[i] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  for (let i = 0; i < N; i++) {
    const v = (g.h[i]! - lo) / (hi - lo);
    g.h[i] = v;
    g.elev[i] = Math.round(v * 255);
  }

  // The rim: headwalls 3–7 tiles deep all round, so the survivor can't walk out (SPEC 6.1).
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const edge = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y);
      const margin = 3 + Math.floor((perlin((w + 77) | 0, x / 10, y / 10) + 0.7) * 2.9);
      if (edge < margin) g.terrain[y * SIZE + x] = T.headwall;
    }
  }

  const interior = tilesWhere((i) => g.terrain[i] !== T.headwall);
  const sorted = Float64Array.from(interior, (i) => g.h[i]!).sort();
  const lakeLevel = sorted[Math.floor(sorted.length * LAKE_QUANTILE)]!;
  let lowest = interior[0]!;
  for (const i of interior) if (g.h[i]! < g.h[lowest]!) lowest = i;
  const lake = bfs([lowest], (i) => g.terrain[i] !== T.headwall && g.h[i]! <= lakeLevel);
  let size = 0;
  for (let i = 0; i < N; i++) {
    if (lake[i]! >= 0) {
      g.water[i] = WATER.lake;
      size++;
    }
  }
  g.lakeSize = size;
  if (size < MIN_LAKE) return `lake too small (${size})`;
  return null;
}

/** Step 3's first half: cut the height map into bands, then tidy them into large, smooth areas. */
export function cutBands(g: Gen): void {
  const dry = tilesWhere((i) => g.terrain[i] !== T.headwall && g.water[i] === WATER.none);
  const sorted = Float64Array.from(dry, (i) => g.h[i]!).sort();
  const cuts = BAND_QUANTILES.map((q) => sorted[Math.floor(sorted.length * q)]!);
  for (let i = 0; i < N; i++) {
    const v = g.h[i]!;
    g.band[i] = g.water[i] === WATER.lake ? BAND.floor : v < cuts[0]! ? 0 : v < cuts[1]! ? 1 : v < cuts[2]! ? 2 : 3;
  }

  // Majority smoothing, twice, from a copy each time so the visiting order doesn't matter.
  for (let pass = 0; pass < 2; pass++) {
    const src = g.band.slice();
    for (let i = 0; i < N; i++) {
      if (g.terrain[i] === T.headwall || g.water[i] === WATER.lake) continue;
      const counts = [0, 0, 0, 0];
      forBox(i, 1, (n) => {
        if (g.terrain[n] !== T.headwall) counts[src[n]!]!++;
      });
      let best = src[i]!;
      for (let b = 0; b < 4; b++) if (counts[b]! > counts[best]!) best = b;
      g.band[i] = best;
    }
  }

  // Merge small patches of a band into the band round them.
  const seen = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (seen[i] || g.terrain[i] === T.headwall) continue;
    const b = g.band[i]!;
    const members = floodFill(i, (n) => g.terrain[n] !== T.headwall && g.band[n] === b, seen);
    if (members.length >= MIN_BAND_PATCH || g.water[i] === WATER.lake) continue;
    const counts = [0, 0, 0, 0];
    for (const m of members) {
      forNeighbours4(m, (n) => {
        if (g.terrain[n] !== T.headwall && g.band[n] !== b) counts[g.band[n]!]!++;
      });
    }
    let best = -1;
    for (let k = 0; k < 4; k++) if (counts[k]! > 0 && (best < 0 || counts[k]! > counts[best]!)) best = k;
    if (best >= 0) for (const m of members) g.band[m] = best;
  }
}

/** Step 2's second half: two streams from the high ground down to the lake, and the lake's depth. */
export function carveStreams(g: Gen): string | null {
  const w = g.word;
  const px = -g.high.y;
  const py = g.high.x;
  const notRim = bfs(
    tilesWhere((i) => g.terrain[i] === T.headwall),
    (i) => g.terrain[i] !== T.headwall,
    true,
    8,
  );
  const side = (i: number) => ((xOf(i) + 0.5) / 128 - 1) * px + ((yOf(i) + 0.5) / 128 - 1) * py;
  const source = (wantSide: number): number => {
    for (const band of [BAND.alpine, BAND.subalpine]) {
      const c = tilesWhere(
        (i) => g.band[i] === band && g.water[i] === WATER.none && notRim[i] === -1 && side(i) * wantSide > 0.12,
      );
      if (c.length) return pick(g.rng, c);
    }
    return -1;
  };
  const srcA = source(-1);
  const srcB = source(1);
  if (srcA < 0 || srcB < 0) return 'no stream source';

  const inA = new Uint8Array(N);
  const nearA = new Uint8Array(N);
  const run = (src: number, avoidA: boolean): number[] | null =>
    cheapestPath(
      src,
      (from, to) => {
        if (g.terrain[to] === T.headwall) return Infinity;
        if (avoidA && inA[to]) return Infinity;
        const climb = g.h[to]! - g.h[from]!;
        return 1 + (climb > 0 ? climb * 600 : 0) + hash2f(w, xOf(to), yOf(to), 31) * 0.8 + (avoidA && nearA[to] ? 6 : 0);
      },
      (i) => g.water[i] === WATER.lake,
    );
  const a = run(srcA, false);
  if (!a) return 'stream A found no lake';
  a.pop();
  for (const i of a) {
    inA[i] = 1;
    forBox(i, 1, (n) => {
      nearA[n] = 1;
    });
  }
  const b = run(srcB, true);
  if (!b) return 'stream B found no lake';
  b.pop();
  if (a.length < MIN_STREAM || b.length < MIN_STREAM) return `stream too short (${a.length}, ${b.length})`;
  for (const i of a) {
    g.terrain[i] = T.stream;
    g.water[i] = WATER.streamA;
  }
  for (const i of b) {
    g.terrain[i] = T.stream;
    g.water[i] = WATER.streamB;
  }
  g.streamA = a;
  g.streamB = b;
  g.mouth = a[a.length - 1]!;

  // Lake depth: shallows along the shore, deep water beyond.
  const fromShore = bfs(
    tilesWhere((i) => g.water[i] !== WATER.lake),
    (i) => g.water[i] === WATER.lake,
    false,
    3,
  );
  for (let i = 0; i < N; i++) {
    if (g.water[i] !== WATER.lake) continue;
    const d = fromShore[i]!;
    const shallow = d === 1 || (d === 2 && hash2f(w, xOf(i), yOf(i), 41) < 0.45);
    g.terrain[i] = shallow ? T.shallows : T.deep;
  }
  return null;
}

/**
 * Step 3's second half: a cliff wherever a subalpine or alpine tile meets a lower band (a waterfall
 * where a stream crosses), then a few scramble routes through each cliff band. Floor to forest is
 * an open slope.
 */
export function raiseCliffs(g: Gen): string | null {
  const cliffClass = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const b = g.band[i]!;
    if (b < BAND.subalpine || g.terrain[i] === T.headwall || g.water[i] === WATER.lake) continue;
    let lower = false;
    forNeighbours4(i, (n) => {
      if (g.terrain[n] !== T.headwall && g.band[n]! < b) lower = true;
    });
    if (!lower) continue;
    if (g.terrain[i] === T.stream) {
      g.terrain[i] = T.waterfall;
    } else {
      g.terrain[i] = T.cliff;
      cliffClass[i] = b;
    }
  }
  for (const band of [BAND.subalpine, BAND.alpine]) {
    const candidates = shuffle(
      g.rng,
      tilesWhere((i) => cliffClass[i] === band),
    );
    if (candidates.length === 0) return `no cliff band below the ${band === BAND.alpine ? 'alpine' : 'subalpine'} band`;
    const sites: number[] = [];
    for (const c of candidates) {
      if (sites.length >= ROUTES[band]!) break;
      if (sites.some((s) => dist2(s, c) < ROUTE_SPACING * ROUTE_SPACING)) continue;
      sites.push(c);
    }
    for (const s of sites) {
      forBox(s, 1, (n) => {
        if (g.terrain[n] === T.cliff) g.terrain[n] = T.scree;
      });
    }
  }
  return null;
}

/** The step from tile `i` in direction `d` (0–3), or -1 off the map. */
export function neighbour(i: number, d: number): number {
  const x = xOf(i) + DX4[d]!;
  const y = yOf(i) + DY4[d]!;
  return x < 0 || y < 0 || x >= SIZE || y >= SIZE ? -1 : y * SIZE + x;
}

