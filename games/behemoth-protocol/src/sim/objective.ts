import { ENEMIES, type EnemyId } from '../content/enemies';
import { MODES, type BattleModeId } from '../content/modes';
import { isWet } from '../content/terrain';
import { DIRECTIVE, OBJECTIVE, SPAWNER, TERRAIN_GEN } from '../content/tuning';
import type { BehemothState } from './behemoth';
import { spawnEnemy } from './enemies';
import type { Enemy } from './entities';
import { frameRight } from './frame';
import { Rng, hashSeed } from './rng';
import type { Strength } from './sectorMap';
import { cutAlert } from './encounter';
import { drawUnit, edgeSpot } from './spawner';
import { chunkRiver, riverCenter, type FortressSpec, type Terrain, type TerrainRecipe } from './terrain';
import type { World } from './world';
import { paySalvage } from './salvage';
import { createTrain } from './train';
import type { TrainCarId } from '../content/trainCars';

/**
 * Battle-mode objectives (SPEC §4.4). Every battle ends at the extraction line; Breach and Chase
 * also set targets:
 * - **Breach:** a fortress stands across the field (`TerrainRecipe.fortress`): a wall with gates and
 *   armed positions set into it. The guns are the targets, placed when the frame reaches the wall.
 *   Shoot them (their fronts are thick: angle in for the flanks) or plow through them.
 * - **Chase:** a convoy starts just ahead and drives up the lane for the far end, a little faster
 *   than the Behemoth cruises. Its haulers are the targets; damage slows them; mine layers at the
 *   tail drop mines in the Behemoth's path; light tanks screen it. A hauler past the extraction line
 *   has escaped.
 * - **Intercept:** an armored train runs the battle's rail line (`sim/train.ts`). Its engines are the
 *   targets; one that reaches the far end has escaped; a train stopped any other way (derailed) pays
 *   the rest of the bonus at once (`objectiveStopped`).
 * A target left behind the frame is lost. Each one destroyed pays its share of the mode's bonus
 * (`objectiveBonus`); missing some never stops the battle.
 *
 * A Decapitation objective (SPEC §3) adds a **command post** on a pad behind the fortress's bunkers.
 * It's tallied on its own (`ObjectiveState.command`), not with the guns; destroying it stops the
 * alert clock for the rest of the battle.
 */

/** What the battle's node asks for: its mode and strength (which sizes the objective). */
export interface ObjectiveSpec {
  mode: BattleModeId;
  strength: Strength;
  /** Breach only: a command post stands behind the wall (a Decapitation objective, SPEC §3). */
  command?: boolean;
  /** Intercept only: the train's vehicles, front to back (a practice layout); default by strength. */
  train?: readonly TrainCarId[];
}

/** A command post's fate: placed with the guns, then destroyed or left behind. */
export type CommandState = 'waiting' | 'standing' | 'destroyed' | 'lost';

export interface ObjectiveState {
  mode: BattleModeId;
  /** Targets in all, destroyed, and lost (passed by, or escaped). */
  total: number;
  destroyed: number;
  lost: number;
  /**
   * Breach: the guns waiting to be placed when the frame reaches the wall (x), and how many field
   * batteries dig in behind it; null once placed.
   */
  fortress: { x: number; guns: { id: EnemyId; x: number; y: number }[]; batteries: number } | null;
  /** Chase: the convoy's pace (world units/s). 0 outside a chase. */
  convoySpeed: number;
  /** Chase: seconds the convoy stays alarmed (> 0: the Behemoth is near, or was just now), and whether it has been yet. */
  alarm: number;
  alarmed: boolean;
  /** Decapitation: the command post, where it stands and what became of it; null without one. */
  command: { x: number; y: number; state: CommandState } | null;
}

/**
 * Where a Breach battle's fortress stands: about `MODES.breach.fortress.at` of the way to the
 * extraction line, at a column where no river's banks touch the wall, its trap belt, or its bunkers
 * (a river would cut them apart). Its own random stream, so a seed always puts its fortress in the
 * same place.
 */
