import { rainy } from '../content/conditions';
import { isWet, MATERIALS } from '../content/terrain';
import { FIRE } from '../content/tuning';
import type { BurnSpec, FlameSpec, RoundSpec, WeaponDef } from '../content/weapons';
import { hitched, hullBox } from './behemoth';
import { markFlash } from './conditions';
import { sealed, type Enemy } from './entities';
import { TIMER_SLACK } from './loop';
import { angleDiff, orientedBox, pointInBox, type Box } from './math';
import { damageEnemy } from './projectiles';
import { mineAt, triggerMine } from './trailer';
import type { World } from './world';

/**
 * Fire (SPEC §6 "Fire"). Three things burn:
 * - **Units** set alight take damage over time until it runs out (fresh flame renews it). A burning
 *   unit sets alight what burns under it and can light a unit that touches it.
 * - **Tiles that burn** (each material's `burns`: a wood, a hedge, a house, a car) eat their own hit
 *   points until they're down (a forest burns to a clearing, flushing out what hid in it) and can
 *   catch their neighbors, so a wood goes up as a forest fire.
 * - **Burning fuel** on ground that doesn't burn itself (where a flamethrower's stream lands, under
 *   a fireball, round a wreck): it burns out in a few seconds, and can catch a neighbor that burns.
 * Any burning tile scorches and lights up the units standing in it. Tiles that burn and burning
 * wrecks pour **smoke** over themselves and the tiles round them, which hangs a while after: a
 * unit in smoke is concealed like one in a wood (`sim/concealment.ts`), and shoots wild.
 *
 * What starts fires: the flamethrower (a cone resolved at once, like a beam), incendiary bursts,
 * fuel going up, vehicles brewing up, plasma, lightning, and by chance most other weapons where
 * they strike something that burns (`ignites`). Rain damps it. Fire never hurts the Behemoth, and
 * its treads put out what they roll over (a call to revisit, SPEC §16).
 *
 * Everything random here draws from `World.fireRng`, so a fire never shifts the battle's combat draws.
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

/**
 * Burning fuel lands on a tile: a tile that burns catches; other ground burns for `seconds` (fresh
 * fuel keeps it going). Nothing burns on water, or on what still stands in a shot's way (a wall, rock).
 */
export function splashFuel(w: World, col: number, row: number, seconds: number, smokes = false): void {
  if (igniteTile(w, col, row)) return;
  const key = fireKey(col, row);
  const f = w.fires.get(key);
  if (f) {
    if (f.fuel !== undefined) f.fuel = Math.max(f.fuel, seconds);
    if (f.fuel !== undefined && smokes) f.smokes = true;
    return;
  }
  const t = w.terrain.tile(col, row);
  if (!t || w.fires.size >= FIRE.maxTiles || isWet(t.mat) || MATERIALS[t.mat].blocksShots[t.state]) return;
  w.fires.set(key, smokes ? { col, row, age: 0, fuel: seconds, smokes } : { col, row, age: 0, fuel: seconds });
}

/** Whether smoke hangs over a point (SPEC §6 "Fire"): it hides what's in it. */
export function smoky(w: World, x: number, y: number): boolean {
  if (w.smoke.size === 0) return false;
  const ts = w.terrain.tileSize;
  return w.smoke.has(fireKey(Math.floor(x / ts), Math.floor(y / ts)));
}

/** Roll `odds` to set alight the tile at a point (a round striking something that burns). */
export function igniteAt(w: World, x: number, y: number, odds: number): void {
  if (odds <= 0) return;
  const ts = w.terrain.tileSize;
  const col = Math.floor(x / ts);
  const row = Math.floor(y / ts);
  if (canBurn(w, col, row) && w.fireRng.chance(odds)) igniteTile(w, col, row);
}

/** Every tile whose center is within `r` of a point. */
function tilesWithin(w: World, x: number, y: number, r: number, visit: (col: number, row: number) => void): void {
  const ts = w.terrain.tileSize;
  for (let c = Math.floor((x - r) / ts); c <= Math.floor((x + r) / ts); c++) {
    for (let row = Math.floor((y - r) / ts); row <= Math.floor((y + r) / ts); row++) {
      if (Math.hypot((c + 0.5) * ts - x, (row + 0.5) * ts - y) <= r) visit(c, row);
    }
  }
}

