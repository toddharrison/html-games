import { CONDITION, FIRE } from '../content/tuning';
import { ARMOR_ARCS } from '../content/chassis';
import type { ArcSpec } from '../content/weapons';
import { damageArmor, damageComponent, hullBox, pickInternal, type BehemothState } from './behemoth';
import { sealed, type Enemy } from './entities';
import { igniteAt } from './fire';
import { frameRight } from './frame';
import { distanceToBox } from './math';
import { damageEnemy } from './projectiles';
import type { Rng } from './rng';
import type { World } from './world';

/**
 * Lightning in a thunderstorm's squalls (SPEC §4.6). Every few seconds while a squall is strong, a
 * strike **marks** a spot where its target will be (the Behemoth, a unit in the frame, or open
 * ground, weighted so the Behemoth is the likeliest single target); `warn` seconds later it lands
 * on the nearest unit within `reach` of the spot, or on the ground. From a unit it leaps on like a
 * tesla bolt (`sim/arc.ts`) to the nearest unit not yet struck, whichever side it's on. A strike on
 * the Behemoth comes down from above: the whole hull flashes and one armor zone takes it. Every
 * unit in the frame shows for a moment in the flash. All its draws come from its own stream.
 */

/** A strike marked and waiting to land. */
export interface LightningMark {
  x: number;
  y: number;
  /** Sim time it lands. */
  lands: number;
}

export interface LightningState {
  rng: Rng;
  /** Sim time of the next mark; null between squalls. */
  next: number | null;
  marks: LightningMark[];
}

/** What a strike is, for damage multipliers (lightning goes hard on troops, like the tesla coil). */
const BOLT: ArcSpec = {
  kind: 'arc',
  damage: CONDITION.lightning.damage,
  tileDamage: CONDITION.lightning.tileDamage,
  range: 0,
  spread: 0,
  jumps: CONDITION.lightning.jumps,
  jumpRange: CONDITION.lightning.jumpRange,
  falloff: CONDITION.lightning.falloff,
  vs: { infantry: 1.4 },
};

/** A unit a strike can land on or leap to: the Behemoth or an enemy. */
type Struck = { kind: 'behemoth'; b: BehemothState } | { kind: 'enemy'; e: Enemy };

export function stepLightning(w: World): void {
  const lt = w.condition?.lightning;
  if (!lt) return;
  const L = CONDITION.lightning;

  const due = lt.marks.filter((m) => m.lands <= w.time);
  if (due.length > 0) {
    lt.marks = lt.marks.filter((m) => m.lands > w.time);
    for (const m of due) land(w, lt.rng, m);
  }

  // Between squalls, or once the battle's decided, no new strikes.
  if (w.condition!.squall < L.squall || w.extractedAt !== null || w.behemoth.destroyed) {
    lt.next = null;
    return;
  }
  // The first strike of a squall comes sooner than the rest.
  lt.next ??= w.time + lt.rng.range(...L.interval) * 0.5;
  if (w.time < lt.next) return;
  lt.next = w.time + lt.rng.range(...L.interval);
  mark(w, lt);
}

/** Marks where the next strike will land: where its target will be when it does. */
function mark(w: World, lt: LightningState): void {
  const L = CONDITION.lightning;
  const b = w.behemoth;
  const left = w.frame.left;
  const right = frameRight(w.frame);
  type Option = { w: number; target: Struck | null };
  const options: Option[] = [{ w: L.pull.behemoth, target: { kind: 'behemoth', b } }, { w: L.pull.ground, target: null }];
  for (const e of w.enemies) {
    if (e.alive && !sealed(e) && e.x >= left && e.x <= right) options.push({ w: L.pull.enemy, target: { kind: 'enemy', e } });
  }
  const rng = lt.rng;
  const pick = rng.weighted(options, (o) => o.w)!;
  let x: number;
  let y: number;
  const t = pick.target;
  if (!t) {
    x = rng.range(left, right);
    y = rng.range(0, w.terrain.height);
  } else if (t.kind === 'behemoth') {
    // Somewhere on the hull where it'll be: steering, surging, or braking can take it off the spot.
    const box = hullBox(b);
    const u = rng.range(-box.hl, box.hl);
    const v = rng.range(-box.hw, box.hw);
    const cos = Math.cos(b.heading);
    const sin = Math.sin(b.heading);
    x = b.x + b.vx * L.warn + u * cos - v * sin;
    y = b.y + b.vy * L.warn + u * sin + v * cos;
  } else {
    x = t.e.x + t.e.vx * L.warn;
    y = t.e.y + t.e.vy * L.warn;
  }
  lt.marks.push({ x, y, lands: w.time + L.warn });
  w.events.push({ type: 'lightningMark', x, y, time: L.warn });
}

