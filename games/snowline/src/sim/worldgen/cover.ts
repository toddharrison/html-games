// Pipeline steps 4 and 5 (SPEC 6.3): a moisture map, ground cover from band and moisture, and the
// scatter of trees, rocks, and bushes. Every choice here is position-hashed (SPEC 11.3, rule 2), so a
// tile's result never depends on the order tiles are visited.

import { BAND, F, FLAG, T, WATER } from '../../content/terrain.ts';
import { hash2f, makeRng, nextFloat, nextInt } from '../rng.ts';
import { type Gen, UNSET, tilesWhere, xOf, yOf } from './gen.ts';
import { DX4, DX8, DY4, DY8, N, bfs, floodFill, forNeighbours4 } from './grid.ts';
import { fbm, perlin } from './noise.ts';
import { SIZE } from '../world.ts';

/**
 * True if tile (x, y) wins the scatter for `salt`: its hash is under its density, and lowest among the
 * four neighbours that are also under theirs. Two winners are never side by side, so a stand of trees or a
 * line of rocks always has a way through. The density can vary over the map (a noise field), which is
 * what makes copses, glades, and ridgelines instead of an even sprinkle.
 */
function scatter(seed: number, x: number, y: number, salt: number, density: number | ((x: number, y: number) => number)): boolean {
  const at = typeof density === 'number' ? () => density : density;
  const v = hash2f(seed, x, y, salt);
  if (v >= at(x, y)) return false;
  for (let d = 0; d < 4; d++) {
    const nx = x + DX4[d]!;
    const ny = y + DY4[d]!;
    const n = hash2f(seed, nx, ny, salt);
    if (n < at(nx, ny) && n < v) return false;
  }
  return true;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** How far from a glacier its forefield reaches, in tiles (downhill of the ice; two all round). */
const FOREFIELD = 7;
/** The smallest patch of marsh that stays marsh; smaller ones dry back into meadow. */
const MIN_MARSH = 10;
/** Land cut off by water and smaller than this (tiles) is an island. */
const ISLAND_MAX = 150;
/** `forefield` results that aren't a ground: not near the ice, or open ground in front of it. */
const NOT_FORE = -1;
const OPEN_FORE = -2;

export function coverGround(g: Gen): void {
  const w = g.word;
  const fromWater = bfs(
    tilesWhere((i) => g.water[i] === WATER.lake || g.water[i] === WATER.streamA || g.water[i] === WATER.streamB),
    () => true,
    false,
    80,
  );
  const fromCliff = bfs(
    tilesWhere((i) => g.terrain[i] === T.cliff || g.terrain[i] === T.headwall),
    () => true,
    true,
    4,
  );
  // Within a few tiles of where stream A or B meets the lake: the delta, built of what the streams carried.
  const delta = bfs(
    [g.streamA[g.streamA.length - 1]!, g.streamB[g.streamB.length - 1]!].filter((i) => i >= 0),
    () => true,
    false,
    6,
  );

  // What the ground knows: how steep it is, which way it faces, and how much water passes through or
  // lies on it (from the flow), with a little noise for what the map can't see (springs, soil).
  const slope = new Float64Array(N);
  const sunny = new Float64Array(N);
  const moisture = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const x = xOf(i);
    const y = yOf(i);
    const e = (dx: number, dy: number) => g.elev[Math.min(SIZE - 1, Math.max(0, y + dy)) * SIZE + Math.min(SIZE - 1, Math.max(0, x + dx))]!;
    const gx = (e(1, 0) - e(-1, 0)) / 2;
    const gy = (e(0, 1) - e(0, -1)) / 2;
    slope[i] = Math.sqrt(gx * gx + gy * gy);
    // Rising to the north faces the slope south, into the sun.
    sunny[i] = clamp(-gy / 6, -1, 1);
    const dw = fromWater[i]! < 0 ? 80 : fromWater[i]!;
    const runoff = clamp((Math.sqrt(g.flow[i]!) - 1.6) / 7, 0, 1) * (slope[i]! < 2 ? 1 : 2 / slope[i]!);
    moisture[i] = 0.42 + runoff * 0.6 + fbm((w + 101) | 0, x / 38, y / 38, 4) * 0.3 - dw / 60 - sunny[i]! * 0.12 + (g.bog[i] ? 0.4 : 0);
  }

  // The ground the ice has just let go of: within a step or two of a glacier all round, bare rubble (its
  // lateral and end moraines); in front of it, downhill, a ridge of boulders where the ice stood longest,
  // then raw ground where grass and willow scrub are only starting. No trees grow on any of it yet.
  const fromIce = new Int32Array(N).fill(-1);
  const iceElev = new Float64Array(N);
  {
    const q: number[] = [];
    for (let i = 0; i < N; i++) {
      if (g.snow[i] !== 2) continue;
      fromIce[i] = 0;
      iceElev[i] = g.elev[i]!;
      g.flags[i] = g.flags[i]! | FLAG.glacier;
      q.push(i);
    }
    for (let h = 0; h < q.length; h++) {
      const c = q[h]!;
      if (fromIce[c]! >= FOREFIELD) continue;
      for (let d = 0; d < 8; d++) {
        const nx = xOf(c) + DX8[d]!;
        const ny = yOf(c) + DY8[d]!;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const n = ny * SIZE + nx;
        if (fromIce[n] !== -1) continue;
        fromIce[n] = fromIce[c]! + 1;
        iceElev[n] = iceElev[c]!;
        q.push(n);
      }
    }
  }
  const fore = new Uint8Array(N);
  const forefield = (i: number): number => {
    if (fromIce[i]! <= 0 || g.reserved[i]) return NOT_FORE;
    const d = fromIce[i]! + perlin((w + 130) | 0, xOf(i) / 4, yOf(i) / 4) * 1.6;
    const below = g.elev[i]! < iceElev[i]! - 1;
    if (d <= 2.2) return T.talus;
    if (below && d <= 4) return T.boulders;
    if (below && d <= FOREFIELD) return OPEN_FORE;
    return NOT_FORE;
  };

  for (let i = 0; i < N; i++) {
    if (g.terrain[i] !== UNSET) continue;
    const x = xOf(i);
    const y = yOf(i);
    const m = moisture[i]!;
    const sl = slope[i]!;
    const dw = fromWater[i]! < 0 ? 80 : fromWater[i]!;
    const underCliff = fromCliff[i]! >= 0 && fromCliff[i]! <= 2;
    const patchy = perlin((w + 202) | 0, x / 14, y / 14) + perlin((w + 203) | 0, x / 5, y / 5) * 0.3;
    let t: number;
    const ff = forefield(i);
    if (g.snow[i]) t = T.snow;
    else if (ff >= 0) {
      t = ff;
      fore[i] = 1;
    } else {
      switch (g.band[i]) {
        case BAND.floor:
          if (g.bog[i]) t = m > 0.9 ? T.marsh : T.reeds;
          else if (dw <= 1) t = delta[i]! >= 0 ? (hash2f(w, x, y, 11) < 0.55 ? T.reeds : T.sand) : sl > 5 ? T.boulders : m < 0.5 ? T.sand : T.reeds;
          else if (delta[i]! >= 0 && delta[i]! <= 4) t = m > 0.6 ? T.marsh : T.meadow;
          else if (dw <= 3 && m > 0.7) t = T.reeds;
          else if (m > 0.85) t = T.marsh;
          else if (sl > 4 && m > 0.35) t = T.forest; // the forest comes down the steeper banks to the water
          else t = T.meadow;
          break;
        case BAND.montane:
          if (underCliff && sl > 6) t = T.talus;
          else if (sl > 13) t = T.boulders; // rock breaking through on the steepest slopes
          else if (g.bog[i] || (m > 0.95 && sl < 2)) t = T.meadow; // wet meadows on the flats
          else if (sunny[i]! > 0.45 && sl > 5 && m < 0.45) t = T.meadow; // dry grassy slopes facing the sun
          else t = T.forest;
          break;
        case BAND.subalpine:
          if (underCliff) t = T.talus;
          else if (sl > 12) t = T.boulders;
          else if (m > 0.7 || g.bog[i]) t = T.highMeadow;
          else if (sunny[i]! < -0.2 && m > 0.45 && patchy < 0.25) t = T.forest; // fir on the shady side, up to the treeline
          else t = patchy > 0.22 ? T.boulders : m > 0.5 ? T.highMeadow : T.scrub;
          break;
        default:
          if (underCliff) t = T.talus;
          else if (sl > 9) t = T.rock;
          else if (m > 0.75 && sl < 4) t = T.highMeadow; // alpine meadow where meltwater runs
          else t = patchy > 0.15 ? T.rock : T.talus;
      }
      // Ground the ice left lately is open: grass and willow, no forest yet.
      if (ff === OPEN_FORE) {
        fore[i] = 1;
        if (t === T.forest) t = g.band[i]! >= BAND.subalpine ? T.highMeadow : T.meadow;
      }
    }
    g.terrain[i] = t;
  }

  // Tidy the ground: a lone tile of forest floor in a meadow (or meadow in a forest) takes what's round it.
  for (let pass = 0; pass < 2; pass++) {
    const was = g.terrain.slice();
    for (let y = 1; y < SIZE - 1; y++) {
      for (let x = 1; x < SIZE - 1; x++) {
        const i = y * SIZE + x;
        const t = was[i]!;
        if (fore[i] || (t !== T.forest && t !== T.meadow && t !== T.highMeadow && t !== T.scrub)) continue;
        let same = 0;
        const other = [0, 0, 0, 0];
        const kinds = [T.forest, T.meadow, T.highMeadow, T.scrub];
        for (let d = 0; d < 8; d++) {
          const n = was[(y + DY8[d]!) * SIZE + x + DX8[d]!]!;
          if (n === t) same++;
          const k = kinds.indexOf(n as (typeof kinds)[number]);
          if (k >= 0) other[k]!++;
        }
        if (same >= 2) continue;
        let bk = -1;
        for (let k = 0; k < 4; k++) if (kinds[k] !== t && (bk < 0 || other[k]! > other[bk]!)) bk = k;
        if (bk >= 0 && other[bk]! >= 4) g.terrain[i] = kinds[bk]!;
      }
    }
  }

  // Wet ground lies in patches, not flecks: a hollow or a seep spreads into the ground round it. Twice,
  // grass with most of its neighbours marsh goes marsh too; then any patch of marsh too small to be a
  // real wet meadow dries back into whatever ground is round it, from its edge in.
  for (let pass = 0; pass < 2; pass++) {
    const was = g.terrain.slice();
    for (let y = 1; y < SIZE - 1; y++) {
      for (let x = 1; x < SIZE - 1; x++) {
        const i = y * SIZE + x;
        if (was[i] !== T.meadow || fore[i] || g.reserved[i]) continue;
        let wet = 0;
        for (let d = 0; d < 8; d++) if (was[(y + DY8[d]!) * SIZE + x + DX8[d]!] === T.marsh) wet++;
        if (wet >= 5) g.terrain[i] = T.marsh;
      }
    }
  }
  {
    const seen = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (seen[i] || g.terrain[i] !== T.marsh) continue;
      const patch = floodFill(i, (n) => g.terrain[n] === T.marsh, seen);
      if (patch.length >= MIN_MARSH) continue;
      const dry = [T.meadow, T.forest, T.reeds, T.highMeadow, T.scrub, T.sand];
      let left = patch;
      while (left.length) {
        const next: number[] = [];
        const was = g.terrain.slice();
        for (const n of left) {
          const counts = [0, 0, 0, 0, 0, 0];
          for (let d = 0; d < 8; d++) {
            const nx = xOf(n) + DX8[d]!;
            const ny = yOf(n) + DY8[d]!;
            if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
            const k = dry.indexOf(was[ny * SIZE + nx] as (typeof dry)[number]);
            if (k >= 0) counts[k]!++;
          }
          let best = 0;
          for (let k = 1; k < dry.length; k++) if (counts[k]! > counts[best]!) best = k;
          if (counts[best]) g.terrain[n] = dry[best]!;
          else next.push(n);
        }
        // Nothing dry beside what's left (all water and rock): it becomes meadow.
        if (next.length === left.length) for (const n of next) g.terrain[n] = T.meadow;
        left = next.length === left.length ? [] : next;
      }
    }
  }

  // Islands are knobs of rock: a rocky shore with a little sand in the coves, and pines on top.
  {
    const seen = new Uint8Array(N);
    const land = (n: number) => g.water[n] === WATER.none && g.terrain[n] !== T.headwall;
    for (let i = 0; i < N; i++) {
      if (seen[i] || !land(i)) continue;
      const isle = floodFill(i, land, seen);
      if (isle.length >= ISLAND_MAX || isle.some((n) => g.reserved[n])) continue;
      for (const n of isle) {
        let shore = false;
        forNeighbours4(n, (m) => {
          if (!land(m)) shore = true;
        });
        g.terrain[n] = shore ? (hash2f(w, xOf(n), yOf(n), 13) < 0.65 ? T.boulders : T.sand) : T.forest;
      }
    }
  }

  // Avalanche chutes: down the steep slopes under the high ground, the snow has cleared strips through
  // the forest, three wide, where only grass and shrubs grow.
  const chuteTops = tilesWhere(
    (i) => g.band[i]! >= BAND.subalpine && slope[i]! > 9 && !g.reserved[i] && g.water[i] === WATER.none && hash2f(w, xOf(i), yOf(i), 71) < 0.004,
  );
  for (const top of chuteTops) {
    let at = top;
    for (let step = 0; step < 40; step++) {
      let next = -1;
      for (let d = 0; d < 4; d++) {
        const nx = xOf(at) + DX4[d]!;
        const ny = yOf(at) + DY4[d]!;
        if (nx < 1 || ny < 1 || nx >= SIZE - 1 || ny >= SIZE - 1) continue;
        const n = ny * SIZE + nx;
        if (g.elev[n]! < g.elev[at]! && (next < 0 || g.elev[n]! < g.elev[next]!)) next = n;
      }
      if (next < 0 || g.water[next] !== WATER.none || g.reserved[next] || g.band[next] === BAND.floor) break;
      at = next;
      if (slope[at]! < 3) break;
      for (let d = -1; d <= 1; d++) {
        const across = Math.abs(g.high.x) > Math.abs(g.high.y) ? at + d * SIZE : at + d;
        if (g.terrain[across] !== T.forest) continue;
        g.terrain[across] = g.band[across]! >= BAND.subalpine ? T.highMeadow : T.meadow;
        g.flags[across] = g.flags[across]! | FLAG.avalanche;
      }
    }
  }

  // The forest's history: three centuries of lightning fires. Each starts where it's dry (more often on
  // slopes facing the sun), runs uphill faster than down, and dies out on wet ground. What each tile
  // remembers is how long since its stand last burned: recent burns are open ground with fallen trunks
  // and young aspen; young stands are thick (aspen first, where it's damp enough); old growth is big
  // conifers with gaps and deadfall.
  const age = g.age;
  const burnable = (i: number) => g.terrain[i] === T.forest || (g.terrain[i] === T.scrub && g.band[i] === BAND.subalpine);
  for (let i = 0; i < N; i++) age[i] = burnable(i) ? 150 + Math.floor(hash2f(w, xOf(i), yOf(i), 81) * 106) : 0;
  const frng = makeRng(g.genSeed, 'fire-history');
  const fires = 14 + nextInt(frng, 8);
  const stamp = new Uint8Array(N);
  for (let k = 0; k < fires; k++) {
    const yearsAgo = Math.max(3, Math.floor(290 * (1 - k / fires) * (0.75 + nextFloat(frng) * 0.25)));
    let start = -1;
    for (let tries = 0; tries < 60 && start < 0; tries++) {
      const i = nextInt(frng, N);
      if (burnable(i) && nextFloat(frng) < 0.25 + sunny[i]! * 0.5 - moisture[i]! * 0.2) start = i;
    }
    if (start < 0) continue;
    const cap = 150 + nextInt(frng, 1400);
    const queue = [start];
    stamp[start] = k + 1;
    let burned = 0;
    for (let q = 0; q < queue.length && burned < cap; q++) {
      const c = queue[q]!;
      age[c] = yearsAgo;
      burned++;
      forNeighbours4(c, (n) => {
        if (stamp[n] === k + 1 || !burnable(n)) return;
        // Above about 0.6 a fire keeps going on a grid like this; below, it dies out. Uphill, dry, sunny: above.
        const up = g.elev[n]! > g.elev[c]! ? 0.12 : -0.04;
        // A smooth field as well as chance, so a burn's edge follows the lie of the fuel, not a coin per tile.
        const patch = perlin((w + 700 + k) | 0, xOf(n) / 5, yOf(n) / 5) * 0.35;
        if (hash2f(w, xOf(n), yOf(n), 900 + k) * 0.5 + 0.25 < 0.74 + up + sunny[n]! * 0.12 - moisture[n]! * 0.22 + patch) {
          stamp[n] = k + 1;
          queue.push(n);
        }
      });
    }
  }
  // A recent burn is open ground: grass and fireweed between the fallen trunks.
  for (let i = 0; i < N; i++) {
    if (age[i]! > 0 && age[i]! < 20 && g.terrain[i] === T.forest) g.terrain[i] = g.band[i]! >= BAND.subalpine ? T.highMeadow : T.meadow;
  }

  // Distance to the forest's edge, for bushes along it.
  const fromOpen = bfs(
    tilesWhere((i) => g.terrain[i] !== T.forest),
    (i) => g.terrain[i] === T.forest,
    false,
    3,
  );

  // Smooth fields for where things grow and lie (SPEC 6.8), so the valley has shape: forest thick in its
  // heart and opening into glades; copses out in the meadows, a few lone trees between; aspens in groves
  // on damp ground (one grove is one clone); krummholz in clumps; and rock along ridgelines.
  // Each field is worked out once per tile, the first time it's asked for (scatter asks of neighbours too).
  const field = (f: (x: number, y: number) => number) => {
    const memo = new Float64Array(N).fill(NaN);
    return (x: number, y: number): number => {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return f(x, y);
      const k = y * SIZE + x;
      const v = memo[k]!;
      return v === v ? v : (memo[k] = f(x, y));
    };
  };
  const stand = field((x, y) => fbm((w + 301) | 0, x / 16, y / 16, 3));
  const copse = field((x, y) => perlin((w + 302) | 0, x / 6, y / 6) + perlin((w + 303) | 0, x / 2.5, y / 2.5) * 0.25);
  const grove = (x: number, y: number) => perlin((w + 304) | 0, x / 9, y / 9);
  const clump = field((x, y) => perlin((w + 306) | 0, x / 5, y / 5));
  // 1 on a ridge line, falling off either side: the noise's zero crossings, which run in long curves.
  const ridge = field((x, y) => 1 - Math.abs(fbm((w + 305) | 0, x / 22, y / 22, 3)));
  const forestTrees = (x: number, y: number) => {
    const s = stand(x, y);
    return s < -0.45 ? 0.04 : clamp(0.55 + s * 0.3, 0.2, 0.7);
  };
  const meadowTrees = (floor: boolean) => (x: number, y: number) => {
    const c = copse(x, y);
    const at = floor ? 0.42 : 0.32;
    return c > at ? 0.55 : c > at - 0.1 ? 0.12 : 0.008;
  };
  const floorMeadow = meadowTrees(true);
  const hillMeadow = meadowTrees(false);
  const krummholz = (lone: number) => (x: number, y: number) => (clump(x, y) > 0.2 ? 0.42 : lone);
  const ridgeRocks = (on: number, off: number) => (x: number, y: number) => {
    const r = ridge(x, y);
    return r > 0.9 ? on : r > 0.82 ? on * 0.4 : off;
  };
  // Where young growth has come up too thick to pass: patches, a few tiles across, inside young stands.
  const thicket = (x: number, y: number) => perlin((w + 310) | 0, x / 5, y / 5) + perlin((w + 311) | 0, x / 2, y / 2) * 0.2;
  // Young stands come up thick; old growth has thinned to big trees with gaps where giants fell.
  const young = (x: number, y: number) => clamp(0.62 + stand(x, y) * 0.1, 0.5, 0.72);
  const oldGrowth = (x: number, y: number) => clamp(0.45 + stand(x, y) * 0.15, 0.28, 0.58);
  const tree = (x: number, y: number, m: number) => (grove(x, y) > 0.2 && m > 0.42 ? F.aspen : F.conifer);

  for (let i = 0; i < N; i++) {
    if (g.feature[i] !== F.none || g.flags[i]) continue;
    const x = xOf(i);
    const y = yOf(i);
    const m = moisture[i]!;
    const h = (salt: number) => hash2f(w, x, y, salt);
    let f: number = F.none;
    const a = age[i]!;
    if (a > 0 && a < 20) {
      // A recent burn: fallen trunks, and aspen and pine seedlings coming up through the grass.
      if (h(2) < 0.1) f = F.log;
      else if (scatter(w, x, y, 1, 0.14)) f = m > 0.3 ? F.aspen : F.conifer;
      g.feature[i] = f;
      continue;
    }
    switch (g.terrain[i]) {
      case T.forest:
        // Trees stand side by side now (they're walked among); thickets are the young growth too close to pass.
        if (a >= 20 && a < 90 && thicket(x, y) > 0.2 && h(12) < 0.8) f = F.thicket;
        else if (h(1) < (a < 70 ? young : a < 160 ? forestTrees : oldGrowth)(x, y)) f = a < 70 && m > 0.35 && h(9) < 0.75 ? F.aspen : tree(x, y, m);
        else if (h(2) < (a >= 160 ? 0.07 : a < 70 ? 0.015 : 0.03)) f = F.log; // deadfall where the forest is old
        else if (fromOpen[i]! <= 2 && h(3) < 0.08) f = F.bush;
        break;
      case T.meadow:
        if (g.band[i] !== BAND.floor && scatter(w, x, y, 5, ridgeRocks(0.25, 0))) f = F.boulder;
        else if (h(1) < (g.band[i] === BAND.floor ? floorMeadow : hillMeadow)(x, y)) f = tree(x, y, m);
        else if (h(3) < (copse(x, y) > 0.15 ? 0.08 : 0.025)) f = F.bush; // roses round the copses
        break;
      case T.highMeadow:
        if (scatter(w, x, y, 5, ridgeRocks(0.3, 0.005))) f = F.boulder;
        else if (scatter(w, x, y, 4, krummholz(0.01))) f = F.stunted;
        else if (h(3) < 0.035) f = F.bush;
        break;
      case T.scrub:
        if (scatter(w, x, y, 5, ridgeRocks(0.35, 0.015))) f = F.boulder;
        else if (scatter(w, x, y, 4, krummholz(0.06))) f = F.stunted;
        else if (h(3) < 0.06) f = F.bush;
        break;
      case T.boulders:
        if (scatter(w, x, y, 5, ridgeRocks(0.45, 0.14))) f = F.boulder;
        break;
      case T.talus:
        if (scatter(w, x, y, 5, ridgeRocks(0.3, 0.03))) f = F.boulder;
        break;
    }
    // On ground the ice left lately, only rocks and the first shrubs; trees haven't reached it yet.
    if (fore[i] && f !== F.boulder && f !== F.bush) f = F.none;
    g.feature[i] = f;
  }
}

