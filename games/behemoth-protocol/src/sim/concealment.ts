import { CONCEALMENT } from '../content/tuning';
import { revealRadius } from './behemoth';
import { beyondSight } from './conditions';
import type { Enemy } from './entities';
import { smoky } from './fire';
import type { World } from './world';

/**
 * Concealment (SPEC §4.5): units that can hide are invisible to the player while they stand in
 * concealing terrain (forest) outside the sensor reveal radius, and so is any unit standing in a
 * fire's smoke (SPEC §6 "Fire"). Clearing the trees, lining up a shot (the telegraph), firing, or
 * being hit gives them away.
 */

export function concealed(w: World, e: Enemy): boolean {
  // A trapdoor team is hidden by its lid until the hole is found (SPEC §7.4); then it stays marked.
  if (e.def.trapdoor) return !e.ai.marked;
  if (e.exposed > 0 || e.windup > 0 || e.salvoLeft > 0) return false;
  // Troops hide in the trees; smoke hides anything that isn't itself on fire (SPEC §6 "Fire").
  const inCover = e.def.canHide && w.terrain.concealsAt(e.x, e.y);
  if (!inCover && (e.burn || !smoky(w, e.x, e.y))) return false;
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
  if (!b.destroyed) w.terrain.reveal(b.x, b.y, revealRadius(b) * CONCEALMENT.mineSweep);
  for (const e of w.enemies) {
    if (!e.alive) continue;
    e.exposed = Math.max(0, e.exposed - dt);
    e.hidden = hiddenNow(w, e);
  }
}
