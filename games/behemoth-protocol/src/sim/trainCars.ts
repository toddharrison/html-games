import type { DoctrineId } from '../content/doctrines';
import { ENEMIES, type EnemyDef } from '../content/enemies';
import { TRAIN_CAR_IDS, TRAIN_CARS, TRAIN_DOCTRINE, TRAIN_LAYOUT, type TrainCarId } from '../content/trainCars';
import { destroyEnemy, spawnEnemy } from './enemies';
import type { Enemy } from './entities';
import { inFrame } from './frame';
import type { Rng } from './rng';
import type { Strength } from './sectorMap';
import { unitOf, type TrainState, type TrainVehicle } from './train';
import type { World } from './world';

/**
 * What a train's cars are and do beyond shooting (content/trainCars.ts; SPEC-armored-train.md §T6,
 * §T21). How the train itself runs, parts, and piles up is `sim/train.ts`, which calls in here.
 *
 * - **Making one up:** `buildTrain` (an armored train, from its node's strength, threat, and
 *   doctrine) and `buildRaider` (an attack train).
 * - **Troops inside** (`TrainCarDef.troops`, a troop car): they jump out beside it when it's
 *   destroyed or abandoned (`dismount`).
 * - **Troops on the roof** (`TrainCarDef.riders`: any car with a clear roof may carry them): ordinary units that the train
 *   carries (`board`, `carryRiders`), in cover behind its parapet (`coverProtection`). They go with the car when it's wrecked and climb down when
 *   it's abandoned (`dismount`).
 * - **Mine flingers** (`TrainCarDef.fling`): `stepFlingers`.
 *
 * What a car does as a unit (its guns, a shield on an arm, a mask) is the unit's own
 * (`EnemyDef`, `sim/enemies.ts`, `sim/shield.ts`, `sim/mask.ts`).
 */

/**
 * The cars a train of this strength carries (docs/SPEC-armored-train.md §T6), front to back: the
 * railway gun behind the lead engine; armed cars drawn by the doctrine's odds against a budget
 * that grows with the node's threat (`TRAIN_LAYOUT.budget`), split between the sections so the front is
 * hardest (what a section can't spend goes on to the one ahead of it); ammo cars beside armed
 * ones; boxcars in what's left.
 */
export function buildTrain(strength: Strength, threat: number, doctrine: DoctrineId, rng: Rng): TrainCarId[] {
  const L = TRAIN_LAYOUT;
  const n = L.sections[strength];
  const slots = L.cars[strength];
  const weights = TRAIN_DOCTRINE[doctrine].weights;
  const armed = (id: TrainCarId | undefined) => !!id && TRAIN_CARS[id].cost !== undefined;
  const choices = TRAIN_CAR_IDS.filter((id) => armed(id) && (weights[id] ?? 0) > 0);
  // Section 0 is the lead, n - 1 the tail: each one's part of the budget runs from `split.lead` down to `split.tail`.
  const share = (s: number) => (n > 1 ? L.split.lead + ((L.split.tail - L.split.lead) * s) / (n - 1) : 1);
  let total = 0;
  for (let s = 0; s < n; s++) total += share(s);
  const sections: TrainCarId[][] = Array.from({ length: n }, () => Array<TrainCarId>(slots).fill('boxcar'));
  let carry = 0;
  for (let s = n - 1; s >= 0; s--) {
    let budget = ((L.budget.base[strength] + L.budget.perThreat * threat) * share(s)) / total + carry;
    const free = [...Array(slots).keys()];
    while (free.length > 0) {
      const id = rng.weighted(
        choices.filter((c) => TRAIN_CARS[c].cost! <= budget + 1e-9),
        (c) => weights[c] ?? 0,
      );
      if (!id) break;
      budget -= TRAIN_CARS[id].cost!;
      sections[s]![free.splice(rng.int(0, free.length - 1), 1)[0]!] = id;
    }
    carry = budget;
  }
  for (let k = 0; k < L.ammo[strength]; k++) {
    // A boxcar's place beside an armed car; failing that any boxcar's; on a train armed end to end,
    // an armed car's place beside another.
    const open: [number, number][] = [];
    const beside: [number, number][] = [];
    const full: [number, number][] = [];
    sections.forEach((cars, s) =>
      cars.forEach((id, i) => {
        const near = armed(cars[i - 1]) || armed(cars[i + 1]);
        if (id === 'boxcar') (near ? beside : open).push([s, i]);
        else if (armed(id) && near) full.push([s, i]);
      }),
    );
    const pool = beside.length > 0 ? beside : open.length > 0 ? open : full;
    if (pool.length === 0) break;
    const [s, i] = rng.pick(pool);
    sections[s]![i] = 'ammoCar';
  }
  return sections.flatMap((cars, s) => ['engine', ...(s === 0 ? [L.gun] : []), ...cars] as TrainCarId[]);
}

