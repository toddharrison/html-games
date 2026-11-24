import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/content/enemies';
import { TRAIN_CAR_IDS, TRAIN_CARS, parseTrain, sampleTrain, type TrainCarId } from '../../src/content/trainCars';
import { FIRE, TRAIN } from '../../src/content/tuning';
import { WEAPONS, type FlameSpec, type RoundSpec, type WeaponId } from '../../src/content/weapons';
import { IDLE_COMMAND, type PlayerCommand } from '../../src/sim/behemoth';
import { destroyEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import type { SimEvent } from '../../src/sim/events';
import { frameRight } from '../../src/sim/frame';
import { masked } from '../../src/sim/mask';
import { coverProtection, damageEnemy } from '../../src/sim/projectiles';
import { liveThreat } from '../../src/sim/spawner';
import type { TrainState } from '../../src/sim/train';
import { createWorld, stepWorld, type World, type WorldOptions } from '../../src/sim/world';

/**
 * Trains at close quarters (docs/SPEC-armored-train.md §T21): an engine's flamethrowers, troops on a
 * guard car's roof, the ambush car, engines through wrecks on their track, and an engine against the hull.
 */

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };

const E: TrainCarId = 'engine';
const B: TrainCarId = 'boxcar';
/** A boxcar where a test wants riders on it (it sets the boxcar's odds to 1), and a car with no roof to ride as filler. */
const G: TrainCarId = 'boxcar';
const S: TrainCarId = 'shieldCar';
const Q: TrainCarId = 'ambushCar';

/** An Intercept on a quiet field: no posts, no waves, no escorts, no attack trains, the autos off. */
function world(layout: TrainCarId[], opts: Partial<WorldOptions> = {}, invulnerable = true): World {
  const w = createWorld({ ...OPTS, ...opts, objective: { mode: 'intercept', strength: 'normal', train: layout } });
  w.encounter.posts = [];
  w.encounter.alert.next = 1e9;
  w.enemies = w.enemies.filter((e) => e.train);
  w.behemoth.invulnerable = invulnerable;
  w.behemoth.autoEnabled.fill(false);
  w.train!.raid = null;
  return w;
}

/** Steps the battle; `hold` puts the hull where it should be before each step (default: in the lane, clear of the line). */
function run(w: World, seconds: number, hold?: (w: World) => void, cmd: Partial<PlayerCommand> = {}): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const b = w.behemoth;
    if (hold) hold(w);
    else b.y = w.terrain.laneY(b.x);
    stepWorld(w, { ...IDLE_COMMAND, aimX: b.x + 200, aimY: b.y, ...cmd });
    events.push(...w.events);
    w.events.length = 0;
  }
  return events;
}

const train = (w: World): TrainState => w.train!;
const unit = (w: World, i: number): Enemy | undefined => w.enemies.find((e) => e.id === train(w).vehicles[i]!.enemyId && e.alive);
const riders = (w: World, i: number): Enemy[] => (train(w).vehicles[i]!.riders ?? []).flatMap((id) => w.enemies.find((e) => e.id === id && e.alive) ?? []);
const fired = (events: SimEvent[], ...weapons: WeaponId[]) =>
  events.filter((e): e is Extract<SimEvent, { type: 'fire' }> => e.type === 'fire' && e.owner === 'enemy' && weapons.includes(e.weapon));
/** The side of the line the lane is on at a vehicle (the sign of sim y). */
const laneSide = (w: World, i: number) => Math.sign(w.terrain.laneY(train(w).vehicles[i]!.x) - train(w).vehicles[i]!.y) || 1;
/** Holds the hull level with a vehicle, `off` units to the lane's side of it, keeping pace with it. */
const alongside = (i: number, off: number, ahead = 0) => (w: World) => {
  const v = train(w).vehicles[i]!;
  const b = w.behemoth;
  b.x = v.x + ahead;
  b.y = v.y + laneSide(w, i) * off;
  b.vx = train(w).speed;
  b.vy = 0;
  b.heading = 0;
};

