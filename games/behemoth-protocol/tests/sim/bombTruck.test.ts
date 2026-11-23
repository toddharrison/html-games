import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../../src/content/chassis';
import { DOCTRINES, DOCTRINE_IDS } from '../../src/content/doctrines';
import { ENEMIES } from '../../src/content/enemies';
import { BOMB } from '../../src/content/tuning';
import { WEAPONS } from '../../src/content/weapons';
import { addonOf, damageComponent, IDLE_COMMAND, type ArmorArc } from '../../src/sim/behemoth';
import { spawnEnemy } from '../../src/sim/enemies';
import { encounterMix } from '../../src/sim/encounter';
import type { Enemy } from '../../src/sim/entities';
import type { SimEvent } from '../../src/sim/events';
import { damageEnemy, roundSpec } from '../../src/sim/projectiles';
import { newRun } from '../../src/sim/run';
import { mobileMix } from '../../src/sim/spawner';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };
const DEF = ENEMIES.bombTruck;

function world(addons: Parameters<typeof newRun>[2] = []): World {
  const w = createWorld({ ...OPTS, behemoth: newRun(1, 'class2', addons).behemoth });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  for (let c = 0; c < 120; c++) {
    for (let r = 0; r < w.terrain.rows; r++) {
      const t = w.terrain.tile(c, r);
      if (t) Object.assign(t, { mat: 'ground', state: 'intact', hp: 0 });
    }
  }
  return w;
}

function steps(w: World, n: number, log: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < n; i++) {
    stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y });
    log.push(...w.events);
    w.events.length = 0;
  }
  return log;
}

/** Steps until the truck is gone (or `n` steps), returning the events. */
function untilGone(w: World, e: Enemy, n = 60 * 8): SimEvent[] {
  const log: SimEvent[] = [];
  for (let i = 0; i < n && e.alive; i++) steps(w, 1, log);
  return log;
}

const armor = (w: World, a: ArmorArc) => w.behemoth.armor[a].hp;
const arcs = (w: World) => Object.fromEntries((Object.keys(w.behemoth.armor) as ArmorArc[]).map((a) => [a, armor(w, a)])) as Record<ArmorArc, number>;
/** A round from the Behemoth's autocannon, for shooting a truck from the test. */
const SHOT = roundSpec(WEAPONS.autocannon);

describe('bomb truck', () => {
  it('is industrial’s own unit: unarmed, fast, coming from ahead or the sides, never from behind', () => {
    expect(DEF.biome).toBe('industrial');
    expect(DEF.weapon).toBeNull();
    expect(DEF.behavior.kind).toBe('charge');
    expect(DEF.spawn).toBe('ahead');
    expect(DEF.callout?.per).toBe('run');
    expect(DEF.bomb).toBeDefined();
    // Faster than the Behemoth's cruise: it runs it down. The armored fist fields the most.
    expect(DEF.maxSpeed).toBeGreaterThan(CHASSIS.class2.speed.cruise);
    const most = Math.max(...DOCTRINE_IDS.map((d) => DOCTRINES[d].mix.bombTruck ?? 0));
    expect(DOCTRINES.armoredFist.mix.bombTruck).toBe(most);
    expect(encounterMix('armoredFist', 'industrial', null).bombTruck).toBeGreaterThan(0);
    for (const biome of ['temperate', 'arctic', 'desert', 'wasteland'] as const) expect(encounterMix('armoredFist', biome, null).bombTruck).toBeUndefined();
    // The last stand can bring one (it drives in like any vehicle).
    expect(mobileMix(DOCTRINES.armoredFist.mix).bombTruck).toBeGreaterThan(0);
  });

  it('starts its run (and its alarm) once it’s in the frame, then rams the hull and goes up', () => {
    const w = world();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'bombTruck', b.x + 170, b.y - 50);
    const before = arcs(w);
    const treads = b.treads.hp;
    const log = untilGone(w, e);
    expect(log.some((ev) => ev.type === 'charge')).toBe(true);
    expect(log.some((ev) => ev.type === 'explosion')).toBe(true);
    expect(e.alive).toBe(false);
    // One arc took half the bomb (through the armor it may reach a component, so at least most of it).
    const lost = (Object.keys(before) as ArmorArc[]).map((a) => before[a] - armor(w, a));
    expect(Math.max(...lost)).toBeGreaterThan(DEF.bomb!.damage * BOMB.contact * 0.9);
    expect(treads - b.treads.hp).toBeGreaterThanOrEqual(DEF.bomb!.damage * BOMB.treads - 0.01);
  });

  it('meets a ram plow first, head on', () => {
    const bare = world();
    const plowed = world(['ramPlow']);
    for (const w of [bare, plowed]) {
      const b = w.behemoth;
      untilGone(w, spawnEnemy(w, 'bombTruck', b.x + 120, b.y));
    }
    const front = (w: World) => armor(w, 'frontLeft') + armor(w, 'frontRight');
    expect(front(plowed)).toBeGreaterThan(front(bare));
    const plow = addonOf(plowed.behemoth, 'ramPlow')!.integrity!;
    expect(plow.hp).toBeLessThan(plow.max);
  });

  it('shot well short of the hull, it takes its own escorts with it and leaves the hull alone', () => {
    const w = world();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'bombTruck', b.x + 220, b.y);
    const escort = spawnEnemy(w, 'lightTank', b.x + 240, b.y + 10);
    const before = arcs(w);
    damageEnemy(w, e, SHOT, 100, 'splash');
    const log = steps(w, 2);
    expect(e.alive).toBe(false);
    expect(escort.alive).toBe(false);
    expect(log.some((ev) => ev.type === 'enemyDestroyed' && ev.enemy === 'lightTank' && ev.cause === 'hazard')).toBe(true);
    expect(arcs(w)).toEqual(before);
  });

  it('sets off a fuel tank it’s passing', () => {
    const w = world();
    const b = w.behemoth;
    const ts = w.terrain.tileSize;
    const e = spawnEnemy(w, 'bombTruck', b.x + 220, b.y - 40);
    const tank = w.terrain.tileAt(e.x + ts, e.y)!;
    Object.assign(tank, { mat: 'fuelTank', state: 'intact', hp: 25 });
    damageEnemy(w, e, SHOT, 100, 'splash');
    const log = steps(w, 30);
    // It went up and left a crater.
    expect(tank.mat).toBe('crater');
    // Two blasts: the bomb, then the tank after its fuse.
    expect(log.filter((ev) => ev.type === 'explosion').length).toBeGreaterThanOrEqual(2);
  });

  it('enemy fire never sets it off', () => {
    const w = world();
    const e = spawnEnemy(w, 'bombTruck', w.behemoth.x + 220, w.behemoth.y);
    damageEnemy(w, e, roundSpec(WEAPONS.batteryShells), 100, 'top', 'friendly');
    expect(e.alive).toBe(true);
    expect(e.hp).toBe(DEF.hp);
  });

  it('keeps charging in the last stand and goes up against the stopped hull', () => {
    const w = world();
    steps(w, 60);
    damageComponent(w.behemoth, 'treads', 1e6, w.events);
    w.events.length = 0;
    steps(w, 60 * 3);
    expect(w.lastStand).not.toBeNull();
    w.lastStand!.nextWave = 1e9;
    const b = w.behemoth;
    const e = spawnEnemy(w, 'bombTruck', b.x + 120, b.y + 30);
    const log = untilGone(w, e);
    expect(e.alive).toBe(false);
    expect(log.some((ev) => ev.type === 'explosion')).toBe(true);
  });
});
