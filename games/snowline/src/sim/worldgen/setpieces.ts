// Pipeline step 6 (SPEC 6.3): set pieces, placed by constraint search. Each takes a random tile from
// the tiles that meet its rule, and claims room round it so no two overlap.
//
// Placement never reads the deal. Slots are placed the same way whatever was dealt, and only then
// labelled from it (this patch is the good lookalike, that outcrop the spark-stone), so changing the
// deal never moves the terrain (SPEC 11.4, deal tests).

import { PLANTS, REMEDIES, STONES, WATER_SOURCES } from '../../content/decks.ts';
import { BAND, F, FEATURES, FLAG, T, TERRAIN, WATER } from '../../content/terrain.ts';
import { hash2, nextInt, nextRange, pick, shuffle } from '../rng.ts';
import type { PatchRole } from '../world.ts';
import { type Gen, anyNear, clearAround, dist2, forBox, isOpenLand, pt, reserve, tilesWhere, xOf, yOf } from './gen.ts';
import { DX8, DY8, N, bfs } from './grid.ts';
import { neighbour } from './shape.ts';
import { SIZE } from '../world.ts';

const VEGETATED: readonly number[] = [T.meadow, T.forest, T.highMeadow, T.scrub];
const within = (a: number, b: number, lo: number, hi: number) => {
  const d = dist2(a, b);
  return d >= lo * lo && d <= hi * hi;
};

/** Random tiles to try before scanning the whole map for one that meets a rule. */
const SAMPLE_TRIES = 300;

/**
 * A random open-land tile meeting `test`, or -1. With `near`, only tiles within that box are looked
 * at; without it, random tiles are tried first and the whole map is scanned only if none fits. Either
 * way each tile that fits is equally likely.
 */
function choose(g: Gen, test: (i: number) => boolean, near?: { at: number; r: number }): number {
  const ok = (i: number) => isOpenLand(g, i) && test(i);
  if (near) {
    const c: number[] = [];
    forBox(near.at, near.r, (n) => {
      if (ok(n)) c.push(n);
    });
    return c.length ? pick(g.rng, c) : -1;
  }
  for (let k = 0; k < SAMPLE_TRIES; k++) {
    const i = nextInt(g.rng, N);
    if (ok(i)) return i;
  }
  const c = tilesWhere(ok);
  return c.length ? pick(g.rng, c) : -1;
}

/** The crash and start, once the ground is covered: clear round them and lay the forward section down. */
export function settleStart(g: Gen): void {
  if (g.terrain[g.start] === T.marsh || g.terrain[g.start] === T.reeds) g.terrain[g.start] = T.meadow;
  clearAround(g, g.start, 3);
  g.feature[g.crash] = F.crash;
  if (g.terrain[g.crash] === T.reeds || g.terrain[g.crash] === T.marsh) g.terrain[g.crash] = T.sand;
}

/** The rock overhang: the first shelter, at the forest's edge within 40 tiles of the start. */
function placeOverhang(g: Gen, fromFloor: Int32Array): string | null {
  const shelterOk = (s: number) =>
    s >= 0 &&
    !g.reserved[s] &&
    g.water[s] === WATER.none &&
    (g.band[s] === BAND.floor || g.band[s] === BAND.montane) &&
    TERRAIN[g.terrain[s]!]!.passable &&
    g.terrain[s] !== T.scree;
  const rock = choose(
    g,
    (i) =>
      g.band[i] === BAND.montane &&
      (g.terrain[i] === T.forest || g.terrain[i] === T.meadow) &&
      fromFloor[i]! >= 0 &&
      fromFloor[i]! <= 4 &&
      within(i, g.start, 12, 40) &&
      [0, 1, 2, 3].some((d) => shelterOk(neighbour(i, d))),
    { at: g.start, r: 40 },
  );
  if (rock < 0) return 'no site for the overhang';
  // The shelter faces downhill.
  let shelter = -1;
  let dir = 0;
  for (let d = 0; d < 4; d++) {
    const s = neighbour(rock, d);
    if (shelterOk(s) && (shelter < 0 || g.elev[s]! < g.elev[shelter]!)) {
      shelter = s;
      dir = d;
    }
  }
  g.feature[rock] = F.overhang;
  // The rock face runs either side of it, across the direction it faces.
  for (const side of [(dir + 1) % 4, (dir + 3) % 4]) {
    const s = neighbour(rock, side);
    if (s >= 0 && !g.reserved[s] && g.water[s] === WATER.none && TERRAIN[g.terrain[s]!]!.passable) g.feature[s] = F.overhang;
  }
  g.terrain[shelter] = T.shelter;
  clearAround(g, shelter, 1);
  g.overhang = { rock, shelter };
  reserve(g, shelter, 1);
  reserve(g, rock, 1);
  return null;
}

