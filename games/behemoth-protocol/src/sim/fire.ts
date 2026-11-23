import { MATERIALS } from '../content/terrain';
import { FIRE } from '../content/tuning';
import type { FlameSpec, RoundSpec, WeaponDef } from '../content/weapons';
import { markFlash } from './conditions';
import { sealed, type Enemy } from './entities';
import { TIMER_SLACK } from './loop';
import { angleDiff } from './math';
import { damageEnemy } from './projectiles';
import { mineAt, triggerMine } from './trailer';
import type { World } from './world';

/**
 * Fire (SPEC §6 flamethrower). A flame is resolved at once, like a beam: a cone out of the nozzle
 * that strikes every unit in it with a clear line, sets them burning, and sets alight whatever
 * burns along its path (each material's `burns`) up to the first cover that stops it.
 *
 * Burning units take damage over time until it runs out (fresh flame renews it). A burning tile
 * eats its own hit points until it's down (a forest burns to a clearing, flushing out what hid in
 * it), scorches and lights up any unit standing in it, and can catch its burnable neighbors, so a
 * wood goes up as a forest fire. Fire never hurts the Behemoth (a call to revisit, SPEC §16).
 */

/** A burning tile's key in `World.fires`. */
export function fireKey(col: number, row: number): number {
  return col * 4096 + row;
}

/** Whether a tile is burning. */
export function burning(w: World, col: number, row: number): boolean {
  return w.fires.has(fireKey(col, row));
}

/** Whether a tile can be set alight now: a material that burns, still standing, not already burning. */
function canBurn(w: World, col: number, row: number): boolean {
  const t = w.terrain.tile(col, row);
  if (!t || !MATERIALS[t.mat].burns || burning(w, col, row)) return false;
  return t.state === 'intact' || t.state === 'damaged';
}

/** Set a tile alight, if it burns (and the fire count is under `FIRE.maxTiles`). Returns whether it caught. */
export function igniteTile(w: World, col: number, row: number): boolean {
  if (w.fires.size >= FIRE.maxTiles || !canBurn(w, col, row)) return false;
  w.fires.set(fireKey(col, row), { col, row, age: 0 });
  return true;
}

/** Set a unit burning (a shut trapdoor keeps the fire out). A fresh flame renews it, never shortens it. */
export function igniteEnemy(e: Enemy, spec: RoundSpec, burn: { dps: number; duration: number }): void {
  if (!e.alive || sealed(e)) return;
  if (e.burn && e.burn.left >= burn.duration && e.burn.dps >= burn.dps) return;
  e.burn = { dps: Math.max(burn.dps, e.burn?.dps ?? 0), left: Math.max(burn.duration, e.burn?.left ?? 0), spec };
}

/**
 * Fire a flame from a nozzle (SPEC §6): traces its path for what stops it and what it lights, then
 * strikes every unit in the cone short of that. Pushes a `fire` event (sound, heat) and a `flame`
 * event to draw it.
 */
export function shootFlame(w: World, weapon: WeaponDef, x: number, y: number, angle: number, slot: string): void {
  const spec = weapon.projectile as FlameSpec;
  markFlash(w);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const ts = w.terrain.tileSize;

  // Along its path: it lights what burns, sets off a mine, and stops at cover.
  let reach = spec.range;
  for (let d = FIRE.traceStep; d < spec.range; d += FIRE.traceStep) {
    const px = x + dx * d;
    const py = y + dy * d;
    if (py < 0 || py > w.terrain.height) {
      reach = d;
      break;
    }
    const col = Math.floor(px / ts);
    const row = Math.floor(py / ts);
    igniteTile(w, col, row);
    const mine = mineAt(w, px, py);
    if (mine) triggerMine(mine);
    if (w.terrain.blocksShotAt(px, py)) {
      w.terrain.damage(col, row, spec.tileDamage, w.events);
      reach = d;
      break;
    }
  }

  // Every unit in the cone short of that, with a clear line from the nozzle (troops hiding in the trees too).
  for (const e of w.enemies) {
    if (!e.alive || sealed(e)) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d - e.def.radius > reach) continue;
    const off = Math.abs(angleDiff(angle, Math.atan2(e.y - y, e.x - x)));
    if (off > spec.cone + Math.atan2(e.def.radius, Math.max(1, d))) continue;
    if (w.terrain.lineBlocked(x, y, e.x, e.y)) continue;
    damageEnemy(w, e, spec, spec.damage, 'splash');
    igniteEnemy(e, spec, spec.burn);
  }

  w.events.push({ type: 'fire', owner: 'player', weapon: weapon.id, x, y, angle, slot });
  w.events.push({ type: 'flame', x, y, angle, reach, cone: spec.cone });
}

/** Burning units and tiles, every `FIRE.tick`. */
export function stepFire(w: World, dt: number): void {
  w.fireTick -= dt;
  if (w.fireTick > TIMER_SLACK) return;
  w.fireTick += FIRE.tick;
  const tick = FIRE.tick;

  for (const e of w.enemies) {
    if (!e.burn) continue;
    if (!e.alive) {
      delete e.burn;
      continue;
    }
    damageEnemy(w, e, e.burn.spec, e.burn.dps * tick, 'splash');
    e.burn.left -= tick;
    if (e.burn.left <= TIMER_SLACK) delete e.burn;
  }

  if (w.fires.size === 0) return;
  const ts = w.terrain.tileSize;
  const catches: [number, number][] = [];
  for (const [key, f] of w.fires) {
    const t = w.terrain.tile(f.col, f.row);
    const burns = t && MATERIALS[t.mat].burns;
    // Burnt out (down, crushed flat, or scrolled away).
    if (!t || !burns || (t.state !== 'intact' && t.state !== 'damaged')) {
      w.fires.delete(key);
      continue;
    }
    f.age += tick;
    // Units standing in it (troops under burning trees, a garrison in a burning house).
    const x0 = f.col * ts;
    const y0 = f.row * ts;
    for (const e of w.enemies) {
      if (!e.alive || sealed(e)) continue;
      if (e.x + e.def.radius < x0 || e.x - e.def.radius > x0 + ts || e.y + e.def.radius < y0 || e.y - e.def.radius > y0 + ts) continue;
      damageEnemy(w, e, FIRE_SPEC, FIRE.tileDps * tick, 'splash');
      igniteEnemy(e, FIRE_SPEC, FIRE.burn);
    }
    // Spreads to its neighbors (decided before any of them catch, so a fire moves a tile a tick at most).
    for (const [c, r] of [
      [f.col + 1, f.row],
      [f.col - 1, f.row],
      [f.col, f.row + 1],
      [f.col, f.row - 1],
    ] as const) {
      if (canBurn(w, c, r) && w.rng.chance(burns.spread * tick)) catches.push([c, r]);
    }
    w.terrain.damage(f.col, f.row, burns.dps * tick, w.events);
  }
  for (const [c, r] of catches) igniteTile(w, c, r);
}

/** Burning terrain's own fire: no class modifiers, nothing to aim. */
const FIRE_SPEC: RoundSpec = { kind: 'beam', damage: 0, tileDamage: 0, range: 0, spread: 0 };
