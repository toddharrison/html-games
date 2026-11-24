import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MODES } from '../../src/content/modes';
import { TRAIN_CARS, TRAIN_LAYOUT, type TrainCarId } from '../../src/content/trainCars';
import { FIRE, OIL, TERRAIN_GEN, TRAIN } from '../../src/content/tuning';
import { WEAPONS } from '../../src/content/weapons';
import { IDLE_COMMAND, speedLimits, type PlayerCommand } from '../../src/sim/behemoth';
import { destroyEnemy } from '../../src/sim/enemies';
import { sealed, type Enemy } from '../../src/sim/entities';
import type { SimEvent } from '../../src/sim/events';
import { frameRight } from '../../src/sim/frame';
import { objectiveComplete } from '../../src/sim/objective';
import { fireBeam } from '../../src/sim/projectiles';
import { Rng } from '../../src/sim/rng';
import { shieldPlate, shieldStop } from '../../src/sim/shield';
import { trainBodies, type TrainPiece, type TrainState } from '../../src/sim/train';
import { buildRaider } from '../../src/sim/trainCars';
import { spawnProjectile } from '../../src/sim/weapons';
import { createWorld, stepWorld, type World, type WorldOptions } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };
const TS = TERRAIN_GEN.tileSize;
const INTERCEPT = MODES.intercept.train!.raids!;
const GAUNTLET = MODES.gauntlet.train!.raids!;

/** A battle on a quiet field (no posts, no waves, no escorts) with a Behemoth that can't break and holds its fire. */
function battle(mode: 'intercept' | 'gauntlet', layout?: TrainCarId[], opts: Partial<WorldOptions> = {}): World {
  const w = createWorld({ ...OPTS, ...opts, objective: { mode, strength: 'normal', ...(layout ? { train: layout } : {}) } });
  w.encounter.posts = [];
  w.encounter.alert.next = 1e9;
  w.enemies = w.enemies.filter((e) => e.train);
  w.behemoth.invulnerable = true;
  w.behemoth.autoEnabled.fill(false);
  return w;
}

/** Steps the battle, the hull held in the lane (clear of the line); attack trains are made harmless so they pass. */
function run(w: World, seconds: number, cmd: Partial<PlayerCommand> = {}, events: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const b = w.behemoth;
    b.y = w.terrain.laneY(b.x);
    stepWorld(w, { ...IDLE_COMMAND, aimX: b.x + 200, aimY: b.y, ...cmd });
    events.push(...w.events);
    w.events.length = 0;
  }
  return events;
}

const train = (w: World): TrainState => w.train!;
const unitOf = (w: World, i: number): Enemy | undefined => w.enemies.find((e) => e.id === train(w).vehicles[i]!.enemyId && e.alive);
const raids = (w: World): TrainPiece[] => train(w).pieces.filter((p) => p.raid);
/** Steps until an attack train has started, and returns its piece. */
function awaitRaid(w: World, events: SimEvent[] = [], limit = 120): TrainPiece {
  const had = new Set(raids(w));
  for (let t = 0; t < limit; t += 0.1) {
    run(w, 0.1, {}, events);
    const fresh = raids(w).find((p) => !had.has(p));
    if (fresh) return fresh;
  }
  throw new Error('no attack train came');
}

/** The pile's fireworks finish off cars at random: off, except where a test is about them. */
const FIREWORKS = { blast: TRAIN.derail.blast.damage, odds: TRAIN.derail.cookOff.odds, burn: TRAIN.derail.burn, wreck: FIRE.fuel.wreck };
beforeEach(() => {
  TRAIN.derail.blast.damage = 0;
  TRAIN.derail.cookOff.odds = 0;
  TRAIN.derail.burn = 0;
  FIRE.fuel.wreck = 0;
});
afterEach(() => {
  TRAIN.derail.blast.damage = FIREWORKS.blast;
  TRAIN.derail.cookOff.odds = FIREWORKS.odds;
  TRAIN.derail.burn = FIREWORKS.burn;
  FIRE.fuel.wreck = FIREWORKS.wreck;
});