/** An attack train's vehicles (`TRAIN_LAYOUT.raid`), front to back: an engine, cars drawn by the doctrine's odds, and maybe an armored caboose in the last one's place. */
export function buildRaider(doctrine: DoctrineId, caboose: boolean, rng: Rng): TrainCarId[] {
  const weights = TRAIN_DOCTRINE[doctrine].weights;
  const choices = TRAIN_CAR_IDS.filter((id) => TRAIN_CARS[id].cost !== undefined && (weights[id] ?? 0) > 0);
  const n = rng.int(TRAIN_LAYOUT.raid.cars[0], TRAIN_LAYOUT.raid.cars[1]);
  const cars: TrainCarId[] = ['engine'];
  for (let i = 0; i < n; i++) cars.push(caboose && i === n - 1 ? 'caboose' : (rng.weighted(choices, (c) => weights[c] ?? 0) ?? 'boxcar'));
  return cars;
}

/** Puts a car's riders on its roof, if it carries any (`TrainCarDef.riders`, by its odds), as it's mustered at (x, y). */
export function board(w: World, v: TrainVehicle, x: number, y: number, rng: Rng): void {
  const r = v.car.riders;
  if (!r || !rng.chance(r.odds)) return;
  v.riders = [];
  for (let i = 0; i < r.squads; i++) {
    const e = spawnEnemy(w, r.unit, x, y);
    e.train = true;
    e.ai.riding = true;
    e.ai.parapet = r.cover;
    v.riders.push(e.id);
  }
}

/** A car's riders still alive up there. */
function ridersOf(w: World, v: TrainVehicle): Enemy[] {
  if (!v.riders) return [];
  return v.riders.flatMap((id) => w.enemies.find((e) => e.id === id && e.alive && e.ai.riding) ?? []);
}

/**
 * Carries every car's riders with it: each squad at its place along the roof, moving as the car
 * does, out of sight with it in a tunnel. Riders of a car that's no longer on the rails without
 * having been destroyed (it ran off the far end, or was dropped behind) go with it.
 */
export function carryRiders(w: World, tr: TrainState): void {
  for (const v of tr.vehicles) {
    const r = v.car.riders;
    if (!r || !v.riders) continue;
    const riders = ridersOf(w, v);
    const car = unitOf(w, v);
    if (v.state !== 'coupled' || !car) {
      for (const e of riders) e.alive = false;
      delete v.riders;
      continue;
    }
    const c = Math.cos(v.heading);
    const s = Math.sin(v.heading);
    v.riders.forEach((id, i) => {
      const e = riders.find((o) => o.id === id);
      if (!e) return;
      const along = (i - (r.squads - 1) / 2) * r.spacing;
      e.x = v.x + c * along;
      e.y = v.y + s * along;
      e.heading = v.heading;
      e.vx = car.vx;
      e.vy = car.vy;
      if (car.ai.under) e.ai.under = true;
      else delete e.ai.under;
    });
  }
}

/** Open ground beside a car for squad `i` of `n` of a unit getting down from it: off one side, or the other if the first gives onto water. */
function beside(w: World, v: TrainVehicle, def: EnemyDef, i: number, n: number): { x: number; y: number } | null {
  const ts = w.terrain.tileSize;
  const first = i % 2 === 0 ? 1 : -1;
  for (const side of [first, -first]) {
    for (let k = 0; k < 3; k++) {
      const y = v.y + side * (v.car.width / 2 + def.radius + k * ts);
      const x = v.x + (i - (n - 1) / 2) * def.radius * 2;
      if (y > def.radius && y < w.terrain.height - def.radius && w.terrain.speedAt(x, y, def.mobility) > 0) return { x, y };
    }
  }
  return null;
}

/**
 * A car's troops leave it, once (§T6): a troop car's squads jump out beside it when it's destroyed
 * or abandoned. Riders on its roof climb down to fight on foot when it's abandoned; `wrecked`
 * (the car destroyed under them), they're lost with it.
 */
