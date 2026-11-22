import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../../src/content/chassis';
import { WEAPONS, type WeaponId } from '../../src/content/weapons';
import {
  AlarmWatch,
  CueLimiter,
  cuesFor,
  engineState,
  HEARING,
  levelFactor,
  LEVEL_SPREAD,
  MIN_GAP,
  PITCH_SPREAD,
  pitchFactor,
  place,
  reactorState,
  WEAPON_SOUNDS,
  type Cue,
  type CueContext,
} from '../../src/audio/cues';
import { createBehemoth, damageComponent } from '../../src/sim/behemoth';
import type { SimEvent } from '../../src/sim/events';

const c = CHASSIS.class2;
const make = () =>
  createBehemoth(c, Object.fromEntries(Object.entries(c.loadout).map(([slot, id]) => [slot, WEAPONS[id]])), 100, 50);

function context(opts: { wet?: boolean } = {}): CueContext {
  return { tileSize: 8, wet: () => opts.wet ?? false };
}

const sounds = (ev: SimEvent, ctx = context()) => cuesFor(ev, ctx).map((q) => q.sound);

describe('cuesFor', () => {
  it('gives every weapon a report at the muzzle', () => {
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      const cues = cuesFor({ type: 'fire', owner: 'player', weapon: id, x: 5, y: 6, angle: 0 }, context());
      expect(cues[0]).toMatchObject({ sound: WEAPON_SOUNDS[id].sound, x: 5, y: 6 });
    }
  });

  it('sounds a lock warning in the cab for enemy missiles only', () => {
    expect(sounds({ type: 'fire', owner: 'enemy', weapon: 'launcherMissiles', x: 0, y: 0, angle: 0 })).toEqual(['missile', 'missileWarning']);
    expect(sounds({ type: 'fire', owner: 'player', weapon: 'missileRack', x: 0, y: 0, angle: 0 })).toEqual(['missile']);
    expect(sounds({ type: 'fire', owner: 'enemy', weapon: 'lightTankGun', x: 0, y: 0, angle: 0 })).toEqual(['cannon']);
  });

  it('adds an airburst when point defense kills a round', () => {
    const ev = { type: 'intercept', weapon: 'pdGuns', x0: 0, y0: 0, x: 30, y: 0 } as const;
    expect(sounds({ ...ev, hit: false })).toEqual(['rotary']);
    expect(cuesFor({ ...ev, hit: true }, context())[1]).toMatchObject({ sound: 'airburst', x: 30 });
  });

  it('splashes in water, sizes blasts by radius, and clamps them', () => {
    expect(sounds({ type: 'explosion', x: 0, y: 0, radius: 18 }, context({ wet: true }))).toEqual(['splash']);
    expect(sounds({ type: 'explosion', x: 0, y: 0, radius: 14, plasma: true })).toEqual(['plasmaSplash']);
    const small = cuesFor({ type: 'explosion', x: 0, y: 0, radius: 10 }, context())[0]!;
    const big = cuesFor({ type: 'explosion', x: 0, y: 0, radius: 34 }, context())[0]!;
    expect(big.size).toBeGreaterThan(small.size);
    expect(cuesFor({ type: 'explosion', x: 0, y: 0, radius: 0 }, context())[0]!.size).toBeGreaterThan(0);
    expect(cuesFor({ type: 'explosion', x: 0, y: 0, radius: 900 }, context())[0]!.size).toBeLessThanOrEqual(1.5);
  });

  it('rings thin armor on flank and rear hits, louder from behind', () => {
    const flank = cuesFor({ type: 'facingHit', facing: 'flank', x: 3, y: 4 }, context())[0]!;
    const rear = cuesFor({ type: 'facingHit', facing: 'rear', x: 3, y: 4 }, context())[0]!;
    expect(flank).toMatchObject({ sound: 'pierce', x: 3, y: 4 });
    expect(rear.size).toBeGreaterThan(flank.size);
  });

  it('a bullet glances off front armor, and leaves flank and rear hits to the pierce', () => {
    expect(sounds({ type: 'impact', x: 0, y: 0 })).toEqual(['impact']);
    expect(sounds({ type: 'impact', x: 0, y: 0, armor: 'front' })).toEqual(['ricochet']);
    expect(sounds({ type: 'impact', x: 0, y: 0, armor: 'flank' })).toEqual([]);
    expect(sounds({ type: 'impact', x: 0, y: 0, armor: 'rear' })).toEqual([]);
  });

  it('makes no fireball for infantry, and crunches crushed vehicles', () => {
    expect(sounds({ type: 'enemyDestroyed', id: 1, enemy: 'infantry', x: 0, y: 0, cause: 'shot' })).toEqual([]);
    expect(sounds({ type: 'enemyDestroyed', id: 1, enemy: 'lightTank', x: 0, y: 0, cause: 'shot' })).toEqual(['vehicleKill']);
    expect(sounds({ type: 'enemyDestroyed', id: 1, enemy: 'lightTank', x: 0, y: 0, cause: 'crushed' })).toEqual(['crush', 'vehicleKill']);
  });

  it('hears trees, buildings, and rock giving way at the tile center', () => {
    const ev = { type: 'tileChanged', col: 2, row: 3, state: 'flattened', mat: 'building' } as const;
    expect(cuesFor({ ...ev, mat: 'forest' }, context())[0]).toMatchObject({ sound: 'wood', x: 20, y: 28 });
    expect(sounds(ev)).toEqual(['collapse']);
    expect(sounds({ ...ev, state: 'damaged' })).toEqual([]);
    expect(sounds({ ...ev, mat: 'ground' })).toEqual([]);
    // A bridge giving way under the hull: masonry or girders, then the splash.
    expect(sounds({ type: 'bridgeCollapse', x: 0, y: 0, tiles: 9 })).toEqual(['collapse', 'splash']);
  });

  it('plays harder rams louder and ignores trivial ones', () => {
    const size = (obstacle: 'light' | 'heavy' | 'trivial') => cuesFor({ type: 'collision', obstacle, x: 0, y: 0 }, context())[0]?.size ?? 0;
    expect(size('heavy')).toBeGreaterThan(size('light'));
    expect(size('trivial')).toBe(0);
  });

  it('keeps on-board sounds unplaced', () => {
    for (const ev of [{ type: 'componentDestroyed', component: 'reactor' }, { type: 'reloaded', slot: 'x' }, { type: 'wave', wave: 2, units: 5 }, { type: 'alert', wave: 1 }] as SimEvent[]) {
      const cue = cuesFor(ev, context())[0]!;
      expect(cue.x).toBeUndefined();
    }
  });
});

