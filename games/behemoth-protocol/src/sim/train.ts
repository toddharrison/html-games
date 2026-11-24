import type { DoctrineId } from '../content/doctrines';
import { ENEMIES } from '../content/enemies';
import { TRAIN_CAR_IDS, TRAIN_CARS, TRAIN_DOCTRINE, TRAIN_LAYOUT, type TrainCarDef, type TrainCarId } from '../content/trainCars';
import { OBJECTIVE, TRAIN } from '../content/tuning';
import { damageArmor, damageTreads, hitArc, hitched, mobile, speedLimits } from './behemoth';
import { destroyEnemy, spawnEnemy } from './enemies';
import type { Enemy } from './entities';
import type { KillCause } from './events';
import { frameRight } from './frame';
import { approach, type Rect } from './math';
import { objectiveLost, objectiveStopped, objectiveStranded } from './objective';
import { Rng, hashSeed } from './rng';
import type { Strength } from './sectorMap';
import { wreckTrailer } from './trailer';
import type { World } from './world';

/**
 * An armored train (SPEC §4.4 Intercept, §7.3): a chain of vehicles on the battle's rail line
 * (`Terrain.lineY`), heading the way the Behemoth does, faster than it cruises and slower than it
 * surges (`TRAIN.pace`).
 *
 * - **Vehicles** are ordinary units (`World.enemies`, flagged `train`) that never drive themselves:
 *   each step the train writes their place on the line.
 * - **Sections:** an engine and the cars behind it. Every engine lost slows the train.
 * - **Pieces:** coupled runs of vehicles. The train starts as one, under way.
 * - **Wrecks:** a vehicle destroyed on the rails leaves them where it is, and the chain parts
 *   there. What was coupled ahead of it runs on. What was behind it **piles into the wreck**: its
 *   front vehicle leaves the rails, and the next, each one braking what's left, until it stops.
 *   Engines behind a wreck are out of the fight (`objectiveStranded`).
 * - **Derailment:** the train itself runs onto a break in the line (`Terrain.lineCut`) and piles
 *   up the same way.
 * - **Scuttling:** what's left on the rails behind a pile is abandoned by its crews: its guns fall
 *   silent, and its charges fire from the tail forward.
 *
 * - **Armed cars** (docs/SPEC-armored-train.md §T6) are ordinary units with ordinary guns, quiet
 *   while out of the frame like every unit, and silent once abandoned. A troop car's squads jump out
 *   when it's destroyed or abandoned (`dismount`); a mine flinger's throws are worked here
 *   (`stepFlingers`). The railway gun (§T7) is a unit whose gun fires from off screen.
 * - **Collisions** (§T10): `trainBodies` is what the hull can meet, for `sim/collision.ts`;
 *   `plowVehicle` and `trainStrikes` are what follows.
 *
 * The train is laid out along the field (sim +x): the line's slope is shallow, so a vehicle's place
 * is its distance along x, and its y and heading come from the line there.
 */

export type VehicleState =
  /** On the rails, in a piece. */
  | 'coupled'
  /** Off the rails or blown up: it lies where it stopped. */
  | 'wrecked'
  /** Out of the battle: through the far end, into a river, or left far behind. */
  | 'gone';

export interface TrainVehicle {
  car: TrainCarDef;
  /** Its unit on the field (`Enemy.id`), while `alive`. */
  enemyId: number;
  /** Which engine's section it's in (0 = the lead). */
  section: number;
  /** How far its center sits behind the train's front, with the train whole. */
  offset: number;
  x: number;
  y: number;
  heading: number;
  /** Still a unit; false = a wreck (or gone). */
  alive: boolean;
  state: VehicleState;
  /** Share of its salvage it pays if it's destroyed now (a derailed vehicle less, one lost in a river none). */
  pays: number;
  /** A troop car whose squads are already out. */
  emptied?: boolean;
  /** A mine flinger: seconds until its next throw. */
  flingIn?: number;
  /** Against the hull this step (a ram happens on first contact), and seconds held at its face. */
  touching?: boolean;
  held?: number;
}