export function planFortress(
  seed: number,
  terrainSeed: number,
  rows: number,
  recipe: TerrainRecipe,
  startX: number,
  exitX: number,
  strength: Strength,
  keep = false,
): FortressSpec {
  const f = MODES.breach.fortress!;
  const g = TERRAIN_GEN;
  const rng = new Rng(hashSeed(seed, 0xb7e4));
  // Columns the fortress reaches behind its wall: the bunkers, and the command post's pad.
  const behind = g.fortLine.bunkerBehind + (keep ? DIRECTIVE.keep.behind + DIRECTIVE.keep.cols - 1 : 0);
  const want = Math.floor((startX + (exitX - startX) * rng.range(f.at[0], f.at[1])) / g.tileSize / g.chunkCols);
  const lastChunk = Math.max(1, Math.floor((exitX / g.tileSize - behind - 2) / g.chunkCols));
  const lo = g.fortLine.trapsAhead + 2;
  const hi = g.chunkCols - g.fortLine.bunkerBehind - 1;
  const clear = (col: number) => {
    const ci = Math.floor(col / g.chunkCols);
    const a = col - g.fortLine.trapsAhead - 1;
    const b = col + behind + 1;
    for (let c = ci - 1; c <= ci + 1; c++) {
      const rv = chunkRiver(terrainSeed, c, rows, recipe);
      if (!rv) continue;
      const reach = rv.half + g.riverMargin + 0.5;
      for (let row = 0; row < rows; row++) {
        const center = riverCenter(rv, row + 0.5, rows);
        if (center + reach > a && center - reach < b + 1) return false;
      }
    }
    return true;
  };
  const first = Math.min(Math.max(1, want), lastChunk);
  for (const d of [0, 1, -1, 2, -2, 3, -3]) {
    const ci = want + d;
    if (ci < 1 || ci > lastChunk) continue;
    const cols = Array.from({ length: hi - lo + 1 }, (_, k) => ci * g.chunkCols + lo + k);
    const start = rng.int(0, cols.length - 1);
    for (let k = 0; k < cols.length; k++) {
      const col = cols[(start + k) % cols.length]!;
      if (clear(col)) return { col, guns: f.guns[strength], gates: f.gates, gateWidth: f.gateWidth, ...(keep ? { keep } : {}) };
    }
  }
  return { col: first * g.chunkCols + rng.int(lo, hi), guns: f.guns[strength], gates: f.gates, gateWidth: f.gateWidth, ...(keep ? { keep } : {}) };
}

export function createObjective(spec: ObjectiveSpec | null, terrain: Terrain, b: BehemothState): ObjectiveState {
  const mode = spec?.mode ?? 'assault';
  const o: ObjectiveState = { mode, total: 0, destroyed: 0, lost: 0, fortress: null, convoySpeed: 0, alarm: 0, alarmed: false, command: null };
  const def = MODES[mode];
  if (def.fortress) {
    const plan = terrain.fortress();
    if (plan) {
      const ts = terrain.tileSize;
      const x = (plan.col + 0.5) * ts;
      const guns = plan.embrasures.map(([a, z], i) => ({ id: def.fortress!.units[i % def.fortress!.units.length]!, x, y: ((a + z) / 2) * ts }));
      o.fortress = { x, guns, batteries: spec ? def.fortress.batteries[spec.strength] : 0 };
      o.total = guns.length;
      const k = plan.keep;
      if (k) o.command = { x: (k.col + DIRECTIVE.keep.cols / 2) * ts, y: ((k.rows[0] + k.rows[1]) / 2) * ts, state: 'waiting' };
    }
  }
  if (def.convoy && spec) {
    o.total = def.convoy.haulers[spec.strength];
    // Rated cruise, not the Behemoth's own: worn treads or an overload let the convoy get away.
    o.convoySpeed = def.convoy.speed * b.chassis.speed.cruise;
  }
  return o;
}

/** Sets the battle's objective going once the world exists: a Chase convoy starts just ahead, an Intercept's train pulls out. */
export function startObjective(w: World, strength: Strength, layout?: readonly TrainCarId[]): void {
  if (MODES[w.objective.mode].train) startTrain(w, strength, layout);
  const c = MODES[w.objective.mode].convoy;
  if (!c) return;
  const column: EnemyId[] = [...Array<EnemyId>(c.haulers[strength]).fill('hauler'), ...Array<EnemyId>(c.layers[strength]).fill('mineLayer')];
  const lead = frameRight(w.frame) + c.lead;
  column.forEach((id, i) => {
    const x = lead - i * c.spacing;
    const offset = (i % 2 === 0 ? -1 : 1) * w.terrain.tileSize * 0.8;
    const at = laneSpot(w, id, x, w.terrain.laneY(x) + offset);
    if (!at) return;
    const e = spawnEnemy(w, id, at.x, at.y);
    e.objective = id === 'hauler';
    e.ai.laneOffset = offset;
    e.ai.mineIn = c.mineEvery * (1 + i * 0.1);
    e.ai.minesLeft = c.mines;
    e.heading = 0;
    e.vx = w.objective.convoySpeed;
  });
  // A hauler with nowhere to start (rare: the lane walled in by buildings) doesn't count.
  w.objective.total = w.enemies.filter((e) => e.objective).length;
  // The screen: light tanks and hovercraft around the middle of the column.
  const mid = lead - ((column.length - 1) * c.spacing) / 2;
  for (let i = 0; i < c.escorts[strength]; i++) {
    const id = drawUnit(w.rng, c.escortMix, Infinity);
    if (!id) break;
    const side = i % 2 === 0 ? -1 : 1;
    const at = laneSpot(w, id, mid + w.rng.range(-30, 30), w.terrain.laneY(mid) + side * w.rng.range(40, 80));
    if (!at) continue;
    const e = spawnEnemy(w, id, at.x, at.y);
    e.role = c.escort;
    e.ai.orbitDir = side;
  }
}

