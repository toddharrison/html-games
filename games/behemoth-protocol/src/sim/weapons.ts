import { DEGRADE, RIPPLE_GAP } from '../content/tuning';
import type { InterceptSpec, MissileSpec, RoundSpec, WeaponDef } from '../content/weapons';
import {
  autoGroupOf,
  autoReach,
  degraded,
  fireControlSpread,
  firingBinding,
  fraction,
  hitched,
  mountPosition,
  mountWorldAngle,
  reloadScale,
  spreadScale,
  stepPower,
  type BehemothState,
  type HardpointState,
  type PlayerCommand,
  type Trigger,
} from './behemoth';
import { allocId, type Enemy, type Projectile } from './entities';
import type { Owner } from './events';
import { frameRight } from './frame';
import { angleDiff, clamp, dist, rotateToward, wrapAngle } from './math';
import { damageMultiplier, fireBeam, roundRange, roundSpec, shotSpec } from './projectiles';
import type { World } from './world';
import { conditionSpread, markFlash } from './conditions';

/**
 * Weapon firing (SPEC §5.2, §6): spawns projectiles from mounts. Projectile flight lives in
 * projectiles.ts. Each hardpoint fires by its binding: a trigger (LMB, RMB, Space: at the cursor)
 * or Auto (picks its own targets through fire control; groups toggled with 1–4). The weapon decides
 * how: shells and bullets from the barrel, lasers as instant beams, missiles in a homing salvo,
 * point defense at incoming rounds. Two or more L guns on one trigger ripple: they fire in turn rather than together.
 */

export interface SpawnOptions {
  /** Distance before the round bursts or fizzles (defaults to its max range). */
  fuse?: number;
  /** Aim error multiplier (damaged mounts scatter more). */
  spreadMul?: number;
  /** Missiles: locked target and destination. */
  targetId?: number | null;
  tx?: number;
  ty?: number;
  /** Player hardpoint slot that fired, for the renderer. */
  slot?: string;
  /** Fired from inside this tile (a garrisoned building), so its walls don't stop the round. */
  shelter?: { col: number; row: number };
  /** Muzzle speed in place of the round's own (area fire sets it so a round lands on time). */
  speed?: number;
}

/**
 * Fire a round (or, for a canister, a cone of pellets: each one its own round with its own
 * spread) and push one `fire` event. Returns the first.
 */
export function spawnProjectile(w: World, owner: Owner, weapon: WeaponDef, x: number, y: number, angle: number, opts: SpawnOptions = {}): Projectile {
  const spec = roundSpec(weapon);
  const count = spec.kind === 'bullet' ? (spec.pellets ?? 1) : 1;
  const rounds: Projectile[] = [];
  // The battle's condition widens the spread (SPEC §4.6); a shot from the Behemoth gives it away at night.
  const spreadMul = (opts.spreadMul ?? 1) * conditionSpread(w);
  if (owner === 'player') markFlash(w);
  for (let i = 0; i < count; i++) rounds.push(spawnRound(w, owner, weapon, x, y, angle, { ...opts, spreadMul }));
  const first = rounds[0]!;
  const ev = { type: 'fire', owner, weapon: weapon.id, x, y, angle: Math.atan2(first.vy, first.vx) } as const;
  w.events.push(opts.slot ? { ...ev, slot: opts.slot } : ev);
  return first;
}

function spawnRound(w: World, owner: Owner, weapon: WeaponDef, x: number, y: number, angle: number, opts: SpawnOptions): Projectile {
  const spec = roundSpec(weapon);
  const spread = spec.spread * (opts.spreadMul ?? 1);
  const a = angle + w.rng.range(-spread, spread);
  const speed = opts.speed ?? spec.speed;
  const p: Projectile = {
    id: allocId(w),
    owner,
    weapon,
    kind: spec.kind,
    x,
    y,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    traveled: 0,
    fuse: opts.fuse ?? roundRange(spec),
    targetId: opts.targetId ?? null,
    tx: opts.tx ?? x + Math.cos(angle) * roundRange(spec),
    ty: opts.ty ?? y + Math.sin(angle) * roundRange(spec),
    alive: true,
  };
  if (opts.shelter) p.shelter = opts.shelter;
  w.projectiles.push(p);
  return p;
}

