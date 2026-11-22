import { ENEMIES, type EnemyDef, type EnemyId, type WaveSide } from '../content/enemies';
import { isWet, MATERIALS } from '../content/terrain';
import { LAST_STAND, SPAWNER } from '../content/tuning';
import type { Rng } from './rng';
import { frameRight } from './frame';
import type { World } from './world';

/**
 * Where units enter the field, shared by the defenders, the alert clock's waves (`encounter.ts`),
 * and the last stand: in cover ahead of the frame, beyond the frame ahead or behind, or across a
 * field edge.
 */

/** A unit drawn from `mix` that costs no more than `room` threat, or null if none fits. */
export function drawUnit(rng: Rng, mix: Partial<Record<EnemyId, number>>, room: number): EnemyId | null {
  const ids = (Object.keys(mix) as EnemyId[]).filter((id) => (mix[id] ?? 0) > 0 && ENEMIES[id].threat <= room);
  return rng.weighted(ids, (i) => mix[i] ?? 0) ?? null;
}

/** The cheapest unit in a mix (its threat), or Infinity for an empty mix. */
export function cheapest(mix: Partial<Record<EnemyId, number>>): number {
  const costs = (Object.keys(mix) as EnemyId[]).filter((id) => (mix[id] ?? 0) > 0).map((id) => ENEMIES[id].threat);
  return costs.length > 0 ? Math.min(...costs) : Infinity;
}

/** Live enemies' total threat. */
export function liveThreat(w: World): number {
  return w.enemies.reduce((sum, e) => sum + (e.alive ? e.def.threat : 0), 0);
}

/**
 * A random cover tile between `from` and `to` (world x) that's ahead of the frame, so troops are
 * already dug in when the Behemoth gets there. Null if there's none.
 */
export function coverSpot(w: World, from: number, to: number): { x: number; y: number } | null {
  const t = w.terrain;
  const ts = t.tileSize;
  const c0 = Math.floor(Math.max(from, frameRight(w.frame) + SPAWNER.coverBand[0]) / ts);
  const c1 = Math.floor(to / ts);
  const tiles: { c: number; r: number }[] = [];
  for (let c = c0; c <= c1; c++) {
    for (let r = 0; r < t.rows; r++) if (t.isCover(c, r)) tiles.push({ c, r });
  }
  if (tiles.length === 0) return null;
  const { c, r } = w.rng.pick(tiles);
  return { x: (c + 0.5) * ts, y: (r + 0.5) * ts };
}

/** A random spot across the field at `x` that this unit can move on, or null after a few tries. */
export function openSpot(w: World, def: EnemyDef, x: number): { x: number; y: number } | null {
  const margin = 12;
  for (let attempt = 0; attempt < 8; attempt++) {
    const y = w.rng.range(margin, w.terrain.height - margin);
    if (w.terrain.speedAt(x, y, def.mobility) > 0) return { x, y };
  }
  return null;
}

/**
 * Where a fixed unit (a field battery) is found dug in at `x`: open, dry ground within
 * `SPAWNER.edgeBand` of either side of the field, off the Behemoth's line. Null after a few tries.
 */
export function edgeSpot(w: World, def: EnemyDef, x: number): { x: number; y: number } | null {
  const t = w.terrain;
  const margin = def.radius + 4;
  const band = Math.max(margin + 1, t.height * SPAWNER.edgeBand);
  for (let attempt = 0; attempt < 12; attempt++) {
    const inset = w.rng.range(margin, band);
    const y = w.rng.chance(0.5) ? inset : t.height - inset;
    const tile = t.tileAt(x, y);
    if (t.speedAt(x, y, def.mobility) > 0 && !(tile && isWet(tile.mat)) && !t.blocksShotAt(x, y)) return { x, y };
  }
  return null;
}

/**
 * Where a hedge gun (SPEC §7.4) is found dug in: an intact hedgerow tile between `from` and `to`
 * (world x), ahead of the frame and at least `SPAWNER.hedgeOffset` across from the Behemoth's line,
 * so it fires into the flank as the hull goes by. With no hedge in that stretch, a wood the same way
 * (concealing ground that doesn't stop shots, so never a building); null if there's neither.
 */
