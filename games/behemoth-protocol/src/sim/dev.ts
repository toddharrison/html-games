import type { ConditionId } from '../content/conditions';
import { ENEMIES, type EnemyDef, type EnemyId, type WaveSide } from '../content/enemies';
import { SPAWNER } from '../content/tuning';
import { mapArcs, type Integrity } from './behemoth';
import { createCondition } from './conditions';
import { arrival } from './encounter';
import { destroyEnemy, spawnEnemy } from './enemies';
import type { Enemy } from './entities';
import { frameRight } from './frame';
import { endLastStand } from './lastStand';
import { entryPoint, openSpot } from './spawner';
import type { World } from './world';

/**
 * The dev console's levers on a battle (`src/dev/console.ts`). Playtest cheats, never reached in
 * normal play: each one reaches into the world the way the sim itself would, so the battle carries
 * on normally afterwards.
 */

/** Where a dev-spawned unit comes in: the way the alert clock would send it, from one side, or on screen just ahead. */
export type DevSide = 'auto' | 'near' | WaveSide;

/** Sim seconds from switching to a storm until its first squall starts building. */
const STORM_SOON = 2;

/** Spawns a unit; null if there was no ground to put it on. */
export function devSpawn(w: World, id: EnemyId, side: DevSide): Enemy | null {
  const def = ENEMIES[id];
  let at: { x: number; y: number } | null = null;
  if (side === 'auto') {
    // Objective units (fortress guns, convoys) have no way in of their own: they're found ahead.
    at = def.spawn === 'objective' ? openSpot(w, def, frameRight(w.frame) + SPAWNER.coverBand[0]) : arrival(w, id);
  } else if (side !== 'near') {
    at = entryPoint(w, def, side);
  }
  at ??= nearSpot(w, def);
  return at ? spawnEnemy(w, id, at.x, at.y) : null;
}

/** Open ground on screen, well ahead of the hull. */
function nearSpot(w: World, def: EnemyDef): { x: number; y: number } | null {
  const b = w.behemoth;
  const ahead = frameRight(w.frame) - b.x;
  for (const k of [0.6, 0.5, 0.7, 0.4, 0.8, 0.3, 0.9]) {
    const at = openSpot(w, def, b.x + ahead * k);
    if (at) return at;
  }
  return null;
}

/** Every component, add-on, armor zone, and trailer part back to full; a burning reactor put out; Immobilized ends. */
export function devRepair(w: World): void {
  const b = w.behemoth;
  const fill = (i: Integrity | null | undefined) => {
    if (i) i.hp = i.max;
  };
  for (const i of [b.treads, b.sensors, b.fireControl, b.magazine, b.reactor]) fill(i);
  mapArcs((arc) => fill(b.armor[arc]));
  for (const h of b.hardpoints) fill(h.integrity);
  for (const a of b.addons) fill(a.integrity);
  if (b.trailer) {
    fill(b.trailer.armor);
    for (const bay of b.trailer.bays) fill(bay?.integrity);
  }
  if (b.destroyed) return;
  b.reactorFuse = null;
  if (b.immobilized) {
    b.immobilized = false;
    endLastStand(w);
  }
}

/** Every gun's ammo to a full load, and the capacitor charged. */
export function devRearm(w: World): void {
  const b = w.behemoth;
  for (const h of b.hardpoints) {
    const full = h.weapon?.ammo;
    if (h.ammo !== null && full !== undefined) h.ammo = Math.max(h.ammo, full);
  }
  b.power.stored = b.power.max;
}

/** God mode on or off (`BehemothState.invulnerable`). */
export function setInvulnerable(w: World, on: boolean): void {
  w.behemoth.invulnerable = on;
}

/** Destroys every live enemy (as if shot: they count as kills and pay salvage). Returns how many. */
export function devKillAll(w: World): number {
  const live = w.enemies.filter((e) => e.alive);
  for (const e of live) destroyEnemy(w, e, 'shot');
  return live.length;
}

/** The alert clock's next wave goes out on the next step. */
export function devWave(w: World): void {
  w.encounter.alert.next = 0;
}

/** The extraction line moves to the hull: the battle is won on the next step (if it can still move). */
export function devExtract(w: World): void {
  w.exitX = Math.min(w.exitX, w.behemoth.x);
}

/** Switches the battle's condition (SPEC §4.6) mid-battle; a new storm squalls soon. */
export function devCondition(w: World, id: ConditionId | null): void {
  w.condition = createCondition(id, w.seed, w.time + STORM_SOON);
}