/** A mine a flinger has thrown (§T6): in the air, then lying in plain sight until it's live. */
export interface FlungMine {
  /** Which vehicle threw it. */
  from: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  /** Seconds since it was thrown, its time in the air, and seconds on the ground before it's live. */
  t: number;
  flight: number;
  arm: number;
}

export type PieceState =
  /** Under way at the train's pace. */
  | 'running'
  /** Piling into a wreck or a break ahead of it: carried on by its own weight until it stops. */
  | 'derailing'
  /** Stranded and stopped for good: its crews gone, its scuttling charges counting down. */
  | 'abandoned';

export interface TrainPiece {
  /** Its vehicles: `first`..`last` (inclusive) in `TrainState.vehicles`. */
  first: number;
  last: number;
  /** World x the whole train's front would be at: a vehicle's center is `x - offset`. */
  x: number;
  speed: number;
  state: PieceState;
  /** Abandoned: seconds until its next scuttling charge. */
  fuse: number;
  /** World x of the wreckage it's running into (its next vehicle leaves the rails there). */
  block: number | null;
}

export interface TrainState {
  /** Front to back; fixed for the battle. */
  vehicles: TrainVehicle[];
  /** Front to back. */
  pieces: TrainPiece[];
  /** The running pieces' pace (world units/s). */
  speed: number;
  /** The Behemoth's top speed the pace is worked out from (its last while it could drive). */
  top: number;
  /** Engines it started with, and how many have got away off the far end (they still pull what's behind them). */
  engines: number;
  escaped: number;
  /** `through`: what was left of it reached the far end. */
  outcome: 'running' | 'stopped' | 'through';
  /** The train itself ran onto a break in the line and left the rails. */
  derailed: boolean;
  /** Where wrecks come to rest: its own stream, so a pileup never shifts the battle's combat draws. */
  rng: Rng;
  /** Mine flingers' mines on their way, and the live ones they've laid (tiles), by the vehicle that threw them. */
  flung: FlungMine[];
  laid: { from: number; col: number; row: number }[];
  /** Seconds until a piece under way can strike the hull again (§T10, `TRAIN.collide.strike`). */
  struck: number;
  /** Something massive on the train was against the hull last step (it eases off the shove when it clears). */
  contact: boolean;
  /** A piece under way has struck the hull and is shoving it clear of its path (`sim/collision.ts`). */
  shoving: boolean;
}

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

/**
 * Sets the battle's train on the line, at rest, its tail `TRAIN.startGap` ahead of the Behemoth's
 * nose (it pulls out of its station as the battle opens), and its escorts beside it.
 */
export function createTrain(w: World, strength: Strength, layout?: readonly TrainCarId[], doctrine: DoctrineId = 'combined'): TrainState {
  const b = w.behemoth;
  // Its makeup has a stream of its own, so the battle's combat draws are the same whatever it carries.
  layout ??= buildTrain(strength, w.threat, doctrine, new Rng(hashSeed(w.seed, 0x7a12)));
  const vehicles: TrainVehicle[] = [];
  let at = 0;
  let section = -1;
  for (const id of layout) {
    const car = TRAIN_CARS[id];
    if (car.engine || section < 0) section++;
    vehicles.push({ car, enemyId: 0, section, offset: at + car.length / 2, x: 0, y: 0, heading: 0, alive: true, state: 'coupled', pays: 1 });
    at += car.length + TRAIN.coupling;
  }
  const length = at - TRAIN.coupling;
  const front = b.x + b.chassis.length / 2 + TRAIN.startGap + length;
  const tr: TrainState = {
    vehicles,
    pieces: vehicles.length > 0 ? [{ first: 0, last: vehicles.length - 1, x: front, speed: 0, state: 'running', fuse: 0, block: null }] : [],
    speed: 0,
    top: speedLimits(b).top,
    engines: vehicles.filter((v) => v.car.engine).length,
    escaped: 0,
    outcome: 'running',
    derailed: false,
    rng: new Rng(hashSeed(w.seed, 0x7a11)),
    flung: [],
    laid: [],
    struck: 0,
    contact: false,
    shoving: false,
  };
  for (const v of vehicles) {
    const e = spawnEnemy(w, v.car.enemy, front - v.offset, w.terrain.lineY(front - v.offset));
    e.train = true;
    e.objective = !!v.car.engine;
    v.enemyId = e.id;
    // The railway gun's first shell is the train's introduction (§T7).
    if (v.car.firstShot !== undefined) e.cooldown = Math.max(0, v.car.firstShot - e.def.aimTime);
    if (v.car.fling) v.flingIn = v.car.fling.every;
  }
  place(w, tr);
  // Fire aimed at the train never breaks the line under it (SPEC §7.3).
  w.terrain.shield = (col) => shields(w, tr, col);
  const lead = vehicles[0];
  if (lead) w.events.push({ type: 'trainStart', x: lead.x, y: lead.y, engines: tr.engines, gun: vehicles.some((v) => v.car.enemy === 'trainRailwayGun') });
  return tr;
}

