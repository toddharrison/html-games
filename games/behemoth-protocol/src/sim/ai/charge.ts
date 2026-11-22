import { BOMB } from '../../content/tuning';
import type { Enemy } from '../entities';
import { frameRight } from '../frame';
import type { World } from '../world';
import { viaFord } from './crossing';
import { goTo } from './steer';

/**
 * Charge (SPEC §7.4 bomb truck): drive flat out at where the Behemoth will be by the time it gets
 * there, fording a river on the way if it must. The run starts the moment it's in the frame (an
 * event for its alarm), and from then on the view strobes it.
 */
export function charge(e: Enemy, w: World, _dt: number): { vx: number; vy: number } {
  const b = w.behemoth;
  if (!e.ai.charging && e.x >= w.frame.left && e.x <= frameRight(w.frame)) {
    e.ai.charging = true;
    w.events.push({ type: 'charge', id: e.id, x: e.x, y: e.y });
  }
  const dist = Math.hypot(b.x - e.x, b.y - e.y);
  e.ai.close = dist < BOMB.close;
  const lead = Math.min(BOMB.maxLead, dist / e.def.maxSpeed);
  const tx = b.x + b.vx * lead;
  const ty = b.y + b.vy * lead;
  const ford = viaFord(e, w, tx, ty);
  if (ford) return goTo(e, ford.x, ford.y);
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  return { vx: (dx / d) * e.def.maxSpeed, vy: (dy / d) * e.def.maxSpeed };
}