/** A pile's fireworks finish off cars at random: off here, as in the other train tests. */
const FIREWORKS = { blast: TRAIN.derail.blast.damage, odds: TRAIN.derail.cookOff.odds, burn: TRAIN.derail.burn, wreck: FIRE.fuel.wreck };
/** Who rides on which roof is drawn by odds: nobody, except where a test is about them. */
const ROOFS = TRAIN_CAR_IDS.filter((id) => TRAIN_CARS[id].riders);
const ODDS = Object.fromEntries(ROOFS.map((id) => [id, TRAIN_CARS[id].riders!.odds]));
beforeEach(() => {
  for (const id of ROOFS) TRAIN_CARS[id].riders!.odds = 0;
  TRAIN.derail.blast.damage = 0;
  TRAIN.derail.cookOff.odds = 0;
  TRAIN.derail.burn = 0;
  FIRE.fuel.wreck = 0;
});
afterEach(() => {
  for (const id of ROOFS) TRAIN_CARS[id].riders!.odds = ODDS[id]!;
  TRAIN.derail.blast.damage = FIREWORKS.blast;
  TRAIN.derail.cookOff.odds = FIREWORKS.odds;
  TRAIN.derail.burn = FIREWORKS.burn;
  FIRE.fuel.wreck = FIREWORKS.wreck;
});

describe('a sample train (`?train=all`)', () => {
  it('has one of every car, behind an engine', () => {
    const all = sampleTrain();
    expect(all[0]).toBe('engine');
    expect([...all].sort()).toEqual([...TRAIN_CAR_IDS].sort());
    expect(parseTrain('all')).toEqual(all);
    expect(parseTrain(' all ')).toEqual(all);
    // Every car has a name a layout can call it by, and no two share one.
    const shorts = TRAIN_CAR_IDS.map((id) => TRAIN_CARS[id].short);
    expect(new Set(shorts).size).toBe(shorts.length);
    for (const id of TRAIN_CAR_IDS) expect(parseTrain(TRAIN_CARS[id].short)).toEqual([id]);
  });

  it('runs as a train: every car is a unit on the line', () => {
    const w = world(sampleTrain());
    run(w, 3);
    expect(train(w).vehicles.every((_, i) => !!unit(w, i))).toBe(true);
  });
});

describe('an engine\'s flamethrowers (§T21)', () => {
  const flamer = WEAPONS.trainFlamer.projectile as FlameSpec;

  it('are two flame projectors that open up a little inside their reach, half again as long as the first build\'s', () => {
    const turrets = ENEMIES.trainEngine.turrets!;
    expect(turrets.map((t) => t.weapon)).toEqual(['trainFlamer', 'trainFlamer']);
    for (const t of turrets) expect(t.fireRange).toBeLessThanOrEqual(flamer.range);
    expect(flamer.range).toBe(75 * 1.5);
  });

  it('reach a hull in the lane where the lane runs close to the line', () => {
    const w = world([E], {}, false);
    run(w, 6);
    // 100 units off the track's middle: a lane's distance on its nearer stretches.
    const events = run(w, 4, alongside(0, 100));
    expect(fired(events, 'trainFlamer').length).toBeGreaterThan(10);
    expect(events.some((e) => e.type === 'hullBurn')).toBe(true);
  });

  it('leave a hull that keeps its distance alone', () => {
    const w = world([E], {}, false);
    const armor = w.behemoth.armor.left.hp + w.behemoth.armor.right.hp;
    // Level with it, well out of reach.
    const events = run(w, 4, alongside(0, flamer.range + 40));
    expect(fired(events, 'trainFlamer')).toHaveLength(0);
    expect(w.behemoth.armor.left.hp + w.behemoth.armor.right.hp).toBe(armor);
  });

  it('pour fire on a hull alongside: the armor facing it scorches, with no blow to the hull', () => {
    const w = world([E], {}, false);
    run(w, 6);
    const b = w.behemoth;
    const side = laneSide(w, 0);
    // The hull is on the lane's side of the engine: that's its left if the engine is at smaller y.
    const arc = side > 0 ? 'left' : 'right';
    const before = b.armor[arc].hp;
    const events = run(w, 3, alongside(0, 45));
    const licks = fired(events, 'trainFlamer');
    expect(licks.length).toBeGreaterThan(10);
    // Drawn as a stream of the engine's own, not the Behemoth's.
    const jets = events.filter((e) => e.type === 'flame');
    expect(jets.length).toBe(licks.length);
    for (const j of jets) expect(j.type === 'flame' && j.slot.startsWith('enemy')).toBe(true);
    const burns = events.filter((e) => e.type === 'hullBurn');
    expect(burns.length).toBeGreaterThan(5);
    expect(before - b.armor[arc].hp).toBeCloseTo(burns.length * flamer.damage, 5);
    expect(events.some((e) => e.type === 'behemothHit')).toBe(false);
    // It comes in gouts with a pause between: fewer licks than two nozzles flowing the whole time.
    expect(licks.length).toBeLessThan(3 * 2 * (1 / WEAPONS.trainFlamer.salvo!.interval));
  });

  it('burn nothing of their own train: no fuel left burning on the ground, the riders behind untouched', () => {
    TRAIN_CARS.boxcar.riders!.odds = 1;
    const w = world([E, G, S]);
    run(w, 6);
    // Level with the car behind it, close in: the engine's streams run back along its own train.
    const events = run(w, 6, alongside(1, 45));
    expect(fired(events, 'trainFlamer').length).toBeGreaterThan(10);
    expect([...w.fires.values()].filter((f) => f.fuel !== undefined)).toHaveLength(0);
    expect(riders(w, 1)).toHaveLength(TRAIN_CARS.boxcar.riders!.squads);
    for (const i of [0, 1, 2]) expect(unit(w, i)!.hp).toBe(unit(w, i)!.def.hp);
  });

  it('fall silent once the engine is abandoned behind a wreck', () => {
    // Enough cars ahead of it that the pile has stopped before the engine reaches it.
    const w = world([B, B, B, B, B, B, B, B, E, B]);
    run(w, 8);
    destroyEnemy(w, unit(w, 0)!, 'shot');
    for (let t = 0; t < 30 && !unit(w, 8)?.ai.charging; t += 0.5) run(w, 0.5);
    expect(unit(w, 8)!.ai.charging).toBe(true);
    expect(fired(run(w, 1, alongside(8, 45)), 'trainFlamer')).toHaveLength(0);
  });
});

