import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/content/enemies';
import { MODES } from '../../src/content/modes';
import { parseTrain, plainTrain, TRAIN_CARS, type TrainCarDef, type TrainCarId } from '../../src/content/trainCars';
import { FIRE, OBJECTIVE, RUN, TERRAIN_GEN, TRAIN } from '../../src/content/tuning';
import { IDLE_COMMAND, speedLimits, type PlayerCommand } from '../../src/sim/behemoth';
import { destroyEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import type { SimEvent } from '../../src/sim/events';
import { objectiveBonus, objectiveComplete } from '../../src/sim/objective';
import { runningEngines, trainLength, trainPace, type TrainState } from '../../src/sim/train';
import { createWorld, START_X, stepWorld, type World, type WorldOptions } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };
const TS = TERRAIN_GEN.tileSize;

/**
 * An Intercept on a quiet field (no posts, no waves, no escorts) with a Behemoth that can't break.
 * The train is engines and boxcars unless a layout says otherwise (how a train runs doesn't hang on its guns).
 */
function world(layout: TrainCarId[] = plainTrain('normal'), opts: Partial<WorldOptions> = {}): World {
  const w = createWorld({ ...OPTS, ...opts, objective: { mode: 'intercept', strength: 'normal', train: layout } });
  w.encounter.posts = [];
  w.encounter.alert.next = 1e9;
  w.enemies = w.enemies.filter((e) => e.train);
  const b = w.behemoth;
  b.invulnerable = true;
  b.autoEnabled.fill(false);
  // The armored train alone: no attack trains come up behind it (they have tests of their own).
  w.train!.raid = null;
  return w;
}

/** Steps the battle, the hull held in the lane: rock-free, and clear of the line on its wide side (so it never plows the train). */
function run(w: World, seconds: number, cmd: Partial<PlayerCommand> = {}, events: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const b = w.behemoth;
    b.y = w.terrain.laneY(b.x);
    stepWorld(w, { ...IDLE_COMMAND, aimX: b.x + 200, aimY: b.y, ...cmd });
    count(w);
    events.push(...w.events);
    w.events.length = 0;
  }
  return events;
}

const train = (w: World): TrainState => w.train!;
/** Salvage from kills and the objective (not from scenery the hull crushes on its way): `run` tallies it. */
const tally = new WeakMap<World, number>();
const counted = new WeakSet<SimEvent>();
const earned = (w: World): number => tally.get(w) ?? 0;
function count(w: World): void {
  for (const e of w.events) {
    if (e.type !== 'salvage' || e.source === 'tile' || counted.has(e)) continue;
    counted.add(e);
    tally.set(w, earned(w) + e.amount);
  }
}
const unit = (w: World, i: number): Enemy => w.enemies.find((e) => e.id === train(w).vehicles[i]!.enemyId)!;
const states = (w: World) => train(w).pieces.map((p) => `${p.first}-${p.last}:${p.state}`);
const kill = (w: World, i: number, cause: 'shot' | 'crushed' = 'shot') => {
  destroyEnemy(w, unit(w, i), cause);
  count(w);
};
const E: TrainCarId = 'engine';
const B: TrainCarId = 'boxcar';

