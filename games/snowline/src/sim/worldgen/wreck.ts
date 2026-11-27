// The start by the lake, and the tail wreckage high on the mountain: a ragged pocket of alpine ground
// walled by cliff (a headwall behind, a thin lip below), with a rockslide path below the lip that the
// severe storm will open (SPEC 6.3, 10).

import { BAND, F, FLAG, T, WATER } from '../../content/terrain.ts';
import { hash2f, pick } from '../rng.ts';
import { SIZE } from '../world.ts';
import { type Gen, UNSET, dist2, forBox, reserve, tilesWhere, xOf, yOf } from './gen.ts';
import { DX8, DY8, N, bfs, floodFill } from './grid.ts';
import { perlin } from './noise.ts';

/** The start: dry valley floor beside the lake, a few tiles from the near stream's mouth. */
export function chooseStart(g: Gen): string | null {
  const fromLake = bfs(
    tilesWhere((i) => g.water[i] === WATER.lake),
    () => true,
    false,
    3,
  );
  // Only on the main body of land, never an island or a spit cut off by cliffs.
  const seen = new Uint8Array(N);
  let mainland: number[] = [];
  for (let i = 0; i < N; i++) {
    if (seen[i] || g.water[i] !== WATER.none || g.terrain[i] === T.headwall || g.terrain[i] === T.cliff) continue;
    const part = floodFill(i, (n) => g.water[n] === WATER.none && g.terrain[n] !== T.headwall && g.terrain[n] !== T.cliff, seen);
    if (part.length > mainland.length) mainland = part;
  }
  const onMain = new Uint8Array(N);
  for (const n of mainland) onMain[n] = 1;
  const ok = (i: number) =>
    onMain[i] === 1 &&
    g.band[i] === BAND.floor &&
    g.water[i] === WATER.none &&
    g.terrain[i] !== T.headwall &&
    (fromLake[i] === 1 || fromLake[i] === 2) &&
    dist2(i, g.mouth) >= 9 &&
    dist2(i, g.mouth) <= 81;
  const candidates = tilesWhere(ok);
  if (candidates.length === 0) return 'no dry shore by the stream mouth';
  g.start = pick(g.rng, candidates);
  // The aircraft's forward section lies on the shore beside the survivor.
  let crash = -1;
  forBox(g.start, 1, (n, dx, dy) => {
    if (crash >= 0 || (dx !== 0 && dy !== 0) || n === g.start) return;
    if (g.water[n] === WATER.none && g.terrain[n] !== T.headwall && fromLake[n] === 1) crash = n;
  });
  if (crash < 0) {
    forBox(g.start, 1, (n, dx, dy) => {
      if (crash < 0 && (dx === 0) !== (dy === 0) && g.water[n] === WATER.none && g.terrain[n] !== T.headwall) crash = n;
    });
  }
  if (crash < 0) return 'no room for the crash';
  g.crash = crash;
  reserve(g, g.start, 4);
  return null;
}

/** The pocket's mean radius round the tail wreckage, and how far its edge wanders in or out. */
const POCKET_R = 5;
const POCKET_WOBBLE = 2;
/** Farthest the pocket and its walls (up to three tiles thick) reach from the wreckage. */
const POCKET_REACH = POCKET_R + POCKET_WOBBLE + 3;
/** The wreckage is at least this far from the start, in tiles. */
const WRECK_MIN_DIST = 90;
const SLIDE_LENGTH = 10;