describe('attack trains on the second track (SPEC §7.3)', () => {
  it('are an engine and two or three cars, some with an armored caboose at the tail', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const plain = buildRaider('combined', false, new Rng(seed));
      expect(plain[0]).toBe('engine');
      expect(plain.length - 1).toBeGreaterThanOrEqual(TRAIN_LAYOUT.raid.cars[0]);
      expect(plain.length - 1).toBeLessThanOrEqual(TRAIN_LAYOUT.raid.cars[1]);
      // Armed cars only (the ones an armored train pays for), and no second engine.
      for (const id of plain.slice(1)) expect(TRAIN_CARS[id].cost, id).toBeDefined();
      const tailed = buildRaider('combined', true, new Rng(seed));
      expect(tailed[tailed.length - 1]).toBe('caboose');
      expect(tailed.filter((id) => id === 'caboose')).toHaveLength(1);
    }
  });

  it('come up from behind the frame about once a minute, faster than the hull can go, pass it, and run on ahead', () => {
    const w = battle('intercept');
    const tr = train(w);
    const main = tr.vehicles.length;
    const events: SimEvent[] = [];
    const p = awaitRaid(w, events);
    expect(w.time).toBeGreaterThanOrEqual(INTERCEPT.first);
    expect(w.time).toBeLessThan(INTERCEPT.first + 3);
    expect(events.find((e) => e.type === 'trainRaid')).toMatchObject({ track: 1 });
    // On the second track, behind the frame, already at its pace; its vehicles are units, none a target.
    expect(p.track).toBe(1);
    expect(p.first).toBe(main);
    const lead = tr.vehicles[p.first]!;
    expect(lead.x).toBeLessThan(w.frame.left);
    expect(lead.y).toBeCloseTo(w.terrain.trackY(lead.x, 1));
    expect(Math.abs(lead.y - w.terrain.lineY(lead.x))).toBeCloseTo(TERRAIN_GEN.railLine.twin * TS, 0);
    expect(p.speed).toBeCloseTo(TRAIN.raid.pace * speedLimits(w.behemoth).top);
    expect(p.speed).toBeGreaterThan(speedLimits(w.behemoth).top);
    for (let i = p.first; i <= p.last; i++) expect(unitOf(w, i)!.objective).toBe(false);
    expect(w.objective.total).toBe(tr.engines);
    // It comes past the hull...
    const b = w.behemoth;
    let passed = false;
    for (let t = 0; t < 40 && !passed; t += 0.5) {
      run(w, 0.5, { throttle: 1 });
      passed = tr.vehicles[p.last]!.x > b.x;
    }
    expect(passed).toBe(true);
    // ...and is gone once it's well ahead of the frame, with nothing lost by it.
    for (let t = 0; t < 60 && raids(w).includes(p); t += 0.5) run(w, 0.5);
    expect(raids(w)).not.toContain(p);
    for (let i = p.first; i <= p.last; i++) expect(tr.vehicles[i]!.state).toBe('gone');
    expect(w.objective.lost).toBe(0);
    // The next is a minute or so behind it.
    const next = awaitRaid(w);
    expect(next.first).toBeGreaterThan(p.last);
  });

  it('stop coming once the armored train is stopped', () => {
    const w = battle('intercept', ['engine', 'boxcar']);
    run(w, 5);
    destroyEnemy(w, unitOf(w, 0)!, 'shot');
    run(w, INTERCEPT.first + INTERCEPT.every[1] + 10);
    expect(train(w).outcome).toBe('stopped');
    expect(raids(w)).toHaveLength(0);
  });

  it('wreck and pile up like any train, and the next one\'s engine plows through a wreck lying on its track in view', () => {
    const w = battle('gauntlet');
    const tr = train(w);
    const events: SimEvent[] = [];
    const p = awaitRaid(w, events);
    const { first, last, track } = p;
    // Wait for it to come into the frame, then kill its engine: the cars behind pile into it.
    for (let t = 0; t < 20 && tr.vehicles[first]!.x < w.frame.left + 80; t += 0.1) run(w, 0.1, {}, events);
    destroyEnemy(w, unitOf(w, first)!, 'shot');
    expect(tr.vehicles[first]!.state).toBe('wrecked');
    for (let t = 0; t < 20 && tr.pieces.some((q) => q.first >= first && q.last <= last && q.state === 'derailing'); t += 0.1) run(w, 0.1, {}, events);
    expect(events.filter((e) => e.type === 'trainDerail').length).toBeGreaterThanOrEqual(1);
    const wrecks = tr.vehicles.slice(first, last + 1).filter((v) => v.state === 'wrecked');
    expect(wrecks.length).toBeGreaterThanOrEqual(2);
    // Lay one of the wrecks square across the other track too, where the hull can see it, and wait there.
    const other = track === 0 ? 1 : 0;
    const across = wrecks[1]!;
    across.x = w.behemoth.x + 60;
    for (const t of [0, 1] as const) {
      const v = t === track ? across : wrecks[0]!;
      v.x = across.x;
      v.y = w.terrain.trackY(v.x, t);
      v.heading = Math.PI / 2;
    }
    expect(other).not.toBe(track);
    const plowed: SimEvent[] = [];
    const piled: SimEvent[] = [];
    for (let t = 0; t < 80 && plowed.length < 1; t += 0.1) {
      for (const e of run(w, 0.1, { throttle: -1 })) (e.type === 'trainPlow' ? plowed : e.type === 'trainDerail' ? piled : []).push(e);
      // Hold the hull by the wrecks (the frame, and so what counts as in view, follows it).
      w.behemoth.vx = 0;
      w.behemoth.x = across.x - 60;
    }
    // A later train's engine went through one of them (they're no part of its own train): the wreck
    // is swept off the rails, and nothing of that train left them.
    expect(plowed).toHaveLength(1);
    expect(piled).toHaveLength(0);
    expect([across, wrecks[0]!].filter((v) => v.state === 'gone')).toHaveLength(1);
    const later = tr.vehicles.slice(last + 1);
    expect(later.length).toBeGreaterThan(0);
    expect(later.filter((v) => v.state === 'wrecked')).toHaveLength(0);
    expect(new Set(later.map((v) => v.train)).has(tr.vehicles[first]!.train)).toBe(false);
  });

  it('goes up in earnest: each vehicle that piles in is blown up as it lands, burns, and may cook off', () => {
    Object.assign(TRAIN.derail.blast, { damage: FIREWORKS.blast });
    TRAIN.derail.cookOff.odds = 1;
    TRAIN.derail.burn = FIREWORKS.burn;
    const w = battle('intercept', ['engine', 'boxcar', 'boxcar', 'boxcar', 'boxcar', 'boxcar', 'boxcar', 'boxcar', 'boxcar', 'boxcar']);
    train(w).raid = null;
    run(w, 8);
    const tr = train(w);
    destroyEnemy(w, unitOf(w, 1)!, 'shot');
    // The wreck burns where it lies, and a cook-off is on its fuse.
    const first = tr.vehicles[1]!;
    expect(first.burnsUntil).toBeCloseTo(w.time + TRAIN.derail.burn, 1);
    const near = (f: { col: number; row: number }) => Math.abs(f.col - Math.floor(first.x / TS)) + Math.abs(f.row - Math.floor(first.y / TS)) <= 1;
    expect([...w.fires.values()].some((f) => near(f) && f.smokes)).toBe(true);
    expect(w.blasts.some((bl) => bl.fire && bl.x === first.x)).toBe(true);
    const events = run(w, 3);
    const off = events.filter((e) => e.type === 'trainDerail') as Extract<SimEvent, { type: 'trainDerail' }>[];
    expect(off.length).toBeGreaterThanOrEqual(3);
    // Each one rides up into the last (closer than a car's length), thrown to the other side from it.
    const piled = tr.vehicles.slice(2, 2 + off.length);
    for (let i = 1; i < piled.length; i++) {
      expect(piled[i - 1]!.x - piled[i]!.x).toBeLessThan(piled[i]!.car.length);
      expect(Math.sign(piled[i]!.y - w.terrain.lineY(piled[i]!.x))).toBe(-Math.sign(piled[i - 1]!.y - w.terrain.lineY(piled[i - 1]!.x)));
    }
    // And each went up as it landed.
    expect(events.filter((e) => e.type === 'explosion').length).toBeGreaterThanOrEqual(off.length);
  });
});

