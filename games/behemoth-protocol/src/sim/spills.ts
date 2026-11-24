import { isWet } from '../content/terrain';
import { OIL } from '../content/tuning';
import { allocId, type OilSpill } from './entities';
import { burning, splashFuel } from './fire';
import type { World } from './world';

/**
 * Oil spills (SPEC §7.3: a wrecked train vehicle leaks them): a slick on the ground that does
 * nothing until fire reaches it. A burning tile under it, or a plasma pool lapping into it, sets
 * the whole slick alight at once: every tile of it burns as spilt fuel does (`splashFuel`), and
 * the slick is gone. Left alone it soaks away after `OIL.life` seconds.
 */

/** Spill oil at a point, unless it's water (it washes away). */
export function spillOil(w: World, x: number, y: number, radius: number): void {
  const t = w.terrain.tileAt(x, y);
  if (!t || isWet(t.mat)) return;
  w.spills.push({ id: allocId(w), x, y, radius, age: 0 });
}

/** The tiles a spill lies on: every one whose center is within its radius, and the one under its middle. */
function tilesOf(w: World, s: OilSpill): [number, number][] {
  const ts = w.terrain.tileSize;
  const out: [number, number][] = [[Math.floor(s.x / ts), Math.floor(s.y / ts)]];
  for (let c = Math.floor((s.x - s.radius) / ts); c <= Math.floor((s.x + s.radius) / ts); c++) {
    for (let r = Math.floor((s.y - s.radius) / ts); r <= Math.floor((s.y + s.radius) / ts); r++) {
      if ((c !== out[0]![0] || r !== out[0]![1]) && Math.hypot((c + 0.5) * ts - s.x, (r + 0.5) * ts - s.y) <= s.radius) out.push([c, r]);
    }
  }
  return out;
}

export function stepSpills(w: World, dt: number): void {
  if (w.spills.length === 0) return;
  w.spills = w.spills.filter((s) => {
    s.age += dt;
    if (s.age >= OIL.life) return false;
    const tiles = tilesOf(w, s);
    const lit = tiles.some(([c, r]) => burning(w, c, r)) || w.pools.some((p) => Math.hypot(p.x - s.x, p.y - s.y) < p.pool.radius + s.radius);
    if (!lit) return true;
    for (const [c, r] of tiles) splashFuel(w, c, r, OIL.burn, true);
    w.events.push({ type: 'oilIgnite', x: s.x, y: s.y, radius: s.radius });
    return false;
  });
}
