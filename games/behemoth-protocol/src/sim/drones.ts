import type { AddonId } from '../content/addons';
import type { DroneBayModule } from '../content/trailer';
import {
  component,
  fraction,
  hitched,
  hullToWorld,
  treadSets,
  trailerToWorld,
  type BayState,
  type BehemothState,
  type ComponentId,
  type TrailerState,
} from './behemoth';
import { allocId, type Drone } from './entities';
import { endLastStand } from './lastStand';
import type { World } from './world';

/**
 * Repair drones (SPEC §5.1 tread recovery). A drone bay in the trailer launches its drones when a
 * tread set is worn; they hover over the set's pods and patch it from the bay's per-battle pool,
 * draining power the whole time they're out. Rounds that reach a drone hit it instead of the hull,
 * and blasts catch them. Once a battle, if the Behemoth is Immobilized, every drone swarms the
 * treads; if enough work gets done before they're all shot down, the treads turn again and the
 * last stand is over.
 */

type DroneBay = BayState & { def: DroneBayModule };

/** Working drone bays in a hitched trailer, with their bay index. */
function droneBays(t: TrailerState): [number, DroneBay][] {
  return t.bays.flatMap((bay, i) => (bay?.def.kind === 'drones' && bay.integrity.hp > 0 ? [[i, bay as DroneBay] as [number, DroneBay]] : []));
}

/** Hull-space points over a tread set's pods, where drones work on it. */
function setAnchors(b: BehemothState, id: ComponentId): { x: number; y: number }[] {
  if (id === 'treads') return b.chassis.anchors.treads;
  return b.chassis.addonMounts[id as AddonId]?.anchors ?? b.chassis.anchors.treads;
}

/** Drones hover this far outboard of a pod's anchor, over its outer edge, where flank fire lands. */
const OUTBOARD = 4;

/** Where a drone works: one of its set's anchor points, spread by its spot number. */
function workSpot(b: BehemothState, d: Drone): { x: number; y: number } {
  const anchors = setAnchors(b, d.target ?? 'treads');
  // Start mid-hull and alternate sides, so the first two drones split left and right.
  const a = anchors[(d.spot + 2) % anchors.length]!;
  return hullToWorld(b, { x: a.x, y: a.y + Math.sign(a.y) * OUTBOARD });
}

/**
 * The tread set drones should patch: the most worn one below `below` of its integrity. A set that's
 * gone counts too (patching it brings its capacity back).
 */
function repairTarget(b: BehemothState, below: number): ComponentId | null {
  let best: { id: ComponentId; f: number } | null = null;
  for (const s of treadSets(b)) {
    const f = fraction(s.integrity);
    if (f < below && (!best || f < best.f)) best = { id: s.id, f };
  }
  return best?.id ?? null;
}

export function stepDrones(w: World, dt: number): void {
  const b = w.behemoth;
  const t = b.destroyed ? null : hitched(b);
  // Drones whose bay is gone (wrecked, cut loose, or the Behemoth with it) go down.
  for (const d of w.drones) {
    const bay = t?.bays[d.bay];
    if (d.alive && (!bay || bay.def.kind !== 'drones' || bay.integrity.hp <= 0)) loseDrone(w, d);
  }
  // A wrecked bay takes its docked drones with it.
  for (const bay of t?.bays ?? []) if (bay?.def.kind === 'drones' && bay.integrity.hp <= 0) bay.loads = 0;
  const bays = t ? droneBays(t) : [];
  stepRevive(w, bays);

  for (const [i, bay] of bays) {
    const out = w.drones.filter((d) => d.alive && d.bay === i);
    let task: Drone['task'] = 'return';
    let target: ComponentId | null = null;
    if (w.revive) {
      task = 'revive';
      target = 'treads';
    } else if (!b.immobilized && bay.pool > 0) {
      // Once out, they keep at it until the set is whole; they only launch for real wear.
      target = repairTarget(b, out.length > 0 ? 1 : bay.def.launchBelow);
      if (target) task = 'repair';
    }
    for (const d of out) {
      d.task = task;
      d.target = target;
    }
    if (target) for (let k = out.length; k < bay.loads; k++) launch(w, t!, i, bay, task, target);
  }

  for (const d of w.drones) if (d.alive) flyDrone(w, t!, d, dt);
  w.drones = w.drones.filter((d) => d.alive);

  const reviver = bays[0]?.[1];
  if (w.revive && reviver && w.revive.work >= reviver.def.revive.work) finishRevive(w, reviver.def);
}