describe('what a wreck leaks (SPEC §7.3)', () => {
  const was = { ...TRAIN.leak };
  afterEach(() => Object.assign(TRAIN.leak, was));
  /** A short train with its second car destroyed, and the battle run on a while. */
  function wrecked(seconds: number): { w: World; events: SimEvent[]; wreck: { x: number; y: number } } {
    const w = battle('intercept', ['engine', 'boxcar', 'boxcar']);
    train(w).raid = null;
    run(w, 6);
    destroyEnemy(w, unitOf(w, 1)!, 'shot');
    return { w, events: run(w, seconds), wreck: train(w).vehicles[1]! };
  }

  it('plasma: a few pools land round it, one after another', () => {
    Object.assign(TRAIN.leak, { plasma: 1, oil: 0 });
    const { w, wreck } = wrecked(0.2);
    expect(w.pools).toHaveLength(0);
    const seen = new Set<number>();
    for (let t = 0; t < TRAIN.leak.spots[1] * TRAIN.leak.every[1] + 1; t += 0.1) {
      run(w, 0.1);
      for (const p of w.pools) seen.add(p.id);
    }
    expect(seen.size).toBeGreaterThanOrEqual(1);
    expect(seen.size).toBeLessThanOrEqual(TRAIN.leak.spots[1] * 3);
    expect(train(w).vehicles[1]!.leak).toBeUndefined();
    expect(w.spills).toHaveLength(0);
    void wreck;
  });

  it('oil: slicks that lie there until fire reaches one, and then it all burns', () => {
    Object.assign(TRAIN.leak, { plasma: 0, oil: 1, reach: [60, 70] });
    const { w, wreck } = wrecked(TRAIN.leak.spots[1] * TRAIN.leak.every[1] + 1);
    // Well clear of the wreck (which doesn't burn in these tests), they're just slicks.
    expect(w.spills.length).toBeGreaterThanOrEqual(1);
    for (const s of w.spills) {
      // (Each from its own wreck: what piled in behind the first leaks too.)
      const from = train(w).vehicles.filter((v) => v.state === 'wrecked');
      expect(from).toContain(wreck);
      expect(Math.max(...from.map((v) => Math.hypot(s.x - v.x, s.y - v.y)))).toBeGreaterThanOrEqual(60 - 1e-9);
      expect(s.radius).toBeGreaterThanOrEqual(TRAIN.leak.slick[0]);
    }
    const s = w.spills[0]!;
    const n = w.spills.length;
    const key = Math.floor(s.x / TS) * 4096 + Math.floor(s.y / TS);
    expect(w.fires.has(key)).toBe(false);
    // A burning tile under it sets it off: the slick is gone, and its ground burns as spilt fuel does.
    w.fires.set(key, { col: Math.floor(s.x / TS), row: Math.floor(s.y / TS), age: 0, fuel: 0.5 });
    const events = run(w, 0.1);
    expect(events.find((e) => e.type === 'oilIgnite')).toMatchObject({ x: s.x, y: s.y });
    expect(w.spills.length).toBeLessThan(n);
    expect(w.spills).not.toContain(s);
    expect(w.fires.get(key)!.fuel).toBeGreaterThan(OIL.burn - 1);
  });
});