describe('troops on a car\'s roof (§T21)', () => {
  const def = TRAIN_CARS.boxcar.riders!;
  beforeEach(() => {
    TRAIN_CARS.boxcar.riders!.odds = 1;
  });

  it('ride only cars with a clear roof: nothing up there with a turret, an arm, a hopper, or a mask', () => {
    expect([...ROOFS].sort()).toEqual(['ammoCar', 'boxcar', 'troopCar']);
    for (const id of ROOFS) {
      const car = TRAIN_CARS[id];
      const unit = ENEMIES[car.enemy];
      expect(car.fling).toBeUndefined();
      expect(car.engine).toBeUndefined();
      expect(unit.turrets).toBeUndefined();
      expect(unit.shield).toBeUndefined();
      expect(unit.masked).toBeUndefined();
      expect(ODDS[id]).toBeGreaterThan(0);
      expect(ODDS[id]).toBeLessThan(1);
    }
  });

  it('are on some cars and not others, by each car\'s odds, the same every time for a seed', () => {
    TRAIN_CARS.boxcar.riders!.odds = ODDS.boxcar!;
    const layout: TrainCarId[] = [E, ...Array<TrainCarId>(20).fill(B)];
    const carriers = (seed: number) => {
      const w = world(layout, { seed });
      return train(w).vehicles.map((v) => (v.riders ? v.riders.length : 0));
    };
    const a = carriers(1);
    expect(carriers(1)).toEqual(a);
    expect(a[0]).toBe(0);
    const n = a.filter((k) => k > 0).length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(20);
    for (const k of a) expect([0, def.squads]).toContain(k);
    expect(carriers(2)).not.toEqual(a);
    // And the units on the field are the train's vehicles and its riders, nothing else.
    const w = world(layout);
    expect(w.enemies.length).toBe(layout.length + n * def.squads);
  });

  it('carries its squads along its roof, as fast as the train', () => {
    const w = world([E, G, S]);
    expect(riders(w, 1)).toHaveLength(def.squads);
    run(w, 8);
    const v = train(w).vehicles[1]!;
    const car = unit(w, 1)!;
    const up = riders(w, 1);
    expect(up).toHaveLength(def.squads);
    up.forEach((e, i) => {
      expect(e.def.id).toBe(def.unit);
      expect(e.ai.riding).toBe(true);
      expect(e.train).toBe(true);
      const along = (i - (def.squads - 1) / 2) * def.spacing;
      expect(Math.hypot(e.x - v.x, e.y - v.y)).toBeCloseTo(Math.abs(along), 3);
      expect(e.vx).toBeCloseTo(car.vx);
      // On the car, not beside it.
      expect(Math.hypot(e.x - v.x, e.y - v.y)).toBeLessThan(v.car.length / 2);
    });
    // The other cars carry nobody.
    expect(riders(w, 0)).toHaveLength(0);
    expect(riders(w, 2)).toHaveLength(0);
  });

  it('costs the alert clock nothing', () => {
    const w = world([E, G, G]);
    expect(riders(w, 1).length + riders(w, 2).length).toBe(2 * def.squads);
    expect(liveThreat(w)).toBe(0);
  });

  it('shoots from up there, and can be shot off it without harming the car', () => {
    const w = world([E, G]);
    run(w, 6);
    const events = run(w, 6, alongside(1, 70));
    const squad = ENEMIES[def.unit];
    expect(fired(events, squad.weapon!).length).toBeGreaterThan(0);
    const [first, second] = riders(w, 1);
    const hp = unit(w, 1)!.hp;
    destroyEnemy(w, first!, 'shot');
    run(w, 1);
    expect(riders(w, 1)).toEqual([second]);
    expect(unit(w, 1)!.hp).toBe(hp);
    expect(train(w).vehicles[1]!.state).toBe('coupled');
    // The one left keeps its own place on the roof.
    const v = train(w).vehicles[1]!;
    expect(Math.hypot(second!.x - v.x, second!.y - v.y)).toBeCloseTo(def.spacing / 2, 3);
  });

  it('gives them cover: a sandbagged nest keeps half of a shot off them, until they\'re down off it', () => {
    const w = world([S, G, E, S]);
    run(w, 8);
    const [rider] = riders(w, 1);
    const shot = WEAPONS.autocannon.projectile as RoundSpec;
    const vs = shot.vs?.infantry ?? 1;
    expect(def.cover).toBeGreaterThan(0);
    expect(coverProtection(w, rider!)).toBe(def.cover);
    const hp = rider!.hp;
    damageEnemy(w, rider!, shot, 4, { dx: 1, dy: 0, x: rider!.x, y: rider!.y });
    expect(hp - rider!.hp).toBeCloseTo(4 * vs * (1 - def.cover));
    // The car under them has none of it.
    expect(coverProtection(w, unit(w, 1)!)).toBe(0);
    // Set down beside an abandoned car, they have whatever the ground there gives.
    destroyEnemy(w, unit(w, 2)!, 'shot');
    for (let t = 0; t < 40 && rider!.ai.riding; t += 0.5) run(w, 0.5);
    expect(rider!.ai.riding).toBeUndefined();
    expect(coverProtection(w, rider!)).toBe(w.terrain.protectionAt(rider!.x, rider!.y));
  });

  it('loses its riders with the car when it\'s wrecked', () => {
    const w = world([E, G, S]);
    run(w, 6);
    const up = riders(w, 1);
    const events: SimEvent[] = [];
    destroyEnemy(w, unit(w, 1)!, 'shot');
    events.push(...w.events);
    expect(up.every((e) => !e.alive)).toBe(true);
    expect(events.filter((e) => e.type === 'enemyDestroyed' && e.enemy === def.unit)).toHaveLength(def.squads);
    expect(train(w).vehicles[1]!.riders).toBeUndefined();
  });

  it('lets them down to fight on foot when it\'s abandoned', () => {
    // No engine ahead of the wreck: what runs on brakes to a stand and is left by its crews.
    const w = world([S, G, E, S]);
    run(w, 8);
    const up = riders(w, 1);
    destroyEnemy(w, unit(w, 2)!, 'shot');
    for (let t = 0; t < 40 && !unit(w, 1)?.ai.charging; t += 0.5) run(w, 0.5);
    expect(unit(w, 1)!.ai.charging).toBe(true);
    const v = train(w).vehicles[1]!;
    expect(v.riders).toBeUndefined();
    expect(up.every((e) => e.alive)).toBe(true);
    for (const e of up) {
      expect(e.ai.riding).toBeUndefined();
      expect(e.train).toBeUndefined();
    }
    // They got down beside it (and are free to walk from there).
    const down = up.map((e) => ({ x: e.x, y: e.y }));
    run(w, 1 / 60);
    expect(Math.min(...down.map((p) => Math.abs(p.y - v.y)))).toBeGreaterThanOrEqual(v.car.width / 2);
  });

  it('goes underground with the car in a tunnel', () => {
    const w = world([E, G]);
    let under = false;
    for (let t = 0; t < 120 && !under; t += 0.1) {
      run(w, 0.1, undefined, { throttle: 1 });
      under = w.terrain.underground(train(w).vehicles[1]!.x);
    }
    expect(under).toBe(true);
    expect(unit(w, 1)!.ai.under).toBe(true);
    for (const e of riders(w, 1)) expect(e.ai.under).toBe(true);
  });
});

