import { isWet } from '../content/terrain';
import { POOL } from '../content/tuning';
import type { PoolSpec, ShellSpec } from '../content/weapons';
import { damageTreads, groundFootprint, hitched, type BehemothState } from './behemoth';
import { allocId, type Pool } from './entities';
import { circleIntersectsRect, clamp } from './math';
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
    // A hair of slack, so float drift can't push a tick into the next step.
    if (p.tick <= 1e-9 && p.ticks > 0) {
      p.tick += POOL.tick;
      p.ticks--;
      burn(w, p, POOL.tick);
    }
  }
  w.pools = w.pools.filter((p) => p.ticks > 0);
}

/** True while a pool reaches into the Behemoth's ground box (for the HUD and the AI later). */
export function poolUnder(b: BehemothState, p: Pool): boolean {
  return circleIntersectsRect(p.x, p.y, p.pool.radius, groundFootprint(b));
}

function burn(w: World, p: Pool, dt: number): void {
  const { radius, dps, tileDps } = p.pool;
  for (const e of w.enemies) {
    if (e.alive && Math.hypot(e.x - p.x, e.y - p.y) - e.def.radius < radius) damageEnemy(w, e, p.spec, dps * dt, 'splash');
  }

  const ts = w.terrain.tileSize;
  for (let c = Math.floor((p.x - radius) / ts); c <= Math.floor((p.x + radius) / ts); c++) {
    for (let row = Math.floor((p.y - radius) / ts); row <= Math.floor((p.y + radius) / ts); row++) {
      if (Math.hypot((c + 0.5) * ts - p.x, (row + 0.5) * ts - p.y) < radius + ts * 0.5) w.terrain.damage(c, row, tileDps * dt, w.events);
    }
  }

  const b = w.behemoth;
  if (b.destroyed) return;
  if (poolUnder(b, p)) {
    damageTreads(b, dps * POOL.treads * dt, w.events);
    const fp = groundFootprint(b);
    w.events.push({ type: 'plasmaBurn', x: clamp(p.x, fp.x0, fp.x1), y: clamp(p.y, fp.y0, fp.y1) });
  }
  const t = hitched(b);
  if (t) {
    // The pool's center in the trailer's own frame, against its box.
    const c = Math.cos(t.heading);
    const s = Math.sin(t.heading);
    const lx = (p.x - t.x) * c + (p.y - t.y) * s;
    const ly = -(p.x - t.x) * s + (p.y - t.y) * c;
    const hl = t.def.length / 2;
    const hw = t.def.width / 2;
    if (circleIntersectsRect(lx, ly, radius, { x0: -hl, y0: -hw, x1: hl, y1: hw })) {
      const cx = clamp(lx, -hl, hl);
      const cy = clamp(ly, -hw, hw);
      hitTrailer(b, t, dps * POOL.trailer * dt, w.rng, w.events, t.x + cx * c - cy * s, t.y + cx * s + cy * c);
    }
  }
}