/** How a pile runs is tested without its fireworks (blasts, cook-offs, and burning wrecks finish off cars at random); they have a test of their own. */
const FIREWORKS = { blast: TRAIN.derail.blast.damage, odds: TRAIN.derail.cookOff.odds, burn: TRAIN.derail.burn, wreck: FIRE.fuel.wreck };
/** Who rides on which roof is drawn by odds (tests/sim/trainCloseQuarters.test.ts): nobody here, so a train is its vehicles. */
const ROOFS = (Object.keys(TRAIN_CARS) as TrainCarId[]).filter((id) => TRAIN_CARS[id].riders);
const ROOF_ODDS = Object.fromEntries(ROOFS.map((id) => [id, TRAIN_CARS[id].riders!.odds]));
beforeEach(() => {
  for (const id of ROOFS) TRAIN_CARS[id].riders!.odds = 0;
});
afterEach(() => {
  for (const id of ROOFS) TRAIN_CARS[id].riders!.odds = ROOF_ODDS[id]!;
});
beforeEach(() => {
  TRAIN.derail.blast.damage = 0;
  TRAIN.derail.cookOff.odds = 0;
  TRAIN.derail.burn = 0;
  FIRE.fuel.wreck = 0;
});
afterEach(() => {
  delete (TRAIN_CARS.boxcar as TrainCarDef).volatile;
  TRAIN.derail.blast.damage = FIREWORKS.blast;
  TRAIN.derail.cookOff.odds = FIREWORKS.odds;
  TRAIN.derail.burn = FIREWORKS.burn;
  FIRE.fuel.wreck = FIREWORKS.wreck;
});

/** What `n` vehicles from `first` pay as a pile's wrecks (`TRAIN.derail.salvage` of each one's worth). */
function pilePays(w: World, first: number, n: number): number {
  let sum = 0;
  for (let i = first; i < first + n; i++) sum += Math.round(ENEMIES[train(w).vehicles[i]!.car.enemy].salvage * TRAIN.derail.salvage);
  return sum;
}

/** Engines of the plain train (four sections of an engine and six boxcars), and its vehicles in all. */
const ENGINES = [0, 7, 14, 21];
const COUNT = 28;

/** How many vehicles leave the rails in a pileup that starts at `speed` (`TRAIN.derail`). */
function pileup(speed: number): number {
  let n = 0;
  do {
    speed -= TRAIN.derail.brake;
    n++;
  } while (speed >= TRAIN.derail.stop);
  return n;
}