/** Total length of a train's vehicles and couplings (world units). */
export function trainLength(tr: TrainState): number {
  const last = tr.vehicles[tr.vehicles.length - 1];
  return last ? last.offset + last.car.length / 2 : 0;
}

/** The piece a vehicle is coupled in, or null (a wreck, or gone). */
function pieceOf(tr: TrainState, index: number): TrainPiece | null {
  if (tr.vehicles[index]?.state !== 'coupled') return null;
  return tr.pieces.find((p) => index >= p.first && index <= p.last) ?? null;
}

/** Engines still pulling: alive, in a piece under way (or already off the far end, with the rest following). */
export function runningEngines(tr: TrainState): number {
  let count = tr.escaped;
  for (const p of tr.pieces) {
    if (p.state !== 'running') continue;
    for (let i = p.first; i <= p.last; i++) {
      const v = tr.vehicles[i]!;
      if (v.alive && v.car.engine && v.state === 'coupled') count++;
    }
  }
  return count;
}

/** The pace a train with `running` of its `total` engines holds, as a share of the Behemoth's top speed. */
export function trainPace(running: number, total: number): number {
  if (running <= 0 || total <= 0) return 0;
  return TRAIN.pace * (TRAIN.paceFloor + (1 - TRAIN.paceFloor) * (running / total));
}

/** A line column the train stands over (within `TRAIN.shield` columns of a vehicle on the rails). */
function shields(w: World, tr: TrainState, col: number): boolean {
  const ts = w.terrain.tileSize;
  for (const v of tr.vehicles) {
    if (v.state !== 'coupled') continue;
    const c0 = Math.floor((v.x - v.car.length / 2) / ts) - TRAIN.shield;
    const c1 = Math.floor((v.x + v.car.length / 2) / ts) + TRAIN.shield;
    if (col >= c0 && col <= c1) return true;
  }
  return false;
}

function unitOf(w: World, v: TrainVehicle): Enemy | undefined {
  return v.alive ? w.enemies.find((e) => e.id === v.enemyId && e.alive) : undefined;
}

/** Advances the train one step. */
export function stepTrain(w: World, dt: number): void {
  const tr = w.train;
  if (!tr) return;
  // A unit that's gone without being destroyed (an engine past the far end, `objectiveLost`).
  for (const v of tr.vehicles) if (v.alive && !unitOf(w, v)) v.alive = false;
  setPace(w, tr, dt);
  tr.struck = Math.max(0, tr.struck - dt);
  for (const p of [...tr.pieces]) movePiece(w, tr, p, dt);
  place(w, tr);
  stepFlingers(w, tr, dt);
  leave(w, tr);
  settle(w, tr);
}

/** The train's pace: a share of the Behemoth's present top speed, by the engines still pulling (`TRAIN.pace`). */
function setPace(w: World, tr: TrainState, dt: number): void {
  const b = w.behemoth;
  // Once the Behemoth can't drive (the last stand, or gone), the train keeps the pace it had.
  if (!b.destroyed && mobile(b)) tr.top = speedLimits(b).top;
  const running = runningEngines(tr);
  const target = trainPace(running, tr.engines) * tr.top;
  tr.speed = approach(tr.speed, target, (running > 0 ? TRAIN.ease : TRAIN.brake) * dt);
}