/**
 * Stone outcrops: the spark-stone and one other beside the overhang (so the overhang isn't simply
 * "where the spark-stone is"), and three of each stone across the valley.
 */
function placeOutcrops(g: Gen): string | null {
  const nearShelter = (i: number) => {
    const dx = Math.abs(xOf(i) - xOf(g.overhang.shelter));
    const dy = Math.abs(yOf(i) - yOf(g.overhang.shelter));
    const d = Math.max(dx, dy);
    return d >= 2 && d <= 4 && g.feature[i] !== F.overhang;
  };
  const sparks = g.rules.stones.indexOf('sparks');
  const edge = g.rules.stones.indexOf('edge');
  const spark = choose(g, nearShelter, { at: g.overhang.shelter, r: 4 });
  if (spark < 0) return 'no room for the spark-stone by the overhang';
  g.feature[spark] = F.outcrop;
  g.data[spark] = sparks;
  reserve(g, spark, 1);
  const decoy = choose(g, nearShelter, { at: g.overhang.shelter, r: 4 });
  if (decoy < 0) return 'no room for a second stone by the overhang';
  g.feature[decoy] = F.outcrop;
  g.data[decoy] = edge;
  reserve(g, decoy, 1);
  g.sparkOutcrop = spark;
  g.decoyOutcrop = decoy;
  g.outcrops.push({ stone: sparks, at: spark }, { stone: edge, at: decoy });
  for (let s = 0; s < STONES.length; s++) {
    for (let k = 0; k < 3; k++) {
      const at = choose(g, (i) => g.terrain[i] !== T.shelter);
      if (at < 0) continue;
      g.feature[at] = F.outcrop;
      g.data[at] = s;
      reserve(g, at, 2);
      g.outcrops.push({ stone: s, at });
    }
  }
  return null;
}

/** A patch of `size` tiles round a centre that meets `test`, labelled `thing`. Returns its centre, or -1. */
function placePatch(
  g: Gen,
  role: PatchRole,
  thing: number,
  size: number,
  test: (i: number) => boolean,
  near?: { at: number; r: number },
): number {
  const center = choose(g, (i) => test(i) && !FEATURES[g.feature[i]!]!.blocks, near);
  if (center < 0) return -1;
  const around: number[] = [];
  forBox(center, 2, (n) => {
    if (n !== center && isOpenLand(g, n) && VEGETATED.includes(g.terrain[n]!)) around.push(n);
  });
  around.sort((a, b) => hash2(g.word, xOf(a), yOf(a), 61) - hash2(g.word, xOf(b), yOf(b), 61) || a - b);
  const tiles = [center, ...around.slice(0, size - 1)];
  const feature = role === 'herb' ? F.herb : F.plant;
  for (const t of tiles) {
    g.feature[t] = feature;
    g.data[t] = thing;
  }
  reserve(g, center, 3);
  g.patches.push({ role, thing, center: pt(center), tiles: tiles.map(pt) });
  return center;
}