export function sealWreck(g: Gen): string | null {
  // Open alpine ground, clear of cliffs and streams: best a ledge right under the rim, so the rim's
  // headwall is the pocket's back wall; otherwise open ground well clear of the rim too.
  const bad = (i: number) => g.band[i] !== BAND.alpine || g.water[i] !== WATER.none || (g.terrain[i] !== UNSET && g.terrain[i] !== T.headwall);
  const fromBad = bfs(tilesWhere(bad), () => true, true);
  const fromRim = bfs(tilesWhere((i) => g.terrain[i] === T.headwall), () => true, true);
  const far = (i: number) => fromBad[i]! >= POCKET_REACH + 1 && dist2(i, g.start) >= WRECK_MIN_DIST * WRECK_MIN_DIST;
  let candidates = tilesWhere((i) => far(i) && fromRim[i]! >= POCKET_R - 1 && fromRim[i]! <= POCKET_R + 1);
  if (candidates.length === 0) candidates = tilesWhere((i) => far(i) && fromRim[i]! >= POCKET_REACH + 1);
  if (candidates.length === 0) return 'no room for the wreck pocket';
  const c = pick(g.rng, candidates);
  g.wreck = c;
  const cx = xOf(c);
  const cy = yOf(c);

  // The pocket: a bench in the mountainside, its edge wandering in and out with the rock (not a circle).
  const edge = (n: number) => perlin((g.word + 120) | 0, xOf(n) / 3.5, yOf(n) / 3.5);
  const hollow = new Uint8Array(N);
  forBox(c, POCKET_R + POCKET_WOBBLE, (n, dx, dy) => {
    const r = POCKET_R + edge(n) * (POCKET_WOBBLE / 0.7);
    if (dx * dx + dy * dy < r * r && g.terrain[n] === UNSET) hollow[n] = 1;
  });
  const pocket = bfs([c], (n) => hollow[n] === 1);
  const inPocket = (n: number) => pocket[n]! >= 0;
  const wall = new Uint8Array(N);
  const ring: number[] = [];
  const addWall = (n: number) => {
    if (wall[n] || inPocket(n)) return;
    wall[n] = 1;
    ring.push(n);
  };
  // The first course of wall: every tile touching the pocket, corners too, so nothing slips through.
  forBox(c, POCKET_REACH, (n) => {
    if (!inPocket(n)) return;
    for (let k = 0; k < 8; k++) {
      const nx = xOf(n) + DX8[k]!;
      const ny = yOf(n) + DY8[k]!;
      if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE) addWall(ny * SIZE + nx);
    }
  });
  // The lip: the lowest of it, which is where the slope below gives way in the storm.
  let low = -1;
  for (const r of ring) {
    if (g.terrain[r] === T.headwall) continue;
    if (low < 0 || g.elev[r]! < g.elev[low]! || (g.elev[r] === g.elev[low] && r < low)) low = r;
  }
  if (low < 0) return 'no lip below the wreck pocket';
  // Thicker where the mountain rises behind the pocket (a headwall), thin at the lip; ragged everywhere.
  for (let course = 2; course <= 3; course++) {
    const outer = ring.slice();
    for (const r of outer) {
      for (let k = 0; k < 8; k++) {
        const nx = xOf(r) + DX8[k]!;
        const ny = yOf(r) + DY8[k]!;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const n = ny * SIZE + nx;
        if (dist2(n, low) <= 16 || (nx - cx) * (nx - cx) + (ny - cy) * (ny - cy) > POCKET_REACH * POCKET_REACH) continue;
        const rise = g.elev[n]! - g.elev[c]!;
        const rag = hash2f(g.word, nx, ny, 121);
        if (rise > 0 ? rag < (course === 2 ? 0.85 : 0.5) : rag < (course === 2 ? 0.3 : 0.08)) addWall(n);
      }
    }
  }
  for (let n = 0; n < N; n++) {
    if (inPocket(n)) {
      g.flags[n] = g.flags[n]! | FLAG.pocket;
      g.terrain[n] = T.talus;
    } else if (wall[n] && g.terrain[n] !== T.headwall) g.terrain[n] = T.cliff;
  }
  reserve(g, c, POCKET_REACH);
  g.feature[c] = F.tail;
  const east = c + 1;
  if (xOf(east) === xOf(c) + 1) g.feature[east] = F.tail;

  // The gap: the lip, round its lowest point.
  for (const r of ring) {
    if (dist2(r, low) <= 2 && g.terrain[r] === T.cliff) {
      g.slideGap.push(r);
      g.flags[r] = g.flags[r]! | FLAG.slideGap;
    }
  }

  // The slide's path runs downhill from the gap: loose talus, cleared of everything.
  const onPath = new Set<number>();
  let at = low;
  for (let step = 0; step < SLIDE_LENGTH; step++) {
    let next = -1;
    const x = xOf(at);
    const y = yOf(at);
    for (let k = 0; k < 8; k++) {
      const nx = x + DX8[k]!;
      const ny = y + DY8[k]!;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const n = ny * SIZE + nx;
      const t = g.terrain[n]!;
      if (onPath.has(n) || g.flags[n]! & (FLAG.pocket | FLAG.slideGap) || ring.includes(n)) continue;
      if (t === T.headwall || g.water[n] !== WATER.none) continue;
      if (next < 0 || g.elev[n]! < g.elev[next]!) next = n;
    }
    if (next < 0 || g.terrain[next] === T.cliff) break;
    onPath.add(next);
    g.slidePath.push(next);
    g.terrain[next] = T.talus;
    g.flags[next] = g.flags[next]! | FLAG.slidePath;
    reserve(g, next, 1);
    at = next;
  }
  return null;
}
