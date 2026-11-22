import { COVER } from '../../content/tuning';
import { hullWidth } from '../behemoth';
import type { Enemy } from '../entities';
import { clamp } from '../math';
import type { World } from '../world';
import { goTo } from './steer';

/**
 * Ambusher behavior (infantry): walk to the best cover within `engage.maxRange` (forest, a
 * building to garrison, or rubble) beside the Behemoth's path and hold there, firing as it rolls
 * past. Buildings protect best, so they win over trees nearby. Too slow to keep
 * up, so once passed they're left behind. If their cover burns or is flattened they move on to
 * the next bit; with no cover nearby they stand in the open off to one side of its path.
 */
export function ambusher(e: Enemy, w: World, dt: number): { vx: number; vy: number } {
  const ai = e.ai;
  ai.retargetIn -= dt;
  if (!ai.anchor || ai.retargetIn <= 0) {
    ai.retargetIn = 1;
    const ts = w.terrain.tileSize;
    const lost = ai.anchor && !w.terrain.isCover(Math.floor(ai.anchor.x / ts), Math.floor(ai.anchor.y / ts));
    if (!ai.anchor || lost) ai.anchor = findCover(e, w) ?? openGround(e, w);
  }
  return goTo(e, ai.anchor.x, ai.anchor.y);
}

/** Lateral distance band from the Behemoth's path where a squad wants to be. */
function lane(e: Enemy, w: World): { min: number; max: number } {
  return { min: hullWidth(w.behemoth) / 2 + 18, max: e.def.fireRange * 0.7 };
}

/** The best cover tile within reach, or null. Favors close tiles beside (not in) the path, ahead. */
export function findCover(e: Enemy, w: World): { x: number; y: number } | null {
  const b = w.behemoth;
  const { min, max } = lane(e, w);
  return bestCover(e, w, e.def.engage.maxRange, (x, y, d) => {
    const lat = Math.abs(y - b.y);
    let score = d;
    if (lat < min) score += (min - lat) * 3;
    else if (lat > max) score += (lat - max) * 2;
    if (x < b.x) score += (b.x - x) * 2;
    return score;
  });
}

/**
 * The cover tile within `reach` of the unit with the lowest `score(x, y, distance)` (null =
 * unsuitable), less a bonus for better protection (`COVER.preference`), jittered within the tile so
 * squads sharing a wood don't stack. A building tile only counts if it has a window toward the
 * Behemoth (an open neighbor on that side): deep inside a block there's nothing to shoot at.
 */
export function bestCover(
  e: Enemy,
  w: World,
  reach: number,
  score: (x: number, y: number, d: number) => number | null,
): { x: number; y: number } | null {
  const t = w.terrain;
  const b = w.behemoth;
  const ts = t.tileSize;
  const c0 = Math.floor((e.x - reach) / ts);
  const c1 = Math.floor((e.x + reach) / ts);
  const r0 = Math.max(0, Math.floor((e.y - reach) / ts));
  const r1 = Math.min(t.rows - 1, Math.floor((e.y + reach) / ts));

  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      if (!t.isCover(c, r)) continue;
      const x = (c + 0.5) * ts;
      const y = (r + 0.5) * ts;
      const d = Math.hypot(x - e.x, y - e.y);
      if (d > reach) continue;
      if (t.blocksShot(c, r) && !hasWindow(w, c, r, b.x - x, b.y - y)) continue;
      const s = score(x, y, d);
      if (s === null) continue;
      const total = s - COVER.preference * t.protection(c, r);
      if (total < bestScore) {
        bestScore = total;
        best = { x, y };
      }
    }
  }
  if (!best) return null;
  return { x: best.x + w.rng.range(-4, 4), y: best.y + w.rng.range(-4, 4) };
}

/** A tile has an open neighbor (one that doesn't stop fire) on a side facing direction (dx, dy). */
function hasWindow(w: World, c: number, r: number, dx: number, dy: number): boolean {
  const t = w.terrain;
  if (dx !== 0 && !t.blocksShot(c + Math.sign(dx), r)) return true;
  if (dy !== 0 && !t.blocksShot(c, r + Math.sign(dy))) return true;
  return false;
}

/** No cover: stand in the open, off to the side of the Behemoth's path. */
function openGround(e: Enemy, w: World): { x: number; y: number } {
  const b = w.behemoth;
  const { min, max } = lane(e, w);
  const side = Math.sign(e.y - b.y) || e.ai.orbitDir;
  const lat = clamp(Math.abs(e.y - b.y), min, max);
  const y = clamp(b.y + side * lat, e.def.radius, w.terrain.height - e.def.radius);
  return { x: e.x, y: clamp(y, e.y - e.def.engage.maxRange, e.y + e.def.engage.maxRange) };
}