function movePiece(w: World, tr: TrainState, p: TrainPiece, dt: number): void {
  switch (p.state) {
    case 'running':
      p.speed = tr.speed;
      p.x += p.speed * dt;
      // Nothing pulls it any more: once it has rolled to a stop, its crews leave it.
      if (tr.outcome === 'stopped' && p.speed <= 0) abandon(w, tr, p);
      else obstructed(w, tr, p);
      return;
    case 'derailing':
      p.x += p.speed * dt;
      obstructed(w, tr, p);
      return;
    case 'abandoned':
      p.fuse -= dt;
      if (p.fuse <= 0) scuttleNext(w, tr, p);
      return;
  }
}

/** World x of a piece's nose (its front vehicle's leading end). */
function noseOf(tr: TrainState, p: TrainPiece): number {
  const v = tr.vehicles[p.first]!;
  return p.x - v.offset + v.car.length / 2;
}

/** World x of a piece's tail (its last vehicle's trailing end). */
function tailOf(tr: TrainState, p: TrainPiece): number {
  const v = tr.vehicles[p.last]!;
  return p.x - v.offset - v.car.length / 2;
}

/**
 * A piece on the move meets something it can't pass: the wreck it was coupled to, a break in the
 * line, the wreckage of its own front, or the tail of a piece stopped ahead of it. Its front
 * vehicle leaves the rails.
 */
function obstructed(w: World, tr: TrainState, p: TrainPiece): void {
  const nose = noseOf(tr, p);
  const ts = w.terrain.tileSize;
  if (p.block !== null) {
    if (nose >= p.block) derail(w, tr, p, false);
    return;
  }
  if (w.terrain.lineCut(Math.floor(nose / ts))) {
    // A fallen span: nothing to pile up on, the vehicle goes into the river.
    const t = w.terrain.tileAt(nose, w.terrain.lineY(nose));
    derail(w, tr, p, !!t && t.mat !== 'crater' && t.mat !== 'wreck');
    return;
  }
  const i = tr.pieces.indexOf(p);
  const ahead = i > 0 ? tr.pieces[i - 1]! : null;
  if (ahead && ahead.state !== 'running' && nose >= tailOf(tr, ahead) - TRAIN.coupling) derail(w, tr, p, false);
}

/**
 * A piece's front vehicle leaves the rails (SPEC §7.3): destroyed, it lies where it stops, and
 * brakes what's behind it. Slowed enough, the rest pulls up short and is abandoned.
 */
function derail(w: World, tr: TrainState, p: TrainPiece, sunk: boolean): void {
  const d = TRAIN.derail;
  const v = tr.vehicles[p.first]!;
  const e = unitOf(w, v);
  // The train itself, off the rails at a break in the line (not a piece piling into a wreck).
  const first = p.state === 'running';
  if (first) tr.derailed = true;
  v.pays = sunk ? 0 : d.salvage;
  v.state = sunk ? 'gone' : 'wrecked';
  // Jackknifed: thrown to one side and slewed round, the next one maybe to the other.
  if (!sunk) jackknife(w, tr, v, tr.rng.sign());
  if (e) {
    e.x = v.x;
    e.y = v.y;
    destroyEnemy(w, e, 'hazard');
  }
  v.alive = false;
  w.events.push({ type: 'trainDerail', x: v.x, y: v.y, heading: v.heading, first, sunk });
  // What's behind piles into it: the wreck's near end is the next obstruction. Into a river there's
  // nothing to pile up on: the next vehicle runs off the end of the line the same way.
  p.block = sunk ? null : v.x - v.car.length / 2;
  p.first++;
  p.speed = Math.max(0, p.speed - d.brake);
  p.state = 'derailing';
  if (p.first > p.last) removePiece(tr, p);
  else if (p.speed < d.stop) abandon(w, tr, p);
}

/** A vehicle comes off the rails where it is: thrown to one `side` of the line and slewed round, a wreck on the ground there. */
function jackknife(w: World, tr: TrainState, v: TrainVehicle, side: number): void {
  const d = TRAIN.derail;
  v.y += side * tr.rng.range(d.scatter[0], d.scatter[1]);
  v.heading += side * tr.rng.range(0.3, 1) * ((d.turn * Math.PI) / 180);
  const ts = w.terrain.tileSize;
  w.terrain.strew(Math.floor(v.x / ts), Math.floor(v.y / ts), w.events);
}

