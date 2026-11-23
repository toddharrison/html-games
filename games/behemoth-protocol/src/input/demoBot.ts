import { OBSTACLE_CLASSES } from '../content/obstacles';
import { MATERIALS } from '../content/terrain';
import { MOVEMENT, TERRAIN_GEN } from '../content/tuning';
import { IDLE_COMMAND, loadMass, type BehemothState, type PlayerCommand } from '../sim/behemoth';
import type { Enemy } from '../sim/entities';
import { frameRight } from '../sim/frame';
import type { World } from '../sim/world';

/**
 * The autopilot: turns the battle into commands the way a player's input would, so the sim plays
 * itself. It drives the title's attract mode and headless playtests. It reads only what a player
 * could see: terrain in view, mines the sensors have swept, marked artillery zones, units not
 * hidden. Pure, no Phaser (its one bit of memory, the line it has picked, is kept per world).
 *
 * - Driving: it scores lines across the field by what the hull would hit over the next stretch
 *   (tread and armor cost of each obstacle, ford wear, swept mines, fuel tanks, thin ice, artillery
 *   zones), plus a pull toward the guaranteed lane and against swerving, and steers for the
 *   cheapest. It brakes into what it can't avoid and surges over open ground with nothing in sight.
 * - Fighting: a battle mode's targets first, then whatever is most dangerous and nearest, with a
 *   clear line of fire preferred. Leads moving targets. Missiles for the big ones.
 */

export const BOT = {
  /** How far ahead of the hull's nose it reads the ground, and how far up the lane it looks. */
  lookAhead: 208,
  /** Spacing of the candidate lines across the field. */
  lineStep: 6,
  /** Sim seconds between re-planning the line. */
  replan: 0.1,
  /** Cost per unit off the guaranteed lane (it's rock-free and crosses rivers where it can), and per unit of swerve. */
  lanePull: 0.012,
  swerve: 0.03,
  /** A new line must beat the current one by this much, so the hull doesn't flap between two. */
  stickiness: 3,
  /** Close enough to the line not to steer. */
  deadband: 3,
  /** Ground costs. */
  immovable: 25,
  sweptMine: 40,
  explosive: 20,
  /** Over a tile that can't bear the hull (thin ice, a light bridge under a heavy load). */
  weakGround: 12,
  artilleryZone: 30,
  /** Fuel tanks and derricks within this of the hull's line, and what each costs. */
  blastRoom: 32,
  nearBlast: 8,
  /** With nothing to shoot, the main gun knocks down a structure on the line this costly, at least this far out. */
  clearAt: 2.5,
  clearFrom: 24,
  /** Brakes when the line's cost in the near stretch is at least this (a medium obstacle). */
  brakeAt: 2.5,
  nearStretch: 72,
  /** Surges when the line ahead costs less than this and nothing is in sight. */
  surgeBelow: 0.3,
  /** Secondary weapons (autocannon) only open up this close. */
  secondaryRange: 200,
  /** Assumed round speed for leading a moving target (world units/s). */
  leadSpeed: 400,
  /** Missiles only for units this threatening, or a battle mode's targets. */
  missileThreat: 3,
} as const;

const TS = TERRAIN_GEN.tileSize;

interface Plan {
  y: number;
  /** Sim time of the last re-plan. */
  at: number;
  /** The plan's cost over the near stretch, for braking. */
  near: number;
  /** The plan's whole cost, for surging. */
  total: number;
  /** The nearest structure on the line worth shooting out of the way (a tile's center); null for none. */
  clear: { x: number; y: number } | null;
}

const plans = new WeakMap<World, Plan>();