describe('an ambush car (§T21)', () => {
  const def = ENEMIES.trainAmbushCar;
  const guns: WeaponId[] = [def.weapon!, ...def.turrets!.map((t) => t.weapon)];

  it('rides masked, its guns silent, while the hull keeps away', () => {
    const w = world([E, Q, B], {}, false);
    const events = run(w, 6);
    const car = unit(w, 1)!;
    expect(masked(car)).toBe(true);
    expect(Math.hypot(w.behemoth.x - car.x, w.behemoth.y - car.y)).toBeGreaterThan(def.masked!.range);
    expect(events.some((e) => e.type === 'unmask')).toBe(false);
    expect(fired(events, ...guns)).toHaveLength(0);
  });

  it('drops its sides when the hull comes alongside, and opens fire a moment later', () => {
    const w = world([E, Q, B], {}, false);
    run(w, 6);
    const car = unit(w, 1)!;
    const off = def.masked!.range - 40;
    const first = run(w, 1 / 60, alongside(1, off));
    const drop = first.filter((e) => e.type === 'unmask');
    expect(drop).toHaveLength(1);
    // Toward the hull.
    expect(drop[0]).toMatchObject({ id: car.id, side: laneSide(w, 1) });
    expect(masked(car)).toBe(false);
    // Nothing fires while the panels are still coming off.
    expect(fired(run(w, def.masked!.drop - 0.1, alongside(1, off)), ...guns)).toHaveLength(0);
    const after = fired(run(w, 4, alongside(1, off)), ...guns);
    expect(new Set(after.map((e) => e.weapon))).toEqual(new Set(guns));
    // Once only.
    expect(run(w, 2, alongside(1, off)).some((e) => e.type === 'unmask')).toBe(false);
  });

  it('is given away by a hit, if it\'s on screen', () => {
    const w = world([E, Q, B], {}, false);
    run(w, 6);
    const car = unit(w, 1)!;
    // Level with it, on screen, but out of the range it would drop its sides at.
    const far = alongside(1, def.masked!.range + 30);
    expect(run(w, 1, far).some((e) => e.type === 'unmask')).toBe(false);
    expect(car.x).toBeGreaterThan(w.frame.left);
    expect(car.x).toBeLessThan(frameRight(w.frame));
    car.hp -= 5;
    expect(run(w, 1 / 30, far).filter((e) => e.type === 'unmask')).toHaveLength(1);
  });

  it('keeps its mask off screen, whatever hits it', () => {
    const w = world([E, Q, B]);
    run(w, 20);
    const car = unit(w, 1)!;
    expect(car.x).toBeGreaterThan(frameRight(w.frame));
    car.hp -= 5;
    expect(run(w, 1).some((e) => e.type === 'unmask')).toBe(false);
    expect(masked(car)).toBe(true);
  });
});

