import { afterEach, describe, expect, it } from 'vitest';
import { MODES } from '../../src/content/modes';
import { parseTrain, plainTrain, TRAIN_CARS, type TrainCarDef, type TrainCarId } from '../../src/content/trainCars';
import { OBJECTIVE, RUN, TERRAIN_GEN, TRAIN } from '../../src/content/tuning';
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

afterEach(() => {
  delete (TRAIN_CARS.boxcar as TrainCarDef).volatile;
});

describe('an armored train (SPEC §4.4 Intercept, §7.3)', () => {
  it('stands on the line ahead of the Behemoth as the battle opens, at rest', () => {
    const w = world();
    const tr = train(w);
    const b = w.behemoth;
    expect(tr.vehicles.map((v) => v.car.id)).toEqual(plainTrain('normal'));
    expect(tr.vehicles.filter((v) => v.car.engine)).toHaveLength(3);
    expect(tr.vehicles.map((v) => v.section)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
    expect(w.objective.total).toBe(3);
    expect(w.exitX).toBeCloseTo(START_X + RUN.battleLength * MODES.intercept.length!);
    expect(tr.speed).toBe(0);
    const tail = tr.vehicles[tr.vehicles.length - 1]!;
    expect(tail.x - tail.car.length / 2).toBeCloseTo(b.x + b.chassis.length / 2 + TRAIN.startGap);
    expect(tr.vehicles[0]!.x - tail.x).toBeCloseTo(trainLength(tr) - (tr.vehicles[0]!.car.length + tail.car.length) / 2);
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
    expect(parseTrain('engine, boxcar,caboose,engine')).toEqual([E, B, E]);
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

  it('paces the Behemoth: a share of its present cruise, less with each engine lost', () => {
    expect(trainPace(3, 3)).toBeCloseTo(0.85);
    expect(trainPace(2, 3)).toBeCloseTo(0.68);
    expect(trainPace(1, 3)).toBeCloseTo(0.51);
    expect(trainPace(0, 3)).toBe(0);
    const w = world();
    const tr = train(w);
    const cruise = speedLimits(w.behemoth).cruise;
    run(w, 1);
    expect(tr.speed).toBeCloseTo(TRAIN.ease, 1);
    run(w, 12);
    expect(tr.speed).toBeCloseTo(0.85 * cruise);
    kill(w, 0);
    run(w, 4);
    expect(runningEngines(tr)).toBe(2);
    expect(tr.speed).toBeCloseTo(0.68 * cruise);
  });

  it('is the same fight for a slow Behemoth: worn treads slow the train too, after a moment', () => {
    const w = world();
    const tr = train(w);
    run(w, 12);
    const before = tr.speed;
    const b = w.behemoth;
    b.treads.hp = b.treads.max * 0.2;
    const slow = speedLimits(b).cruise;
    expect(slow).toBeLessThan(before);
    run(w, 0.5);
    expect(tr.speed).toBeGreaterThan(0.85 * slow);
    run(w, 10);
    expect(tr.speed).toBeCloseTo(0.85 * slow);
    // Cruising still gains on it, and braking still drops back.
    expect(slow).toBeGreaterThan(tr.speed);
    expect(speedLimits(b).min).toBeLessThan(tr.speed);
  });

  it('leaves a destroyed vehicle in the chain as a hulk', () => {
    const w = world();
    const tr = train(w);
    run(w, 5);
    const salvage = earned(w);
    kill(w, 2);
    expect(earned(w) - salvage).toBe(12);
    expect(tr.vehicles[2]!.alive).toBe(false);
    expect(tr.vehicles[2]!.state).toBe('coupled');
    expect(states(w)).toEqual(['0-14:running']);
    const x = tr.vehicles[2]!.x;
    run(w, 2);
    expect(tr.vehicles[2]!.x).toBeGreaterThan(x);
    expect(tr.vehicles[1]!.x - tr.vehicles[2]!.x).toBeCloseTo(34 + TRAIN.coupling);
  });

  it('isn\'t lost or despawned for falling behind the frame', () => {
    const w = world();
    run(w, 5);
    w.behemoth.x += 1600;
    run(w, 3);
    expect(w.frame.left).toBeGreaterThan(train(w).vehicles[0]!.x + 300);
    expect(w.enemies.filter((e) => e.train)).toHaveLength(15);
    expect(w.objective.lost).toBe(0);
  });
});

describe('cutting loose (SPEC §7.3)', () => {
  it('uncouples the tail section when its engine dies, and scuttles it from the tail forward', () => {
    const w = world();
    const tr = train(w);
    run(w, 10);
    const salvage = earned(w);
    kill(w, 10);
    const events = run(w, 1 / 60);
    expect(states(w)).toEqual(['0-9:running', '10-14:coasting']);
    expect(events.find((e) => e.type === 'trainCutLoose')).toMatchObject({ cars: 5 });
    expect(w.objective.destroyed).toBe(1);
    // The engine's kill and its share of the bonus: the cars pay nothing.
    expect(earned(w) - salvage).toBe(30 + MODES.intercept.bonus / 3);
    run(w, TRAIN.cutLoose.fuse - 0.2, {}, events);
    expect(events.filter((e) => e.type === 'trainScuttle')).toHaveLength(0);
    expect(tr.pieces[1]!.speed).toBeLessThan(tr.speed);
    run(w, 0.3 + 5 * TRAIN.cutLoose.ripple, {}, events);
    const blown = events.filter((e) => e.type === 'trainScuttle') as Extract<SimEvent, { type: 'trainScuttle' }>[];
    expect(blown).toHaveLength(5);
    for (let i = 1; i < blown.length; i++) expect(blown[i]!.x).toBeGreaterThan(blown[i - 1]!.x);
    expect(events.filter((e) => e.type === 'explosion').length).toBeGreaterThanOrEqual(5);
    expect(tr.vehicles.slice(10).every((v) => v.state === 'wrecked' && !v.alive)).toBe(true);
    expect(states(w)).toEqual(['0-9:running']);
    expect(w.enemies.filter((e) => e.train)).toHaveLength(10);
    expect(earned(w) - salvage).toBe(30 + MODES.intercept.bonus / 3);
    expect(tr.outcome).toBe('running');
  });

  it('keeps a dead section that has a running engine behind it, then drops both together', () => {
    const w = world();
    run(w, 5);
    kill(w, 5);
    run(w, 1);
    expect(states(w)).toEqual(['0-14:running']);
    kill(w, 10);
    const events = run(w, 1 / 60);
    expect(states(w)).toEqual(['0-4:running', '5-14:coasting']);
    expect(events.find((e) => e.type === 'trainCutLoose')).toMatchObject({ cars: 10 });
  });

  it('pays for a cut-loose car the Behemoth destroys before its charge fires, which blows at once', () => {
    const w = world();
    run(w, 5);
    kill(w, 10);
    run(w, 0.5);
    const salvage = earned(w);
    kill(w, 12);
    const events = run(w, 1 / 60);
    expect(earned(w) - salvage).toBe(12);
    expect(train(w).vehicles[12]!.state).toBe('wrecked');
    expect(events.some((e) => e.type === 'trainScuttle')).toBe(true);
    expect(events.some((e) => e.type === 'explosion')).toBe(true);
    expect(states(w)).toEqual(['0-9:running', '10-11:coasting', '13-14:coasting']);
  });

  it('parts the chain where an ammo car goes up: a gap if an engine still pulls what\'s behind', () => {
    (TRAIN_CARS.boxcar as TrainCarDef).volatile = { radius: 4, damage: 10 };
    const w = world([E, B, B, B, E, B]);
    run(w, 5);
    kill(w, 2);
    const events = run(w, 1 / 60);
    expect(events.some((e) => e.type === 'trainBroken')).toBe(true);
    expect(train(w).vehicles[2]!.state).toBe('wrecked');
    expect(states(w)).toEqual(['0-1:running', '3-5:running']);
    // The pieces keep formation: a gap, not a second train.
    const gap = train(w).vehicles[1]!.x - train(w).vehicles[3]!.x;
    run(w, 5);
    expect(train(w).vehicles[1]!.x - train(w).vehicles[3]!.x).toBeCloseTo(gap);
  });

  it('cuts loose what an ammo car leaves with no engine', () => {
    (TRAIN_CARS.boxcar as TrainCarDef).volatile = { radius: 4, damage: 10 };
    const w = world([E, B, E, B, B, B]);
    run(w, 5);
    kill(w, 4);
    run(w, 1 / 60);
    expect(states(w)).toEqual(['0-3:running', '5-5:coasting']);
  });

  it('parts where the Behemoth plows through a car, and pushes on what\'s ahead of every engine', () => {
    const w = world([E, B, B, E, B]);
    run(w, 5);
    kill(w, 0);
    kill(w, 1, 'crushed');
    run(w, 1 / 60);
    expect(states(w)).toEqual(['0-0:running', '2-4:running']);
    const x = train(w).vehicles[0]!.x;
    run(w, 2);
    expect(train(w).vehicles[0]!.x).toBeGreaterThan(x + 20);
    expect(train(w).outcome).toBe('running');
  });
});

describe('stopping the train (SPEC §4.4)', () => {
  it('is stopped once its last engine is destroyed: the objective taken, the extraction line pulled in', () => {
    const w = world();
    const tr = train(w);
    run(w, 10);
    const exit = w.exitX;
    kill(w, 0);
    kill(w, 5);
    expect(tr.outcome).toBe('running');
    kill(w, 10);
    const events = run(w, 1 / 60);
    expect(tr.outcome).toBe('stopped');
    expect(events.find((e) => e.type === 'trainStopped')).toMatchObject({ derailed: false });
    expect(objectiveComplete(w.objective)).toBe(true);
    expect(objectiveBonus(w.objective)).toBe(MODES.intercept.bonus);
    expect(w.exitX).toBeLessThan(exit);
    expect(w.exitX).toBeLessThanOrEqual(w.behemoth.x + TRAIN.extractAhead + 1);
    run(w, 5);
    expect(tr.speed).toBe(0);
    expect(tr.pieces.every((p) => p.state === 'halted')).toBe(true);
    expect(tr.pieces).toHaveLength(1);
  });

  it('gets through if an engine reaches the far end: that engine is lost, and it pulls its cars off the field', () => {
    const w = world([E, B, B], { battleLength: 400 });
    const tr = train(w);
    const events = run(w, 30);
    expect(w.objective.lost).toBe(1);
    expect(events.some((e) => e.type === 'objective' && e.what === 'lost')).toBe(true);
    expect(tr.outcome).toBe('through');
    expect(tr.vehicles.every((v) => v.state === 'gone')).toBe(true);
    expect(w.enemies.filter((e) => e.train)).toHaveLength(0);
    expect(events.some((e) => e.type === 'trainStopped')).toBe(false);
    expect(OBJECTIVE.escapeBeyond).toBeGreaterThan(0);
  });

  /** How far along the line (0–1) the lead engine is when the hull draws level with it; -1 if it never does. */
  function passesLeadAt(w: World, cmd: Partial<PlayerCommand>): number {
    const lead = train(w).vehicles[0]!;
    for (let t = 0; t < 400 && lead.x < w.exitX && w.extractedAt === null; t++) {
      run(w, 1, cmd);
      if (w.behemoth.x > lead.x) return (lead.x - START_X) / (w.exitX - START_X);
    }
    return -1;
  }

  it('can be overhauled end to end at a surge well before the far end, and not at a cruise', () => {
    const surge = passesLeadAt(world(), { throttle: 1 });
    expect(surge).toBeGreaterThan(0);
    expect(surge).toBeLessThan(0.5);
    // Cruising gains only a car every ten seconds on open ground, and rivers and rubble eat that.
    const cruise = passesLeadAt(world(), {});
    expect(cruise === -1 || cruise > surge + 0.3).toBe(true);
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
    run(w, 14);
    const salvage = earned(w);
    const col = cut(w, 60);
    expect(w.terrain.lineCut(col)).toBe(true);
    const events = run(w, 12);
    const off = events.filter((e) => e.type === 'trainDerail') as Extract<SimEvent, { type: 'trainDerail' }>[];
    // From full pace (30.6): 22.6, 14.6, 6.6, stopped.
    expect(off).toHaveLength(4);
    expect(off.map((e) => e.first)).toEqual([true, false, false, false]);
    expect(off.every((e) => !e.sunk)).toBe(true);
    expect(tr.vehicles.slice(0, 4).every((v) => v.state === 'wrecked' && !v.alive)).toBe(true);
    // The pile grows back from the break: each wreck lies behind the last.
    for (let i = 1; i < 4; i++) expect(tr.vehicles[i]!.x).toBeLessThan(tr.vehicles[i - 1]!.x);
    expect(Math.abs(tr.vehicles[0]!.y - w.terrain.lineY(tr.vehicles[0]!.x))).toBeGreaterThanOrEqual(TRAIN.derail.scatter[0] - 1e-9);
    expect(states(w)).toEqual(['4-14:halted']);
    // A derailed train is a stopped train: every engine counts, the wrecks pay half.
    expect(tr.outcome).toBe('stopped');
    expect(events.find((e) => e.type === 'trainStopped')).toMatchObject({ derailed: true });
    expect(objectiveComplete(w.objective)).toBe(true);
    expect(earned(w) - salvage).toBe(15 + 3 * 6 + MODES.intercept.bonus);
    expect(w.enemies.filter((e) => e.train)).toHaveLength(11);
    expect(w.enemies.some((e) => e.objective)).toBe(false);
  });

  it('leaves wrecks the Behemoth has to plow through or steer round', () => {
    const w = world();
    run(w, 14);
    cut(w, 60);
    run(w, 12);
    const v = train(w).vehicles[0]!;
    expect(w.terrain.tileAt(v.x, v.y)!.mat).toBe('wreck');
  });

  it('loses fewer vehicles the slower it\'s going', () => {
    const w = world();
    run(w, 5);
    kill(w, 5);
    kill(w, 10);
    run(w, 14);
    cut(w, 60);
    const events = run(w, 14);
    // One engine of three: 0.51 × 36 = 18.4, then 10.4, 2.4, stopped.
    expect(events.filter((e) => e.type === 'trainDerail')).toHaveLength(3);
  });

  it('runs a following piece into the pile', () => {
    (TRAIN_CARS.boxcar as TrainCarDef).volatile = { radius: 4, damage: 10 };
    const w = world([E, B, B, B, B, B, E, B]);
    const tr = train(w);
    run(w, 14);
    kill(w, 5);
    run(w, 1 / 60);
    expect(states(w)).toEqual(['0-4:running', '6-7:running']);
    cut(w, 60);
    const events = run(w, 14);
    expect(tr.pieces.every((p) => p.state === 'halted')).toBe(true);
    expect(tr.vehicles[6]!.state).toBe('wrecked');
    expect(tr.outcome).toBe('stopped');
    expect(events.filter((e) => e.type === 'trainStopped')).toHaveLength(1);
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
    const salvage = earned(w);
    const events = run(w, (col * TS - tr.vehicles[0]!.x) / 28 + 20);
    const off = events.filter((e) => e.type === 'trainDerail') as Extract<SimEvent, { type: 'trainDerail' }>[];
    expect(off.length).toBeGreaterThanOrEqual(1);
    expect(off.every((e) => e.sunk)).toBe(true);
    expect(tr.vehicles[0]!.state).toBe('gone');
    expect(tr.outcome).toBe('stopped');
    const paid = events.filter((e): e is Extract<SimEvent, { type: 'salvage' }> => e.type === 'salvage' && e.source !== 'tile');
    expect(paid.map((e) => [e.source, e.amount])).toEqual([['objective', MODES.intercept.bonus]]);
    void salvage;
  });
});
