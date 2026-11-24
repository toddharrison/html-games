import { inFrame } from './frame';
import type { Enemy } from './entities';
import type { World } from './world';

/**
 * A masked unit (`EnemyDef.masked`: an armored train's ambush car, SPEC-armored-train.md §T21). It
 * looks like something harmless and its guns are hidden and silent, until the Behemoth comes
 * within range of it on screen or a hit on it gives the game away. Then the mask comes off (an
 * `unmask` event: its side panels are blown clear, toward the Behemoth), and a moment later its
 * guns lay and fire like any unit's. It takes damage the same either way.
 */

/** Whether a unit still has its cover on (it's drawn as what it pretends to be, its turrets hidden). */
export function masked(e: Enemy): boolean {
  return !!e.ai.masked;
}

/**
 * Steps a masked unit's cover. Returns whether it may aim and fire this step: not with the mask on,
 * nor for `drop` s after it comes off. A unit out of the fight (abandoned, underground) keeps it on.
 */
export function stepMask(w: World, e: Enemy, dt: number): boolean {
  const m = e.def.masked;
  const ai = e.ai;
  if (!m) return true;
  if (ai.masked) {
    const b = w.behemoth;
    const near = !b.destroyed && Math.hypot(b.x - e.x, b.y - e.y) <= m.range;
    if (ai.under || ai.charging || w.extractedAt !== null || !inFrame(w.frame, e) || !(near || e.hp < e.def.hp)) return false;
    delete ai.masked;
    ai.maskT = m.drop;
    // Its guns come up laid on the hull, loaded: the telegraph is the mask coming off, and each gun's own aim after it.
    const toward = Math.atan2(b.y - e.y, b.x - e.x);
    for (const g of [e, ...e.guns]) {
      g.turret = toward;
      g.cooldown = 0;
      g.windup = 0;
    }
    w.events.push({ type: 'unmask', id: e.id, x: e.x, y: e.y, heading: e.heading, side: Math.sign(b.y - e.y) || 1 });
    return false;
  }
  if (ai.maskT === undefined) return true;
  ai.maskT -= dt;
  if (ai.maskT > 0) return false;
  delete ai.maskT;
  return true;
}
