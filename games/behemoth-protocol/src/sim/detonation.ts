import { DETONATION } from '../content/tuning';
import { detonationRadius } from './behemoth';
import { destroyEnemy } from './enemies';
import { wreckTrailer } from './trailer';
import type { World } from './world';

/**
 * Reactor detonation (SPEC §5.1): failure that pays off. Once the reactor is destroyed (or the
 * player confirms a self-destruct) the fuse burns down, then the Behemoth goes up and takes
 * everything nearby with it.
 */
export function stepReactor(w: World, dt: number): void {
  const b = w.behemoth;
  if (b.reactorFuse === null || b.destroyed) return;
  b.reactorFuse -= dt;
  if (b.reactorFuse <= 0) detonate(w);
}

export function detonate(w: World): void {
  const b = w.behemoth;
  b.reactorFuse = null;
  b.destroyed = true;
  b.vx = 0;
  b.vy = 0;

  const radius = detonationRadius(b);
  const damage = b.chassis.reactor.blastDamage;
  const before = w.stats.blastKills;

  // Units inside the radius are vaporized; a fringe zone beyond it still takes falling-off damage.
  const fringe = radius * DETONATION.fringe;
  for (const e of w.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - b.x, e.y - b.y) - e.def.radius;
    if (d <= radius) destroyEnemy(w, e, 'blast');
    else if (d < radius + fringe) {
      e.hp -= damage * (1 - (d - radius) / fringe) * 0.5;
      if (e.hp <= 0) destroyEnemy(w, e, 'blast');
    }
  }

  // Levels the terrain: buildings to rubble, forests to ash.
  const t = w.terrain;
  const ts = t.tileSize;
  const c0 = Math.floor((b.x - radius) / ts);
  const c1 = Math.floor((b.x + radius) / ts);
  const r0 = Math.max(0, Math.floor((b.y - radius) / ts));
  const r1 = Math.min(t.rows - 1, Math.floor((b.y + radius) / ts));
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      if (Math.hypot((c + 0.5) * ts - b.x, (r + 0.5) * ts - b.y) <= radius) t.damage(c, r, damage, w.events);
    }
  }

  // Shells in flight inside the blast are swallowed by it.
  for (const p of w.projectiles) {
    if (Math.hypot(p.x - b.x, p.y - b.y) <= radius) p.alive = false;
  }

  // A trailer still in tow goes up with it; its kills count toward the final blast.
  wreckTrailer(w, 'blast');

  w.events.push({ type: 'detonation', x: b.x, y: b.y, radius, kills: w.stats.blastKills - before });
}
