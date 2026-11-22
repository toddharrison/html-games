import { ENEMIES, type EnemyDef, type WaveSide } from '../content/enemies';
import type { MobilityId } from '../content/terrain';
import { LAST_STAND, SPAWNER } from '../content/tuning';
import { joinSiege, leaveSiege } from './ai/besiege';
import { buildFlow, type FlowField } from './ai/flow';
import { footprint, revealRadius } from './behemoth';
import { spawnEnemy } from './enemies';
import { frameRight } from './frame';
import { drawUnit, entryPoint, liveThreat } from './spawner';
import type { World } from './world';

/**
 * The Immobilized last stand (SPEC §5.1). When the treads give out, the camera stops, every unit
 * on the map converges (`besiege`), the frame eases to center the hull, and the defenders and alert clock
 * give way to escalating waves from every side. The Behemoth can still fire everything, but nothing ends this except the
 * reactor going up.
 */

export interface LastStandState {
  /** Seconds since the Behemoth was Immobilized. */
  time: number;
  /** Waves sent so far. */
  wave: number;
  /** Seconds until the next wave. */
  nextWave: number;
  /** Routes toward the Behemoth around rock and buildings, per mobility (rebuilt as terrain changes). */
  flow: Record<MobilityId, FlowField> | null;
  /** Seconds until the flow fields are rebuilt. */
  flowIn: number;
}

/** How often the flow fields are rebuilt (seconds): buildings fall, and the hull grinds to a halt. */
const FLOW_REBUILD = 0.5;

/** Starts the last stand once the Behemoth is Immobilized, then sends the waves. */
export function stepLastStand(w: World, dt: number): void {
  const b = w.behemoth;
  if (b.destroyed) return;
  if (!w.lastStand) {
    if (!b.immobilized) return;
    w.lastStand = { time: 0, wave: 0, nextWave: LAST_STAND.firstWave, flow: null, flowIn: 0 };
    for (const e of w.enemies) if (e.alive) joinSiege(e, w);
    w.events.push({ type: 'lastStand' });
  }
  const ls = w.lastStand;
  ls.time += dt;
  ls.flowIn -= dt;
  if (!ls.flow || ls.flowIn <= 0) {
    ls.flowIn = FLOW_REBUILD;
    ls.flow = buildFlows(w);
  }
  ls.nextWave -= dt;
  if (ls.nextWave > 0) return;
  ls.wave++;
  ls.nextWave = Math.max(LAST_STAND.minInterval, LAST_STAND.interval - LAST_STAND.intervalShrink * (ls.wave - 1));
  const count = sendWave(w, waveBudget(ls.wave));
  w.events.push({ type: 'wave', wave: ls.wave, units: count });
}

/**
 * The drones got the treads turning again (SPEC §5.1): the waves stop, the camera follows the hull
 * again, the alert clock picks up where it stopped, and the besiegers go back to their usual behaviors.
 */
export function endLastStand(w: World): void {
  if (!w.lastStand) return;
  w.lastStand = null;
  for (const e of w.enemies) if (e.alive) leaveSiege(e, w);
}

function buildFlows(w: World): Record<MobilityId, FlowField> {
  const hull = footprint(w.behemoth);
  const margin = SPAWNER.spawnDistance + 4 * w.terrain.tileSize;
  const x0 = w.frame.left - margin;
  const x1 = frameRight(w.frame) + margin;
  return {
    tracked: buildFlow(w.terrain, 'tracked', hull, x0, x1),
    foot: buildFlow(w.terrain, 'foot', hull, x0, x1),
  };
}

/** Threat a given wave brings (1-based). */
export function waveBudget(wave: number): number {
  return LAST_STAND.budget + LAST_STAND.budgetGrowth * (wave - 1);
}

/**
 * Spawns up to `budget` threat from the battle's mix (the defenders' doctrine), within the
 * live-threat ceiling. Returns units spawned.
 */
function sendWave(w: World, budget: number): number {
  let live = liveThreat(w);
  let count = 0;
  // A few extra tries cover placements that come up empty.
  for (let tries = 0; tries < 40 && budget > 0; tries++) {
    const id = drawUnit(w.rng, w.mix, Math.min(budget, LAST_STAND.maxThreat - live));
    if (!id) break;
    const def = ENEMIES[id];
    const at = wavePlacement(w, def);
    if (!at) continue;
    spawnEnemy(w, id, at.x, at.y);
    budget -= def.threat;
    live += def.threat;
    count++;
  }
  return count;
}

/**
 * Troops infiltrate: they turn up already dug into concealing cover on screen, beyond the sensor
 * reveal radius, so they're hidden when they arrive (or come in from a side if there's no such
 * cover). Vehicles drive in from every side: beyond the top or bottom of the frame, or across
 * either edge of the field.
 */
export function wavePlacement(w: World, def: EnemyDef): { x: number; y: number } | null {
  if (def.canHide) {
    const spot = infiltrationSpot(w, def);
    if (spot) return spot;
  }
  const sides = Object.keys(LAST_STAND.sides) as WaveSide[];
  return entryPoint(w, def, w.rng.weighted(sides, (s) => LAST_STAND.sides[s])!);
}

function infiltrationSpot(w: World, def: EnemyDef): { x: number; y: number } | null {
  const t = w.terrain;
  const b = w.behemoth;
  const ts = t.tileSize;
  const minDist = revealRadius(b) + def.radius + LAST_STAND.infiltrateMargin;
  const c0 = Math.floor(w.frame.left / ts);
  const c1 = Math.floor(frameRight(w.frame) / ts);
  const tiles: { x: number; y: number }[] = [];
  for (let c = c0; c <= c1; c++) {
    for (let r = 0; r < t.rows; r++) {
      const x = (c + 0.5) * ts;
      const y = (r + 0.5) * ts;
      if (t.concealsAt(x, y) && Math.hypot(x - b.x, y - b.y) > minDist) tiles.push({ x, y });
    }
  }
  return tiles.length > 0 ? w.rng.pick(tiles) : null;
}
