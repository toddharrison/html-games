import type { ArcSpec, WeaponDef } from '../content/weapons';
import { conditionSpread, markFlash } from './conditions';
import { sealed, type Enemy } from './entities';
import { damageEnemy } from './projectiles';
import { mineAt, triggerMine } from './trailer';
import type { World } from './world';

/**
 * Arc projectors and tesla coils (SPEC §6): a bolt along the barrel to the first unit or cover in
 * its path (out to its range), resolved at once. From a unit it leaps to the nearest one not yet
 * struck within `jumpRange` that it has a clear line to, up to `jumps` times, keeping `falloff` of
 * its damage each leap. Cover takes the first bolt and ends it. Lightning finds troops hidden in the
 * trees too.
 */

/** How finely the first bolt is traced for cover and mines. */
const STEP = 2;
/** Lightning finds a unit whose body comes this close to the bolt's line (it's not a pencil beam). */
const REACH = 4;

export function shootArc(w: World, weapon: WeaponDef, x: number, y: number, angle: number, opts: { spreadMul?: number; slot: string }): void {
  const spec = weapon.projectile as ArcSpec;
  const spread = spec.spread * (opts.spreadMul ?? 1) * conditionSpread(w);
  const a = angle + w.rng.range(-spread, spread);
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  markFlash(w);

  // The first bolt: the nearest unit along the line.
  let reach = spec.range;
  let first: Enemy | null = null;
  for (const e of w.enemies) {
    if (!e.alive || sealed(e)) continue;
    const along = (e.x - x) * dx + (e.y - y) * dy;
    const across = Math.abs(-(e.x - x) * dy + (e.y - y) * dx);
    const r = e.def.radius + REACH;
    if (along <= 0 || across > r) continue;
    const t = Math.max(0, along - Math.sqrt(r * r - across * across));
    if (t < reach) {
      reach = t;
      first = e;
    }
  }
  // Cover or a mine before it takes the bolt.
  const points: { x: number; y: number }[] = [{ x, y }];
  let hit = false;
  for (let d = 0; d < reach; d += STEP) {
    const px = x + dx * d;
    const py = y + dy * d;
    const mine = mineAt(w, px, py);
    if (mine) triggerMine(mine);
    if (mine || w.terrain.blocksShotAt(px, py)) {
      const ts = w.terrain.tileSize;
      if (!mine) w.terrain.damage(Math.floor(px / ts), Math.floor(py / ts), spec.tileDamage, w.events);
      points.push({ x: px, y: py });
      first = null;
      hit = true;
      break;
    }
  }

  if (first) {
    // Then from unit to unit.
    const struck = new Set<Enemy>();
    let at: Enemy | null = first;
    let dmg = spec.damage;
    for (let leap = 0; at && leap <= spec.jumps; leap++) {
      struck.add(at);
      points.push({ x: at.x, y: at.y });
      damageEnemy(w, at, spec, dmg, 'splash');
      dmg *= spec.falloff;
      at = nextLeap(w, at, spec.jumpRange, struck);
    }
    hit = true;
  } else if (!hit) {
    points.push({ x: x + dx * spec.range, y: y + dy * spec.range });
  }

  w.events.push({ type: 'fire', owner: 'player', weapon: weapon.id, x, y, angle: a, slot: opts.slot });
  w.events.push({ type: 'arc', weapon: weapon.id, points, hit });
}

/** The nearest live unit not yet struck within `range` of `from` (body to body), with a clear line. */
function nextLeap(w: World, from: Enemy, range: number, struck: ReadonlySet<Enemy>): Enemy | null {
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of w.enemies) {
    if (!e.alive || sealed(e) || struck.has(e)) continue;
    const d = Math.hypot(e.x - from.x, e.y - from.y) - e.def.radius - from.def.radius;
    if (d > range || d >= bestD || w.terrain.lineBlocked(from.x, from.y, e.x, e.y)) continue;
    best = e;
    bestD = d;
  }
  return best;
}
