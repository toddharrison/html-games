import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/content/enemies';
import { TRAIN_CARS, TRAIN_DOCTRINE, TRAIN_LAYOUT, parseTrain, type MineFlingDef, type TrainCarId } from '../../src/content/trainCars';
import { FIRE, TERRAIN_GEN, TRAIN } from '../../src/content/tuning';
import { WEAPONS, type WeaponId } from '../../src/content/weapons';
import { IDLE_COMMAND, groundFootprint, speedLimits, type PlayerCommand } from '../../src/sim/behemoth';
import { destroyEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import type { SimEvent } from '../../src/sim/events';
import { frameRight } from '../../src/sim/frame';
import { Rng, hashSeed } from '../../src/sim/rng';
import { newRun } from '../../src/sim/run';
import type { Strength } from '../../src/sim/sectorMap';
import type { TrainState } from '../../src/sim/train';
import { buildTrain } from '../../src/sim/trainCars';
import { spawnProjectile } from '../../src/sim/weapons';
import { createWorld, stepWorld, type World, type WorldOptions } from '../../src/sim/world';

/** The armored train's armed cars, its railway gun, and what happens when the hull meets it (docs/SPEC-armored-train.md §T6, §T7, §T10). */

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };
const TS = TERRAIN_GEN.tileSize;

const E: TrainCarId = 'engine';
const B: TrainCarId = 'boxcar';
const R: TrainCarId = 'railwayGun';
const G: TrainCarId = 'gunCar';
const M: TrainCarId = 'missileCar';
const T: TrainCarId = 'troopCar';
const F: TrainCarId = 'mineCar';
const A: TrainCarId = 'ammoCar';

/** An Intercept on a quiet field: no posts, no waves, no escorts, the autos off. */
function world(layout: TrainCarId[], opts: Partial<WorldOptions> = {}, invulnerable = true): World {
  const w = createWorld({ ...OPTS, ...opts, objective: { mode: 'intercept', strength: 'normal', train: layout } });
  w.encounter.posts = [];
  w.encounter.alert.next = 1e9;
  w.enemies = w.enemies.filter((e) => e.train);
  w.behemoth.invulnerable = invulnerable;
  w.behemoth.autoEnabled.fill(false);
  // The armored train alone: attack trains have tests of their own.
  w.train!.raid = null;
  return w;
}