function placePlants(g: Gen): string | null {
  const { good, bad } = g.rules.lookalike;
  const berries = PLANTS.map((p, i) => (p.kind === 'berry' ? i : -1)).filter((i) => i >= 0);
  const others = berries.filter((i) => i !== good && i !== bad);
  const secondGood = others.find((i) => g.rules.plants[i] === 'nourishing') ?? good;
  const forestEdge = (i: number) =>
    (g.terrain[i] === T.meadow && anyNear(i, 2, (n) => g.terrain[n] === T.forest)) ||
    (g.terrain[i] === T.forest && anyNear(i, 2, (n) => g.terrain[n] === T.meadow));
  const berrySize = () => nextRange(g.rng, 4, 6);

  // The near patch is the safe lookalike, with its bad twin close by: the first lesson (SPEC 6.3).
  const s1 = placePatch(g, 'safe', good, berrySize(), (i) => forestEdge(i) && within(i, g.start, 8, 45), { at: g.start, r: 45 });
  if (s1 < 0) return 'no forest edge near the start for berries';
  const t1 = placePatch(g, 'lookalike', bad, berrySize(), (i) => VEGETATED.includes(g.terrain[i]!) && within(i, s1, 6, 13), { at: s1, r: 13 });
  if (t1 < 0) return 'no room for the lookalike berries';
  const s2 = placePatch(g, 'safe', good, berrySize(), (i) => g.terrain[i] === T.highMeadow);
  if (s2 < 0) return 'no high meadow for berries';
  const t2 = placePatch(g, 'lookalike', bad, berrySize(), (i) => VEGETATED.includes(g.terrain[i]!) && within(i, s2, 6, 13), { at: s2, r: 13 });
  if (t2 < 0) return 'no room for the high lookalike berries';
  placePatch(
    g,
    'safe',
    secondGood,
    berrySize(),
    (i) => (g.terrain[i] === T.highMeadow || forestEdge(i)) && dist2(i, s1) >= 625 && dist2(i, s2) >= 625,
  );
  for (const b of others) {
    for (let k = 0; k < 2; k++) placePatch(g, 'berries', b, berrySize(), (i) => VEGETATED.includes(g.terrain[i]!));
  }

  PLANTS.forEach((p, thing) => {
    if (p.kind === 'berry') return;
    const habitat =
      p.kind === 'bulb'
        ? (i: number) => g.terrain[i] === T.meadow || g.terrain[i] === T.highMeadow
        : p.kind === 'greens'
          ? (i: number) => g.terrain[i] === T.meadow || (g.band[i] === BAND.floor && anyNear(i, 2, (n) => g.terrain[n] === T.marsh))
          : (i: number) => g.terrain[i] === T.forest;
    for (let k = 0; k < 3; k++) placePatch(g, 'plant', thing, nextRange(g.rng, 2, 4), habitat);
  });
  REMEDIES.forEach((_, thing) => {
    for (let k = 0; k < 3; k++) placePatch(g, 'herb', thing, nextRange(g.rng, 2, 3), (i) => VEGETATED.includes(g.terrain[i]!));
  });
  return null;
}

/** Spawning gravel where the near stream meets the lake. */
function placeGravel(g: Gen): void {
  for (const i of g.streamA.slice(-4)) {
    if (g.terrain[i] === T.stream) g.terrain[i] = T.gravel;
    reserve(g, i, 1);
  }
}

/** The highest elevation within Chebyshev distance `r` of each tile: a sliding maximum, rows then columns. */
function boxMax(elev: Uint8Array, r: number): Uint8Array {
  const rows = new Uint8Array(N);
  const out = new Uint8Array(N);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let m = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(SIZE - 1, x + r); k++) m = Math.max(m, elev[y * SIZE + k]!);
      rows[y * SIZE + x] = m;
    }
  }
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      let m = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(SIZE - 1, y + r); k++) m = Math.max(m, rows[k * SIZE + x]!);
      out[y * SIZE + x] = m;
    }
  }
  return out;
}

/** The highest tile meeting `test`, or -1. */
function highest(g: Gen, test: (i: number) => boolean): number {
  let best = -1;
  for (let i = 0; i < N; i++) {
    if (!isOpenLand(g, i) || !test(i)) continue;
    if (best < 0 || g.elev[i]! > g.elev[best]!) best = i;
  }
  return best;
}

const highGround = (g: Gen, i: number) => g.band[i]! >= BAND.subalpine && !(g.flags[i]! & FLAG.pocket);

/** The signal knoll and the viewpoints: one that shows the wreckage, and a few other high points. */
function placeViewpoints(g: Gen): string | null {
  const max3 = boxMax(g.elev, 3);
  const max5 = boxMax(g.elev, 5);
  const knoll = highest(g, (i) => highGround(g, i) && g.elev[i]! >= max3[i]! && dist2(i, g.start) >= 2500);
  if (knoll < 0) return 'no signal knoll';
  clearAround(g, knoll, 1);
  reserve(g, knoll, 3);
  g.knoll = knoll;
  const view = highest(g, (i) => highGround(g, i) && within(i, g.wreck, 9, 24));
  if (view < 0) return 'no viewpoint for the wreckage';
  clearAround(g, view, 1);
  reserve(g, view, 2);
  g.viewpoints = [knoll, view];
  const peaks = tilesWhere((i) => isOpenLand(g, i) && g.band[i]! >= BAND.montane && g.elev[i]! >= max5[i]!);
  peaks.sort((a, b) => g.elev[b]! - g.elev[a]! || a - b);
  for (const p of peaks) {
    if (g.viewpoints.length >= 5) break;
    if (g.viewpoints.some((v) => dist2(v, p) < 1600)) continue;
    clearAround(g, p, 1);
    reserve(g, p, 2);
    g.viewpoints.push(p);
  }
  return null;
}