describe('an armored train (SPEC §4.4 Intercept, §7.3)', () => {
  it('stands on the line ahead of the Behemoth as the battle opens, at rest', () => {
    const w = world();
    const tr = train(w);
    const b = w.behemoth;
    expect(tr.vehicles.map((v) => v.car.id)).toEqual(plainTrain('normal'));
    expect(tr.vehicles).toHaveLength(COUNT);
    expect(tr.vehicles.flatMap((v, i) => (v.car.engine ? [i] : []))).toEqual(ENGINES);
    expect(tr.vehicles.map((v) => v.section)).toEqual(Array.from({ length: COUNT }, (_, i) => Math.floor(i / 7)));
    expect(w.objective.total).toBe(4);
    expect(w.exitX).toBeCloseTo(START_X + RUN.battleLength * MODES.intercept.length!);
    expect(tr.speed).toBe(0);
    const tail = tr.vehicles[tr.vehicles.length - 1]!;
    expect(tail.x - tail.car.length / 2).toBeCloseTo(b.x + b.chassis.length / 2 + TRAIN.startGap);
    expect(tr.vehicles[0]!.x - tail.x).toBeCloseTo(trainLength(tr) - (tr.vehicles[0]!.car.length + tail.car.length) / 2);
    // Well over three screens long.
    expect(trainLength(tr)).toBeGreaterThan(3 * OPTS.frameWidth);
    for (const [i, v] of tr.vehicles.entries()) {
      const e = unit(w, i);
      expect(e.train).toBe(true);
      expect(e.objective).toBe(!!v.car.engine);
      expect(e.y).toBeCloseTo(w.terrain.lineY(e.x));
    }
    // The Behemoth starts on the wide side of the line.
    expect((b.y - w.terrain.lineY(b.x)) * -w.terrain.lineSide).toBeGreaterThan(40);
  });

  it('reads a practice layout, skipping what it doesn\'t know', () => {
    expect(parseTrain('engine, boxcar,tender,engine')).toEqual([E, B, E]);
  });

  it('keeps its vehicles coupled and on the line through the bends', () => {
    const w = world();
    const tr = train(w);
    for (let t = 0; t < 60; t++) {
      run(w, 1);
      for (let i = 1; i < tr.vehicles.length; i++) {
        const a = tr.vehicles[i - 1]!;
        const v = tr.vehicles[i]!;
        expect(a.x - v.x).toBeCloseTo((a.car.length + v.car.length) / 2 + TRAIN.coupling);
        expect(v.y).toBeCloseTo(w.terrain.lineY(v.x));
        const e = unit(w, i);
        expect([e.x, e.y, e.heading]).toEqual([v.x, v.y, v.heading]);
      }
    }
  });

  it('outruns a cruise and is outrun by a surge: a share of the Behemoth\'s present top speed, less with each engine lost', () => {
    const share = (n: number) => TRAIN.pace * (TRAIN.paceFloor + (1 - TRAIN.paceFloor) * (n / 4));
    expect(trainPace(4, 4)).toBeCloseTo(TRAIN.pace);
    expect(trainPace(3, 4)).toBeCloseTo(share(3));
    expect(trainPace(1, 4)).toBeCloseTo(share(1));
    expect(trainPace(0, 4)).toBe(0);
    const w = world();
    const tr = train(w);
    const { cruise, top } = speedLimits(w.behemoth);
    // Whatever it has lost, only a surge gains on it.
    for (const n of [1, 2, 3, 4]) {
      expect(trainPace(n, 4) * top).toBeGreaterThan(cruise);
      expect(trainPace(n, 4) * top).toBeLessThan(top);
    }
    run(w, 1);
    expect(tr.speed).toBeCloseTo(TRAIN.ease, 1);
    run(w, 12);
    expect(tr.speed).toBeCloseTo(TRAIN.pace * top);
    kill(w, 21);
    run(w, 4);
    expect(runningEngines(tr)).toBe(3);
    expect(tr.speed).toBeCloseTo(share(3) * top);
  });

  it('is the same fight for a slow Behemoth: worn treads slow the train too, after a moment', () => {
    const w = world();
    const tr = train(w);
    run(w, 12);
    const before = tr.speed;
    const b = w.behemoth;
    b.treads.hp = b.treads.max * 0.2;
    const slow = speedLimits(b);
    expect(TRAIN.pace * slow.top).toBeLessThan(before);
    run(w, 0.5);
    expect(tr.speed).toBeGreaterThan(TRAIN.pace * slow.top);
    run(w, 10);
    expect(tr.speed).toBeCloseTo(TRAIN.pace * slow.top);
    // A surge still gains on it, and a cruise still drops back.
    expect(slow.top).toBeGreaterThan(tr.speed);
    expect(slow.cruise).toBeLessThan(tr.speed);
  });

  it('isn\'t lost or despawned for falling behind the frame', () => {
    const w = world();
    run(w, 5);
    w.behemoth.x += 2400;
    run(w, 3);
    expect(w.frame.left).toBeGreaterThan(train(w).vehicles[0]!.x + 300);
    expect(w.enemies.filter((e) => e.train)).toHaveLength(COUNT);
    expect(w.objective.lost).toBe(0);
  });

  /** How much ground the hull makes on the lead engine in `seconds`, held in the lane. */
  function gains(w: World, seconds: number, cmd: Partial<PlayerCommand>): number {
    const lead = train(w).vehicles[0]!;
    const gap = lead.x - w.behemoth.x;
    run(w, seconds, cmd);
    return gap - (lead.x - w.behemoth.x);
  }

  it('is only gained on at a full surge, even on its last engine', () => {
    const surging = world();
    run(surging, 12, { throttle: 1 });
    expect(gains(surging, 60, { throttle: 1 })).toBeGreaterThan(100);
    const cruising = world();
    run(cruising, 12);
    expect(gains(cruising, 60, {})).toBeLessThan(-300);
    // Down to the lead engine: slower, and still not to be caught at a cruise.
    const last = world();
    run(last, 12);
    kill(last, 7);
    run(last, 8);
    expect(runningEngines(train(last))).toBe(1);
    expect(gains(last, 60, {})).toBeLessThan(0);
    expect(gains(last, 30, { throttle: 1 })).toBeGreaterThan(200);
  });
});

