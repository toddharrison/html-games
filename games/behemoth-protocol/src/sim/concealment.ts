import { revealRadius } from './behemoth';
import { beyondSight } from './conditions';
import type { Enemy } from './entities';
import type { World } from './world';

/**
 * Concealment (SPEC §4.5): units that can hide are invisible to the player while they stand in
 * concealing terrain (forest) outside the sensor reveal radius. Clearing the trees, lining up a
 * shot (the telegraph), firing, or being hit gives them away.
 */

export function concealed(w: World, e: Enemy): boolean {
  if (!e.def.canHide || e.exposed > 0 || e.windup > 0 || e.salvoLeft > 0) return false;
  if (!w.terrain.concealsAt(e.x, e.y)) return false;
  const b = w.behemoth;
  return Math.hypot(e.x - b.x, e.y - b.y) - e.def.radius > revealRadius(b);
}

/** Hidden from the player: concealed in cover, or lost in the dark or the storm (SPEC §4.6). */
export function hiddenNow(w: World, e: Enemy): boolean {
  return concealed(w, e) || beyondSight(w, e);
}

export function stepConcealment(w: World, dt: number): void {
  // Minefields show up as the sensors sweep them (SPEC §4.5), and stay marked.
  const b = w.behemoth;
  if (!b.destroyed) w.terrain.reveal(b.x, b.y, revealRadius(b));
  for (const e of w.enemies) {
    if (!e.alive) continue;
    e.exposed = Math.max(0, e.exposed - dt);
    e.hidden = hiddenNow(w, e);
  }
}