/** An Intercept's train (its engines are the targets) and the hovercraft that ride with it, on the wide side of the line. */
function startTrain(w: World, strength: Strength, layout?: readonly TrainCarId[]): void {
  const m = MODES[w.objective.mode].train!;
  const tr = (w.train = createTrain(w, strength, layout));
  w.objective.total = tr.engines;
  const tail = tr.vehicles[tr.vehicles.length - 1];
  if (!tail) return;
  const wide = -w.terrain.lineSide;
  for (let i = 0; i < m.escorts[strength]; i++) {
    const x = tail.x + w.rng.range(0, 120);
    const at = laneSpot(w, m.escort, x, w.terrain.lineY(x) + wide * w.rng.range(50, 90));
    if (!at) continue;
    const e = spawnEnemy(w, m.escort, at.x, at.y);
    e.ai.orbitDir = wide < 0 ? -1 : 1;
  }
}

/** Open, dry ground for a unit near (x, y): the nearest row that will do, a few rows either way. */
function laneSpot(w: World, id: EnemyId, x: number, y: number): { x: number; y: number } | null {
  const t = w.terrain;
  const def = ENEMIES[id];
  const ts = t.tileSize;
  for (let i = 0; i <= OBJECTIVE.spawnSearch * 2; i++) {
    const dy = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * ts;
    const yy = Math.min(t.height - def.radius, Math.max(def.radius, y + dy));
    const tile = t.tileAt(x, yy);
    if (t.speedAt(x, yy, def.mobility) > 0 && !(tile && isWet(tile.mat))) return { x, y: yy };
  }
  return null;
}

/** Advances the objective: places the fortress guns, loses targets left behind or escaped, lays mines. */
export function stepObjective(w: World, dt: number): void {
  const o = w.objective;
  if (o.fortress && o.fortress.x <= frameRight(w.frame) + SPAWNER.spawnDistance) {
    for (const g of o.fortress.guns) {
      const e = spawnEnemy(w, g.id, g.x, g.y);
      e.objective = true;
      // Set into the wall facing the way the Behemoth comes: the thick front toward it.
      e.heading = Math.PI;
      e.turret = Math.PI;
    }
    const c = o.command;
    if (c?.state === 'waiting') {
      const e = spawnEnemy(w, 'commandPost', c.x, c.y);
      e.objective = true;
      e.heading = e.turret = Math.PI;
      c.state = 'standing';
    }
    // The fortress's own artillery, behind the wall near the sides, facing the approach.
    const depth = MODES.breach.fortress?.batteryDepth ?? 0;
    for (let i = 0; i < o.fortress.batteries; i++) {
      const at = edgeSpot(w, ENEMIES.artillery, o.fortress.x + depth + i * 2 * w.terrain.tileSize);
      if (!at) continue;
      const e = spawnEnemy(w, 'artillery', at.x, at.y);
      e.heading = e.turret = Math.PI;
    }
    o.fortress = null;
  }
  stepAlarm(w, dt);
  for (const e of w.enemies) {
    // A train's vehicles are the train's to lose (`sim/train.ts`): they fall behind and come back.
    if (!e.alive || e.train) continue;
    const d = e.def.behavior;
    if (e.objective && (e.x >= w.exitX + OBJECTIVE.escapeBeyond || e.x < w.frame.left - OBJECTIVE.lostBehind)) objectiveLost(w, e);
    else if (d.kind === 'convoy' && d.mines) layMines(w, e, d.mines.range, dt);
  }
}

/** The Chase convoy's alarm (`MODES.chase.convoy.alarm`): the Behemoth within range of any of its vehicles. */
function stepAlarm(w: World, dt: number): void {
  const o = w.objective;
  const a = MODES[o.mode].convoy?.alarm;
  if (!a) return;
  const b = w.behemoth;
  const near = w.enemies.find((e) => e.alive && e.def.behavior.kind === 'convoy' && Math.hypot(e.x - b.x, e.y - b.y) <= a.range);
  if (!near) {
    o.alarm = Math.max(0, o.alarm - dt);
    return;
  }
  o.alarm = a.hold;
  if (o.alarmed) return;
  o.alarmed = true;
  w.events.push({ type: 'convoyAlarm', x: near.x, y: near.y });
}