/**
 * A vehicle destroyed on the rails (SPEC §7.3): it leaves them where it is, a wreck, and the chain
 * parts there. What was coupled ahead of it runs on; what was behind it piles into the wreck
 * (`obstructed`), and any engine back there is out of the fight. `flat`: crushed under the hull,
 * it lies where it was (the treads sweep it away, `plowVehicle`).
 */
function wreck(w: World, tr: TrainState, p: TrainPiece, index: number, flat: boolean): void {
  const v = tr.vehicles[index]!;
  v.state = 'wrecked';
  // Blown off the far side of the line from the Behemoth, so a kill from alongside doesn't land on it.
  if (!flat) jackknife(w, tr, v, Math.sign(v.y - w.behemoth.y) || tr.rng.sign());
  const behind = p.last - index;
  const rear = behind > 0 ? split(tr, p, index + 1) : null;
  p.last = index - 1;
  if (p.first > p.last) removePiece(tr, p);
  if (rear) {
    rear.state = 'derailing';
    rear.block = v.x - v.car.length / 2;
    strand(w, tr, rear);
  }
  w.events.push({ type: 'trainBroken', x: v.x, y: v.y, heading: v.heading, behind });
}

/** A piece's engines are out of the fight: left behind a wreck, they count as destroyed (`objectiveStranded`). */
function strand(w: World, tr: TrainState, p: TrainPiece): void {
  if (w.extractedAt !== null) return;
  const engines: Enemy[] = [];
  for (let i = p.first; i <= p.last; i++) {
    const v = tr.vehicles[i]!;
    const e = v.car.engine ? unitOf(w, v) : undefined;
    if (e) engines.push(e);
  }
  objectiveStranded(w, engines);
}

/**
 * A piece stopped for good is abandoned by its crews (SPEC §7.3): its guns fall silent, its troops
 * get out, and its scuttling charges start `TRAIN.scuttle.fuse` s later.
 */
function abandon(w: World, tr: TrainState, p: TrainPiece): void {
  p.state = 'abandoned';
  p.speed = 0;
  p.block = null;
  p.fuse = TRAIN.scuttle.fuse;
  // Its vehicles strobe while the charges count down (the bomb truck's warning, `EnemyView`).
  for (let i = p.first; i <= p.last; i++) {
    const v = tr.vehicles[i]!;
    const e = unitOf(w, v);
    if (!e) continue;
    e.ai.charging = true;
    dismount(w, v);
  }
  const lead = tr.vehicles[p.first]!;
  w.events.push({ type: 'trainAbandoned', x: lead.x, y: lead.y, cars: p.last - p.first + 1 });
}

/** Uncouples a piece ahead of vehicle `at`: the vehicles from `at` back become a piece of their own, which is returned. */
function split(tr: TrainState, p: TrainPiece, at: number): TrainPiece {
  const rear: TrainPiece = { ...p, first: at, block: null };
  p.last = at - 1;
  tr.pieces.splice(tr.pieces.indexOf(p) + 1, 0, rear);
  return rear;
}

function removePiece(tr: TrainState, p: TrainPiece): void {
  const i = tr.pieces.indexOf(p);
  if (i >= 0) tr.pieces.splice(i, 1);
}

/** The next scuttling charge: the rearmost vehicle still on the rails in an abandoned piece goes up. */
function scuttleNext(w: World, tr: TrainState, p: TrainPiece): void {
  for (let i = p.last; i >= p.first; i--) {
    const v = tr.vehicles[i]!;
    if (v.state !== 'coupled') continue;
    scuttle(w, v);
    p.fuse = TRAIN.scuttle.ripple;
    if (i === p.first) removePiece(tr, p);
    return;
  }
  removePiece(tr, p);
}