describe('wrecks and pileups (SPEC §7.3)', () => {
  it('a vehicle destroyed on the rails wrecks there and parts the train: what was behind it piles in, and its engines are out of the fight', () => {
    const w = world();
    const tr = train(w);
    run(w, 12);
    const pace = tr.speed;
    const salvage = earned(w);
    const v = tr.vehicles[9]!;
    const line = v.y;
    kill(w, 9);
    const events = run(w, 1 / 60);
    // Off the rails where it was, on the far side of the line from the Behemoth.
    expect(v.state).toBe('wrecked');
    expect(v.alive).toBe(false);
    expect((v.y - line) * Math.sign(line - w.behemoth.y)).toBeGreaterThanOrEqual(TRAIN.derail.scatter[0] - 1e-9);
    expect(events.find((e) => e.type === 'trainBroken')).toMatchObject({ behind: 18 });
    expect(states(w)[0]).toBe('0-8:running');
    expect(train(w).pieces[1]!.state).toBe('derailing');
    // The two engines behind the wreck count as destroyed: half the bonus, with the boxcar's own salvage.
    expect(events.find((e) => e.type === 'objective')).toMatchObject({ what: 'destroyed', stranded: 2, done: false });
    expect(w.objective.destroyed).toBe(2);
    expect(earned(w) - salvage).toBe(12 + MODES.intercept.bonus / 2);
    expect(unit(w, 14).objective).toBe(false);
    // The pile: each vehicle off the rails brakes the rest, until what's left pulls up short of it.
    const n = pileup(pace);
    expect(n).toBeGreaterThanOrEqual(3);
    run(w, 12, {}, events);
    const off = events.filter((e) => e.type === 'trainDerail') as Extract<SimEvent, { type: 'trainDerail' }>[];
    expect(off).toHaveLength(n);
    expect(off.every((e) => !e.first && !e.sunk)).toBe(true);
    expect(tr.vehicles.slice(10, 10 + n).every((x) => x.state === 'wrecked' && !x.alive)).toBe(true);
    // Each wreck lies behind the last, and pays half.
    for (let i = 11; i < 10 + n; i++) expect(tr.vehicles[i]!.x).toBeLessThan(tr.vehicles[i - 1]!.x);
    expect(earned(w) - salvage).toBe(12 + MODES.intercept.bonus / 2 + pilePays(w, 10, n));
    // The front runs on, slower for the engines it has lost.
    expect(runningEngines(tr)).toBe(2);
    expect(tr.speed).toBeCloseTo(trainPace(2, 4) * speedLimits(w.behemoth).top, 0);
    expect(tr.outcome).toBe('running');
  });

  it('abandons what\'s left stranded behind the pile, and scuttles it from the tail forward', () => {
    const w = world();
    const tr = train(w);
    run(w, 12);
    const n = pileup(tr.speed);
    kill(w, 9);
    const salvage = earned(w);
    const events: SimEvent[] = [];
    for (let t = 0; t < 20 && !events.some((e) => e.type === 'trainAbandoned'); t += 0.1) run(w, 0.1, {}, events);
    const left = COUNT - 10 - n;
    expect(events.find((e) => e.type === 'trainAbandoned')).toMatchObject({ cars: left });
    expect(states(w)).toEqual(['0-8:running', `${10 + n}-27:abandoned`]);
    // Its crews are gone: every vehicle strobes, its charge set.
    for (let i = 10 + n; i < COUNT; i++) expect(unit(w, i).ai.charging).toBe(true);
    run(w, TRAIN.scuttle.fuse - 0.3, {}, events);
    expect(events.filter((e) => e.type === 'trainScuttle')).toHaveLength(0);
    run(w, 0.5 + left * TRAIN.scuttle.ripple, {}, events);
    const blown = events.filter((e) => e.type === 'trainScuttle') as Extract<SimEvent, { type: 'trainScuttle' }>[];
    expect(blown).toHaveLength(left);
    for (let i = 1; i < blown.length; i++) expect(blown[i]!.x).toBeGreaterThan(blown[i - 1]!.x);
    expect(tr.vehicles.slice(10).every((v) => v.state === 'wrecked' && !v.alive)).toBe(true);
    expect(states(w)).toEqual(['0-8:running']);
    expect(w.enemies.filter((e) => e.train)).toHaveLength(9);
    // Blown by their own crews: the pile's wrecks paid half, the scuttled cars nothing.
    expect(earned(w) - salvage).toBe(pilePays(w, 10, n));
  });

  it('pays for an abandoned car the Behemoth destroys before its charge fires, which blows at once', () => {
    const w = world();
    const tr = train(w);
    run(w, 12);
    const n = pileup(tr.speed);
    kill(w, 9);
    const events: SimEvent[] = [];
    for (let t = 0; t < 20 && !events.some((e) => e.type === 'trainAbandoned'); t += 0.1) run(w, 0.1, {}, events);
    const salvage = earned(w);
    kill(w, 20);
    const after = run(w, 1 / 60);
    expect(earned(w) - salvage).toBe(12);
    expect(tr.vehicles[20]!.state).toBe('wrecked');
    expect(after.some((e) => e.type === 'trainScuttle')).toBe(true);
    expect(after.some((e) => e.type === 'explosion')).toBe(true);
    expect(states(w)).toEqual(['0-8:running', `${10 + n}-19:abandoned`, '21-27:abandoned']);
  });

  it('leaves nothing to pile up behind the tail car', () => {
    const w = world();
    run(w, 12);
    kill(w, COUNT - 1);
    const events = run(w, 1 / 60);
    expect(events.find((e) => e.type === 'trainBroken')).toMatchObject({ behind: 0 });
    expect(states(w)).toEqual([`0-${COUNT - 2}:running`]);
    expect(w.objective.destroyed).toBe(0);
  });

  it('piles up from an ammo car that goes up, which batters the cars either side', () => {
    (TRAIN_CARS.boxcar as TrainCarDef).volatile = { radius: 4, damage: 10 };
    const w = world([E, B, B, B, E, B]);
    run(w, 5);
    kill(w, 2);
    const events = run(w, 1 / 60);
    expect(events.some((e) => e.type === 'explosion')).toBe(true);
    expect(train(w).vehicles[2]!.state).toBe('wrecked');
    expect(states(w)).toEqual(['0-1:running', '3-5:derailing']);
    expect(w.objective.destroyed).toBe(1);
  });

  it('wrecks a car the Behemoth plows through where it lies, for the treads to sweep away', () => {
    const w = world([E, B, B, E, B]);
    run(w, 5);
    const v = train(w).vehicles[1]!;
    const { x, y } = v;
    kill(w, 1, 'crushed');
    expect(v.state).toBe('wrecked');
    expect([v.x, v.y]).toEqual([x, y]);
    run(w, 1 / 60);
    expect(states(w)).toEqual(['0-0:running', '2-4:derailing']);
    expect(train(w).outcome).toBe('running');
  });
});