/** Starts, or calls off, the once-a-battle revive. */
function stepRevive(w: World, bays: [number, DroneBay][]): void {
  const b = w.behemoth;
  const wanted = b.immobilized && !w.revived && !b.destroyed && b.reactorFuse === null && w.extractedAt === null;
  const drones = bays.reduce((sum, [, bay]) => sum + bay.loads, 0);
  if (wanted && !w.revive && drones > 0) {
    w.revive = { work: 0 };
    w.events.push({ type: 'reviveStarted' });
  } else if (w.revive && (!wanted || drones === 0)) {
    w.revive = null;
    if (wanted) w.events.push({ type: 'reviveFailed' });
  }
}

function launch(w: World, t: TrailerState, i: number, bay: DroneBay, task: Drone['task'], target: ComponentId): void {
  const at = trailerToWorld(t, t.def.bays[i]!);
  w.drones.push({
    id: allocId(w),
    bay: i,
    x: at.x,
    y: at.y,
    heading: t.heading,
    hp: bay.def.droneHp,
    radius: bay.def.radius,
    task,
    target,
    spot: w.drones.filter((d) => d.alive).length,
    working: false,
    alive: true,
  });
}

/** Fly toward the work spot (or home), drain power, and work once there. */
function flyDrone(w: World, t: TrailerState, d: Drone, dt: number): void {
  const b = w.behemoth;
  const bay = t.bays[d.bay] as DroneBay;
  const goal = d.task === 'return' ? trailerToWorld(t, t.def.bays[d.bay]!) : workSpot(b, d);
  const dx = goal.x - d.x;
  const dy = goal.y - d.y;
  const dist = Math.hypot(dx, dy);
  const step = bay.def.speed * dt;
  let there = dist <= step;
  if (there) {
    d.x = goal.x;
    d.y = goal.y;
  } else {
    d.x += (dx / dist) * step;
    d.y += (dy / dist) * step;
    d.heading = Math.atan2(dy, dx);
  }
  d.working = false;
  if (d.task === 'return') {
    // Home: docked again (it's still the bay's; it just isn't flying).
    if (there) d.alive = false;
    return;
  }
  // Every drone out of the bay draws power; with the capacitor dry it hovers, idle.
  const drain = bay.def.power * dt;
  const powered = b.power.stored >= drain;
  if (powered) b.power.stored -= drain;
  if (!there || !powered) return;
  d.heading = b.heading;
  if (d.task === 'revive') {
    if (w.revive) w.revive.work += dt;
    d.working = true;
    return;
  }
  const set = d.target ? component(b, d.target) : null;
  if (!set) return;
  const amount = Math.min(bay.def.repairRate * dt, bay.pool, set.max - set.hp);
  if (amount <= 0) return;
  set.hp += amount;
  bay.pool -= amount;
  d.working = true;
}

/** The treads turn again: the chassis' own set comes back at the revive's share and the stand ends. */
function finishRevive(w: World, def: DroneBayModule): void {
  const b = w.behemoth;
  const treads = component(b, 'treads')!;
  treads.hp = Math.max(treads.hp, treads.max * def.revive.fraction);
  b.immobilized = false;
  w.revived = true;
  w.revive = null;
  endLastStand(w);
  w.events.push({ type: 'revived', x: b.x, y: b.y });
}

function loseDrone(w: World, d: Drone): void {
  if (!d.alive) return;
  d.alive = false;
  const bay = w.behemoth.trailer?.bays[d.bay];
  if (bay?.def.kind === 'drones') bay.loads = Math.max(0, bay.loads - 1);
  w.events.push({ type: 'droneLost', x: d.x, y: d.y });
}

/** The drone a point is on, if any (enemy rounds hit drones before the hull). */
export function droneAt(w: World, x: number, y: number): Drone | undefined {
  return w.drones.find((d) => d.alive && Math.hypot(x - d.x, y - d.y) <= d.radius);
}

export function damageDrone(w: World, d: Drone, amount: number): void {
  d.hp -= amount;
  if (d.hp <= 0) loseDrone(w, d);
}

/** A blast catches every drone in reach. */
export function blastDrones(w: World, x: number, y: number, radius: number, damage: number): void {
  for (const d of w.drones) if (d.alive && Math.hypot(d.x - x, d.y - y) <= radius + d.radius) damageDrone(w, d, damage);
}