/**
 * Fire a laser from a muzzle (SPEC §6): the beam resolves at once (`fireBeam`). Pushes the usual
 * `fire` event (recoil, heat) and a `beam` event to draw it.
 */
export function shootBeam(w: World, weapon: WeaponDef, x: number, y: number, angle: number, opts: { spreadMul?: number; slot?: string } = {}): void {
  const spread = shotSpec(weapon).spread * (opts.spreadMul ?? 1) * conditionSpread(w);
  const a = angle + w.rng.range(-spread, spread);
  markFlash(w);
  const end = fireBeam(w, weapon, x, y, a);
  const ev = { type: 'fire', owner: 'player', weapon: weapon.id, x, y, angle: a } as const;
  w.events.push(opts.slot ? { ...ev, slot: opts.slot } : ev);
  w.events.push({ type: 'beam', weapon: weapon.id, x0: x, y0: y, x1: end.x, y1: end.y, hit: end.hit });
}

/**
 * The unit a missile salvo locks on to: the one nearest the cursor, within the lock radius.
 * Hidden units can't be locked on to.
 */
export function missileLockTarget(w: World, x: number, y: number, radius: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of w.enemies) {
    if (!e.alive || e.hidden) continue;
    const d = Math.hypot(e.x - x, e.y - y) - e.def.radius;
    if (d <= radius && d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

export function stepWeapons(w: World, cmd: PlayerCommand, dt: number): void {
  const b = w.behemoth;
  if (cmd.toggleAuto !== null && cmd.toggleAuto >= 1 && cmd.toggleAuto <= 4) {
    b.autoEnabled[cmd.toggleAuto - 1] = !b.autoEnabled[cmd.toggleAuto - 1];
  }
  stepPower(b, dt);
  for (const r of Object.values(b.ripple)) r.gap = Math.max(0, r.gap - dt);
  // Weapons keep firing while Immobilized (the last stand) but go dead once the reactor is going.
  const armed = b.reactorFuse === null && !b.destroyed;

  const live: HardpointState[] = [];
  for (const h of b.hardpoints) {
    h.cooldown = Math.max(0, h.cooldown - dt);
    // A pod works only while its trailer is still in tow.
    const attached = h.slot.position !== 'trailer' || hitched(b) !== null;
    if (!h.weapon || !armed || h.integrity.hp <= 0 || !attached) h.salvo = null;
    else live.push(h);
  }

  // L guns sharing a trigger ripple instead of firing together (SPEC §5.2).
  const rippling = new Set<HardpointState>();
  for (const trigger of TRIGGERS) {
    const group = live.filter((h) => h.weapon!.size === 'L' && h.weapon!.projectile.kind !== 'missile' && firingBinding(b, h) === trigger);
    if (group.length < 2) continue;
    for (const h of group) rippling.add(h);
    stepRipple(w, group, trigger, cmd, dt);
  }

  for (const h of live) {
    const weapon = h.weapon!;
    if (rippling.has(h)) continue;
    const binding = firingBinding(b, h);
    const spec = weapon.projectile;
    if (binding === 'auto') {
      if (!b.autoEnabled[autoGroupOf(weapon) - 1]) continue;
      if (spec.kind === 'intercept') stepPointDefense(w, h, weapon, spec, dt);
      else if (spec.kind === 'missile') stepMissiles(w, h, weapon, () => autoLock(w, h, spec), fireControlSpread(b), dt);
      else stepAutoGun(w, h, weapon, dt);
    } else if (spec.kind === 'missile') {
      const fire = held(cmd, binding);
      stepMissiles(w, h, weapon, () => (fire ? cursorLock(w, cmd, spec) : null), 1, dt);
    } else if (spec.kind !== 'intercept') {
      stepAimedWeapon(w, h, weapon, cmd, held(cmd, binding), dt);
    }
  }
}

const TRIGGERS: readonly Trigger[] = ['lmb', 'rmb', 'space'];

function held(cmd: PlayerCommand, trigger: Trigger): boolean {
  return trigger === 'lmb' ? cmd.fireMain : trigger === 'rmb' ? cmd.fireSecondary : cmd.fireMissile;
}

/**
 * Ripple fire: while the trigger is held, the next ready gun after the last one to fire goes, at
 * most one every `RIPPLE_GAP`. Holding ripples down the line; clicking alternates.
 */
function stepRipple(w: World, group: HardpointState[], trigger: Trigger, cmd: PlayerCommand, dt: number): void {
  const b = w.behemoth;
  const r = b.ripple[trigger];
  // Every gun keeps tracking whether or not it's its turn. Turret guns fire along the ring's facing.
  const able = new Set(group.filter((h) => aimMount(b, h, h.weapon!, cmd.aimX, cmd.aimY, dt) || h.slot.ring !== undefined));
  if (!held(cmd, trigger) || r.gap > 0) return;
  const start = group.findIndex((h) => h.slot.id === r.last) + 1;
  for (let i = 0; i < group.length; i++) {
    const h = group[(start + i) % group.length]!;
    if (!able.has(h) || !ready(b, h, h.weapon!)) continue;
    fireAimed(w, h, h.weapon!, cmd);
    r.last = h.slot.id;
    r.gap = RIPPLE_GAP;
    return;
  }
}

/** Ready to fire: reloaded, with ammo and power to spare. */
function ready(b: BehemothState, h: HardpointState, weapon: WeaponDef): boolean {
  return h.cooldown <= 0 && (h.ammo === null || h.ammo > 0) && b.power.stored >= (weapon.power ?? 0);
}

/** Spend what a shot costs and start the reload (`ready` has already checked there's enough). */
function spend(b: BehemothState, h: HardpointState, weapon: WeaponDef): void {
  b.power.stored -= weapon.power ?? 0;
  if (h.ammo !== null) h.ammo = Math.max(0, h.ammo - 1);
  h.cooldown = weapon.reload * reloadScale(h);
}

/** A damaged mount traverses more slowly; a destroyed one doesn't move. A traverse mod speeds it (SPEC §5.6). */
function mountTraverse(h: HardpointState, weapon: WeaponDef, dt: number): number {
  const i = fraction(h.integrity);
  return ((weapon.traverseDegPerSec * (h.slot.traverse ?? 1) * Math.PI) / 180) * (i > 0 ? degraded(DEGRADE.traverseFloor, i) : 0) * dt;
}

/** Whether a world point is inside a mount's firing arc. */
function inArc(b: BehemothState, h: HardpointState, x: number, y: number): boolean {
  if (h.slot.arc.half >= 180) return true;
  const p = mountPosition(b, h);
  const rel = wrapAngle(Math.atan2(y - p.y, x - p.x) - b.heading);
  return Math.abs(angleDiff((h.slot.arc.center * Math.PI) / 180, rel)) <= (h.slot.arc.half * Math.PI) / 180;
}

/**
 * Swing an own-mount weapon toward a world point, staying inside its arc. Returns whether it's
 * lined up to fire (target in arc and the barrel on it). Turret weapons follow the turret.
 */
function aimMount(b: BehemothState, h: HardpointState, weapon: WeaponDef, x: number, y: number, dt: number): boolean {
  const p = mountPosition(b, h);
  const want = Math.atan2(y - p.y, x - p.x);
  if (h.slot.ring !== undefined) return Math.abs(angleDiff(mountWorldAngle(b, h), want)) < 0.05;

  const rel = wrapAngle(want - b.heading);
  const center = (h.slot.arc.center * Math.PI) / 180;
  const half = (h.slot.arc.half * Math.PI) / 180;
  const off = angleDiff(center, rel);
  const goal = wrapAngle(center + clamp(off, -half, half));
  h.angle = rotateToward(h.angle, goal, mountTraverse(h, weapon, dt));
  return Math.abs(off) <= half && Math.abs(angleDiff(h.angle, rel)) < 0.06;
}

function muzzleOf(b: BehemothState, h: HardpointState, weapon: WeaponDef): { x: number; y: number; angle: number } {
  const p = mountPosition(b, h);
  const angle = mountWorldAngle(b, h);
  return { x: p.x + Math.cos(angle) * weapon.muzzle, y: p.y + Math.sin(angle) * weapon.muzzle, angle };
}

/**
 * Main and secondary weapons fire at the cursor while their trigger is held. Turret guns (main
 * guns and coax) fire along their ring's current facing even if it hasn't caught up with the
 * cursor (the heavy feel); shells burst at the aim distance.
 */
function stepAimedWeapon(w: World, h: HardpointState, weapon: WeaponDef, cmd: PlayerCommand, trigger: boolean, dt: number): void {
  const b = w.behemoth;
  const onTarget = aimMount(b, h, weapon, cmd.aimX, cmd.aimY, dt);
  const turret = h.slot.ring !== undefined;
  if (!trigger || !ready(b, h, weapon) || (!turret && !onTarget)) return;
  fireAimed(w, h, weapon, cmd);
}

/** Fire an aimed weapon from its muzzle toward the cursor (`ready` has already been checked). */
function fireAimed(w: World, h: HardpointState, weapon: WeaponDef, cmd: PlayerCommand): void {
  const b = w.behemoth;
  const spec = shotSpec(weapon);
  const m = muzzleOf(b, h, weapon);
  if (spec.kind === 'beam') {
    shootBeam(w, weapon, m.x, m.y, m.angle, { spreadMul: spreadScale(h), slot: h.slot.id });
    spend(b, h, weapon);
    return;
  }
  const p = mountPosition(b, h);
  const fuse =
    spec.kind === 'shell' ? clamp(dist(p.x, p.y, cmd.aimX, cmd.aimY) - weapon.muzzle, spec.minRange, spec.maxRange) : roundRange(spec);
  spawnProjectile(w, 'player', weapon, m.x, m.y, m.angle, { fuse, spreadMul: spreadScale(h), slot: h.slot.id });
  spend(b, h, weapon);
}

/** What a salvo is fired at: a locked unit (or none), and where to fly if there's none. */
interface Lock {
  targetId: number | null;
  x: number;
  y: number;
}

/** A trigger-fired salvo locks on to the unit nearest the cursor, or flies to the cursor point. */
function cursorLock(w: World, cmd: PlayerCommand, spec: MissileSpec): Lock {
  const t = missileLockTarget(w, cmd.aimX, cmd.aimY, spec.lockRadius);
  return { targetId: t?.id ?? null, x: t?.x ?? cmd.aimX, y: t?.y ?? cmd.aimY };
}

/**
 * A salvo on Auto locks on to the best target in reach, on screen only (it shouldn't spend its
 * ammo on what the player can't see). Missiles fly over cover, so no line of fire is needed.
 */
function autoLock(w: World, h: HardpointState, spec: MissileSpec): Lock | null {
  const t = autoTarget(w, h, spec, { lineOfFire: false, minRange: 0, onScreen: true });
  return t && { targetId: t.id, x: t.x, y: t.y };
}

/**
 * Missiles: once `start` gives a lock (the trigger is pulled, or an auto target turns up), launch
 * a salvo. Missiles leave the rack in a spread and home in.
 */
function stepMissiles(w: World, h: HardpointState, weapon: WeaponDef, start: () => Lock | null, spreadMul: number, dt: number): void {
  const b = w.behemoth;
  if (!h.salvo) {
    if (!ready(b, h, weapon)) return;
    const lock = start();
    if (!lock) return;
    h.salvo = { left: weapon.salvo?.count ?? 1, timer: 0, ...lock };
  }

  const s = h.salvo;
  s.timer -= dt;
  if (s.timer > 0) return;
  const t = s.targetId === null ? undefined : w.enemies.find((e) => e.id === s.targetId && e.alive);
  if (t) {
    s.x = t.x;
    s.y = t.y;
  }
  const p = mountPosition(b, h);
  const angle = Math.atan2(s.y - p.y, s.x - p.x);
  spawnProjectile(w, 'player', weapon, p.x, p.y, angle, {
    spreadMul: spreadScale(h) * spreadMul,
    targetId: t ? t.id : null,
    tx: s.x,
    ty: s.y,
    slot: h.slot.id,
  });
  if (h.ammo !== null) h.ammo = Math.max(0, h.ammo - 1);
  s.left--;
  s.timer = weapon.salvo?.interval ?? 0;
  if (s.left <= 0 || h.ammo === 0) {
    h.salvo = null;
    h.cooldown = weapon.reload * reloadScale(h);
  }
}

/**
 * The enemy an auto weapon would engage: the nearest visible one in reach and arc (and in line of
 * fire, unless the round flies over cover), favoring targets it's effective against (AP guns pick
 * infantry over a closer tank). Reach shrinks with sensor damage.
 */
function autoTarget(w: World, h: HardpointState, spec: RoundSpec, opts: { lineOfFire: boolean; minRange: number; onScreen?: boolean }): Enemy | null {
  const b = w.behemoth;
  const p = mountPosition(b, h);
  const reach = roundRange(spec) * autoReach(b);
  let target: Enemy | null = null;
  let bestScore = Infinity;
  for (const e of w.enemies) {
    if (!e.alive || e.hidden) continue;
    if (opts.onScreen && (e.x < w.frame.left || e.x > frameRight(w.frame))) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y) - e.def.radius;
    const score = Math.max(0, d) / Math.max(0.1, damageMultiplier(spec, e.def.targetClass));
    if (d > reach || d < opts.minRange || score >= bestScore || !inArc(b, h, e.x, e.y)) continue;
    if (opts.lineOfFire && w.terrain.lineBlocked(p.x, p.y, e.x, e.y)) continue;
    target = e;
    bestScore = score;
  }
  return target;
}

/**
 * Auto guns engage the target `autoTarget` picks, leading it. Fire control widens their spread
 * as it's damaged.
 */
function stepAutoGun(w: World, h: HardpointState, weapon: WeaponDef, dt: number): void {
  const b = w.behemoth;
  const spec = shotSpec(weapon);
  const p = mountPosition(b, h);
  // Lobbed rounds fly over cover, so they need no line of fire, but can't drop inside their minimum range.
  const lobbed = spec.kind === 'shell' && spec.lobbed === true;
  const target = autoTarget(w, h, spec, { lineOfFire: !lobbed, minRange: spec.kind === 'shell' ? spec.minRange : 0 });
  if (!target) return;

  // Beams arrive at once: nothing to lead.
  const lead = spec.kind === 'beam' ? 0 : Math.hypot(target.x - p.x, target.y - p.y) / spec.speed;
  const ax = target.x + target.vx * lead;
  const ay = target.y + target.vy * lead;
  if (!aimMount(b, h, weapon, ax, ay, dt) || !ready(b, h, weapon)) return;
  const m = muzzleOf(b, h, weapon);
  const spreadMul = spreadScale(h) * fireControlSpread(b);
  if (spec.kind === 'beam') {
    shootBeam(w, weapon, m.x, m.y, m.angle, { spreadMul, slot: h.slot.id });
    spend(b, h, weapon);
    return;
  }
  // Shells burst where the target will be, not at their maximum range.
  const fuse = spec.kind === 'shell' ? clamp(dist(m.x, m.y, ax, ay), spec.minRange, spec.maxRange) : undefined;
  spawnProjectile(w, 'player', weapon, m.x, m.y, m.angle, { spreadMul, slot: h.slot.id, ...(fuse !== undefined ? { fuse } : {}) });
  spend(b, h, weapon);
}

/**
 * Point defense: zaps the most dangerous incoming round in range (missiles first, then the
 * nearest shell). Each shot costs power; a damaged mount, or damaged fire control, hits less often.
 */
function stepPointDefense(w: World, h: HardpointState, weapon: WeaponDef, spec: InterceptSpec, dt: number): void {
  const b = w.behemoth;
  const p = mountPosition(b, h);
  const reach = spec.range * autoReach(b);

  let target: Projectile | null = null;
  let bestScore = Infinity;
  for (const q of w.projectiles) {
    if (!q.alive || q.owner !== 'enemy' || q.kind === 'bullet') continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    // Only rounds still closing on the Behemoth.
    if (d > reach || (b.x - q.x) * q.vx + (b.y - q.y) * q.vy <= 0) continue;
    const score = d - (q.kind === 'missile' ? 1000 : 0);
    if (score < bestScore) {
      target = q;
      bestScore = score;
    }
  }
  if (!target) return;
  if (!aimMount(b, h, weapon, target.x, target.y, dt) || !ready(b, h, weapon)) return;

  spend(b, h, weapon);
  const chance = (spec.chance[target.kind === 'missile' ? 'missile' : 'shell'] * (0.5 + 0.5 * fraction(h.integrity))) / fireControlSpread(b);
  const hit = w.rng.chance(chance);
  if (hit) target.alive = false;
  w.events.push({ type: 'intercept', weapon: weapon.id, x0: p.x, y0: p.y, x: target.x, y: target.y, hit });
}