describe('stopping the train (SPEC §4.4)', () => {
  it('is stopped once its last engine is destroyed: the objective taken, the extraction line pulled in', () => {
    const w = world();
    const tr = train(w);
    run(w, 10);
    const exit = w.exitX;
    // Tail first: each engine destroyed takes only its own section with it.
    kill(w, 21);
    kill(w, 14);
    kill(w, 7);
    run(w, 1 / 60);
    expect(w.objective.destroyed).toBe(3);
    expect(tr.outcome).toBe('running');
    expect(w.exitX).toBe(exit);
    kill(w, 0);
    const events = run(w, 1 / 60);
    expect(tr.outcome).toBe('stopped');
    expect(events.find((e) => e.type === 'trainStopped')).toMatchObject({ derailed: false });
    expect(objectiveComplete(w.objective)).toBe(true);
    expect(objectiveBonus(w.objective)).toBe(MODES.intercept.bonus);
    expect(w.exitX).toBeLessThan(exit);
    expect(w.exitX).toBeLessThanOrEqual(w.behemoth.x + TRAIN.extractAhead + 1);
    // Everything that was on the rails ends as wreckage.
    run(w, 20);
    expect(tr.speed).toBe(0);
    expect(tr.pieces).toHaveLength(0);
    expect(tr.vehicles.every((v) => v.state !== 'coupled')).toBe(true);
  });

  it('is stopped at a stroke by destroying the lead engine: the whole train piles into it', () => {
    const w = world();
    const tr = train(w);
    run(w, 12);
    const salvage = earned(w);
    kill(w, 0);
    const events = run(w, 1 / 60);
    expect(events.find((e) => e.type === 'trainBroken')).toMatchObject({ behind: COUNT - 1 });
    expect(events.find((e) => e.type === 'objective' && e.stranded)).toMatchObject({ stranded: 3, done: true });
    expect(tr.outcome).toBe('stopped');
    expect(objectiveComplete(w.objective)).toBe(true);
    // The engine's own salvage and the whole bonus.
    expect(earned(w) - salvage).toBe(30 + MODES.intercept.bonus);
    expect(w.enemies.some((e) => e.objective)).toBe(false);
  });

  it('gets through if an engine reaches the far end: that engine is lost, and it pulls its cars off the field', () => {
    const w = world([E, B, B], { battleLength: 1200 });
    const tr = train(w);
    const exit = w.exitX;
    const events = run(w, 80, { throttle: -1 });
    expect(w.objective.lost).toBe(1);
    expect(events.some((e) => e.type === 'objective' && e.what === 'lost')).toBe(true);
    expect(tr.outcome).toBe('through');
    expect(tr.vehicles.every((v) => v.state === 'gone')).toBe(true);
    expect(w.enemies.filter((e) => e.train)).toHaveLength(0);
    expect(events.some((e) => e.type === 'trainStopped')).toBe(false);
    expect(OBJECTIVE.escapeBeyond).toBeGreaterThan(0);
    // Nothing left to chase: the extraction line comes in.
    expect(w.extractedAt).toBeNull();
    expect(w.exitX).toBeLessThan(exit);
  });
});