describe('Gauntlet (SPEC §4.4): attack trains, and no armored train', () => {
  it('sends a fixed number up either track, their engines the targets', () => {
    const w = battle('gauntlet');
    const tr = train(w);
    expect(tr.main).toBe(false);
    expect(tr.vehicles).toHaveLength(0);
    expect(w.terrain.hasLine).toBe(true);
    expect(w.objective.total).toBe(GAUNTLET.count!.normal);
    const events: SimEvent[] = [];
    const tracks = new Set<number>();
    let cabooses = 0;
    let last = 0;
    for (let n = 0; n < GAUNTLET.count!.normal; n++) {
      const p = awaitRaid(w, events);
      tracks.add(p.track);
      if (n > 0) expect(w.time - last).toBeGreaterThanOrEqual(GAUNTLET.every[0] - 0.2);
      last = w.time;
      const engine = unitOf(w, p.first)!;
      expect(engine.def.id).toBe('trainEngine');
      expect(engine.objective).toBe(true);
      for (let i = p.first + 1; i <= p.last; i++) expect(unitOf(w, i)!.objective).toBe(false);
      if (tr.vehicles[p.last]!.car.id === 'caboose') cabooses++;
    }
    expect(tracks.size).toBe(2);
    expect(cabooses).toBeGreaterThan(0);
    expect(cabooses).toBeLessThan(GAUNTLET.count!.normal);
    // No more after the last.
    run(w, GAUNTLET.every[1] + 5, {}, events);
    expect(events.filter((e) => e.type === 'trainRaid')).toHaveLength(GAUNTLET.count!.normal);
  });

  it('counts each engine destroyed or got away, and brings the extraction line in after the last', () => {
    const w = battle('gauntlet');
    const total = GAUNTLET.count!.normal;
    const exit = w.exitX;
    const events: SimEvent[] = [];
    // Destroy the engine of every other one as it starts; let the rest go by.
    for (let n = 0; n < total; n++) {
      const p = awaitRaid(w, events);
      if (n % 2 === 0) destroyEnemy(w, unitOf(w, p.first)!, 'shot');
    }
    for (let t = 0; t < 90 && !events.some((e) => e.type === 'raidsOver'); t += 0.5) run(w, 0.5, {}, events);
    const killed = Math.ceil(total / 2);
    expect(w.objective.destroyed).toBe(killed);
    expect(w.objective.lost).toBe(total - killed);
    expect(objectiveComplete(w.objective)).toBe(false);
    expect(events.filter((e) => e.type === 'raidsOver')).toHaveLength(1);
    expect(w.exitX).toBeLessThan(exit);
    expect(w.exitX).toBeLessThanOrEqual(Math.max(w.behemoth.x, w.frame.left) + TRAIN.extractAhead);
    expect(frameRight(w.frame)).toBeGreaterThan(0);
  });
});

