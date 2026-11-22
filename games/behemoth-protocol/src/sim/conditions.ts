import type { ConditionId } from '../content/conditions';
import { CONDITION } from '../content/tuning';
import { autoReach } from './behemoth';
import type { Enemy } from './entities';
import { Rng, hashSeed } from './rng';
import type { World } from './world';

/**
 * A battle's condition (SPEC §4.6; content/conditions.ts). Both conditions work through the
 * Behemoth's **sight**: a unit farther than that (less its radius) is hidden like a unit in
 * concealing cover (`sim/concealment.ts`), so it isn't drawn, auto-targeted, or locked on to,
 * unless it's giving itself away (firing, lining up a shot, just hit). Objective targets are never
 * hidden by it: the intel marks them. The enemy is blind too: a unit can't open fire on the
 * Behemoth from farther than its own sight (`enemyCanSee`), except at night once the Behemoth's
 * muzzle flash has marked it. Night tracks that flash, and a storm its squalls.
 */

export interface ConditionState {
  id: ConditionId;
  /** Sim time of the Behemoth's last muzzle flash (night: the enemy can see what to shoot at). */
  flashAt: number;
  /** Storm only: how hard it's blowing now, 0 (between squalls) to 1 (a full squall). */
  squall: number;
  /** Storm only: the current squall's schedule in sim time (build-up start, full strength, die-away start, end). */
  gust: { start: number; full: number; ease: number; end: number } | null;
  /** The squall schedule's own stream, so the weather never shifts the battle's combat draws. */
  rng: Rng;
}

/** `firstSquall`: sim time the first squall starts building (default: `CONDITION.storm.first` into the battle). */
export function createCondition(id: ConditionId | null, seed: number, firstSquall?: number): ConditionState | null {
  if (!id) return null;
  const c: ConditionState = { id, flashAt: -Infinity, squall: 0, gust: null, rng: new Rng(hashSeed(seed, 0x57a4)) };
  if (id === 'storm') c.gust = nextGust(c, firstSquall ?? c.rng.range(...CONDITION.storm.first));
  return c;
}

/** The squall starting at `start`: a build-up, full strength for a while, and a die-away. */
function nextGust(c: ConditionState, start: number): NonNullable<ConditionState['gust']> {
  const s = CONDITION.storm;
  const full = start + s.ramp;
  const ease = full + c.rng.range(...s.length);
  return { start, full, ease, end: ease + s.ramp };
}

export function stepCondition(w: World): void {
  const c = w.condition;
  if (!c || c.id !== 'storm' || !c.gust) return;
  const g = c.gust;
  const t = w.time;
  if (t >= g.end) {
    c.gust = nextGust(c, g.end + c.rng.range(...CONDITION.storm.gap));
    c.squall = 0;
    return;
  }
  const was = c.squall;
  c.squall = t < g.start ? 0 : t < g.full ? (t - g.start) / (g.full - g.start) : t < g.ease ? 1 : 1 - (t - g.ease) / (g.end - g.ease);
  if (was === 0 && c.squall > 0) w.events.push({ type: 'squall', rising: true });
  if (was > 0.5 && c.squall <= 0.5 && t >= g.ease) w.events.push({ type: 'squall', rising: false });
}

/** How far the Behemoth can see (world units), or null for no limit. */
export function sightRadius(w: World): number | null {
  const base = baseSight(w);
  return base === null ? null : base * autoReach(w.behemoth);
}

/** The condition's sight before the Behemoth's sensors scale it; null for no limit. */
function baseSight(w: World): number | null {
  const c = w.condition;
  if (!c) return null;
  if (c.id === 'night') return CONDITION.night.sight;
  if (c.squall <= 0) return null;
  const s = CONDITION.storm;
  // Eases in from far out, so the edge of sight closes visibly instead of snapping.
  return s.clearSight + (s.sight - s.clearSight) * c.squall;
}

/**
 * Whether a unit can see the Behemoth well enough to open fire: always in clear weather; in the
 * dark only from within the enemy's night sight, unless the Behemoth's muzzle flash marks it; in a
 * squall only from within the storm's sight (the enemy's eyes don't depend on our sensors). Range
 * is to about the hull's nearest edge.
 */
export function enemyCanSee(w: World, e: Enemy): boolean {
  const c = w.condition;
  if (!c) return true;
  const b = w.behemoth;
  const d = Math.hypot(e.x - b.x, e.y - b.y) - b.chassis.length / 2;
  if (c.id === 'night') return behemothMarked(w) || d <= CONDITION.night.enemySight;
  const sight = baseSight(w);
  return sight === null || d <= sight;
}

/** Whether a unit is lost in the dark or the storm (it isn't giving itself away, and it's past sight). */
export function beyondSight(w: World, e: Enemy): boolean {
  if (e.objective || e.exposed > 0 || e.windup > 0 || e.salvoLeft > 0) return false;
  const sight = sightRadius(w);
  if (sight === null) return false;
  const b = w.behemoth;
  return Math.hypot(e.x - b.x, e.y - b.y) - e.def.radius > sight;
}

/** Whether the Behemoth has fired recently enough that its muzzle flash marks it (night). */
export function behemothMarked(w: World): boolean {
  const c = w.condition;
  return !!c && w.time - c.flashAt <= CONDITION.night.flashMark;
}

/** The Behemoth just fired something that flashes (everything but point defense). */
export function markFlash(w: World): void {
  if (w.condition) w.condition.flashAt = w.time;
}

/** The condition's multiplier on a round's spread: a squall's wind pushes everyone's fire about. */
export function conditionSpread(w: World): number {
  const c = w.condition;
  if (!c || c.id !== 'storm') return 1;
  return 1 + (CONDITION.storm.spread - 1) * c.squall;
}

/** The condition's multiplier on hovercraft speed (a squall knocks them about). */
export function hoverScale(w: World): number {
  const c = w.condition;
  if (!c || c.id !== 'storm') return 1;
  return 1 - (1 - CONDITION.storm.hover) * c.squall;
}