export function dismount(w: World, v: TrainVehicle, wrecked: boolean): void {
  const riders = ridersOf(w, v);
  delete v.riders;
  riders.forEach((e, i) => {
    const at = wrecked ? null : beside(w, v, e.def, i, riders.length);
    if (!at) {
      // Thrown from a car going over, or nowhere to get down to: they're casualties of the wreck.
      destroyEnemy(w, e, 'hazard');
      return;
    }
    e.x = at.x;
    e.y = at.y;
    e.vx = 0;
    e.vy = 0;
    delete e.ai.riding;
    delete e.ai.parapet;
    delete e.ai.under;
    delete e.train;
  });
  const t = v.car.troops;
  if (!t || v.emptied) return;
  v.emptied = true;
  const def = ENEMIES[t.unit];
  for (let i = 0; i < t.squads; i++) {
    const at = beside(w, v, def, i, t.squads);
    if (at) spawnEnemy(w, t.unit, at.x, at.y);
  }
}

/**
 * An EMP pulse (SPEC §6 EMP emitter) kills the mines in a flinger's throw within `radius` of a
 * point, in the air or lying unarmed: they never go live. Returns how many.
 */
export function fryFlung(w: World, x: number, y: number, radius: number): number {
  const tr = w.train;
  if (!tr) return 0;
  let killed = 0;
  for (let k = tr.flung.length - 1; k >= 0; k--) {
    const m = tr.flung[k]!;
    const u = Math.min(1, m.t / m.flight);
    const mx = m.x0 + (m.x - m.x0) * u;
    const my = m.y0 + (m.y - m.y0) * u;
    if (Math.hypot(mx - x, my - y) > radius) continue;
    tr.flung.splice(k, 1);
    w.events.push({ type: 'mineFried', x: mx, y: my });
    killed++;
  }
  return killed;
}

/**
 * Mine flingers (§T6): while it's in the frame and its piece isn't abandoned, each one lobs a mine
 * every so often onto open ground where the Behemoth will be (`MineFlingDef`). It lies in plain
 * sight, then turns into a live mine (`Terrain.layMine`).
 */
export function stepFlingers(w: World, tr: TrainState, dt: number): void {
  const b = w.behemoth;
  const t = w.terrain;
  const ts = t.tileSize;
  for (let k = tr.flung.length - 1; k >= 0; k--) {
    const m = tr.flung[k]!;
    m.t += dt;
    if (m.t < m.flight + m.arm) continue;
    tr.flung.splice(k, 1);
    const col = Math.floor(m.x / ts);
    const row = Math.floor(m.y / ts);
    if (!t.layMine(col, row, w.events, true)) continue;
    tr.laid.push({ from: m.from, col, row });
    w.events.push({ type: 'mineLaid', x: (col + 0.5) * ts, y: (row + 0.5) * ts });
  }
  // A laid mine stops counting once it's gone off (or been shot).
  tr.laid = tr.laid.filter((m) => {
    const tile = t.tile(m.col, m.row);
    return !!tile && tile.mat === 'mine' && tile.state === 'intact';
  });
  if (b.destroyed || w.extractedAt !== null) return;
  for (const p of tr.pieces) {
    if (p.state === 'abandoned') continue;
    for (let i = p.first; i <= p.last; i++) {
      const v = tr.vehicles[i]!;
      const f = v.car.fling;
      const e = f && unitOf(w, v);
      if (!f || !e || e.ai.under || !inFrame(w.frame, e)) continue;
      v.flingIn = (v.flingIn ?? f.every) - dt;
      if (v.flingIn > 0) continue;
      const live = tr.flung.filter((m) => m.from === i).length + tr.laid.filter((m) => m.from === i).length;
      const x = b.x + b.vx * f.lead;
      const y = b.y + b.vy * f.lead;
      const tile = t.tileAt(x, y);
      // Bare ground, or the line's service road: that's where the hull runs.
      const open = !!tile && (tile.mat === 'ground' || tile.mat === 'road') && tile.state === 'intact';
      if (live >= f.live || !open || Math.hypot(x - v.x, y - v.y) > f.range) {
        v.flingIn = f.retry;
        continue;
      }
      v.flingIn = f.every;
      tr.flung.push({ from: i, x0: v.x, y0: v.y, x, y, t: 0, flight: f.flight, arm: f.arm });
      w.events.push({ type: 'mineFlung', x0: v.x, y0: v.y, x, y, flight: f.flight });
    }
  }
}

