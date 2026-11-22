import { groundMobility } from '../../content/terrain';
import { hullWidth } from '../behemoth';
import type { Enemy } from '../entities';
import { angleDiff } from '../math';
import type { World } from '../world';
import { bestCover } from './ambusher';
import { flowStep, pathBlocked } from './flow';
import { goTo, inFrame, keepPace } from './steer';

/**
 * Last-stand behavior (SPEC §5.1): once the Behemoth is Immobilized, every unit drops its usual
 * behavior and closes in to a ring at its `siege` range, from any side. Vehicles circle slowly on
 * the ring; troops dig into cover on it if there is some in reach, or stand on it in the open.
 * Everyone steers around the stranded hull rather than into it.
 */
export function besiege(e: Enemy, w: World, dt: number): { vx: number; vy: number } {
  const ai = e.ai;
  ai.retargetIn -= dt;

  if (e.def.canHide) {
    if (!ai.anchor || ai.retargetIn <= 0) {
      ai.retargetIn = 1;
      const ts = w.terrain.tileSize;
      const lost = ai.anchor && !w.terrain.isCover(Math.floor(ai.anchor.x / ts), Math.floor(ai.anchor.y / ts));
      if (!ai.anchor || lost) ai.anchor = siegeCover(e, w) ?? ringPoint(e, w);
    }
    const t = route(e, w, ai.anchor.x, ai.anchor.y);
    return goTo(e, t.x, t.y);
  }

  if (ai.retargetIn <= 0) {
    ai.retargetIn = w.rng.range(3, 7);
    if (w.rng.chance(0.4)) ai.orbitDir = ai.orbitDir === 1 ? -1 : 1;
    ai.orbitRange = w.rng.range(e.def.siege.minRange, e.def.siege.maxRange);
  }
  ai.orbitAngle += ai.orbitDir * e.def.engage.angularSpeed * dt;
  const ring = ringPoint(e, w);
  const t = route(e, w, ring.x, ring.y);
  return keepPace(e, w, t.x, t.y);
}

/**
 * Where to head next on the way to a target: straight there if the way is clear, otherwise one
 * step along the flow field toward the Behemoth (around rock and buildings). Never into the hull.
 */
function route(e: Enemy, w: World, tx: number, ty: number): { x: number; y: number } {
  const t = aroundHull(e, w, tx, ty);
  // Hovercraft follow the tracked field (a little cautious over water, but never stuck), skiers the foot one.
  const flow = w.lastStand?.flow?.[groundMobility(e.def.mobility)];
  if (!flow || !pathBlocked(w.terrain, e.def.mobility, e.def.radius, e.x, e.y, t.x, t.y)) return t;
  const step = flowStep(flow, w.terrain.tileSize, e.x, e.y);
  return step ? aroundHull(e, w, step.x, step.y) : t;
}

/** Switch a unit over to the last stand: it closes in from wherever it is now. */
export function joinSiege(e: Enemy, w: World): void {
  const b = w.behemoth;
  const ai = e.ai;
  ai.orbitAngle = Math.atan2(e.y - b.y, e.x - b.x);
  ai.orbitRange = w.rng.range(e.def.siege.minRange, e.def.siege.maxRange);
  ai.retargetIn = w.rng.range(3, 7);
  ai.anchor = null;
}

/** The siege is over (the drones revived the Behemoth): back to the unit's usual behavior. */
export function leaveSiege(e: Enemy, w: World): void {
  const b = w.behemoth;
  const ai = e.ai;
  ai.orbitAngle = Math.atan2(e.y - b.y, e.x - b.x);
  ai.orbitRange = w.rng.range(e.def.engage.minRange, e.def.engage.maxRange);
  ai.retargetIn = w.rng.range(0.5, 2);
  ai.anchor = null;
}

/** The unit's spot on its siege ring, kept inside the visible frame. */
function ringPoint(e: Enemy, w: World): { x: number; y: number } {
  const b = w.behemoth;
  return inFrame(e, w, b.x + Math.cos(e.ai.orbitAngle) * e.ai.orbitRange, b.y + Math.sin(e.ai.orbitAngle) * e.ai.orbitRange);
}

/** Cover within walking reach that sits inside the siege ring; nearest first. */
function siegeCover(e: Enemy, w: World): { x: number; y: number } | null {
  const b = w.behemoth;
  const { minRange, maxRange } = e.def.siege;
  return bestCover(e, w, e.def.engage.maxRange, (x, y, d) => {
    const r = Math.hypot(x - b.x, y - b.y);
    return r < minRange || r > maxRange ? null : d;
  });
}

/**
 * Keep a unit off the hull: a target inside the clearance circle is pushed out to it, and a path
 * that would cross the hull goes via a waypoint around the side the unit is already on.
 */
function aroundHull(e: Enemy, w: World, tx: number, ty: number): { x: number; y: number } {
  const b = w.behemoth;
  // Distance from the hull's center inside which a unit would be touching it.
  const clear = Math.hypot(b.chassis.length / 2, hullWidth(b) / 2) + e.def.radius + 4;
  const ta = Math.atan2(ty - b.y, tx - b.x);
  if (Math.hypot(tx - b.x, ty - b.y) < clear) {
    tx = b.x + Math.cos(ta) * clear;
    ty = b.y + Math.sin(ta) * clear;
  }
  // Closest approach of the straight path to the hull's center.
  const dx = tx - e.x;
  const dy = ty - e.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1) return { x: tx, y: ty };
  const s = Math.max(0, Math.min(1, ((b.x - e.x) * dx + (b.y - e.y) * dy) / len2));
  const near = Math.hypot(e.x + dx * s - b.x, e.y + dy * s - b.y);
  if (near >= clear) return { x: tx, y: ty };
  const ua = Math.atan2(e.y - b.y, e.x - b.x);
  const wa = ua + Math.sign(angleDiff(ua, ta) || 1) * 0.8;
  return { x: b.x + Math.cos(wa) * clear * 1.15, y: b.y + Math.sin(wa) * clear * 1.15 };
}