describe('derailment (SPEC §7.3)', () => {
  /** Breaks the track `ahead` units in front of the train's nose; returns the column. */
  function cut(w: World, ahead: number): number {
    const lead = train(w).vehicles[0]!;
    const x = lead.x + lead.car.length / 2 + ahead;
    w.terrain.ensure(0, x + 400);
    const col = Math.floor(x / TS);
    w.terrain.damage(col, w.terrain.lineRow(col)!, 200, w.events);
    return col;
  }

  it('shields the line under the train from every blast', () => {
    const w = world();
    run(w, 5);
    const col = Math.floor(train(w).vehicles[3]!.x / TS);
    w.terrain.damage(col, w.terrain.lineRow(col)!, 500, w.events);
    w.terrain.damage(col + 1, w.terrain.lineRow(col + 1)!, 500, w.events);
    expect(w.terrain.lineCut(col)).toBe(false);
    expect(w.terrain.lineCut(col + 1)).toBe(false);
  });

  it('piles up at a break in the track: each vehicle off the rails brakes the rest', () => {
    const w = world();
    const tr = train(w);
    // Up to speed, and short of the first river (a bridge takes more than this to cut).
    run(w, 10);
    const salvage = earned(w);
    const n = pileup(tr.speed);
    const col = cut(w, 60);
    expect(w.terrain.lineCut(col)).toBe(true);
    // Long enough to reach the break and pile up; the charges haven't fired yet.
    const events: SimEvent[] = [];
    for (let t = 0; t < 20 && !events.some((e) => e.type === 'trainAbandoned'); t += 0.1) run(w, 0.1, {}, events);
    const off = events.filter((e) => e.type === 'trainDerail') as Extract<SimEvent, { type: 'trainDerail' }>[];
    expect(off).toHaveLength(n);
    expect(off.map((e) => e.first)).toEqual([true, ...Array<boolean>(n - 1).fill(false)]);
    expect(off.every((e) => !e.sunk)).toBe(true);
    expect(tr.vehicles.slice(0, n).every((v) => v.state === 'wrecked' && !v.alive)).toBe(true);
    // The pile grows back from the break: each wreck lies behind the last.
    for (let i = 1; i < n; i++) expect(tr.vehicles[i]!.x).toBeLessThan(tr.vehicles[i - 1]!.x);
    expect(Math.abs(tr.vehicles[0]!.y - w.terrain.lineY(tr.vehicles[0]!.x))).toBeGreaterThanOrEqual(TRAIN.derail.scatter[0] - 1e-9);
    // What's left on the rails is abandoned.
    expect(states(w)).toEqual([`${n}-27:abandoned`]);
    // A derailed train is a stopped train: every engine counts, the wrecks pay half.
    expect(tr.outcome).toBe('stopped');
    expect(events.find((e) => e.type === 'trainStopped')).toMatchObject({ derailed: true });
    expect(objectiveComplete(w.objective)).toBe(true);
    expect(earned(w) - salvage).toBe(pilePays(w, 0, n) + MODES.intercept.bonus);
    expect(w.enemies.filter((e) => e.train)).toHaveLength(COUNT - n);
    expect(w.enemies.some((e) => e.objective)).toBe(false);
  });

  it('leaves wrecks the Behemoth has to plow through or steer round', () => {
    const w = world();
    // Short of the first river: a wreck that lands in water leaves nothing standing.
    run(w, 10);
    cut(w, 60);
    run(w, 8);
    const v = train(w).vehicles[0]!;
    expect(w.terrain.tileAt(v.x, v.y)!.mat).toBe('wreck');
  });

  it('loses fewer vehicles the slower it\'s going', () => {
    const w = world();
    const tr = train(w);
    // (Short runs: the pile has to be over before the line's first crossover.)
    run(w, 9);
    const full = pileup(tr.speed);
    kill(w, 14);
    run(w, 6);
    expect(runningEngines(tr)).toBe(2);
    const slowed = pileup(tr.speed);
    expect(slowed).toBeLessThan(full);
    cut(w, 60);
    const events = run(w, 16);
    expect(events.filter((e) => e.type === 'trainDerail' && e.x > tr.vehicles[9]!.x)).toHaveLength(slowed);
  });

  it('goes into the river where its bridge is down, and pays nothing for what\'s lost there', () => {
    const w = world([E, B, B]);
    const tr = train(w);
    const t = w.terrain;
    t.ensure(0, 4000);
    let col = Math.floor(tr.vehicles[0]!.x / TS) + 3;
    while (t.tile(col, t.lineRow(col)!)!.mat !== 'railBridge') col++;
    t.damage(col, t.lineRow(col)!, 1000, w.events);
    expect(t.lineCut(col)).toBe(true);
    const events = run(w, (col * TS - tr.vehicles[0]!.x) / 28 + 20);
    const off = events.filter((e) => e.type === 'trainDerail') as Extract<SimEvent, { type: 'trainDerail' }>[];
    expect(off.length).toBeGreaterThanOrEqual(1);
    expect(off.every((e) => e.sunk)).toBe(true);
    expect(tr.vehicles[0]!.state).toBe('gone');
    expect(tr.outcome).toBe('stopped');
    const paid = events.filter((e): e is Extract<SimEvent, { type: 'salvage' }> => e.type === 'salvage' && e.source !== 'tile');
    expect(paid.map((e) => [e.source, e.amount])).toEqual([['objective', MODES.intercept.bonus]]);
  });
});