export function demoCommand(w: World): PlayerCommand {
  const b = w.behemoth;
  const top = frameRight(w.frame);
  const seen = w.enemies.filter((e) => e.alive && !e.hidden && e.x > w.frame.left && e.x < top && e.y > 0 && e.y < w.terrain.height);
  const target = pickTarget(w, seen);

  const plan = planLine(w);
  const steer = steerFor(b, plan.y);

  // A convoy still ahead: run it down. Fortress guns ahead and in sight: slow down and shoot.
  const objectivesAhead = w.enemies.filter((e) => e.alive && e.objective && e.x > b.x);
  let throttle: -1 | 0 | 1 = 0;
  if (plan.near >= BOT.brakeAt) throttle = -1;
  else if (w.objective.mode === 'chase' && objectivesAhead.length > 0) throttle = 1;
  else if (w.objective.mode === 'breach' && objectivesAhead.some((e) => e.x < top)) throttle = -1;
  // No surging up to a fortress: it would roll past the guns before it could knock them out.
  else if (seen.length === 0 && plan.total < BOT.surgeBelow && !(w.objective.mode === 'breach' && objectivesAhead.length + (w.objective.fortress ? 1 : 0) > 0)) throttle = 1;

  // Nothing to shoot: knock down what's in the way.
  const aim = target ? lead(b, target) : (plan.clear ?? { x: b.x + 200, y: b.y });
  return {
    ...IDLE_COMMAND,
    throttle,
    steer,
    aimX: aim.x,
    aimY: aim.y,
    fireMain: target !== null || plan.clear !== null,
    fireSecondary: target !== null && dist(b, target) < BOT.secondaryRange,
    fireMissile: target !== null && (target.objective || target.def.threat >= BOT.missileThreat),
  };
}

/**
 * Steer for line `y` without overshooting it: steering eases in and out (SPEC §4.2), so it lets go
 * once the hull, easing its sideways speed to nothing from here, would come to rest on the line.
 */
function steerFor(b: BehemothState, y: number): -1 | 0 | 1 {
  const err = y - b.y;
  // On ice the treads grip less, so the hull eases off more slowly and drifts further.
  const grip = Math.max(MOVEMENT.minGrip, b.wading.grip);
  const accel = b.chassis.lateral.accel * grip;
  const jerk = b.chassis.lateral.jerk * grip;
  // How far the hull drifts sideways while it eases its sideways speed down to nothing.
  const v = Math.abs(b.vy);
  const drift = (v * v) / (2 * accel) + (v * accel) / (2 * jerk);
  const closing = Math.sign(b.vy) === Math.sign(err);
  if (Math.abs(err) <= BOT.deadband || (closing && Math.abs(err) <= drift)) return 0;
  return err > 0 ? 1 : -1;
}

