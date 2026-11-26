// Pipeline steps 7 and 8 (SPEC 6.3): game trails, then validation.

import { BAND, F, FEATURES, FLAG, T, TERRAIN, WATER } from '../../content/terrain.ts';
import { VIEWPOINT_REVEAL } from '../../content/balance.ts';
import { type Gen, dist2, tilesWhere } from './gen.ts';
import { N, bfs, cheapestPath, forNeighbours4 } from './grid.ts';
import { MIN_LAKE } from './shape.ts';

/** Drinkable, wadeable water: where trails lead. */
function drinkable(g: Gen, i: number): boolean {
  const t = g.terrain[i]!;
  return t === T.shallows || t === T.stream || t === T.gravel;
}

/** Game trails from each animal's range, and from the high berries, down to the nearest water. */
export function layTrails(g: Gen): void {
  const sources = g.territories.map((t) => t.y * 256 + t.x);
  const high = g.patches.find((p) => p.role === 'safe' && g.band[p.center.y * 256 + p.center.x] === BAND.subalpine);
  if (high) sources.push(high.center.y * 256 + high.center.x);
  for (const s of sources) {
    const path = cheapestPath(
      s,
      (_, to) => {
        const t = g.terrain[to]!;
        if (!TERRAIN[t]!.passable) return Infinity;
        const f = FEATURES[g.feature[to]!]!;
        if (f.blocks && f.fixed) return Infinity;
        return TERRAIN[t]!.stepTicks / 6 + (f.blocks ? 3 : 0) + (g.flags[to]! & FLAG.trail ? -0.5 : 0);
      },
      (i) => drinkable(g, i),
    );
    if (!path || path.length > 220) continue;
    for (const i of path) {
      if (g.water[i] !== WATER.none) continue;
      g.flags[i] = g.flags[i]! | FLAG.trail;
      if (!FEATURES[g.feature[i]!]!.fixed) g.feature[i] = F.none;
    }
  }
}

const walkable = (g: Gen, i: number) => TERRAIN[g.terrain[i]!]!.passable && !FEATURES[g.feature[i]!]!.blocks;

/** Every validation check (SPEC 6.3 and 6.6's map checks). An empty list means the valley is good. */
export function validate(g: Gen): string[] {
  const problems: string[] = [];
  const reach = bfs([g.start], (i) => walkable(g, i));
  const reached = (i: number) => reach[i]! >= 0;
  /** Reachable, or a reachable tile is next to it (for things you use from beside them). */
  const touchable = (i: number) => {
    if (reached(i)) return true;
    let ok = false;
    forNeighbours4(i, (n) => {
      if (reached(n)) ok = true;
    });
    return ok;
  };
  const nearest = (test: (i: number) => boolean) => {
    let best = Infinity;
    for (let i = 0; i < N; i++) {
      if (!test(i)) continue;
      let d = reached(i) ? reach[i]! : Infinity;
      forNeighbours4(i, (n) => {
        if (reached(n) && reach[n]! + 1 < d) d = reach[n]! + 1;
      });
      if (d < best) best = d;
    }
    return best;
  };

  if (g.lakeSize < MIN_LAKE) problems.push('lake too small');
  if (!walkable(g, g.start)) problems.push('start is not walkable');
  // Water near the start from two different sources, so the foul one is never the only one (SPEC 6.6).
  if (nearest((i) => g.water[i] === WATER.lake && g.terrain[i] === T.shallows) > 25) problems.push('no lake water near the start');
  if (nearest((i) => g.water[i] === WATER.streamA && TERRAIN[g.terrain[i]!]!.passable) > 30) problems.push('no stream water near the start');
  if (!reached(g.overhang.shelter)) problems.push('the overhang is out of reach');
  else if (reach[g.overhang.shelter]! > 90) problems.push('the overhang is too far on foot');
  if (!touchable(g.sparkOutcrop)) problems.push('the spark-stone is out of reach');
  const s1 = g.patches.find((p) => p.role === 'safe');
  if (!s1 || !s1.tiles.some((t) => reached(t.y * 256 + t.x))) problems.push('the near safe berries are out of reach');
  if (nearest((i) => g.terrain[i] === T.reeds) > 90) problems.push('no reeds (cattails) near the start');
  if (!reached(g.knoll)) problems.push('the signal knoll is out of reach');
  const sub = tilesWhere((i) => g.band[i] === BAND.subalpine && reached(i)).length;
  const alp = tilesWhere((i) => g.band[i] === BAND.alpine && reached(i)).length;
  if (sub < 800) problems.push(`little subalpine ground in reach (${sub})`);
  if (alp < 200) problems.push(`little alpine ground in reach (${alp})`);
  if (!g.viewpoints.some((v) => reached(v) && dist2(v, g.wreck) <= VIEWPOINT_REVEAL * VIEWPOINT_REVEAL)) {
    problems.push('no viewpoint in reach shows the wreckage');
  }

  // The wreckage: sealed until the rockslide, open after it.
  for (let i = 0; i < N; i++) {
    if (g.flags[i]! & FLAG.pocket && reached(i)) {
      problems.push('the wreckage can be reached before the rockslide');
      break;
    }
  }
  if (g.slideGap.length === 0) problems.push('no rockslide gap');
  const after = bfs([g.start], (i) => walkable(g, i) || (g.flags[i]! & FLAG.slideGap) !== 0);
  let wreckOpen = after[g.wreck]! >= 0;
  forNeighbours4(g.wreck, (n) => {
    if (after[n]! >= 0) wreckOpen = true;
  });
  if (!wreckOpen) problems.push('the rockslide does not open a way to the wreckage');
  return problems;
}
