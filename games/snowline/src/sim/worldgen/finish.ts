// Pipeline steps 7 and 8 (SPEC 6.3): game trails, then validation.

import { BAND, F, FEATURES, FLAG, T, TERRAIN, TRAIL_BY, WATER } from '../../content/terrain.ts';
import { VIEWPOINT_REVEAL } from '../../content/balance.ts';
import { type Gen, dist2, tilesWhere } from './gen.ts';
import { hash2f } from '../rng.ts';
import { perlin } from './noise.ts';
import { N, bfs, cheapestPath, forNeighbours4, line4 } from './grid.ts';
import { MIN_LAKE } from './geology.ts';

/** Drinkable, wadeable water: where trails lead. */
function drinkable(g: Gen, i: number): boolean {
  const t = g.terrain[i]!;
  return t === T.shallows || t === T.stream || t === T.gravel;
}

/**
 * Game trails (SPEC 6.3 step 7), worn by each animal along its own daily round, not from one den to
 * another: the elk (who make most of them) from bedding cover at a forest edge to their meadow, to water,
 * and down through the nearest pass toward lower ground; the bear from its den to the berry patches and to
 * water; the cougar from its lair to where the elk feed, and to water. Every pass (scramble route) funnels
 * whatever crosses it, so it gets a trail to the nearest trail or water. Marmots stay by their burrows.
 * Trails keep to easy grades (climbing is costly, so they contour), cross streams where they're narrow,
 * wander a little, and run together where one already goes.
 */