/**
 * A mine layer drops a mine behind it every so often, on bare ground, until it runs out (SPEC §4.4
 * Chase), but only while the hull is within `range` behind it: there's no point mining an empty road.
 */
function layMines(w: World, e: Enemy, range: number, dt: number): void {
  const every = MODES.chase.convoy?.mineEvery ?? 0;
  if (every <= 0 || (e.ai.minesLeft ?? 0) <= 0) return;
  const behind = e.x - w.behemoth.x;
  if (behind <= 0 || behind > range) return;
  e.ai.mineIn = (e.ai.mineIn ?? every) - dt;
  if (e.ai.mineIn > 0) return;
  e.ai.mineIn = every;
  const ts = w.terrain.tileSize;
  const x = e.x - Math.cos(e.heading) * (e.def.radius + ts / 2);
  const y = e.y - Math.sin(e.heading) * (e.def.radius + ts / 2);
  const col = Math.floor(x / ts);
  const row = Math.floor(y / ts);
  if (!w.terrain.layMine(col, row, w.events)) return;
  e.ai.minesLeft = (e.ai.minesLeft ?? 1) - 1;
  w.events.push({ type: 'mineLaid', x: (col + 0.5) * ts, y: (row + 0.5) * ts });
}

/**
 * An Intercept's train is stopped for good with engines still standing (derailed, or stuck behind
 * the pile): they count as taken, and the rest of the bonus is banked at once (SPEC §4.4).
 */
export function objectiveStopped(w: World, x: number, y: number): void {
  const o = w.objective;
  const before = objectiveBonus(o);
  o.destroyed = Math.max(o.destroyed, o.total - o.lost);
  for (const e of w.enemies) if (e.train) e.objective = false;
  paySalvage(w, x, y, objectiveBonus(o) - before, 'objective');
}

/** A target that's gone without being destroyed: it drops out of the battle. */
export function objectiveLost(w: World, e: Enemy): void {
  e.alive = false;
  if (e.def.id === 'commandPost' && w.objective.command) {
    w.objective.command.state = 'lost';
    w.events.push({ type: 'objective', what: 'lost', enemy: e.def.id, x: e.x, y: e.y, done: objectiveSettled(w.objective) });
    return;
  }
  w.objective.lost++;
  w.events.push({ type: 'objective', what: 'lost', enemy: e.def.id, x: e.x, y: e.y, done: objectiveSettled(w.objective) });
}

/** Called by `destroyEnemy` for a target. */
export function objectiveTaken(w: World, e: Enemy): void {
  if (e.def.id === 'commandPost' && w.objective.command) {
    // Its orders die with it: no more reinforcements this battle.
    w.objective.command.state = 'destroyed';
    cutAlert(w.encounter.alert);
    w.events.push({ type: 'objective', what: 'destroyed', enemy: e.def.id, x: e.x, y: e.y, done: objectiveSettled(w.objective) });
    return;
  }
  // Each target pays its share of the bonus as it falls (SPEC §4.4), so more destroyed is more salvage.
  const before = objectiveBonus(w.objective);
  w.objective.destroyed++;
  w.events.push({ type: 'objective', what: 'destroyed', enemy: e.def.id, x: e.x, y: e.y, done: objectiveSettled(w.objective) });
  paySalvage(w, e.x, e.y, objectiveBonus(w.objective) - before, 'objective');
}

/** Every target is accounted for, destroyed or lost. */
export function objectiveSettled(o: ObjectiveState): boolean {
  return o.total > 0 && o.destroyed + o.lost >= o.total;
}

/** All of them destroyed. */
export function objectiveComplete(o: ObjectiveState): boolean {
  return o.total > 0 && o.destroyed >= o.total;
}

/**
 * Salvage the objective has paid so far: the mode's bonus times the share of targets destroyed. It's
 * banked as each target falls (`objectiveTaken`), not at extraction.
 */
export function objectiveBonus(o: ObjectiveState): number {
  return o.total > 0 ? Math.round((MODES[o.mode].bonus * o.destroyed) / o.total) : 0;
}

/** The share of the targets destroyed, as a whole percentage (0 with no targets). */
export function objectivePercent(o: { destroyed: number; total: number }): number {
  return o.total > 0 ? Math.round((100 * o.destroyed) / o.total) : 0;
}