/** An abandoned vehicle's charge goes off: it's a wreck, and its blast is a terrain blast (`stepHazards`). */
function scuttle(w: World, v: TrainVehicle): void {
  const e = unitOf(w, v);
  v.state = 'wrecked';
  v.alive = false;
  // Blown by its own crew: no kill, no salvage.
  if (e) e.alive = false;
  const boom = v.car.volatile ?? TRAIN.scuttle;
  w.blasts.push({ x: v.x, y: v.y, radius: boom.radius, damage: boom.damage, fuse: 0 });
  w.events.push({ type: 'trainScuttle', x: v.x, y: v.y });
}

/**
 * Called by `destroyEnemy` for a train vehicle. On the rails it wrecks there and parts the chain
 * (`wreck`), whatever destroyed it; abandoned, its charge goes off at once. An ammo car or the
 * railway gun's magazine goes up as well (`TrainCarDef.volatile`).
 */
export function trainVehicleDestroyed(w: World, e: Enemy, cause: KillCause): void {
  const tr = w.train;
  if (!tr) return;
  const index = tr.vehicles.findIndex((v) => v.enemyId === e.id);
  const v = tr.vehicles[index];
  if (!v) return;
  v.alive = false;
  const boom = v.car.volatile;
  const p = pieceOf(tr, index);
  dismount(w, v);
  // Already off the rails (it's being derailed): an ammo car still goes up, nothing else to do.
  if (!p) {
    if (boom) w.blasts.push({ x: v.x, y: v.y, radius: boom.radius, damage: boom.damage, fuse: 0 });
    return;
  }
  if (p.state === 'abandoned') {
    // Set off early (SPEC §7.3): the charge blows where it is, beside whatever it's still close to.
    const c = boom ?? TRAIN.scuttle;
    w.blasts.push({ x: v.x, y: v.y, radius: c.radius, damage: c.damage, fuse: 0 });
    w.events.push({ type: 'trainScuttle', x: v.x, y: v.y });
    uncouple(tr, index);
    return;
  }
  if (boom) w.blasts.push({ x: v.x, y: v.y, radius: boom.radius, damage: boom.damage, fuse: 0 });
  wreck(w, tr, p, index, cause === 'crushed' && !v.car.massive);
}

/** A troop car's squads jump out beside it (§T6), once: when it's destroyed or abandoned. */
function dismount(w: World, v: TrainVehicle): void {
  const t = v.car.troops;
  if (!t || v.emptied) return;
  v.emptied = true;
  const def = ENEMIES[t.unit];
  const ts = w.terrain.tileSize;
  for (let i = 0; i < t.squads; i++) {
    // One out of each side's doors, or both out of one if the other gives onto water.
    const first = i % 2 === 0 ? 1 : -1;
    let at: { x: number; y: number } | null = null;
    for (const side of [first, -first]) {
      for (let k = 0; k < 3 && !at; k++) {
        const y = v.y + side * (v.car.width / 2 + def.radius + k * ts);
        const x = v.x + (i - (t.squads - 1) / 2) * def.radius * 2;
        if (y > def.radius && y < w.terrain.height - def.radius && w.terrain.speedAt(x, y, def.mobility) > 0) at = { x, y };
      }
      if (at) break;
    }
    if (at) spawnEnemy(w, t.unit, at.x, at.y);
  }
}

/** Whether a vehicle is far enough inside the frame to act (the margin every unit's guns keep, `aimGun`). */
function inFrame(w: World, e: Enemy): boolean {
  const margin = e.def.radius + 4;
  return e.x >= w.frame.left + margin && e.x <= frameRight(w.frame) - margin;
}

/**
 * Mine flingers (§T6): while it's in the frame and its piece isn't abandoned, each one lobs a mine
 * every so often onto open ground where the Behemoth will be (`MineFlingDef`). It lies in plain
 * sight, then turns into a live mine (`Terrain.layMine`).
 */