describe('an engine meets a wreck on its track (§T21)', () => {
  /** A train whose last car has been destroyed and laid square across the track ahead of its engine, in view. */
  const blocked = () => {
    const w = world([E, B, B]);
    run(w, 8);
    destroyEnemy(w, unit(w, 2)!, 'shot');
    const tr = train(w);
    const lead = tr.vehicles[0]!;
    const wreck = tr.vehicles[2]!;
    expect(wreck.state).toBe('wrecked');
    wreck.x = lead.x + lead.car.length / 2 + 40;
    wreck.y = w.terrain.trackY(wreck.x, 0);
    wreck.heading = Math.PI / 2;
    return { w, tr, lead, wreck };
  };
  /** Runs with the hull level with the engine, off in the lane, until the engine reaches the wreck. */
  const meet = (w: World) => {
    const events: SimEvent[] = [];
    for (let t = 0; t < 5 && !events.some((e) => e.type === 'trainPlow' || e.type === 'trainDerail'); t += 0.1) events.push(...run(w, 0.1, alongside(0, 110)));
    return events;
  };

  it('piles into a wreck of its own train, as before', () => {
    const { w, lead, wreck } = blocked();
    const events = meet(w);
    expect(events.some((e) => e.type === 'trainPlow')).toBe(false);
    expect(events.some((e) => e.type === 'trainDerail')).toBe(true);
    expect(lead.state).toBe('wrecked');
    expect(wreck.state).toBe('wrecked');
  });

  it('plows through another train\'s: the wreck is swept away, the train checked, the engine dented but running', () => {
    const { w, tr, lead, wreck } = blocked();
    // As if an attack train had left it there.
    wreck.train = 7;
    const pace = tr.speed;
    const events = meet(w);
    expect(events.filter((e) => e.type === 'trainPlow')).toHaveLength(1);
    expect(events.some((e) => e.type === 'trainDerail')).toBe(false);
    expect(wreck.state).toBe('gone');
    expect(lead.state).toBe('coupled');
    expect(unit(w, 0)!.hp).toBe(ENEMIES.trainEngine.hp - TRAIN.plow.damage);
    expect(tr.speed).toBeLessThan(pace * (1 - TRAIN.plow.slow) + 1);
    expect(tr.outcome).toBe('running');
    // It eases back up to its pace.
    run(w, 6);
    expect(tr.speed).toBeGreaterThan(pace * 0.95);
  });

  it('is never finished by it', () => {
    const { w, wreck } = blocked();
    wreck.train = 7;
    unit(w, 0)!.hp = 3;
    meet(w);
    expect(unit(w, 0)!.hp).toBe(1);
  });

  it('piles in when it\'s a car at the head, not an engine', () => {
    const w = world([B, E, B]);
    run(w, 8);
    destroyEnemy(w, unit(w, 2)!, 'shot');
    const tr = train(w);
    const lead = tr.vehicles[0]!;
    const wreck = tr.vehicles[2]!;
    wreck.train = 7;
    wreck.x = lead.x + lead.car.length / 2 + 40;
    wreck.y = w.terrain.trackY(wreck.x, 0);
    wreck.heading = Math.PI / 2;
    const events = meet(w);
    expect(events.some((e) => e.type === 'trainPlow')).toBe(false);
    expect(lead.state).toBe('wrecked');
  });
});

