import { MATERIALS } from '../content/terrain';
import type { RailSpec, WeaponDef } from '../content/weapons';
import { conditionSpread, markFlash } from './conditions';
import { sealed, type Enemy } from './entities';
import { damageEnemy } from './projectiles';
import { mineAt, triggerMine } from './trailer';
import type { World } from './world';

/**
 * Railguns and coilguns (SPEC §6): a hypervelocity slug, resolved the moment it fires along the
 * barrel. It goes through every unit in its line, nearest first, keeping `falloff` of its damage past
 * each one, and punches through cover, keeping `wallLoss` past each tile that blocks shots and
 * damaging it on the way. It stops at ground nothing breaks (rock), at the end of its range, or once
 * it's down to `SPENT` of its damage. Its `penetration` takes it through front armor.
 */

/** How finely the slug's path is traced for cover and mines. */
const STEP = 2;
/** A unit is struck if its body comes this close to the line. */
const WIDTH = 1.5;
/** Below this share of its damage the slug is spent. */
const SPENT = 0.1;

export function shootRail(w: World, weapon: WeaponDef, x: number, y: number, angle: number, opts: { spreadMul?: number; slot: string }): void {
  const spec = weapon.projectile as RailSpec;
  const spread = spec.spread * (opts.spreadMul ?? 1) * conditionSpread(w);
  const a = angle + w.rng.range(-spread, spread);
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  markFlash(w);

  // Every unit the line passes through, nearest first, with where the slug meets it.
  const inLine: { e: Enemy; t: number }[] = [];
  for (const e of w.enemies) {
    if (!e.alive || sealed(e)) continue;
    const along = (e.x - x) * dx + (e.y - y) * dy;
    const across = Math.abs(-(e.x - x) * dy + (e.y - y) * dx);
    const r = e.def.radius + WIDTH;
    if (along <= 0 || across > r) continue;
    const t = Math.max(0, along - Math.sqrt(r * r - across * across));
    if (t <= spec.range) inLine.push({ e, t });
  }
  inLine.sort((p, q) => p.t - q.t);

  const ts = w.terrain.tileSize;
  let share = 1;
  let next = 0;
  let end = spec.range;
  let lastTile = -1;
  const hits: { x: number; y: number }[] = [];
  const strike = (upTo: number) => {
    while (next < inLine.length && inLine[next]!.t <= upTo && share >= SPENT) {
      const { e, t } = inLine[next++]!;
      const hx = x + dx * t;
      const hy = y + dy * t;
      damageEnemy(w, e, spec, spec.damage * share, { dx, dy, x: hx, y: hy });
      hits.push({ x: hx, y: hy });
      share *= spec.falloff;
    }
  };
  for (let d = 0; d <= spec.range; d += STEP) {
    strike(d);
    if (share < SPENT) {
      end = inLine[next - 1]?.t ?? d;
      break;
    }
    const px = x + dx * d;
    const py = y + dy * d;
    if (py < -8 || py > w.terrain.height + 8) {
      end = d;
      break;
    }
    const mine = mineAt(w, px, py);
    if (mine) triggerMine(mine);
    const col = Math.floor(px / ts);
    const row = Math.floor(py / ts);
    const key = col * 4096 + row;
    if (key === lastTile || !w.terrain.blocksShotAt(px, py)) continue;
    lastTile = key;
    const tile = w.terrain.tile(col, row);
    // Rock (or anything else nothing can break) stops it dead.
    if (!tile || MATERIALS[tile.mat].maxHp <= 0) {
      end = d;
      hits.push({ x: px, y: py });
      break;
    }
    w.terrain.damage(col, row, spec.tileDamage * share, w.events);
    hits.push({ x: px, y: py });
    share *= spec.wallLoss;
    if (share < SPENT) {
      end = d;
      break;
    }
  }

  // Ran its full length: whatever stands at the very end of its reach.
  if (end === spec.range) strike(spec.range);

  w.events.push({ type: 'fire', owner: 'player', weapon: weapon.id, x, y, angle: a, slot: opts.slot });
  w.events.push({ type: 'rail', weapon: weapon.id, x0: x, y0: y, x1: x + dx * end, y1: y + dy * end, hits });
}