/**
 * A blast that can start fires (most explosive rounds, by chance): rolls `odds` for each tile that
 * burns in the blast and a tile beyond it (a shell that levels the trees it lands in lights the
 * ones left standing round the clearing).
 */
export function igniteBlast(w: World, x: number, y: number, r: number, odds: number): void {
  if (odds <= 0) return;
  tilesWithin(w, x, y, r + w.terrain.tileSize, (c, row) => {
    if (canBurn(w, c, row) && w.fireRng.chance(odds)) igniteTile(w, c, row);
  });
}

/** How likely a round is to set alight what it strikes: its own `ignites`, or its kind's (`FIRE.ignites`). */
export function ignitesOf(spec: RoundSpec): number {
  if (spec.ignites !== undefined) return spec.ignites;
  return spec.kind === 'flame' ? 1 : FIRE.ignites[spec.kind];
}

/** Set a unit burning (a shut trapdoor keeps the fire out). A fresh flame renews it, never shortens it. */
export function igniteEnemy(e: Enemy, spec: RoundSpec, burn: BurnSpec): void {
  if (!e.alive || sealed(e)) return;
  if (e.burn && e.burn.left >= burn.duration && e.burn.dps >= burn.dps) return;
  e.burn = { dps: Math.max(burn.dps, e.burn?.dps ?? 0), left: Math.max(burn.duration, e.burn?.left ?? 0), spec };
}

/**
 * A fireball (a thermobaric or incendiary burst, fuel going up): every unit in it is set burning,
 * everything in it that burns is set alight, and the ground in it burns for `fuel` seconds.
 * `spec` scales the units' burn by class (missing: burning terrain's own, `FIRE.vs`).
 */
export function fireBurst(w: World, x: number, y: number, r: number, burn: BurnSpec, fuel: number = FIRE.fuel.burst, spec: RoundSpec = FIRE_SPEC): void {
  for (const e of w.enemies) if (e.alive && Math.hypot(e.x - x, e.y - y) - e.def.radius < r) igniteEnemy(e, spec, burn);
  tilesWithin(w, x, y, r + w.terrain.tileSize * 0.5, (c, row) => splashFuel(w, c, row, fuel));
}

/** A vehicle brewing up where it died: its wreck burns and smokes (and lights what burns under it). */
export function burnWreck(w: World, x: number, y: number): void {
  const ts = w.terrain.tileSize;
  splashFuel(w, Math.floor(x / ts), Math.floor(y / ts), FIRE.fuel.wreck, true);
}

/**
 * Fire a flame from a nozzle (SPEC §6): traces its path for what stops it and what it lights
 * (burning fuel lands on the ground past `FIRE.fuel.from`), then strikes every unit in the cone
 * short of that. Pushes a `fire` event (sound, heat) and a `flame` event to draw it.
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
    if (d >= FIRE.fuel.from) splashFuel(w, col, row, FIRE.fuel.flame);
    else igniteTile(w, col, row);
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
  w.events.push({ type: 'flame', x, y, angle, reach, cone: spec.cone, slot });
}

/** How hard it's raining (0–1): a rainstorm's squall. */
function rain(w: World): number {
  const c = w.condition;
  return c && rainy(c.id, w.terrain.recipe.biome) ? c.squall : 0;
}

