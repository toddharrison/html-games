// The start by the lake, and the tail wreckage high on the mountain: a pocket of alpine ground sealed
// by a ring of cliff, with a rockslide path below it that the severe storm will open (SPEC 6.3, 10).

import { BAND, F, FLAG, T, WATER } from '../../content/terrain.ts';
import { pick } from '../rng.ts';
import { SIZE } from '../world.ts';
import { type Gen, UNSET, dist2, forBox, reserve, tilesWhere, xOf, yOf } from './gen.ts';
import { DX8, DY8, bfs } from './grid.ts';

/** The start: dry valley floor beside the lake, a few tiles from the near stream's mouth. */
export function chooseStart(g: Gen): string | null {
  const fromLake = bfs(
    tilesWhere((i) => g.water[i] === WATER.lake),
    () => true,
    false,
    3,
  );
  const ok = (i: number) =>
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

/** Radius of the sealed pocket round the tail wreckage. */
const POCKET_R = 5;
const RING_OUTER2 = (POCKET_R + 1.5) * (POCKET_R + 1.5);
/** The wreckage is at least this far from the start, in tiles. */
const WRECK_MIN_DIST = 90;
const SLIDE_LENGTH = 10;

export function sealWreck(g: Gen): string | null {
  // Only open alpine ground, well clear of cliffs, streams, and the rim, can hold the pocket.
  const bad = (i: number) => g.band[i] !== BAND.alpine || g.water[i] !== WATER.none || g.terrain[i] !== UNSET;
  const fromBad = bfs(tilesWhere(bad), () => true, true);
  const candidates = tilesWhere((i) => fromBad[i]! >= POCKET_R + 3 && dist2(i, g.start) >= WRECK_MIN_DIST * WRECK_MIN_DIST);
  if (candidates.length === 0) return 'no room for the wreck pocket';
  const c = pick(g.rng, candidates);
  g.wreck = c;

  const ring: number[] = [];
  forBox(c, POCKET_R + 2, (n, dx, dy) => {
    const d2 = dx * dx + dy * dy;
    if (d2 < POCKET_R * POCKET_R) {
      g.flags[n] = g.flags[n]! | FLAG.pocket;
      g.terrain[n] = T.talus;
    } else if (d2 < RING_OUTER2) {
      g.terrain[n] = T.cliff;
      ring.push(n);
    }
  });
  reserve(g, c, POCKET_R + 3);
  g.feature[c] = F.tail;
  const east = c + 1;
  if (xOf(east) === xOf(c) + 1) g.feature[east] = F.tail;

  // The gap: where the ring is lowest, which is where the slope below gives way in the storm.
  let low = ring[0]!;
  for (const r of ring) if (g.elev[r]! < g.elev[low]!) low = r;
  for (const r of ring) {
    if (dist2(r, low) <= 2) {
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