export function layTrails(g: Gen): void {
  const cost = (from: number, to: number) => {
    const t = g.terrain[to]!;
    if (!TERRAIN[t]!.passable) return Infinity;
    const f = FEATURES[g.feature[to]!]!;
    if (f.blocks && f.fixed) return Infinity;
    // A little roughness per tile (a root, a wet patch) so trails wander instead of running ruler-straight.
    // and a smooth field too (a boggy patch, a tangle of deadfall) so long trails bend round things.
    const x = to % 256;
    const y = (to - x) / 256;
    let c = TERRAIN[t]!.stepTicks / 6 + Math.abs(g.elev[to]! - g.elev[from]!) * 0.35 + (f.blocks ? 2.5 : 0) + hash2f(g.word, x, y, 41) * 0.5 + (perlin((g.word + 42) | 0, x / 11, y / 11) + 0.7) * 3;
    if (TERRAIN[t]!.water) c += 3;
    if (g.flags[to]! & FLAG.trail) c *= 0.4;
    return c;
  };
  let by: number = TRAIL_BY.elk;
  const lay = (route: { path: number[]; bends: number[] } | null) => {
    if (!route || route.path.length > 320) return;
    const path = route.path;
    g.trailLines.push(route.bends);
    for (const i of path) {
      if (g.water[i] !== WATER.none) continue;
      // The route is the animal's everywhere, but a worn path shows only where the ground holds a tread:
      // bare through the forest and scrub, patchy across grass, and gone over rock, talus, scree, and bog.
      if (!g.trailBy[i] || by === TRAIL_BY.bear) g.trailBy[i] = by;
      const t = g.terrain[i]!;
      const hold = t === T.forest || t === T.scrub || t === T.sand ? 1 : t === T.meadow || t === T.highMeadow ? 0.7 : t === T.snow ? 0.3 : 0;
      if (hold === 0 || hash2f(g.word, i % 256, (i - (i % 256)) / 256, 44) >= hold) continue;
      g.flags[i] = g.flags[i]! | FLAG.trail;
      if (!FEATURES[g.feature[i]!]!.fixed) g.feature[i] = F.none;
    }
  };
  /** What walking these tiles in turn costs (a diagonal step √2 times as much), or Infinity. */
  const walkCost = (tiles: readonly number[], from = 0, to = tiles.length - 1) => {
    let c = 0;
    for (let k = from + 1; k <= to && c < Infinity; k++) {
      const a = tiles[k - 1]!;
      const b = tiles[k]!;
      const diag = Math.abs(b - a) !== 1 && Math.abs(b - a) !== 256;
      c += cost(a, b) * (diag ? 1.4142135623730951 : 1);
    }
    return c;
  };
  /**
   * An eight-way route pulled taut, then laid as four-way tiles: from each bend, on to the farthest point
   * of the route that a straight line reaches for about the same effort. Animals walk toward where
   * they're going, not along the grid, so a trail runs at any angle and bends only where the ground
   * makes it (SPEC 6.3 step 7).
   */
  const taut = (route: number[], bends: number[]): number[] => {
    const out = [route[0]!];
    let i = 0;
    while (i < route.length - 1) {
      let j = Math.min(route.length - 1, i + 24);
      for (; j > i + 1; j--) {
        const line = line4(route[i]!, route[j]!);
        const dx = (route[j]! % 256) - (route[i]! % 256);
        const dy = Math.floor(route[j]! / 256) - Math.floor(route[i]! / 256);
        // A four-way line takes |dx| + |dy| steps to cover the straight distance; scale it to compare.
        const straight = (walkCost(line) * Math.sqrt(dx * dx + dy * dy)) / (Math.abs(dx) + Math.abs(dy));
        if (straight <= walkCost(route, i, j) * 1.06) break;
      }
      out.push(...line4(route[i]!, route[j]!).slice(1));
      if (!bends.length || bends[bends.length - 1] !== route[i]) bends.push(route[i]!);
      i = j;
    }
    bends.push(route[route.length - 1]!);
    return out;
  };
  const water = (i: number) => drinkable(g, i);
  const open = (i: number) => TERRAIN[g.terrain[i]!]!.passable && g.water[i] === WATER.none && !FEATURES[g.feature[i]!]!.blocks;
  /**
   * A trail from a to b that meanders: through a few waypoints pushed off the straight line by a smooth
   * field (so it swings in curves), each leg the easiest way between them.
   */
  let legs = 0;
  const meander = (a: number, b: number): { path: number[]; bends: number[] } | null => {
    const ax = a % 256;
    const ay = (a - ax) / 256;
    const bx = b % 256;
    const by2 = (b - bx) / 256;
    const dx = bx - ax;
    const dy = by2 - ay;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const k = Math.min(4, Math.floor(d / 14));
    const pts = [a];
    for (let j = 1; j <= k; j++) {
      const t = j / (k + 1);
      const swing = perlin((g.word + 43) | 0, legs * 3.1 + j * 0.9, 0.5) * Math.min(16, d * 0.22) * 2;
      const wx = Math.round(ax + dx * t - (dy / d) * swing);
      const wy = Math.round(ay + dy * t + (dx / d) * swing);
      // The nearest open ground to where the waypoint fell.
      let best = -1;
      let bd = Infinity;
      for (let yy = Math.max(1, wy - 6); yy <= Math.min(254, wy + 6); yy++) {
        for (let xx = Math.max(1, wx - 6); xx <= Math.min(254, wx + 6); xx++) {
          const n = yy * 256 + xx;
          const e = (xx - wx) * (xx - wx) + (yy - wy) * (yy - wy);
          if (e < bd && open(n)) {
            bd = e;
            best = n;
          }
        }
      }
      if (best >= 0) pts.push(best);
    }
    legs++;
    pts.push(b);
    const out: number[] = [];
    const bends: number[] = [];
    for (let j = 0; j + 1 < pts.length; j++) {
      const route = cheapestPath(pts[j]!, cost, (i) => i === pts[j + 1], true);
      if (!route) return null;
      const leg = taut(route, bends);
      out.push(...(j ? leg.slice(1) : leg));
    }
    return { path: out, bends };
  };
  const between = (a: number, b: number) => lay(meander(a, b));
  const toWater = (a: number) => {
    const p = cheapestPath(a, cost, water);
    if (p) lay(meander(a, p[p.length - 1]!));
  };
  const at = (animal: string) => {
    const t = g.territories.find((r) => r.animal === animal);
    return t ? t.y * 256 + t.x : -1;
  };
  /** The nearest tile to `from` (within `r`) where `test` holds, by straight distance, or -1. */
  const nearest = (from: number, r: number, test: (i: number) => boolean) => {
    let best = -1;
    let bd = Infinity;
    const fx = from % 256;
    const fy = (from - fx) / 256;
    for (let y = Math.max(0, fy - r); y <= Math.min(255, fy + r); y++) {
      for (let x = Math.max(0, fx - r); x <= Math.min(255, fx + r); x++) {
        const i = y * 256 + x;
        const d = (x - fx) * (x - fx) + (y - fy) * (y - fy);
        if (d < bd && test(i)) {
          bd = d;
          best = i;
        }
      }
    }
    return best;
  };
  const passes: number[] = [];
  const seenScree = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (seenScree[i] || g.terrain[i] !== T.scree) continue;
    const route = bfs([i], (n) => g.terrain[n] === T.scree, true);
    let first = -1;
    for (let n = 0; n < N; n++) {
      if (route[n]! < 0) continue;
      seenScree[n] = 1;
      if (first < 0) first = n;
    }
    passes.push(first);
  }

  // The elk: bedding in the timber by their meadow, the meadow, water, and down through the nearest pass.
  const elk = at('elk');
  if (elk >= 0) {
    const bed = nearest(elk, 12, (i) => g.terrain[i] === T.forest && !FEATURES[g.feature[i]!]!.blocks);
    if (bed >= 0) between(bed, elk);
    toWater(elk);
    const pass = passes.length ? passes.reduce((a, b) => (dist2(a, elk) <= dist2(b, elk) ? a : b)) : -1;
    if (pass >= 0 && dist2(pass, elk) <= 70 * 70) between(elk, pass);
  }
  // The bear: den to the berry patches it can reach in a day, and to water.
  by = TRAIL_BY.bear;
  const bear = at('bear');
  if (bear >= 0) {
    for (const p of g.patches) {
      const c = p.center.y * 256 + p.center.x;
      if (p.role === 'safe' && dist2(c, bear) <= 45 * 45) between(bear, c);
    }
    toWater(bear);
  }
  // The cougar: lair to where the elk feed, and to water.
  by = TRAIL_BY.cougar;
  const cougar = at('cougar');
  if (cougar >= 0) {
    if (elk >= 0) between(cougar, elk);
    toWater(cougar);
  }
  // Every meadow worth grazing has trails down to the nearest water: the elk and deer going to drink at
  // dusk. Laid one after another, they run together as they near the water, like a stream's branches.
  by = TRAIL_BY.elk;
  const grazing = (n: number) => g.terrain[n] === T.meadow || g.terrain[n] === T.highMeadow;
  const seenMeadow = new Uint8Array(N);
  const meadows: { at: number; size: number }[] = [];
  for (let i = 0; i < N; i++) {
    if (seenMeadow[i] || !grazing(i)) continue;
    const m = bfs([i], grazing);
    let size = 0;
    let sx = 0;
    let sy = 0;
    for (let n = 0; n < N; n++) {
      if (m[n]! < 0) continue;
      seenMeadow[n] = 1;
      size++;
      sx += n % 256;
      sy += (n - (n % 256)) / 256;
    }
    if (size < 30) continue;
    const c = Math.round(sy / size) * 256 + Math.round(sx / size);
    meadows.push({ at: grazing(c) && open(c) ? c : i, size });
  }
  meadows.sort((a, b) => b.size - a.size || a.at - b.at);
  for (const m of meadows.slice(0, 10)) toWater(m.at);
  // The bear's trail to water, once more, so it isn't lost under the elk's.
  if (bear >= 0) {
    by = TRAIL_BY.bear;
    toWater(bear);
  }

  // Every pass: on to the nearest trail, or down to water. Mostly the elk's.
  by = TRAIL_BY.elk;
  for (const p of passes) {
    let joined = false;
    for (let k = 0; k < N && !joined; k++) if (g.flags[k]! & FLAG.trail) joined = true;
    const found = cheapestPath(p, cost, (i) => (joined && (g.flags[i]! & FLAG.trail) !== 0 && i !== p) || water(i));
    if (found) lay(meander(p, found[found.length - 1]!));
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
