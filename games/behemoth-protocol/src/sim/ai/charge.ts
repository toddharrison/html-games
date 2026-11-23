import type { ChargeDef } from '../../content/behaviors';
import { BOMB } from '../../content/tuning';
import type { Enemy } from '../entities';
import { frameRight } from '../frame';
import type { World } from '../world';
import type { Goal } from './nav';
import { chargeOffset } from './smarts';

/**
 * Charge (SPEC §7.4 bomb truck): drive flat out at where the Behemoth will be by the time it gets
 * there (`navigate` fords a river on the way if it must). The run starts the moment it's in the
 * frame (an event for its alarm), and from then on the view strobes it.
 */
export function charge(e: Enemy, c: ChargeDef, w: World, _dt: number): Goal {
  const b = w.behemoth;
  if (!e.ai.charging && e.x >= w.frame.left && e.x <= frameRight(w.frame)) {
    e.ai.charging = true;
    w.events.push({ type: 'charge', id: e.id, x: e.x, y: e.y });
  }
  const dist = Math.hypot(b.x - e.x, b.y - e.y);
  e.ai.close = dist < BOMB.close;
  const lead = Math.min(c.maxLead, dist / e.def.maxSpeed);
  // Smart: wide of the main gun's line while it's still out there.
  const p = chargeOffset(e, w, b.x + b.vx * lead, b.y + b.vy * lead);
  return { x: p.x, y: p.y, mode: 'speed', speed: e.def.maxSpeed, contact: true };
}