describe('a shield car (SPEC-armored-train.md §T6)', () => {
  const S: TrainCarId = 'shieldCar';
  /** A shield car alone behind its engine, the hull abreast of it in the lane, and its arm swung out. */
  function shielded(): { w: World; car: Enemy } {
    const w = battle('intercept', ['engine', S, 'boxcar']);
    train(w).raid = null;
    const car = unitOf(w, 1)!;
    w.dev.frozen = true;
    w.behemoth.x = car.x;
    w.behemoth.y = w.terrain.laneY(car.x);
    w.dev.frozen = false;
    return { w, car };
  }

  it('swings its arm toward the Behemoth, no faster than it turns', () => {
    const { w, car } = shielded();
    const def = car.def.shield!;
    const want = Math.atan2(w.behemoth.y - car.y, w.behemoth.x - car.x);
    const start = car.turret;
    expect(Math.abs(start - want)).toBeGreaterThan(1);
    w.dev.frozen = true;
    // (The train is frozen with it, so the car holds still; shields are stepped with the train.)
    w.dev.frozen = false;
    const per = ((def.degPerSec * Math.PI) / 180) / 60;
    const b = w.behemoth;
    for (let i = 0; i < 20; i++) {
      const was = car.turret;
      b.x = car.x;
      b.vx = 0;
      stepWorld(w, { ...IDLE_COMMAND, aimX: b.x + 200, aimY: b.y, throttle: -1 });
      expect(Math.abs(car.turret - was)).toBeLessThanOrEqual(per + 1e-9);
    }
    expect(Math.abs(car.turret - start)).toBeGreaterThan(per * 10);
    // The plate stands off from the car, square to the arm.
    const p = shieldPlate(car)!;
    expect(Math.hypot((p.x0 + p.x1) / 2 - car.x, (p.y0 + p.y1) / 2 - car.y)).toBeCloseTo(def.reach);
    expect(Math.hypot(p.x1 - p.x0, p.y1 - p.y0)).toBeCloseTo(def.width);
  });

  it('stops direct fire on its plate and lets lobbed shells over; from behind the plate it can be hit', () => {
    const { w, car } = shielded();
    const b = w.behemoth;
    const toHull = Math.atan2(b.y - car.y, b.x - car.x);
    car.turret = toHull;
    w.dev.frozen = true;
    const fire = (weapon: keyof typeof WEAPONS, from: { x: number; y: number }, lob = false): SimEvent[] => {
      const angle = Math.atan2(car.y - from.y, car.x - from.x);
      const d = Math.hypot(car.x - from.x, car.y - from.y);
      spawnProjectile(w, 'player', WEAPONS[weapon], from.x, from.y, angle, lob ? { fuse: d } : {});
      const events: SimEvent[] = [];
      for (let i = 0; i < 180; i++) {
        stepWorld(w, { ...IDLE_COMMAND, aimX: b.x + 200, aimY: b.y });
        events.push(...w.events);
        w.events.length = 0;
      }
      return events;
    };
    const hull = { x: b.x, y: b.y };
    const hp = car.hp;
    // A flat shot from the hull's side: stopped on the plate, the car untouched.
    expect(shieldStop(w, hull.x, hull.y, car.x, car.y)).not.toBeNull();
    expect(fire('autocannon', hull).some((e) => e.type === 'shieldBlock')).toBe(true);
    expect(car.hp).toBe(hp);
    // A beam the same.
    const beam = fireBeam(w, WEAPONS.beamLaser, hull.x, hull.y, Math.atan2(car.y - hull.y, car.x - hull.x));
    expect(beam.hit).toBe(true);
    expect(Math.hypot(beam.x - car.x, beam.y - car.y)).toBeGreaterThan(car.def.radius);
    expect(car.hp).toBe(hp);
    expect(w.events.some((e) => e.type === 'shieldBlock')).toBe(true);
    w.events.length = 0;
    // A lobbed shell comes down on it over the plate.
    expect(fire('mortar', hull, true).some((e) => e.type === 'shieldBlock')).toBe(false);
    expect(car.hp).toBeLessThan(hp);
    // And from the far side of the car, where the plate isn't, a flat shot goes home.
    const left = car.hp;
    const far = { x: car.x - Math.cos(toHull) * 44, y: car.y - Math.sin(toHull) * 44 };
    expect(shieldStop(w, far.x, far.y, car.x, car.y)).toBeNull();
    fire('autocannon', far);
    expect(car.hp).toBeLessThan(left);
  });

  it('is out of reach in a tunnel, like everything on the line there', () => {
    const w = battle('intercept', ['engine', S, 'boxcar']);
    train(w).raid = null;
    const tr = train(w);
    // Run until the engine is under the first crossover.
    let under = false;
    for (let t = 0; t < 120 && !under; t += 0.1) {
      run(w, 0.1, { throttle: 1 });
      under = w.terrain.underground(tr.vehicles[0]!.x);
    }
    expect(under).toBe(true);
    const engine = unitOf(w, 0)!;
    expect(engine.ai.under).toBe(true);
    expect(sealed(engine)).toBe(true);
    expect(trainBodies(w).some((body) => body.index === 0)).toBe(false);
    // The car behind it hasn't gone in yet.
    const car = unitOf(w, 2)!;
    if (!w.terrain.underground(car.x)) {
      expect(sealed(car)).toBe(false);
      expect(trainBodies(w).some((body) => body.index === 2)).toBe(true);
    }
    // It comes out the far end on the other side of the field, and back into the fight.
    const side = w.terrain.lineSideAt(engine.x - 400);
    for (let t = 0; t < 30 && engine.ai.under; t += 0.1) run(w, 0.1, { throttle: 1 });
    expect(engine.ai.under).toBeUndefined();
    expect(sealed(engine)).toBe(false);
    run(w, 6, { throttle: 1 });
    expect(w.terrain.lineSideAt(engine.x)).toBe(-side);
  });
});