export function hedgeSpot(w: World, from: number, to: number): { x: number; y: number } | null {
  const t = w.terrain;
  const ts = t.tileSize;
  const c0 = Math.floor(Math.max(from, frameRight(w.frame) + SPAWNER.coverBand[0]) / ts);
  const c1 = Math.floor(to / ts);
  const hedges: { c: number; r: number }[] = [];
  const woods: { c: number; r: number }[] = [];
  for (let c = c0; c <= c1; c++) {
    for (let r = 0; r < t.rows; r++) {
      if (Math.abs((r + 0.5) * ts - w.behemoth.y) < SPAWNER.hedgeOffset) continue;
      const tile = t.tile(c, r);
      if (!tile || tile.state !== 'intact') continue;
      const m = MATERIALS[tile.mat];
      if (tile.mat === 'hedgerow') hedges.push({ c, r });
      else if (m.conceals.intact && !m.blocksShots.intact) woods.push({ c, r });
    }
  }
  const tiles = hedges.length > 0 ? hedges : woods;
  if (tiles.length === 0) return null;
  const { c, r } = w.rng.pick(tiles);
  return { x: (c + 0.5) * ts, y: (r + 0.5) * ts };
}

/**
 * Where a trapdoor team (SPEC §7.4) is found dug in: open sand (desert ground or dunes) at `x` or a
 * little beyond, `SPAWNER.burrow.offset` across from the Behemoth's line, so the hull drives past
 * it; within `cluster` of `near` when given (a post's holes lie close together). Null if none.
 */
export function burrowSpot(w: World, x: number, near?: { x: number; y: number }): { x: number; y: number } | null {
  const t = w.terrain;
  const { offset, cluster } = SPAWNER.burrow;
  const by = w.behemoth.y;
  for (let attempt = 0; attempt < 16; attempt++) {
    const at = near
      ? { x: near.x + w.rng.range(-cluster, cluster), y: near.y + w.rng.range(-cluster, cluster) }
      : { x: x + w.rng.range(0, 4 * t.tileSize), y: by + w.rng.sign() * w.rng.range(offset[0], offset[1]) };
    const tile = t.tileAt(at.x, at.y);
    if (!tile || tile.state !== 'intact' || (tile.mat !== 'ground' && tile.mat !== 'dune')) continue;
    if (Math.abs(at.y - by) < offset[0] || at.x <= frameRight(w.frame)) continue;
    return at;
  }
  return null;
}

/** Units that can arrive from anywhere: everything but fixed positions, which are only ever found dug in. */
export function mobileMix(mix: Partial<Record<EnemyId, number>>): Partial<Record<EnemyId, number>> {
  return Object.fromEntries(Object.entries(mix).filter(([id]) => ENEMIES[id as EnemyId].maxSpeed > 0));
}

/** Where a unit coming in from `side` starts, off screen. Null if it found no open ground to enter on. */
export function entryPoint(w: World, def: EnemyDef, side: WaveSide): { x: number; y: number } | null {
  if (side === 'ahead') return openSpot(w, def, frameRight(w.frame) + SPAWNER.spawnDistance);
  if (side === 'behind') return openSpot(w, def, w.frame.left - SPAWNER.spawnDistance);
  // Across a field edge: level with somewhere on screen, onto open ground at the edge.
  const t = w.terrain;
  const margin = def.radius + 8;
  const edgeY = side === 'left' ? t.tileSize / 2 : t.height - t.tileSize / 2;
  for (let attempt = 0; attempt < 8; attempt++) {
    const x = w.rng.range(w.frame.left + margin, frameRight(w.frame) - margin);
    if (t.speedAt(x, edgeY, def.mobility) > 0) {
      return { x, y: side === 'left' ? -LAST_STAND.flankDistance : t.height + LAST_STAND.flankDistance };
    }
  }
  return null;
}