/** Home ranges for the bear, elk, cougar, and marmots: away from the start, near their food. */
function placeTerritories(g: Gen): string | null {
  const land = (i: number) => TERRAIN[g.terrain[i]!]!.passable && g.water[i] === WATER.none && !(g.flags[i]! & FLAG.pocket);
  const any = (test: (i: number) => boolean) => {
    const c = tilesWhere((i) => land(i) && test(i));
    return c.length ? pick(g.rng, c) : -1;
  };
  const highBerries = g.patches.filter((p) => p.role === 'safe' && g.band[p.center.y * SIZE + p.center.x] === BAND.subalpine)[0];
  const hb = highBerries ? highBerries.center.y * SIZE + highBerries.center.x : -1;
  const far = (i: number, d: number) => dist2(i, g.start) >= d * d;
  const bear =
    hb >= 0
      ? any((i) => g.band[i]! <= BAND.subalpine && g.band[i]! >= BAND.montane && within(i, hb, 8, 22) && far(i, 45))
      : -1;
  const bearAt = bear >= 0 ? bear : any((i) => g.band[i] === BAND.montane && far(i, 45));
  const elk = any((i) => g.terrain[i] === T.highMeadow && far(i, 50));
  const cougar = any((i) => g.band[i]! >= BAND.subalpine && far(i, 60) && anyNear(i, 3, (n) => g.terrain[n] === T.cliff));
  const marmot = any((i) => (g.terrain[i] === T.talus || g.terrain[i] === T.boulders) && far(i, 40));
  if (bearAt < 0 || elk < 0 || cougar < 0 || marmot < 0) return 'no room for an animal territory';
  g.territories = [
    { animal: 'bear', ...pt(bearAt), r: 20 },
    { animal: 'elk', ...pt(elk), r: 16 },
    { animal: 'cougar', ...pt(cougar), r: 24 },
    { animal: 'marmot', ...pt(marmot), r: 6 },
  ];
  return null;
}

/** The pack-rat midden: a rock crevice within reach of the overhang. */
function placeMidden(g: Gen): string | null {
  const s = g.overhang.shelter;
  const rocky = (i: number) =>
    g.terrain[i] === T.boulders ||
    g.terrain[i] === T.rock ||
    g.terrain[i] === T.talus ||
    anyNear(i, 1, (n) => g.feature[n] === F.boulder || g.terrain[n] === T.cliff);
  let at = choose(g, (i) => within(i, s, 10, 30) && rocky(i), { at: s, r: 30 });
  if (at < 0) at = choose(g, (i) => within(i, s, 10, 30), { at: s, r: 30 });
  if (at < 0) return 'no room for the midden';
  g.feature[at] = F.midden;
  reserve(g, at, 1);
  g.midden = at;
  return null;
}

/** Where each water source's cause would be. Only the foul source gets it, from the deal. */
function placeWaterCauses(g: Gen): string | null {
  const shore = choose(
    g,
    (i) => g.band[i] === BAND.floor && dist2(i, g.start) >= 35 * 35 && [0, 1, 2, 3].some((d) => g.water[neighbour(i, d)] === WATER.lake),
  );
  if (shore < 0) return 'no lake shore for the water cause';
  const upstream = (path: number[]) => {
    for (let k = Math.floor(path.length * 0.5); k >= 0; k--) if (g.terrain[path[k]!] === T.stream && !g.reserved[path[k]!]) return path[k]!;
    return -1;
  };
  const a = upstream(g.streamA);
  const b = upstream(g.streamB);
  if (a < 0 || b < 0) return 'no stream site for the water cause';
  g.waterCauseSites = [shore, a, b];
  for (const s of g.waterCauseSites) reserve(g, s, 2);
  const foul = g.rules.water.indexOf('foul');
  const site = g.waterCauseSites[foul]!;
  g.feature[site] = g.rules.waterCause === 'beaver' ? F.beaverDam : F.carcass;
  g.landmarks.push({ kind: g.rules.waterCause === 'beaver' ? 'beaver-dam' : 'carcass', ...pt(site) });
  if (WATER_SOURCES.length !== g.waterCauseSites.length) return 'water sources and sites disagree';
  return null;
}