/** The strike comes down: on the nearest unit within reach of its mark, then leaping on; or into the ground. */
function land(w: World, rng: Rng, m: LightningMark): void {
  const L = CONDITION.lightning;
  let first: Struck | null = null;
  let best: number = L.reach;
  const b = w.behemoth;
  if (!b.destroyed) {
    const d = distanceToBox(hullBox(b), m.x, m.y);
    if (d <= best) {
      first = { kind: 'behemoth', b };
      best = d;
    }
  }
  for (const e of w.enemies) {
    if (!e.alive || sealed(e)) continue;
    const d = Math.hypot(e.x - m.x, e.y - m.y) - e.def.radius;
    if (d <= best) {
      first = { kind: 'enemy', e };
      best = d;
    }
  }

  const points: { x: number; y: number }[] = [{ x: m.x, y: m.y }];
  if (!first) {
    // Into the ground: whatever stands there takes it (a fuel tank or derrick goes up).
    const ts = w.terrain.tileSize;
    w.terrain.damage(Math.floor(m.x / ts), Math.floor(m.y / ts), L.tileDamage, w.events);
    // It sets a tree or a roof alight (SPEC §6 "Fire"); the rain it came with soon damps it.
    igniteAt(w, m.x, m.y, FIRE.lightning);
    w.events.push({ type: 'lightning', points, hit: false });
    flash(w);
    return;
  }

  const struck = new Set<BehemothState | Enemy>();
  let at: Struck | null = first;
  let dmg = L.damage;
  for (let leap = 0; at && leap <= L.jumps; leap++) {
    if (at.kind === 'behemoth') {
      struck.add(at.b);
      // The first strike lands on its mark on the hull; a leap, at the hull's middle.
      if (leap > 0) points.push({ x: at.b.x, y: at.b.y });
      topHit(at.b, dmg, rng, w, points[points.length - 1]!);
    } else {
      struck.add(at.e);
      points.push({ x: at.e.x, y: at.e.y });
      damageEnemy(w, at.e, BOLT, dmg, 'top', 'hazard');
      igniteAt(w, at.e.x, at.e.y, FIRE.lightning);
    }
    dmg *= L.falloff;
    at = nextLeap(w, at, struck);
  }
  w.events.push({ type: 'lightning', points, hit: true });
  flash(w);
}

/**
 * Lightning on the Behemoth: from above, so the whole hull flashes (arc `top`); one armor zone,
 * picked at random, takes it, and what gets through strikes inside.
 */
function topHit(b: BehemothState, damage: number, rng: Rng, w: World, at: { x: number; y: number }): void {
  if (b.destroyed) return;
  w.events.push({ type: 'behemothHit', arc: 'top', damage, x: at.x, y: at.y });
  const arc = rng.pick(ARMOR_ARCS);
  const through = damageArmor(b, arc, damage);
  if (through > 0) damageComponent(b, pickInternal(b, arc, rng), through, w.events);
}

/** The nearest unit not yet struck within leaping range (body to body), with a clear line. */
function nextLeap(w: World, from: Struck, struck: ReadonlySet<BehemothState | Enemy>): Struck | null {
  const range = CONDITION.lightning.jumpRange;
  const fx = from.kind === 'behemoth' ? from.b.x : from.e.x;
  const fy = from.kind === 'behemoth' ? from.b.y : from.e.y;
  const b = w.behemoth;
  const hull = b.destroyed ? null : hullBox(b);
  // Body to body: from the hull's edge, or a unit's.
  const gap = (e: Enemy) => (from.kind === 'behemoth' ? distanceToBox(hull!, e.x, e.y) : Math.hypot(e.x - fx, e.y - fy) - from.e.def.radius) - e.def.radius;
  let best: Struck | null = null;
  let bestD = range;
  for (const e of w.enemies) {
    if (!e.alive || sealed(e) || struck.has(e)) continue;
    const d = gap(e);
    if (d > bestD || w.terrain.lineBlocked(fx, fy, e.x, e.y)) continue;
    best = { kind: 'enemy', e };
    bestD = d;
  }
  if (hull && from.kind === 'enemy' && !struck.has(b)) {
    const d = distanceToBox(hull, fx, fy) - from.e.def.radius;
    if (d <= bestD && !w.terrain.lineBlocked(fx, fy, b.x, b.y)) best = { kind: 'behemoth', b };
  }
  return best;
}

/** The flash: every unit in the frame shows for a moment (concealed or past sight). */
function flash(w: World): void {
  const left = w.frame.left;
  const right = frameRight(w.frame);
  for (const e of w.enemies) if (e.alive && e.x >= left && e.x <= right) e.exposed = Math.max(e.exposed, CONDITION.lightning.flash);
}