describe('an engine runs into the hull (§T21)', () => {
  it('blows up against it: a fireball, the engine a wreck, and what it pulled piling in', () => {
    const w = world([E, B, B], {}, false);
    run(w, 14);
    const tr = train(w);
    const lead = tr.vehicles[0]!;
    const b = w.behemoth;
    // Braked to minimum on the track, its tail just onto the engine's nose.
    b.x = lead.x + lead.car.length / 2 + b.chassis.length / 2 - 2;
    b.y = lead.y;
    b.vx = 18;
    b.vy = 0;
    b.heading = 0;
    const rear = b.armor.rear.hp;
    const treads = b.treads.hp;
    const s = TRAIN.collide.strike;
    const events = run(w, 1 / 60, () => {}, { throttle: -1 });
    const strikes = events.filter((e) => e.type === 'trainStrike');
    expect(strikes).toHaveLength(1);
    expect(strikes[0]).toMatchObject({ raid: false, blast: s.blast.radius });
    expect(rear - b.armor.rear.hp).toBe(Math.min(rear, s.arc));
    expect(treads - b.treads.hp).toBeGreaterThanOrEqual(s.treads - 1e-6);
    // The engine is gone, credited to the hull.
    expect(unit(w, 0)).toBeUndefined();
    expect(lead.state).toBe('wrecked');
    expect(events.find((e) => e.type === 'enemyDestroyed' && e.enemy === 'trainEngine')).toMatchObject({ cause: 'crushed' });
    // Its blast follows at once: fire, and a second blow on the hull beyond the ram's.
    const after = [...events, ...run(w, 0.1, () => {}, { throttle: -1 })];
    expect(after.find((e) => e.type === 'explosion' && e.radius === s.blast.radius)).toMatchObject({ fire: true });
    const blows = after.filter((e): e is Extract<SimEvent, { type: 'behemothHit' }> => e.type === 'behemothHit');
    expect(blows.some((e) => e.damage === s.arc)).toBe(true);
    expect(blows.some((e) => e.damage !== s.arc && e.damage > 10)).toBe(true);
    // The cars behind it are no longer a train.
    run(w, 3, () => {}, { throttle: -1 });
    expect(tr.pieces.some((p) => p.state === 'running')).toBe(false);
    expect(tr.outcome).toBe('stopped');
  });
});