describe('place', () => {
  const listener = { x: 100, y: 50 };

  it('plays on-board and close sounds at full volume, centered', () => {
    expect(place(listener, {})).toEqual({ gain: 1, pan: 0, distance: 0 });
    expect(place(listener, { x: 100 + HEARING.near - 1, y: 50 }).gain).toBe(1);
  });

  it('falls off with distance', () => {
    const near = place(listener, { x: 200, y: 50 }).gain;
    const far = place(listener, { x: 600, y: 50 }).gain;
    expect(near).toBeLessThan(1);
    expect(far).toBeLessThan(near);
  });

  it('pans by screen side: sim +y is screen right', () => {
    expect(place(listener, { x: 100, y: 150 }).pan).toBeGreaterThan(0);
    expect(place(listener, { x: 100, y: -50 }).pan).toBeLessThan(0);
    expect(Math.abs(place(listener, { x: 100, y: 5000 }).pan)).toBeLessThanOrEqual(HEARING.maxPan);
    // Straight ahead (up the screen) is centered.
    expect(place(listener, { x: 400, y: 50 }).pan).toBe(0);
  });
});

describe('pitch and level variation', () => {
  it('shifts each play up or down within the spread, centered on the recipe pitch', () => {
    const semis = (f: number) => 12 * Math.log2(f);
    expect(pitchFactor('hullHit', 0.5)).toBe(1);
    expect(semis(pitchFactor('hullHit', 0))).toBeCloseTo(-PITCH_SPREAD.hullHit);
    expect(semis(pitchFactor('hullHit', 0.999999))).toBeCloseTo(PITCH_SPREAD.hullHit);
    expect(pitchFactor('cannon', 0.9)).toBeGreaterThan(1);
    expect(pitchFactor('cannon', 0.1)).toBeLessThan(1);
  });

  it('keeps cab alarms fixed so they stay recognizable', () => {
    for (const r of [0, 0.3, 0.99]) {
      expect(pitchFactor('alarm', r)).toBe(1);
      expect(levelFactor('alarm', r)).toBe(1);
      expect(pitchFactor('missileWarning', r)).toBe(1);
    }
  });

  it('varies weapon levels a little', () => {
    expect(levelFactor('cannon', 0)).toBeCloseTo(1 - LEVEL_SPREAD);
    expect(levelFactor('cannon', 0.5)).toBe(1);
  });
});