/** Steps the battle; `hold` puts the hull where it should be before each step (default: in the lane, clear of the line). */
function run(w: World, seconds: number, cmd: Partial<PlayerCommand> = {}, hold?: (w: World) => void): SimEvent[] {
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
const states = (w: World) => train(w).pieces.map((p) => `${p.first}-${p.last}:${p.state}`);
const kill = (w: World, i: number, cause: 'shot' | 'crushed' = 'shot') => destroyEnemy(w, unit(w, i)!, cause);
const fired = (events: SimEvent[], ...weapons: WeaponId[]) =>
  events.filter((e): e is Extract<SimEvent, { type: 'fire' }> => e.type === 'fire' && e.owner === 'enemy' && weapons.includes(e.weapon));

const fling = TRAIN_CARS.mineCar.fling!;
const flingWas: MineFlingDef = { ...fling };
/** How a pile runs is tested without its fireworks (they finish off cars at random); tests/sim/train.test.ts has those. */
const FIREWORKS = { blast: TRAIN.derail.blast.damage, odds: TRAIN.derail.cookOff.odds, burn: TRAIN.derail.burn, wreck: FIRE.fuel.wreck };
beforeEach(() => {
  TRAIN.derail.blast.damage = 0;
  TRAIN.derail.cookOff.odds = 0;
  TRAIN.derail.burn = 0;
  FIRE.fuel.wreck = 0;
});
afterEach(() => {
  Object.assign(fling, flingWas);
  TRAIN.derail.blast.damage = FIREWORKS.blast;
  TRAIN.derail.cookOff.odds = FIREWORKS.odds;
  TRAIN.derail.burn = FIREWORKS.burn;
  FIRE.fuel.wreck = FIREWORKS.wreck;
});

describe('building a train (§T6)', () => {
  const cost = (id: TrainCarId) => TRAIN_CARS[id].cost ?? 0;
  /** Sections front to back: each an engine and what follows it. */
  const sections = (layout: TrainCarId[]) => {
    const out: TrainCarId[][] = [];
    for (const id of layout) {
      if (id === 'engine') out.push([]);
      else out[out.length - 1]!.push(id);
    }
    return out;
  };

  it('is the same train for the same seed, and a different one for another', () => {
    const a = buildTrain('normal', 10, 'combined', new Rng(5));
    expect(buildTrain('normal', 10, 'combined', new Rng(5))).toEqual(a);
    const others = [6, 7, 8, 9].map((s) => buildTrain('normal', 10, 'combined', new Rng(s)).join());
    expect(others.some((o) => o !== a.join())).toBe(true);
  });

  it('puts the railway gun behind the lead engine, fills every slot, and carries its ammo cars beside armed ones', () => {
    for (const strength of ['normal', 'strong', 'objective'] as Strength[]) {
      for (let seed = 1; seed <= 10; seed++) {
        const layout = buildTrain(strength, 7 + (seed % 7), 'combined', new Rng(seed));
        const secs = sections(layout);
        expect(layout[0]).toBe('engine');
        expect(layout[1]).toBe('railwayGun');
        expect(layout.filter((id) => id === 'railwayGun')).toHaveLength(1);
        expect(secs).toHaveLength(TRAIN_LAYOUT.sections[strength]);
        secs.forEach((cars, s) => expect(cars).toHaveLength(TRAIN_LAYOUT.cars[strength] + (s === 0 ? 1 : 0)));
        expect(layout.filter((id) => id === 'ammoCar')).toHaveLength(TRAIN_LAYOUT.ammo[strength]);
        for (const cars of secs) {
          cars.forEach((id, i) => {
            if (id === 'ammoCar') expect([cars[i - 1], cars[i + 1]].some((n) => !!n && cost(n) > 0)).toBe(true);
          });
        }
      }
    }
  });

  it('spends a budget that grows with the node\'s threat on armed cars, more of it toward the front', () => {
    const spent = [0, 0, 0, 0];
    const armed = { low: 0, high: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      const threat = 7 + (seed % 7);
      const budget = TRAIN_LAYOUT.budget.base.normal + TRAIN_LAYOUT.budget.perThreat * threat;
      const layout = buildTrain('normal', threat, 'combined', new Rng(seed));
      const secs = sections(layout);
      // An ammo car may take an armed car's place only on a train armed end to end: not here.
      const each = secs.map((cars) => cars.reduce((n, id) => n + cost(id), 0));
      const total = each.reduce((a, b) => a + b, 0);
      // What's left over is less than the cheapest car.
      expect(total).toBeLessThanOrEqual(budget + 1e-9);
      expect(total).toBeGreaterThan(budget - 1.5);
      each.forEach((n, s) => (spent[s] = (spent[s] ?? 0) + n));
      const count = layout.filter((id) => cost(id) > 0).length;
      if (threat === 7) armed.low += count;
      if (threat === 13) armed.high += count;
    }
    // Lead to tail.
    for (let s = 1; s < spent.length; s++) expect(spent[s - 1]!).toBeGreaterThan(spent[s]!);
    // Over a quarter of its 24 cars armed on a run's first Intercept, more as the threat climbs.
    expect(armed.high).toBeGreaterThan(armed.low);
    expect(armed.low / 6).toBeGreaterThanOrEqual(6);
  });

  it('is long: four or five sections of six or seven cars', () => {
    expect(buildTrain('normal', 7, 'combined', new Rng(1))).toHaveLength(4 * 7 + 1);
    expect(buildTrain('strong', 7, 'combined', new Rng(1))).toHaveLength(5 * 7 + 1);
    expect(buildTrain('objective', 7, 'combined', new Rng(1))).toHaveLength(5 * 8 + 1);
  });

  it('draws on every kind of armed car', () => {
    const seen = new Set<TrainCarId>();
    for (let seed = 1; seed <= 30; seed++) for (const id of buildTrain('strong', 13, 'combined', new Rng(seed))) seen.add(id);
    for (const id of ['gunCar', 'twinGunCar', 'autocannonCar', 'howitzerCar', 'rocketCar', 'missileCar', 'troopCar', 'mineCar'] as TrainCarId[]) expect(seen.has(id), id).toBe(true);
  });

  it('arms its cars by the doctrine', () => {
    const tally = (doctrine: 'armoredFist' | 'entrenched' | 'longGuns') => {
      const n: Partial<Record<TrainCarId, number>> = {};
      for (let seed = 1; seed <= 40; seed++) for (const id of buildTrain('normal', 12, doctrine, new Rng(seed))) n[id] = (n[id] ?? 0) + 1;
      return n;
    };
    const fist = tally('armoredFist');
    const dug = tally('entrenched');
    expect(fist.gunCar!).toBeGreaterThan(dug.gunCar!);
    expect(dug.troopCar! + dug.mineCar!).toBeGreaterThan(fist.troopCar! + (fist.mineCar ?? 0));
    expect(fist.twinGunCar!).toBeGreaterThan(dug.twinGunCar ?? 0);
    const long = tally('longGuns');
    expect(long.howitzerCar! + long.missileCar! + long.rocketCar!).toBeGreaterThan(fist.howitzerCar! + fist.missileCar! + fist.rocketCar!);
    expect(TRAIN_DOCTRINE.raiders.escorts).toBe(1);
  });

  it('is built from the node\'s threat and doctrine when a battle starts, with an extra escort for raiders', () => {
    const make = (doctrine: 'combined' | 'raiders') => createWorld({ ...OPTS, threat: 11, objective: { mode: 'intercept', strength: 'normal', doctrine } });
    const w = make('combined');
    expect(train(w).vehicles.map((v) => v.car.id)).toEqual(buildTrain('normal', 11, 'combined', new Rng(hashSeed(OPTS.seed, 0x7a12))));
    expect(train(w).vehicles[1]!.car.id).toBe('railwayGun');
    const hover = (x: World) => x.enemies.filter((e) => !e.train && e.def.id === 'hovercraft').length;
    expect(hover(make('raiders'))).toBe(hover(w) + 1);
    // Practice names.
    expect(parseTrain('engine,railgun,gun,missile,troop,mines,ammo,box')).toEqual([E, R, G, M, T, F, A, B]);
    expect(parseTrain('twin,auto,howitzer,rockets')).toEqual(['twinGunCar', 'autocannonCar', 'howitzerCar', 'rocketCar']);
  });
});

describe('the armed cars (§T6)', () => {
  it('fire only from inside the frame, and fall silent once abandoned', () => {
    // The armed cars at the tail, where a hull at a surge stays with them.
    // (A long tail: a pile takes seven of what's behind the engine.)
    const w = world([E, B, E, B, B, B, B, B, B, B, B, T, M, G]);
    const events: SimEvent[] = [];
    // (Twenty seconds: over before the train reaches the line's first crossover.)
    for (let i = 0; i < 20 * 60; i++) {
      const b = w.behemoth;
      b.y = w.terrain.laneY(b.x);
      stepWorld(w, { ...IDLE_COMMAND, aimX: b.x + 200, aimY: b.y, throttle: 1 });
      for (const e of fired(w.events, 'emplacementGun', 'trainMissiles', 'troopRockets')) {
        expect(e.x).toBeGreaterThanOrEqual(w.frame.left);
        expect(e.x).toBeLessThanOrEqual(frameRight(w.frame));
      }
      events.push(...w.events);
      w.events.length = 0;
    }
    expect(fired(events, 'emplacementGun').length).toBeGreaterThan(0);
    expect(fired(events, 'trainMissiles').length).toBeGreaterThan(0);
    // The second engine goes: what's behind it piles up, and the cars at the tail are left stranded.
    kill(w, 2);
    const after: SimEvent[] = [];
    // (The hull brakes, to stay by the tail while the pile forms.)
    for (let t = 0; t < 20 && !after.some((e) => e.type === 'trainAbandoned'); t += 0.1) after.push(...run(w, 0.1, { throttle: -1 }));
    expect(states(w)[0]).toBe('0-1:running');
    expect(train(w).pieces[1]).toMatchObject({ last: 13, state: 'abandoned' });
    const tail = train(w).vehicles[13]!;
    expect(unit(w, 13)!.ai.charging).toBe(true);
    for (const e of fired(run(w, TRAIN.scuttle.fuse - 0.2, { throttle: -1 }), 'emplacementGun')) expect(Math.abs(e.x - tail.x)).toBeGreaterThan(20);
    expect(unit(w, 13)!.windup).toBe(0);
  });

  it('the new cars shoot: twin guns, an autocannon, a howitzer on a marked zone, a ripple of rockets', () => {
    const w = world([E, 'twinGunCar', 'autocannonCar', 'howitzerCar', 'rocketCar', B], {}, true);
    const events: SimEvent[] = [];
    // Held level with the middle of the train, well inside every gun's reach and outside the howitzer's minimum.
    const hold = (x: World) => {
      const b = x.behemoth;
      b.x = train(x).vehicles[3]!.x;
      b.y = train(x).vehicles[3]!.y - x.terrain.lineSide * 150;
    };
    events.push(...run(w, 30, {}, hold));
    // Both of the twin car's turrets fire, from either end of it.
    const twin = train(w).vehicles[1]!;
    expect(unit(w, 1)!.guns).toHaveLength(2);
    expect(fired(events, 'emplacementGun').length).toBeGreaterThanOrEqual(4);
    expect(new Set(fired(events, 'emplacementGun').map((e) => Math.sign(e.x - twin.x))).size).toBeGreaterThanOrEqual(1);
    expect(fired(events, 'trainAutocannon').length).toBeGreaterThanOrEqual(WEAPONS.trainAutocannon.salvo!.count);
    expect(fired(events, 'trainRockets').length).toBeGreaterThanOrEqual(WEAPONS.trainRockets.salvo!.count);
    // The howitzer marks its zone before its rounds land.
    expect(fired(events, 'trainHowitzer').length).toBeGreaterThanOrEqual(2);
    expect(events.some((e) => e.type === 'barrage' && e.radius === WEAPONS.trainHowitzer.barrage!.radius)).toBe(true);
    // Every one of them is something the train's budget can buy.
    for (const id of ['twinGunCar', 'autocannonCar', 'howitzerCar', 'rocketCar'] as TrainCarId[]) expect(TRAIN_CARS[id].cost).toBeGreaterThan(0);
  });

  it('a troop car lets its squads out when it\'s destroyed, shot or piled up, once', () => {
    const w = world([E, T, B, E, T]);
    run(w, 6);
    const seen = new Set<number>();
    const watch = (seconds: number) => {
      for (let i = 0; i < seconds * 60; i++) {
        run(w, 1 / 60);
        for (const e of w.enemies) if (e.def.id === 'infantry') seen.add(e.id);
      }
    };
    const v = train(w).vehicles[1]!;
    const line = v.y;
    kill(w, 1);
    const out = w.enemies.filter((e) => e.alive && e.def.id === 'infantry');
    expect(out).toHaveLength(2);
    for (const s of out) {
      // Beside the rails where it stood (its wreck is thrown clear of them).
      expect(Math.abs(s.x - v.x)).toBeLessThan(20);
      expect(Math.abs(s.y - line)).toBeGreaterThan(v.car.width / 2);
      seen.add(s.id);
    }
    // What was behind it piles into its wreck, the other troop car with it.
    watch(8);
    expect(train(w).vehicles[4]!.alive).toBe(false);
    expect(seen.size).toBe(4);
    watch(4);
    expect(seen.size).toBe(4);
  });

  it('a mine flinger lobs mines onto the hull\'s line ahead of it, in plain sight, five out at most', () => {
    // Held back while the hull comes up; then quick throws, so the cap is what stops it.
    fling.every = 1e9;
    const w = world([E, F, B]);
    run(w, 8);
    Object.assign(fling, { every: 0.3, lead: 4, retry: 0.1 });
    train(w).vehicles[1]!.flingIn = 0;
    const car = () => train(w).vehicles[1]!;
    // Carried along level with the car, at the train's pace.
    const hold = (x: World) => {
      const b = x.behemoth;
      b.x = car().x;
      b.y = x.terrain.laneY(b.x);
      b.vx = train(x).speed;
    };
    const events: SimEvent[] = [];
    let out = 0;
    for (let i = 0; i < 10 * 60; i++) {
      events.push(...run(w, 1 / 60, {}, hold));
      out = Math.max(out, train(w).flung.length + train(w).laid.length);
      for (const m of train(w).laid) {
        const tile = w.terrain.tile(m.col, m.row)!;
        expect(tile.mat).toBe('mine');
        expect(tile.seen).toBe(true);
      }
    }
    expect(out).toBe(fling.live);
    const throws = events.filter((e): e is Extract<SimEvent, { type: 'mineFlung' }> => e.type === 'mineFlung');
    expect(throws.length).toBeGreaterThanOrEqual(fling.live);
    for (const t of throws) {
      // Onto the hull's line, well ahead of it.
      expect(t.x - t.x0).toBeGreaterThan(100);
      expect(Math.abs(t.y - w.terrain.laneY(t.x0))).toBeLessThan(4);
    }
    expect(events.filter((e) => e.type === 'mineLaid').length).toBeGreaterThanOrEqual(fling.live - 1);
  });

  it('an ammo car goes up on its neighbors when it\'s destroyed, and parts the train like any wreck', () => {
    const w = world([E, B, A, B, E, B]);
    run(w, 5);
    const hp = (i: number) => unit(w, i)!.hp;
    kill(w, 2);
    const events = run(w, 1 / 60);
    expect(events.some((e) => e.type === 'explosion' && e.radius === TRAIN_CARS.ammoCar.volatile!.radius)).toBe(true);
    expect(hp(1)).toBeLessThan(ENEMIES.trainBoxcar.hp);
    expect(hp(3)).toBeLessThan(ENEMIES.trainBoxcar.hp);
    expect(states(w)).toEqual(['0-1:running', '3-5:derailing']);
  });
});

describe('the railway gun (§T7)', () => {
  it('opens fire 4 s in, from off screen, on a marked zone where the hull will be', () => {
    // Long enough that the zone (where the hull will be) is beyond the gun's minimum range.
    const w = world([E, R, B, B, B, B, B, B, B, B]);
    const b = w.behemoth;
    let zone: Extract<SimEvent, { type: 'barrage' }> | undefined;
    let shot: Extract<SimEvent, { type: 'fire' }> | undefined;
    let predicted = { x: 0, y: 0 };
    let t = 0;
    for (let i = 0; i < 6 * 60 && !zone; i++) {
      predicted = { x: b.x + b.vx * WEAPONS.railwayGunShell.barrage!.flight, y: b.y + b.vy * WEAPONS.railwayGunShell.barrage!.flight };
      b.y = w.terrain.laneY(b.x);
      stepWorld(w, { ...IDLE_COMMAND, aimX: b.x + 200, aimY: b.y });
      zone = w.events.find((e): e is Extract<SimEvent, { type: 'barrage' }> => e.type === 'barrage');
      shot = fired(w.events, 'railwayGunShell')[0];
      t = w.time;
      if (shot) expect(shot.x).toBeGreaterThan(frameRight(w.frame));
      w.events.length = 0;
    }
    expect(zone).toBeDefined();
    expect(shot).toBeDefined();
    expect(t).toBeCloseTo(TRAIN_CARS.railwayGun.firstShot!, 1);
    expect(zone!.radius).toBe(40);
    expect(Math.hypot(zone!.x - predicted.x, zone!.y - predicted.y)).toBeLessThan(2);
    // One shell, down on the zone's center when the ring closes.
    const events = run(w, WEAPONS.railwayGunShell.barrage!.flight + 0.1);
    const burst = events.find((e) => e.type === 'explosion' && e.radius === 40) as Extract<SimEvent, { type: 'explosion' }>;
    // (The gun is rolling as it fires, which carries the shell a little way along.)
    expect(Math.hypot(burst.x - zone!.x, burst.y - zone!.y)).toBeLessThan(3);
  });

  it('falls silent inside its minimum range, and opens up again beyond it', () => {
    const w = world([E, R, B]);
    run(w, 8);
    const gun = () => train(w).vehicles[1]!;
    const at = (behind: number) => (x: World) => {
      const b = x.behemoth;
      b.x = gun().x - behind;
      b.y = x.terrain.laneY(b.x);
    };
    expect(fired(run(w, 20, {}, at(200)), 'railwayGunShell')).toHaveLength(0);
    expect(fired(run(w, 20, {}, at(500)), 'railwayGunShell').length).toBeGreaterThan(0);
  });

  /** A railway gun shell sent down at (x, y), from 400 ahead. */
  function shellAt(w: World, x: number, y: number, hold?: (w: World) => void): SimEvent[] {
    const weapon = WEAPONS.railwayGunShell;
    spawnProjectile(w, 'enemy', weapon, x + 400, y, Math.PI, { fuse: 400, speed: 400 / weapon.barrage!.flight, tx: x, ty: y });
    return run(w, weapon.barrage!.flight + 0.1, {}, hold);
  }

  it('hurts its own side at half damage, and the hull at full', () => {
    const w = world([E, B, B], {}, false);
    // The train held at its station (the dev freeze), so the shell finds the car where it was aimed.
    w.dev.frozen = true;
    const car = train(w).vehicles[1]!;
    // The hull's side 10 units from where the shell comes down, the car's middle 10 the other way.
    const side = -w.terrain.lineSide;
    const hold = (x: World) => {
      x.behemoth.x = car.x;
      x.behemoth.y = car.y + side * 40;
    };
    hold(w);
    const events = shellAt(w, car.x, car.y + side * 10, hold);
    expect(unit(w, 1)!.hp).toBeCloseTo(ENEMIES.trainBoxcar.hp - 0.5 * 45);
    const hit = events.find((e) => e.type === 'behemothHit') as Extract<SimEvent, { type: 'behemothHit' }>;
    expect(hit.damage).toBeCloseTo(45 * (1 - (0.5 * 10) / 40), 0);
  });

  it('craters open ground but never breaks the track', () => {
    const w = world([E, B]);
    run(w, 5);
    kill(w, 0);
    run(w, 6);
    const t = w.terrain;
    const nose = train(w).vehicles[0]!.x + 20;
    t.ensure(0, nose + 600);
    // Well ahead of the train, where the line isn't shielded.
    let col = Math.floor((nose + 200) / TS);
    while (t.tile(col, t.lineRow(col)!)!.mat !== 'track') col++;
    const row = t.lineRow(col)!;
    shellAt(w, (col + 0.5) * TS, (row + 0.5) * TS);
    expect(t.lineCut(col)).toBe(false);
    expect(t.tile(col, row)!.mat).toBe('track');
    const near = [-2, -1, 1, 2].map((d) => t.tile(col, row + d)!).filter((tile) => tile.mat === 'crater');
    expect(near.length).toBeGreaterThan(0);
  });

  it('goes up when it\'s destroyed, on the vehicles either side, and wrecks like any other', () => {
    const w = world([E, R, B]);
    run(w, 5);
    kill(w, 1);
    const events = run(w, 1 / 60);
    expect(events.find((e) => e.type === 'trainBroken')).toMatchObject({ behind: 1 });
    expect(events.some((e) => e.type === 'explosion' && e.radius === TRAIN_CARS.railwayGun.volatile!.radius)).toBe(true);
    expect(unit(w, 0)!.hp).toBeLessThan(ENEMIES.trainEngine.hp);
    expect(train(w).vehicles[1]!.state).toBe('wrecked');
    expect(states(w)[0]).toBe('0-0:running');
  });

  it('can\'t be shot down', () => {
    expect(WEAPONS.railwayGunShell.projectile.kind === 'shell' && WEAPONS.railwayGunShell.projectile.unstoppable).toBe(true);
    const w = world([E, B]);
    w.behemoth.autoEnabled.fill(true);
    const b = w.behemoth;
    const weapon = WEAPONS.railwayGunShell;
    spawnProjectile(w, 'enemy', weapon, b.x + 300, b.y, Math.PI, { fuse: 300, speed: 300 / weapon.barrage!.flight, tx: b.x, ty: b.y });
    const events = run(w, weapon.barrage!.flight - 0.2);
    expect(events.filter((e) => e.type === 'intercept')).toHaveLength(0);
    expect(w.projectiles.some((p) => p.weapon.id === 'railwayGunShell' && p.alive)).toBe(true);
  });
});

describe('the hull meets the train (§T10)', () => {
  /** Holds the hull at (dx, dy) from a vehicle, at speed `vx`. */
  const beside = (w: World, i: number, dx: number, dy: number, vx: number) => {
    const v = train(w).vehicles[i]!;
    const b = w.behemoth;
    b.x = v.x + dx;
    b.y = v.y + dy;
    b.vx = vx;
    b.vy = 0;
    b.heading = 0;
  };
  const step = (w: World, cmd: Partial<PlayerCommand> = {}) => run(w, 1 / 60, cmd, () => {});

  it('plows through a car: it\'s wrecked under the treads, and the train parts there', () => {
    const w = world([E, B, B, B, E, B]);
    run(w, 8);
    // Where the line runs straight past all three, so the hull's side meets only the middle one.
    const flat = () => [1, 3].every((i) => Math.abs(train(w).vehicles[i]!.y - train(w).vehicles[2]!.y) < 0.3);
    for (let t = 0; t < 80 && !flat(); t++) run(w, 0.5);
    expect(flat()).toBe(true);
    // Its side just into the car's middle, clear of the cars either side.
    beside(w, 2, 0, -(20 + 13 * 0.6 - 1) * w.terrain.lineSide, 36);
    const events = step(w);
    const v = train(w).vehicles[2]!;
    expect(v.state).toBe('wrecked');
    expect(events.some((e) => e.type === 'collision' && e.obstacle === 'heavy')).toBe(true);
    expect(events.find((e) => e.type === 'enemyDestroyed')).toMatchObject({ cause: 'crushed' });
    expect(events.find((e) => e.type === 'trainBroken')).toMatchObject({ behind: 3 });
    expect(states(w)[0]).toBe('0-1:running');
    expect(train(w).pieces[1]!.state).not.toBe('running');
    expect(w.behemoth.vx).toBeLessThan(36);
  });

  it('plows through a car\'s wreck', () => {
    const w = world([E, B, B]);
    run(w, 8);
    kill(w, 1);
    const v = train(w).vehicles[1]!;
    expect(v.state).toBe('wrecked');
    expect(w.terrain.tileAt(v.x, v.y)!.mat).toBe('wreck');
    // Its nose just into the wreck where it lies, off the rails.
    beside(w, 1, -(32 + 13 * 0.6 - 2), 0, 36);
    const events = step(w);
    expect(v.state).toBe('gone');
    expect(events.some((e) => e.type === 'collision' && e.obstacle === 'heavy')).toBe(true);
    expect(w.terrain.tileAt(v.x, v.y)!.state).toBe('flattened');
  });

  it('can\'t crush an engine: rammed from behind, the hull is thrown back off it, and it stays on the rails', () => {
    const w = world([E], {}, false);
    run(w, 12);
    const engine = unit(w, 0)!;
    const lead = train(w).vehicles[0]!;
    const fp = (b: World['behemoth']) => groundFootprint(b);
    // The ground box's nose just into the engine's tail, closing at a surge.
    beside(w, 0, -(20 + (fp(w.behemoth).x1 - fp(w.behemoth).x0) / 2) + 3, 0, 64);
    const front = w.behemoth.armor.frontLeft.hp + w.behemoth.armor.frontRight.hp;
    const x = lead.x;
    const events = run(w, 1, { throttle: 1 }, () => {});
    expect(engine.alive).toBe(true);
    // A ram at the speed it closes, not the hull's own: a dent, not a kill.
    expect(engine.hp).toBeLessThan(ENEMIES.trainEngine.hp);
    expect(engine.hp).toBeGreaterThan(ENEMIES.trainEngine.hp - ENEMIES.trainEngine.ramDamage!);
    expect(engine.y).toBeCloseTo(w.terrain.lineY(engine.x));
    expect(events.filter((e) => e.type === 'collision' && e.obstacle === 'heavy' && Math.abs(e.x - x) < 30)).toHaveLength(1);
    expect(w.behemoth.armor.frontLeft.hp + w.behemoth.armor.frontRight.hp).toBeLessThan(front);
    // Never through it: its nose is still behind the engine's tail, or it has slid off to one side.
    const g = fp(w.behemoth);
    expect(g.x1 <= lead.x - lead.car.length / 2 + 1 || Math.abs(w.behemoth.y - lead.y) > lead.car.width / 2).toBe(true);
  });

  it('can\'t crush an engine from the side either: the hull is held off it, scraping', () => {
    const w = world([E], {}, false);
    run(w, 12);
    const lead = train(w).vehicles[0]!;
    const half = (groundFootprint(w.behemoth).y1 - groundFootprint(w.behemoth).y0) / 2;
    const side = -w.terrain.lineSide;
    beside(w, 0, 0, side * (lead.car.width / 2 + half - 3), 36);
    const arc = side > 0 ? 'left' : 'right';
    const armor = w.behemoth.armor[arc].hp;
    for (let i = 0; i < 30; i++) {
      step(w, { steer: side > 0 ? -1 : 1 });
      expect(Math.abs(w.behemoth.y - lead.y)).toBeGreaterThanOrEqual(lead.car.width / 2 + half - 1);
    }
    expect(w.behemoth.armor[arc].hp).toBeLessThan(armor);
    // Still on the rails: the train put it nowhere else.
    expect(unit(w, 0)!.y).toBeCloseTo(w.terrain.lineY(unit(w, 0)!.x));
    expect(unit(w, 0)!.hp).toBe(ENEMIES.trainEngine.hp);
  });

  // (An engine at the head blows up against the hull instead: tests/sim/trainCloseQuarters.test.ts.)
  it('runs into a hull on the track ahead of it, a car at its head: the hull is struck and shoved to the wide side, the train slowed, not stopped', () => {
    const w = world(['shieldCar', E], {}, false);
    run(w, 14);
    const tr = train(w);
    const pace = tr.speed;
    const lead = tr.vehicles[0]!;
    // Braked to minimum on the track, its tail just onto the engine's nose.
    beside(w, 0, lead.car.length / 2 + 32 - 2, 0, 18);
    const b = w.behemoth;
    const rear = b.armor.rear.hp;
    const treads = b.treads.hp;
    const events = step(w, { throttle: -1 });
    expect(events.filter((e) => e.type === 'trainStrike')).toHaveLength(1);
    expect(events.find((e) => e.type === 'trainStrike')).toMatchObject({ blast: null });
    const s = TRAIN.collide.strike;
    expect(rear - b.armor.rear.hp).toBe(Math.min(rear, s.arc));
    expect(treads - b.treads.hp).toBeGreaterThanOrEqual(s.treads - 1e-6);
    expect(unit(w, 0)!.hp).toBe(ENEMIES.trainShieldCar.hp - s.front);
    expect(tr.speed).toBeCloseTo(pace * (1 - s.slow), 0);
    const later = run(w, 1.5, { throttle: -1 }, () => {});
    expect(later.filter((e) => e.type === 'trainStrike')).toHaveLength(0);
    expect((b.y - w.terrain.lineY(b.x)) * -w.terrain.lineSide).toBeGreaterThan(lead.car.width / 2 + 16);
    expect(tr.outcome).toBe('running');
    run(w, 6);
    // Back to its pace (the treads' damage has slowed the hull's cruise, and so the pace, a little).
    expect(tr.speed).toBeCloseTo(TRAIN.pace * speedLimits(b).top, 0);
  });

  it('wrecks a trailer in tow that it runs into first', () => {
    const w = world([E, B], { behemoth: newRun(1, 'class2', ['trailer']).behemoth }, false);
    run(w, 14);
    const lead = train(w).vehicles[0]!;
    const b = w.behemoth;
    // The trailer's tail just onto the engine's nose: the hull itself still clear.
    const t = b.trailer!;
    beside(w, 0, lead.car.length / 2 + (b.x - t.x) + t.def.length / 2 - 2, 0, 18);
    t.x = lead.x + lead.car.length / 2 + t.def.length / 2 - 2;
    t.y = lead.y;
    const events = step(w, { throttle: -1 });
    expect(events.some((e) => e.type === 'trainStrike')).toBe(true);
    expect(b.trailer!.status).toBe('wrecked');
    // The trailer took the blow, not the armor (its cook-off still reaches the rear plate).
    expect(events.some((e) => e.type === 'behemothHit' && e.damage === TRAIN.collide.strike.arc)).toBe(false);
  });
});