/** Four to six landmarks from the pool (SPEC 6.3). One that can't be placed is skipped. */
function placeDetails(g: Gen): void {
  const count = nextRange(g.rng, 4, 6);
  const pool = shuffle(g.rng, ['waterfall', 'snag', 'bones', 'avalanche', 'tarn', 'arch'] as const);
  let placed = 0;
  for (const kind of pool) {
    if (placed >= count) break;
    let at = -1;
    switch (kind) {
      case 'waterfall': {
        const falls = tilesWhere((i) => g.terrain[i] === T.waterfall);
        if (falls.length) at = pick(g.rng, falls);
        break;
      }
      case 'snag':
        at = choose(g, (i) => g.feature[i] === F.conifer && g.band[i] === BAND.montane && dist2(i, g.start) >= 400);
        if (at >= 0) g.feature[at] = F.snag;
        break;
      case 'bones':
        at = choose(g, (i) => g.terrain[i] === T.highMeadow || g.terrain[i] === T.scrub);
        if (at >= 0) g.feature[at] = F.bones;
        break;
      case 'arch':
        at = choose(g, (i) => g.band[i] === BAND.alpine && (g.terrain[i] === T.rock || g.terrain[i] === T.talus));
        if (at >= 0) g.feature[at] = F.arch;
        break;
      case 'avalanche':
        at = choose(g, (i) => g.terrain[i] === T.forest && anyNear(i, 2, (n) => g.terrain[n] === T.cliff));
        if (at >= 0) carveAvalanche(g, at);
        break;
      case 'tarn':
        at = choose(
          g,
          (i) =>
            g.band[i]! >= BAND.subalpine &&
            !anyNear(i, 3, (n) => !isOpenLand(g, n) || g.band[n] !== g.band[i] || g.feature[n] !== F.none && FEATURES[g.feature[n]!]!.fixed),
        );
        if (at >= 0) carveTarn(g, at);
        break;
    }
    if (at < 0) continue;
    reserve(g, at, 2);
    g.landmarks.push({ kind, ...pt(at) });
    placed++;
  }
}

/** An old avalanche path: a three-wide strip cleared of trees, running downhill from the cliff. */
function carveAvalanche(g: Gen, top: number): void {
  let at = top;
  const seen = new Uint8Array(N);
  for (let step = 0; step < 24; step++) {
    seen[at] = 1;
    forBox(at, 1, (n) => {
      if (!FEATURES[g.feature[n]!]!.fixed) g.feature[n] = F.none;
      if (g.terrain[n] === T.forest) g.terrain[n] = T.meadow;
      g.flags[n] = g.flags[n]! | FLAG.avalanche;
    });
    let next = -1;
    for (let k = 0; k < 8; k++) {
      const nx = xOf(at) + DX8[k]!;
      const ny = yOf(at) + DY8[k]!;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const n = ny * SIZE + nx;
      if (seen[n] || g.water[n] !== WATER.none || !TERRAIN[g.terrain[n]!]!.passable || g.reserved[n]) continue;
      if (next < 0 || g.elev[n]! < g.elev[next]!) next = n;
    }
    if (next < 0 || g.band[next] === BAND.floor) break;
    at = next;
  }
}

/** A small mountain tarn: deep in the middle, shallows round it. */
function carveTarn(g: Gen, c: number): void {
  forBox(c, 3, (n, dx, dy) => {
    const d2 = dx * dx + dy * dy;
    if (d2 <= 6) g.feature[n] = F.none;
    if (d2 <= 1) g.terrain[n] = T.deep;
    else if (d2 <= 5) g.terrain[n] = T.shallows;
    else return;
    g.water[n] = WATER.tarn;
  });
}

/** Every set piece, in order. Returns the first problem, or null. */
export function placeSetPieces(g: Gen): string | null {
  const fromFloor = bfs(
    tilesWhere((i) => g.band[i] === BAND.floor && g.water[i] === WATER.none),
    () => true,
    false,
    6,
  );
  settleStart(g);
  const stages: (() => string | null | void)[] = [
    () => placeOverhang(g, fromFloor),
    () => placeOutcrops(g),
    () => placePlants(g),
    () => placeGravel(g),
    () => placeViewpoints(g),
    () => placeTerritories(g),
    () => placeMidden(g),
    () => placeWaterCauses(g),
    () => placeDetails(g),
  ];
  for (const stage of stages) {
    const problem = stage();
    if (problem) return problem;
  }
  return null;
}