function stepFlingers(w: World, tr: TrainState, dt: number): void {
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
      if (!f || !e || !inFrame(w, e)) continue;
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

/** What the hull can meet of the train (§T10): a vehicle on the rails, or a wreck. */
export interface TrainBody {
  index: number;
  vehicle: TrainVehicle;
  /** Its unit, while it's still one. */
  unit: Enemy | undefined;
  /** Its bounds on the ground. */
  rect: Rect;
  /** The front of a piece under way: what it meets on the track ahead of it, it runs into. */
  leading: boolean;
  /** How fast it's moving along the line (0 for a wreck). */
  speed: number;
}

/** Every vehicle of the train still on the field, with its bounds (`TrainCarDef.length` × `width`, turned with it). */
export function trainBodies(w: World): TrainBody[] {
  const tr = w.train;
  if (!tr) return [];
  const out: TrainBody[] = [];
  tr.vehicles.forEach((v, index) => {
    if (v.state === 'gone') return;
    const p = pieceOf(tr, index);
    const c = Math.abs(Math.cos(v.heading));
    const s = Math.abs(Math.sin(v.heading));
    const hx = (v.car.length / 2) * c + (v.car.width / 2) * s;
    const hy = (v.car.length / 2) * s + (v.car.width / 2) * c;
    out.push({
      index,
      vehicle: v,
      unit: unitOf(w, v),
      rect: { x0: v.x - hx, y0: v.y - hy, x1: v.x + hx, y1: v.y + hy },
      leading: !!p && p.state === 'running' && p.first === index,
      speed: p ? p.speed : 0,
    });
  });
  return out;
}

/** The hull plows through a wreck (§T10): it's swept aside, gone. */
export function plowVehicle(w: World, index: number): void {
  const tr = w.train;
  const v = tr?.vehicles[index];
  if (!tr || !v || v.state === 'gone') return;
  if (v.state === 'coupled') uncouple(tr, index);
  // A wreck's tile goes flat under the treads with it.
  const ts = w.terrain.tileSize;
  const t = w.terrain.tileAt(v.x, v.y);
  if (t?.mat === 'wreck') w.terrain.crush(Math.floor(v.x / ts), Math.floor(v.y / ts), w.events);
  v.state = 'gone';
}

/**
 * A piece under way runs into the hull on the track ahead of it (§T10, `TRAIN.collide.strike`):
 * the trailer takes the blow and is wrecked if one is in tow, or else the struck armor does; the
 * treads take the jolt either way. The train's front vehicle is damaged and the train loses some
 * of its speed for a moment (it eases back up), but it isn't stopped. Shoving the hull clear is
 * `sim/collision.ts`'s.
 */
export function trainStrikes(w: World, index: number): void {
  const tr = w.train;
  const v = tr?.vehicles[index];
  if (!tr || !v) return;
  const s = TRAIN.collide.strike;
  const b = w.behemoth;
  tr.struck = s.again;
  const nose = v.x + v.car.length / 2;
  if (hitched(b)) wreckTrailer(w);
  else {
    const arc = hitArc(b, v.x - b.x, v.y - b.y, nose, v.y);
    w.events.push({ type: 'behemothHit', arc, damage: s.arc, x: nose, y: v.y });
    damageTreads(b, damageArmor(b, arc, s.arc), w.events);
  }
  damageTreads(b, s.treads, w.events);
  const e = unitOf(w, v);
  if (e) {
    e.hp -= s.front;
    if (e.hp <= 0) destroyEnemy(w, e, 'crushed');
  }
  tr.speed *= 1 - s.slow;
  for (const p of tr.pieces) if (p.state === 'running') p.speed = tr.speed;
  w.events.push({ type: 'trainStrike', x: nose, y: v.y });
}

/** Takes a vehicle out of the chain where it is (a wreck): its piece parts into what was ahead of it and what was behind. */
function uncouple(tr: TrainState, index: number): void {
  const p = pieceOf(tr, index);
  tr.vehicles[index]!.state = 'wrecked';
  if (!p) return;
  if (index === p.first) p.first++;
  else if (index === p.last) p.last--;
  else {
    split(tr, p, index + 1);
    p.last = index - 1;
  }
  if (p.first > p.last) removePiece(tr, p);
}

/**
 * The share of its salvage a train vehicle pays when it's destroyed (`destroyEnemy`): a derailed one
 * less, one lost in a river nothing, and an abandoned one only if the Behemoth destroys it before its
 * own charge does (a blast or its own side's fire pays nothing).
 */
export function trainSalvageShare(w: World, e: Enemy, cause: KillCause): number {
  const tr = w.train;
  const index = tr ? tr.vehicles.findIndex((v) => v.enemyId === e.id) : -1;
  const v = tr?.vehicles[index];
  if (!tr || !v) return 1;
  const left = pieceOf(tr, index)?.state === 'abandoned';
  return left && (cause === 'hazard' || cause === 'friendly') ? 0 : v.pays;
}

/** Writes every coupled vehicle's place on the line, and its unit's. */
function place(w: World, tr: TrainState): void {
  const t = w.terrain;
  for (const p of tr.pieces) {
    for (let i = p.first; i <= p.last; i++) {
      const v = tr.vehicles[i]!;
      if (v.state !== 'coupled') continue;
      v.x = p.x - v.offset;
      v.y = t.lineY(v.x);
      v.heading = Math.atan2(t.lineY(v.x + 4) - t.lineY(v.x - 4), 8);
      const e = unitOf(w, v);
      if (!e) continue;
      e.x = v.x;
      e.y = v.y;
      e.heading = v.heading;
      e.vx = p.speed * Math.cos(v.heading);
      e.vy = p.speed * Math.sin(v.heading);
    }
  }
}

/**
 * Vehicles that leave the battle: off the far end of the line with the train still under way (an
 * engine that does has escaped, `objectiveLost`), or far behind the frame once they're no longer
 * part of the running train.
 */
function leave(w: World, tr: TrainState): void {
  const far = w.exitX + OBJECTIVE.escapeBeyond;
  const behind = w.frame.left - TRAIN.dropBehind;
  const live = !w.behemoth.destroyed && w.extractedAt === null;
  for (const p of [...tr.pieces]) {
    for (let i = p.first; i <= p.last; i++) {
      const v = tr.vehicles[i]!;
      if (v.state !== 'coupled') continue;
      const through = p.state === 'running' && tr.outcome === 'running' && v.x - v.car.length / 2 > far;
      if (!through && !(p.state !== 'running' && v.x + v.car.length / 2 < behind)) continue;
      v.state = 'gone';
      const e = unitOf(w, v);
      v.alive = false;
      if (!e) continue;
      // An engine that gets away still pulls the vehicles behind it off the field.
      if (through && v.car.engine) tr.escaped++;
      if (through && e.objective && live) objectiveLost(w, e);
      else e.alive = false;
    }
    while (p.first <= p.last && tr.vehicles[p.first]!.state !== 'coupled') p.first++;
    while (p.last >= p.first && tr.vehicles[p.last]!.state !== 'coupled') p.last--;
    if (p.first > p.last) {
      removePiece(tr, p);
      if (p.state === 'running' && tr.outcome === 'running' && !tr.pieces.some((q) => q.state === 'running')) {
        tr.outcome = 'through';
        // Nothing left to chase: the extraction line comes in, as it does when the train is stopped.
        if (live) w.exitX = Math.min(w.exitX, Math.max(w.behemoth.x, w.frame.left) + TRAIN.extractAhead);
      }
    }
  }
  for (const v of tr.vehicles) if (v.state === 'wrecked' && v.x < behind) v.state = 'gone';
}

/**
 * The train is stopped for good once no engine is pulling it: the last one destroyed or stranded
 * behind a wreck, or the train itself off the rails (SPEC §7.3). The Intercept is taken, and the extraction line
 * comes in to `TRAIN.extractAhead` ahead of the Behemoth.
 */
function settle(w: World, tr: TrainState): void {
  if (tr.outcome !== 'running' || runningEngines(tr) > 0) return;
  // What's still rolling brakes to a stop from here (`setPace`, `movePiece`).
  tr.outcome = 'stopped';
  const at = tr.vehicles.find((v) => v.state !== 'gone') ?? tr.vehicles[0];
  const b = w.behemoth;
  if (!b.destroyed && w.extractedAt === null) {
    objectiveStopped(w, at?.x ?? b.x, at?.y ?? b.y);
    w.exitX = Math.min(w.exitX, Math.max(b.x, w.frame.left) + TRAIN.extractAhead);
  }
  w.events.push({ type: 'trainStopped', x: at?.x ?? b.x, y: at?.y ?? b.y, derailed: tr.derailed });
}
