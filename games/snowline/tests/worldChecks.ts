// Checks on a finished World, from the outside: the same promises world generation's own validation
// makes (SPEC 6.3, 6.6), tested again through the public World so a bug in the validator can't hide
// a broken valley. Shared by the sample in `npm test` and the 1,000-seed sweep.

import { PLANTS } from '../src/content/decks.ts';
import { VIEWPOINT_REVEAL } from '../src/content/balance.ts';
import { F, FLAG, T, WATER } from '../src/content/terrain.ts';
import type { Rules } from '../src/sim/rules.ts';
import { idx, passableAt, type Point, type World } from '../src/sim/world.ts';

function reachFrom(w: World, start: Point, extra?: (i: number) => boolean): Int32Array {
  const n = w.size * w.size;
  const dist = new Int32Array(n).fill(-1);
  const q = [idx(start.x, start.y)];
  dist[q[0]!] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h]!;
    const x = i % w.size;
    const y = (i - x) / w.size;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w.size || ny >= w.size) continue;
      const j = idx(nx, ny);
      if (dist[j] !== -1 || !(passableAt(w, j) || extra?.(j))) continue;
      dist[j] = dist[i]! + 1;
      q.push(j);
    }
  }
  return dist;
}

const touch = (reach: Int32Array, w: World, p: Point) =>
  [
    [0, 0],
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ].some(([dx, dy]) => {
    const x = p.x + dx!;
    const y = p.y + dy!;
    return x >= 0 && y >= 0 && x < w.size && y < w.size && reach[idx(x, y)]! >= 0;
  });

export function checkWorld(w: World, rules: Rules): string[] {
  const out: string[] = [];
  const reach = reachFrom(w, w.start);
  const at = (p: Point) => idx(p.x, p.y);
  if (!passableAt(w, at(w.start))) out.push('start not walkable');
  if (!touch(reach, w, w.overhang.shelter)) out.push('overhang out of reach');
  if (w.terrain[at(w.overhang.shelter)] !== T.shelter) out.push('overhang has no shelter floor');
  if (!touch(reach, w, w.sparkOutcrop)) out.push('spark-stone out of reach');
  if (rules.stones[w.data[at(w.sparkOutcrop)]!] !== 'sparks') out.push('the overhang outcrop is not the dealt spark-stone');
  const dx = w.sparkOutcrop.x - w.overhang.shelter.x;
  const dy = w.sparkOutcrop.y - w.overhang.shelter.y;
  if (dx * dx + dy * dy > 32) out.push('spark-stone not by the overhang');

  // Gravel shallows lie only in water a kid can wade, and never under a log.
  for (let i = 0; i < w.size * w.size; i++) {
    if (!(w.flags[i]! & FLAG.ford)) continue;
    const t = w.terrain[i];
    if (t !== T.stream && t !== T.gravel && t !== T.shallows) out.push(`gravel shallows on dry ground at ${i % w.size},${Math.floor(i / w.size)}`);
    if (w.flags[i]! & FLAG.bridge) out.push(`gravel shallows under a log at ${i % w.size},${Math.floor(i / w.size)}`);
  }

  // Food: the near safe patch is the good lookalike, its twin is the bad one, both placed.
  const safe = w.patches.filter((p) => p.role === 'safe');
  const twins = w.patches.filter((p) => p.role === 'lookalike');
  if (safe.length < 2 || safe.length > 3) out.push(`${safe.length} safe berry patches`);
  if (twins.length < 1 || twins.length > 2) out.push(`${twins.length} lookalike patches`);
  if (!safe[0] || rules.plants[safe[0].thing] !== 'nourishing') out.push('the near safe patch is not nourishing');
  if (!safe[0]?.tiles.some((t) => reach[at(t)]! >= 0)) out.push('the near safe patch is out of reach');
  for (const t of twins) {
    if (t.thing !== rules.lookalike.bad) out.push('a lookalike patch is not the bad twin');
    if (PLANTS[t.thing]!.family !== PLANTS[rules.lookalike.good]!.family) out.push('a lookalike patch is not of the safe family');
  }
  for (const p of w.patches) {
    for (const t of p.tiles) {
      const f = w.feature[at(t)];
      if (f !== F.plant && f !== F.herb) out.push(`patch tile ${t.x},${t.y} lost its plant`);
    }
  }

  // Water: two sources near the start, so the foul one is never the only one.
  let lakeNear = false;
  let streamNear = false;
  for (let i = 0; i < reach.length; i++) {
    if (reach[i]! < 0 || reach[i]! > 30) continue;
    if (w.water[i] === WATER.lake) lakeNear = true;
    if (w.water[i] === WATER.streamA) streamNear = true;
  }
  if (!lakeNear || !streamNear) out.push('the start lacks two water sources nearby');
  const foul = rules.water.indexOf('foul');
  const site = w.waterCauseSites[foul];
  if (!site || !([F.beaverDam, F.carcass] as number[]).includes(w.feature[at(site)]!)) out.push('the foul water has no cause on the map');

  // The wreckage: sealed now, opened by the rockslide, and seen from a reachable viewpoint.
  for (let i = 0; i < reach.length; i++) {
    if (w.flags[i]! & FLAG.pocket && reach[i]! >= 0) {
      out.push('wreckage reachable before the rockslide');
      break;
    }
  }
  const after = reachFrom(w, w.start, (i) => (w.flags[i]! & FLAG.slideGap) !== 0);
  if (!touch(after, w, w.wreck)) out.push('the rockslide does not open the wreckage');
  if (!w.viewpoints.some((v) => reach[at(v)]! >= 0 && (v.x - w.wreck.x) ** 2 + (v.y - w.wreck.y) ** 2 <= VIEWPOINT_REVEAL ** 2)) {
    out.push('no reachable viewpoint shows the wreckage');
  }
  if (w.feature[at(w.wreck)] !== F.tail) out.push('no tail wreckage');
  if (!reach[at(w.knoll)] || reach[at(w.knoll)]! < 0) out.push('signal knoll out of reach');
  if (w.territories.length !== 4) out.push('missing animal territories');
  if (w.landmarks.length < 4) out.push(`only ${w.landmarks.length} landmarks`);

  // The rim holds: every edge tile is headwall, or the falls where the lake's outlet leaves the valley.
  for (let k = 0; k < w.size; k++) {
    for (const i of [idx(k, 0), idx(k, w.size - 1), idx(0, k), idx(w.size - 1, k)]) {
      if (w.terrain[i] !== T.headwall && w.terrain[i] !== T.waterfall) {
        out.push('the rim has a gap');
        k = w.size;
        break;
      }
    }
  }
  return out;
}