/** A battle mode's targets first; then the most dangerous for its distance, a clear shot preferred. */
function pickTarget(w: World, seen: Enemy[]): Enemy | null {
  const b = w.behemoth;
  const objectives = seen.filter((e) => e.objective);
  const pool = objectives.length > 0 ? objectives : seen;
  let best: Enemy | null = null;
  let bestScore = Infinity;
  for (const e of pool) {
    const blocked = w.terrain.lineBlocked(b.x, b.y, e.x, e.y) ? 1.6 : 1;
    const score = (dist(b, e) * blocked) / (1 + 0.35 * e.def.threat);
    if (score < bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

/** Where a round fired now would meet the target, if it holds its course. */
function lead(b: { x: number; y: number }, e: Enemy): { x: number; y: number } {
  const t = dist(b, e) / BOT.leadSpeed;
  return { x: e.x + e.vx * t, y: e.y + e.vy * t };
}

/** The line across the field to drive along: re-planned every `BOT.replan` s. */
function planLine(w: World): Plan {
  const prev = plans.get(w);
  if (prev && w.time - prev.at < BOT.replan) return prev;
  const b = w.behemoth;
  const half = (b.chassis.width * b.chassis.ground.width) / 2;
  const margin = b.chassis.width / 2 + 4;
  const lane = w.terrain.laneY(b.x + BOT.lookAhead);
  const mass = loadMass(b);
  const cost = (col: number, row: number) => tileCost(w, col, row, mass);

  let best: Plan | null = null;
  const score = (y: number) => {
    const { near, total, clear } = lineCost(w, y, half, cost);
    return { near, total, clear, s: total + BOT.lanePull * Math.abs(y - lane) + BOT.swerve * Math.abs(y - b.y) };
  };
  let bestS = Infinity;
  for (let y = margin; y <= w.terrain.height - margin; y += BOT.lineStep) {
    const r = score(y);
    if (r.s < bestS) {
      bestS = r.s;
      best = { y, at: w.time, near: r.near, total: r.total, clear: r.clear };
    }
  }
  // Keep the current line unless the new one is clearly better.
  if (prev && best) {
    const keep = score(prev.y);
    if (keep.s <= bestS + BOT.stickiness) best = { y: prev.y, at: w.time, near: keep.near, total: keep.total, clear: keep.clear };
  }
  const plan = best ?? { y: lane, at: w.time, near: 0, total: 0, clear: null };
  plans.set(w, plan);
  return plan;
}

/**
 * What driving to line `y` costs over the look-ahead: the hull eases over from where it is (about
 * 1.6 units forward per unit across), and every tile under its ground box is counted, the near
 * ones in full and the far ones less (there's time to re-plan).
 */
function lineCost(w: World, y: number, half: number, cost: (col: number, row: number) => number): { near: number; total: number; clear: { x: number; y: number } | null } {
  const b = w.behemoth;
  const nose = b.x + b.chassis.length / 2;
  const ramp = Math.max(40, Math.abs(y - b.y) * 1.6);
  let near = 0;
  let total = 0;
  let clear: { x: number; y: number } | null = null;
  for (let dx = 0; dx <= BOT.lookAhead; dx += TS) {
    const cy = b.y + (y - b.y) * Math.min(1, dx / ramp);
    const col = Math.floor((nose + dx) / TS);
    let c = 0;
    for (let row = Math.floor((cy - half) / TS); row <= Math.floor((cy + half) / TS); row++) {
      const k = cost(col, row);
      c += k;
      if (!clear && k >= BOT.clearAt && dx >= BOT.clearFrom && shootable(w, col, row)) clear = { x: (col + 0.5) * TS, y: (row + 0.5) * TS };
    }
    // Fuel tanks and derricks go up when hit: give them room.
    const reach = Math.ceil(BOT.blastRoom / TS);
    for (let row = Math.floor((cy - half) / TS) - reach; row <= Math.floor((cy + half) / TS) + reach; row++) if (explosive(w, col, row)) c += BOT.nearBlast;
    total += c * (1 - (0.5 * dx) / BOT.lookAhead);
    if (dx <= BOT.nearStretch) near += c;
  }
  // Marked artillery zones the hull would drive into before the rounds land.
  for (const z of w.barrages) {
    if (z.until < w.time) continue;
    const ahead = z.x - nose;
    if (ahead < -z.radius || ahead > BOT.lookAhead) continue;
    const cy = b.y + (y - b.y) * Math.min(1, Math.max(0, ahead) / ramp);
    if (Math.abs(cy - z.y) < z.radius + half) total += BOT.artilleryZone;
  }
  return { near, total, clear };
}

/** A standing tile that stops rounds (so the main gun can knock it down) and isn't explosive. */
function shootable(w: World, col: number, row: number): boolean {
  const t = w.terrain.tile(col, row);
  if (!t || (t.state !== 'intact' && t.state !== 'damaged')) return false;
  const m = MATERIALS[t.mat];
  return m.blocksShots[t.state] && m.maxHp > 0 && !m.explodes;
}

function explosive(w: World, col: number, row: number): boolean {
  const t = w.terrain.tile(col, row);
  return !!t && !!MATERIALS[t.mat].explodes && !MATERIALS[t.mat].hidden && (t.state === 'intact' || t.state === 'damaged');
}

/** What crossing one tile costs the hull, in rough tread-damage terms; what the player can't see is free. */
function tileCost(w: World, col: number, row: number, mass: number): number {
  const t = w.terrain.tile(col, row);
  if (!t) return row < 0 || row >= w.terrain.rows ? BOT.immovable : 0;
  const m = MATERIALS[t.mat];
  if (m.hidden && !t.seen) return 0;
  const ob = m.obstacle[t.state];
  let c = ob === 'immovable' ? BOT.immovable : OBSTACLE_CLASSES[ob].treadDamage + 0.3 * OBSTACLE_CLASSES[ob].armorDamage;
  if (m.hidden && t.state === 'intact') c += BOT.sweptMine;
  else if (m.explodes && (t.state === 'intact' || t.state === 'damaged')) c += BOT.explosive;
  if (m.wading) c += (m.wading.wear * TS) / 100 + (m.wading.cap === 'min' ? 0.5 : 0);
  if (m.bearing && m.bearing.limit < mass && (t.state === 'intact' || t.state === 'damaged')) c += BOT.weakGround;
  return c;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
