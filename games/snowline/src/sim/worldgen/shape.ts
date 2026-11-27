// Pipeline step 3 (SPEC 6.3): the elevation bands, and the cliff bands with their scramble routes. The
// height map, the lake, and the streams come before, from the valley's history (geology.ts).

import { BAND, T, WATER } from '../../content/terrain.ts';
import { shuffle } from '../rng.ts';
import { SIZE } from '../world.ts';
import { type Gen, dist2, forBox, tilesWhere, xOf, yOf } from './gen.ts';
import { DX4, DY4, N, floodFill, forNeighbours4 } from './grid.ts';
/** Fractions of the dry interior below each band's top: floor, montane, subalpine (the rest is alpine). */
const BAND_QUANTILES = [0.22, 0.58, 0.8];
/** A band's edge is a cliff where it drops at least this much (elevation, 0–255) to the next tile. */
const CLIFF_DROP = 4;
/** Bands smaller than this are merged into their surroundings. */
const MIN_BAND_PATCH = 40;
/** Scramble routes through each cliff band, and how far apart they must be. */
const ROUTES = { [BAND.subalpine]: 4, [BAND.alpine]: 3 } as Record<number, number>;
const ROUTE_SPACING = 26;

/** Step 3's first half: cut the height map into bands, then tidy them into large, smooth areas. */
export function cutBands(g: Gen): void {
  // Bands follow warmth, not height alone: a north-facing slope is as cold as one higher up facing south,
  // so the treeline climbs the sunny side and drops on the shady one.
  const cold = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const x = xOf(i);
    const y = yOf(i);
    const up = g.h[Math.min(SIZE - 1, y + 1) * SIZE + x]! - g.h[Math.max(0, y - 1) * SIZE + x]!;
    const shade = up * 3;
    cold[i] = g.h[i]! + (shade < -0.06 ? -0.06 : shade > 0.06 ? 0.06 : shade);
  }
  const dry = tilesWhere((i) => g.terrain[i] !== T.headwall && g.water[i] === WATER.none);
  const sorted = Float64Array.from(dry, (i) => cold[i]!).sort();
  const cuts = BAND_QUANTILES.map((q) => sorted[Math.floor(sorted.length * q)]!);
  for (let i = 0; i < N; i++) {
    const v = cold[i]!;
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

/** Water a stream can run on into or out of. */
const isWet = (t: number) => t === T.stream || t === T.gravel || t === T.waterfall || t === T.shallows || t === T.deep;

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
    // A cliff where the ground steps down to a lower band steeply; a gentle band edge is an open slope.
    let lower = false;
    let drop = 0;
    // The drop is to the lower band only: a bank above a gully cut into the same band is no cliff (and a
    // stream's corner tile on that bank no waterfall, beside the stream that runs on level).
    forNeighbours4(i, (n) => {
      if (g.terrain[n] === T.headwall || g.band[n]! >= b) return;
      lower = true;
      drop = Math.max(drop, g.elev[i]! - g.elev[n]!);
    });
    if (!lower || drop < CLIFF_DROP) continue;
    if (g.terrain[i] === T.stream) {
      // Falling water only where the stream itself drops: water feeding this tile from level or above,
      // and water going on below it in the lower band, a cliff's drop lower. A corner tile laid on the
      // bank beside a stream that runs on level is neither; and a stream tile is never made a cliff.
      let fed = false;
      let falls = false;
      forNeighbours4(i, (n) => {
        if (!isWet(g.terrain[n]!)) return;
        if (g.elev[n]! >= g.elev[i]! - 1) fed = true;
        if (g.band[n]! < b && g.elev[i]! - g.elev[n]! >= CLIFF_DROP) falls = true;
      });
      if (fed && falls) g.terrain[i] = T.waterfall;
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
    if (candidates.length === 0) continue;
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