describe('CueLimiter', () => {
  const item = (sound: Cue['sound'], gain = 1, size = 1) => ({ cue: { sound, size } as Cue, at: { gain, pan: 0, distance: 0 } });

  it('drops a repeat within the gap, keeping the loudest', () => {
    const lim = new CueLimiter();
    const out = lim.filter([item('cannon', 0.3), item('cannon', 0.9)], 0);
    expect(out).toHaveLength(1);
    expect(out[0]!.at.gain).toBe(0.9);
    expect(lim.filter([item('cannon')], MIN_GAP.cannon / 2)).toHaveLength(0);
    expect(lim.filter([item('cannon')], MIN_GAP.cannon * 1.5)).toHaveLength(1);
  });

  it('lets holds through and drops what is too quiet to hear', () => {
    const lim = new CueLimiter();
    expect(lim.filter([item('beam'), item('beam')], 0)).toHaveLength(2);
    expect(lim.filter([item('impact', 0.01, 0.4)], 0)).toHaveLength(0);
  });
});

describe('AlarmWatch', () => {
  it('sounds once when a component goes critical', () => {
    const b = make();
    const watch = new AlarmWatch();
    const hit = (frac: number) => {
      damageComponent(b, 'treads', b.treads.max * frac, []);
      return watch.check(b, 'treads');
    };
    expect(hit(0.5)).toBeNull();
    expect(hit(0.4)).toMatchObject({ sound: 'alarm' });
    expect(hit(0.02)).toBeNull();
  });

  it('uses the urgent alarm for the reactor and ignores unknown parts', () => {
    const b = make();
    const watch = new AlarmWatch();
    damageComponent(b, 'reactor', b.reactor.max * 0.9, []);
    expect(watch.check(b, 'reactor')?.size).toBe(1);
    expect(watch.check(b, 'front')).toBeNull();
  });
});

describe('engineState and reactorState', () => {
  it('works harder on the throttle and stops when Immobilized', () => {
    const b = make();
    const surge = engineState(b, { throttle: 1 });
    const brake = engineState(b, { throttle: -1 });
    expect(surge.load).toBeGreaterThan(brake.load);
    expect(surge.speed).toBeCloseTo(b.vx / c.speed.top);
    b.immobilized = true;
    expect(engineState(b, { throttle: 1 })).toMatchObject({ running: false, load: 0 });
  });

  it('rises toward meltdown as the fuse burns down', () => {
    const b = make();
    expect(reactorState(b, null).meltdown).toBe(0);
    b.reactorFuse = 4;
    const early = reactorState(b, 5).meltdown;
    b.reactorFuse = 1;
    expect(reactorState(b, 5).meltdown).toBeGreaterThan(early);
    b.power.stored = 0;
    expect(reactorState(b, 5).charge).toBe(0);
  });
});
