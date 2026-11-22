import { ENEMIES, type EnemyId } from '../content/enemies';
import { MODES, type BattleModeId } from '../content/modes';
import { isWet } from '../content/terrain';
import { OBJECTIVE, SPAWNER, TERRAIN_GEN } from '../content/tuning';
import type { BehemothState } from './behemoth';
import { spawnEnemy } from './enemies';
import type { Enemy } from './entities';
import { frameRight } from './frame';
import { Rng, hashSeed } from './rng';
import type { Strength } from './sectorMap';
import { drawUnit } from './spawner';
import { chunkRiver, riverCenter, type FortressSpec, type Terrain, type TerrainRecipe } from './terrain';
import type { World } from './world';

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
 * A target left behind the frame is lost. Each one destroyed pays its share of the mode's bonus
 * (`objectiveBonus`); missing some never stops the run.
 */

/** What the battle's node asks for: its mode and strength (which sizes the objective). */
export interface ObjectiveSpec {
  mode: BattleModeId;
  strength: Strength;
}

export interface ObjectiveState {
  mode: BattleModeId;
  /** Targets in all, destroyed, and lost (passed by, or escaped). */
  total: number;
  destroyed: number;
  lost: number;
  /** Breach: the guns waiting to be placed when the frame reaches the wall (x); null once placed. */
  fortress: { x: number; guns: { id: EnemyId; x: number; y: number }[] } | null;
  /** Chase: the convoy's pace (world units/s). 0 outside a chase. */
  convoySpeed: number;
}

/**
 * Where a Breach battle's fortress stands: about `MODES.breach.fortress.at` of the way to the
 * extraction line, at a column where no river's banks touch the wall, its trap belt, or its bunkers
 * (a river would cut them apart). Its own random stream, so a seed always puts its fortress in the
 * same place.
 */
export function planFortress(seed: number, terrainSeed: number, rows: number, recipe: TerrainRecipe, startX: number, exitX: number, strength: Strength): FortressSpec {
  const f = MODES.breach.fortress!;
  const g = TERRAIN_GEN;
  const rng = new Rng(hashSeed(seed, 0xb7e4));
  const want = Math.floor((startX + (exitX - startX) * rng.range(f.at[0], f.at[1])) / g.tileSize / g.chunkCols);
  const lastChunk = Math.max(1, Math.floor((exitX / g.tileSize - g.fortLine.bunkerBehind - 2) / g.chunkCols));
  const lo = g.fortLine.trapsAhead + 2;
  const hi = g.chunkCols - g.fortLine.bunkerBehind - 1;
  const clear = (col: number) => {
    const ci = Math.floor(col / g.chunkCols);
    const a = col - g.fortLine.trapsAhead - 1;
    const b = col + g.fortLine.bunkerBehind + 1;
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
      if (clear(col)) return { col, guns: f.guns[strength], gates: f.gates, gateWidth: f.gateWidth };
    }
  }
  return { col: first * g.chunkCols + rng.int(lo, hi), guns: f.guns[strength], gates: f.gates, gateWidth: f.gateWidth };
}

export function createObjective(spec: ObjectiveSpec | null, terrain: Terrain, b: BehemothState): ObjectiveState {
  const mode = spec?.mode ?? 'assault';
  const o: ObjectiveState = { mode, total: 0, destroyed: 0, lost: 0, fortress: null, convoySpeed: 0 };
  const def = MODES[mode];
  if (def.fortress) {
    const plan = terrain.fortress();
    if (plan) {
      const ts = terrain.tileSize;
      const x = (plan.col + 0.5) * ts;
      const guns = plan.embrasures.map(([a, z], i) => ({ id: def.fortress!.units[i % def.fortress!.units.length]!, x, y: ((a + z) / 2) * ts }));
      o.fortress = { x, guns };
      o.total = guns.length;
    }
  }
  if (def.convoy && spec) {
    o.total = def.convoy.haulers[spec.strength];
    // Rated cruise, not the Behemoth's own: worn treads or an overload let the convoy get away.
    o.convoySpeed = def.convoy.speed * b.chassis.speed.cruise;
  }
  return o;
}

/** Sets the battle's objective going once the world exists: a Chase convoy starts just ahead. */
export function startObjective(w: World, strength: Strength): void {
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
    if (at) spawnEnemy(w, id, at.x, at.y);
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
    o.fortress = null;
  }
  for (const e of w.enemies) {
    if (!e.alive) continue;
    if (e.objective && (e.x >= w.exitX + OBJECTIVE.escapeBeyond || e.x < w.frame.left - OBJECTIVE.lostBehind)) lose(w, e);
    else if (e.def.id === 'mineLayer') layMines(w, e, dt);
  }
}

/** A mine layer drops a mine behind it every so often, on bare ground, until it runs out (SPEC §4.4 Chase). */
function layMines(w: World, e: Enemy, dt: number): void {
  const every = MODES.chase.convoy?.mineEvery ?? 0;
  if (every <= 0 || (e.ai.minesLeft ?? 0) <= 0) return;
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

/** A target that's gone without being destroyed: it drops out of the battle. */
function lose(w: World, e: Enemy): void {
  e.alive = false;
  w.objective.lost++;
  w.events.push({ type: 'objective', what: 'lost', enemy: e.def.id, x: e.x, y: e.y, done: objectiveSettled(w.objective) });
}

/** Called by `destroyEnemy` for a target. */
export function objectiveTaken(w: World, e: Enemy): void {
  w.objective.destroyed++;
  w.events.push({ type: 'objective', what: 'destroyed', enemy: e.def.id, x: e.x, y: e.y, done: objectiveSettled(w.objective) });
}

/** Every target is accounted for, destroyed or lost. */
export function objectiveSettled(o: ObjectiveState): boolean {
  return o.total > 0 && o.destroyed + o.lost >= o.total;
}

/** All of them destroyed. */
export function objectiveComplete(o: ObjectiveState): boolean {
  return o.total > 0 && o.destroyed >= o.total;
}

/** Salvage the objective pays at extraction: the mode's bonus, a share for each target destroyed. */
export function objectiveBonus(o: ObjectiveState): number {
  return o.total > 0 ? Math.round((MODES[o.mode].bonus * o.destroyed) / o.total) : 0;
}