/** Burning units and tiles, every `FIRE.tick`. */
export function stepFire(w: World, dt: number): void {
  w.fireTick -= dt;
  if (w.fireTick > TIMER_SLACK) return;
  w.fireTick += FIRE.tick;
  const tick = FIRE.tick;
  const rng = w.fireRng;
  const ts = w.terrain.tileSize;

  const alight: Enemy[] = [];
  for (const e of w.enemies) {
    if (!e.burn) continue;
    if (!e.alive) {
      delete e.burn;
      continue;
    }
    damageEnemy(w, e, e.burn.spec, e.burn.dps * tick, 'splash');
    e.burn.left -= tick;
    if (e.burn.left <= TIMER_SLACK) delete e.burn;
    if (!e.alive) continue;
    // It lights what burns under it (a burning squad running into a wood).
    igniteTile(w, Math.floor(e.x / ts), Math.floor(e.y / ts));
    if (e.burn) alight.push(e);
  }
  // And can light a unit that touches it (decided for all before any catch, so it passes one unit a tick at most).
  if (alight.length > 0) {
    const caught: Enemy[] = [];
    for (const o of w.enemies) {
      if (!o.alive || o.burn || sealed(o)) continue;
      for (const e of alight) {
        if (Math.hypot(e.x - o.x, e.y - o.y) > e.def.radius + o.def.radius + FIRE.unit.touch) continue;
        if (rng.chance(FIRE.unit.spread * tick)) {
          caught.push(o);
          break;
        }
      }
    }
    for (const o of caught) igniteEnemy(o, FIRE_SPEC, FIRE.burn);
  }

  // Smoke thins out; what's still burning below tops it up.
  for (const [key, left] of w.smoke) {
    if (left - tick <= TIMER_SLACK) w.smoke.delete(key);
    else w.smoke.set(key, left - tick);
  }
  if (w.fires.size === 0) return;
  const wet = rain(w);
  const damp = 1 - (1 - FIRE.rain.spread) * wet;
  // The treads put out what they roll over (and the trailer's wheels).
  const b = w.behemoth;
  const over: Box[] = b.destroyed ? [] : [hullBox(b)];
  const tr = hitched(b);
  if (tr && !b.destroyed) over.push(orientedBox(tr.x, tr.y, tr.def.length / 2, tr.def.width / 2, tr.heading));

  const catches: [number, number][] = [];
  for (const [key, f] of w.fires) {
    const t = w.terrain.tile(f.col, f.row);
    const burns = t && f.fuel === undefined ? MATERIALS[t.mat].burns : undefined;
    const cx = (f.col + 0.5) * ts;
    const cy = (f.row + 0.5) * ts;
    // Burnt out: down, crushed flat, or scrolled away; its fuel spent, or rolled over; put out by rain.
    const out =
      !t ||
      (f.fuel === undefined ? !burns || (t.state !== 'intact' && t.state !== 'damaged') : f.fuel <= TIMER_SLACK || over.some((box) => pointInBox(box, cx, cy))) ||
      (wet > 0 && rng.chance(FIRE.rain.out * wet * tick));
    if (out) {
      w.fires.delete(key);
      continue;
    }
    f.age += tick;
    if (f.fuel !== undefined) f.fuel -= tick;
    if ((f.fuel === undefined || f.smokes) && f.age >= FIRE.smoke.after) {
      const n = FIRE.smoke.reach;
      for (let c = f.col - n; c <= f.col + n; c++) {
        for (let r = Math.max(0, f.row - n); r <= Math.min(w.terrain.rows - 1, f.row + n); r++) w.smoke.set(fireKey(c, r), FIRE.smoke.linger);
      }
    }
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
    const spread = (burns ? burns.spread : FIRE.fuel.spread) * damp;
    for (const [c, r] of [
      [f.col + 1, f.row],
      [f.col - 1, f.row],
      [f.col, f.row + 1],
      [f.col, f.row - 1],
    ] as const) {
      if (spread > 0 && canBurn(w, c, r) && rng.chance(spread * tick)) catches.push([c, r]);
    }
    if (burns) w.terrain.damage(f.col, f.row, burns.dps * tick, w.events);
  }
  for (const [c, r] of catches) igniteTile(w, c, r);
}

/** Burning terrain's own fire: nothing to aim, and `FIRE.vs` by class (the table itself, so a live tweak applies). */
const FIRE_SPEC: RoundSpec = { kind: 'beam', damage: 0, tileDamage: 0, range: 0, spread: 0, vs: FIRE.vs };
