import { BEARING, TERRAIN_BLAST } from '../content/tuning';
import { damageTreads, footprint, groundFootprint, hitched, loadMass } from './behemoth';
import { destroyEnemy } from './enemies';
import { pointInRect } from './math';
import type { TerrainBlast } from './terrain';
import { blast, hitTrailer, hullBlast } from './trailer';
import type { World } from './world';

/**
 * Terrain that fights back (SPEC §4.5, §4.6): explosive tiles going up after their fuse (fuel tanks
 * chain, mines under the treads), bridges and thin ice giving way under the Behemoth's weight, and
 * vehicles lost when the ground under them does the same.
 */
export function stepHazards(w: World, dt: number): void {
  const b = w.behemoth;
  const t = w.terrain;
  if (!b.destroyed) {
    const spans = t.bear(groundFootprint(b), loadMass(b), dt, w.events);
    if (spans > 0) damageTreads(b, BEARING.collapseTreads, w.events);
  }

  w.blasts.push(...t.takeBlasts());
  const due: TerrainBlast[] = [];
  w.blasts = w.blasts.filter((bl) => {
    bl.fuse -= dt;
    if (bl.fuse > 0) return true;
    due.push(bl);
    return false;
  });
  for (const bl of due) terrainBlast(w, bl);

  // Ground that gave way (a bridge into the river, thin ice into icy water) takes whatever stood on it
  // and can't stay there: tracked vehicles drown, troops wade out.
  const ts = t.tileSize;
  for (const [c, r] of t.takeBroken()) {
    for (const e of w.enemies) {
      if (!e.alive || Math.floor(e.x / ts) !== c || Math.floor(e.y / ts) !== r) continue;
      if (t.speedAt(e.x, e.y, e.def.mobility) === 0) destroyEnemy(w, e, 'hazard');
    }
  }
}

/**
 * Explosive terrain going up: units and tiles in reach take falling-off damage (so neighboring tanks
 * chain). Under the Behemoth (a mine, a tank it plowed into) it hits the treads;
 * beside it, the hull takes a share on the arc facing it, and so does a trailer in reach.
 */
function terrainBlast(w: World, bl: TerrainBlast): void {
  const b = w.behemoth;
  blast(w, bl.x, bl.y, bl.radius, bl.damage, 'hazard', TERRAIN_BLAST.edge);
  if (b.destroyed) return;
  // Under the hull: its tile overlaps the footprint (a mine is set off the moment the treads reach it).
  const fp = footprint(b);
  const half = w.terrain.tileSize / 2;
  const under = pointInRect(bl.x, bl.y, { x0: fp.x0 - half, y0: fp.y0 - half, x1: fp.x1 + half, y1: fp.y1 + half });
  if (under) damageTreads(b, bl.damage * TERRAIN_BLAST.under, w.events);
  else hullBlast(w, bl.x, bl.y, bl.radius, bl.damage * TERRAIN_BLAST.hull, TERRAIN_BLAST.edge);
  const tr = hitched(b);
  if (tr && Math.hypot(tr.x - bl.x, tr.y - bl.y) < bl.radius + tr.def.length / 2) {
    hitTrailer(b, tr, bl.damage * TERRAIN_BLAST.hull, w.rng, w.events, bl.x, bl.y);
  }
}
