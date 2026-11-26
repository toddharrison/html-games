import { isWet } from '../content/terrain';
import { POOL } from '../content/tuning';
import type { PoolSpec, ShellSpec } from '../content/weapons';
import { damageTreads, groundBox, hitched, trailerBox, type BehemothState } from './behemoth';
import { allocId, type Pool } from './entities';
import { TIMER_SLACK } from './loop';
import { circleIntersectsBox, closestInBox } from './math';
import { igniteTile } from './fire';
import { damageEnemy } from './projectiles';
import { hitTrailer } from './trailer';
import type { World } from './world';

/**
 * Plasma pools (SPEC §6): a plasma burst leaves a patch burning on the ground. Every damage tick
 * it hurts each unit inside it, eats at the terrain under it (it melts buildings), and burns the
 * Behemoth's treads, and the trailer's armor, while they're over it. It doesn't care whose it is.
 */

/** Leave a pool where a round burst, unless it landed in water (it fizzles). */
export function spawnPool(w: World, x: number, y: number, spec: ShellSpec, pool: PoolSpec): void {
  const t = w.terrain.tileAt(x, y);
  if (t && isWet(t.mat)) return;
  // The burst's own splash has just hit, so the first tick comes a tick later.
  w.pools.push({ id: allocId(w), x, y, spec, pool, age: 0, tick: POOL.tick, ticks: Math.max(1, Math.round(pool.duration / POOL.tick)) });
}

export function stepPools(w: World, dt: number): void {
  for (const p of w.pools) {
    p.age += dt;
    p.tick -= dt;
    if (p.tick <= TIMER_SLACK && p.ticks > 0) {
      p.tick += POOL.tick;
      p.ticks--;
      burn(w, p, POOL.tick);
    }
  }
  w.pools = w.pools.filter((p) => p.ticks > 0);
}

/** True while a pool reaches into the Behemoth's ground box (for the HUD and the AI later). */
export function poolUnder(b: BehemothState, p: Pool): boolean {
  return circleIntersectsBox(groundBox(b), p.x, p.y, p.pool.radius);
}

function burn(w: World, p: Pool, dt: number): void {
  const { radius, dps, tileDps } = p.pool;
  for (const e of w.enemies) {
    if (e.alive && Math.hypot(e.x - p.x, e.y - p.y) - e.def.radius < radius) damageEnemy(w, e, p.spec, dps * dt, 'splash');
  }

  const ts = w.terrain.tileSize;
  for (let c = Math.floor((p.x - radius) / ts); c <= Math.floor((p.x + radius) / ts); c++) {
    for (let row = Math.floor((p.y - radius) / ts); row <= Math.floor((p.y + radius) / ts); row++) {
      if (Math.hypot((c + 0.5) * ts - p.x, (row + 0.5) * ts - p.y) >= radius + ts * 0.5) continue;
      w.terrain.damage(c, row, tileDps * dt, w.events);
      // Plasma sets alight whatever burns under it (SPEC §6 "Fire").
      igniteTile(w, c, row);
    }
  }

  const b = w.behemoth;
  if (b.destroyed) return;
  if (poolUnder(b, p)) {
    damageTreads(b, dps * POOL.treads * dt, w.events);
    const at = closestInBox(groundBox(b), p.x, p.y);
    w.events.push({ type: 'plasmaBurn', x: at.x, y: at.y });
  }
  const t = hitched(b);
  if (t) {
    // The trailer's own turned box.
    const box = trailerBox(t);
    if (circleIntersectsBox(box, p.x, p.y, radius)) {
      const at = closestInBox(box, p.x, p.y);
      hitTrailer(b, t, dps * POOL.trailer * dt, w.rng, w.events, at.x, at.y);
    }
  }
}
