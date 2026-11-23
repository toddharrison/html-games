import type { ArmorArc } from '../../content/chassis';
import { AI } from '../../content/tuning';
import { hitArc, type BehemothState } from '../behemoth';
import type { Enemy } from '../entities';
import { angleDiff } from '../math';
import type { World } from '../world';
import type { Goal } from './nav';

/**
 * Enemy smarts (SPEC §15 "Enemy AI (M3)", phase 5): reading the Behemoth, not just where it is.
 * Units keep out of the main gun's line, go for the most worn armor, spread round the hull instead of
 * bunching, fall back when hurt, and a bomb truck comes in from the side the gun isn't covering. All
 * scaled by one global level, `AI.smarts` (0 = off).
 */

/** World bearing the main gun is laid on. */
export function gunBearing(b: BehemothState): number {
  const t = b.turrets.find((r) => r.def.id === 'main') ?? b.turrets[0];
  return b.heading + (t?.angle ?? 0);
}

/** The armor arc a shot from world bearing `bearing` (from the hull's middle) lands on (`hitArc`'s rule). */
export function arcAt(b: BehemothState, bearing: number): ArmorArc {
  const fx = Math.cos(bearing);
  const fy = Math.sin(bearing);
  return hitArc(b, fx, fy, b.x + fx, b.y + fy);
}

/** 1 straight down a line, falling to 0 at `cone` off it. */
function inCone(bearing: number, line: number, cone: number): number {
  const c = Math.cos(cone);
  return Math.max(0, (Math.cos(bearing - line) - c) / (1 - c));
}

/**
 * The bearing round the hull a skirmisher should work toward (`AI.bearing`): out of the gun's line,
 * onto worn armor, away from the other skirmishers, not too far round from `current`.
 */
export function bestBearing(e: Enemy, w: World, current: number): number {
  const k = AI.bearing;
  const b = w.behemoth;
  const gun = gunBearing(b);
  const mates: number[] = [];
  for (const o of w.enemies) {
    if (o !== e && o.alive && !o.role && o.def.behavior.kind === 'skirmisher') mates.push(Math.atan2(o.y - b.y, o.x - b.x));
  }
  let best = current;
  let bestScore = -Infinity;
  for (let i = 0; i < k.candidates; i++) {
    const t = current + ((i / k.candidates) * 2 - 1) * Math.PI;
    const a = b.armor[arcAt(b, t)];
    let smart = -k.gun * inCone(t, gun, k.gunCone) + k.weakArc * (1 - a.hp / Math.max(1, a.max));
    for (const m of mates) smart -= k.spread * inCone(t, m, k.spreadCone);
    const score = AI.smarts * smart - (k.stay * Math.abs(angleDiff(current, t))) / Math.PI;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/** Which side of a hold-ahead arc to drift to: toward the weaker front armor half (-1 left, +1 right), or 0 if neither is. */
export function weakerFront(b: BehemothState): -1 | 0 | 1 {
  const share = (arc: ArmorArc) => b.armor[arc].hp / Math.max(1, b.armor[arc].max);
  const d = share('frontRight') - share('frontLeft');
  return d < -AI.front.weaker ? 1 : d > AI.front.weaker ? -1 : 0;
}

/**
 * A hurt unit's goal, pushed `fallBack` farther from the hull (`AI.hurt`), but no farther than
 * `AI.hurt.reach` × its own fire range: it backs off, it doesn't drop out of the fight. Others
 * unchanged.
 */
export function fallBack(e: Enemy, w: World, g: Goal): Goal {
  const back = e.def.behavior.fallBack ?? 0;
  if (back <= 0 || g.mode !== 'pace' || e.hp >= AI.hurt.share * e.def.hp) return g;
  const b = w.behemoth;
  const dx = g.x - b.x;
  const dy = g.y - b.y;
  const d = Math.hypot(dx, dy) || 1;
  const push = Math.min(back * AI.smarts, Math.max(0, e.def.fireRange * AI.hurt.reach - d));
  return { ...g, x: g.x + (dx / d) * push, y: g.y + (dy / d) * push };
}

/**
 * A bomb truck's way in (`AI.charge`): with the main gun laid within `cone` of it and the hull still
 * farther than `until`, its aim point moves `offset` to the side away from the gun's line.
 */
export function chargeOffset(e: Enemy, w: World, x: number, y: number): { x: number; y: number } {
  const k = AI.charge;
  const b = w.behemoth;
  if (AI.smarts <= 0 || Math.hypot(e.x - b.x, e.y - b.y) <= k.until) return { x, y };
  const bearing = Math.atan2(e.y - b.y, e.x - b.x);
  const off = angleDiff(gunBearing(b), bearing);
  if (Math.abs(off) >= k.cone) return { x, y };
  const side = off >= 0 ? 1 : -1;
  const push = k.offset * AI.smarts * side;
  return { x: x - Math.sin(bearing) * push, y: y + Math.cos(bearing) * push };
}
