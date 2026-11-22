import { describe, expect, it } from 'vitest';
import { ENEMIES, type EnemyId } from '../../src/content/enemies';
import { applyHit, damageComponent, IDLE_COMMAND } from '../../src/sim/behemoth';
import { devCondition, devExtract, devKillAll, devRearm, devRepair, devSpawn, devWave, setInvulnerable } from '../../src/sim/dev';
import { frameRight } from '../../src/sim/frame';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };

function world(): World {
  const w = createWorld(OPTS);
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  return w;
}

function run(w: World, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) stepWorld(w, IDLE_COMMAND);
}

describe('dev console: spawning', () => {
  it('spawns any mobile unit from each side', () => {
    const w = world();
    const sides = ['ahead', 'behind', 'left', 'right', 'near', 'auto'] as const;
    for (const side of sides) {
      const e = devSpawn(w, 'lightTank', side);
      expect(e, side).not.toBeNull();
      expect(w.enemies).toContain(e);
    }
  });

  it('puts "near" units on screen, ahead of the hull', () => {
    const w = world();
    const e = devSpawn(w, 'infantry', 'near')!;
    expect(e.x).toBeGreaterThan(w.behemoth.x);
    expect(e.x).toBeLessThan(frameRight(w.frame));
  });

  it('places every kind somewhere (fixed and objective units too)', () => {
    const w = world();
    for (const id of Object.keys(ENEMIES) as EnemyId[]) {
      // Burrowing and hedge units need their ground; "near" falls back to open ground.
      expect(devSpawn(w, id, 'near'), id).not.toBeNull();
      expect(devSpawn(w, id, 'auto'), id).not.toBeNull();
    }
    // And the battle runs on with them all in it.
    expect(() => run(w, 2)).not.toThrow();
  });
});

describe('dev console: the Behemoth', () => {
  it('repair restores every component, the armor, and gets an immobilized hull moving', () => {
    const w = world();
    const b = w.behemoth;
    damageComponent(b, 'sensors', 5, w.events);
    b.armor.frontLeft.hp = 0;
    damageComponent(b, 'treads', Infinity, w.events);
    run(w, 0.5);
    expect(b.immobilized).toBe(true);
    expect(w.lastStand).not.toBeNull();
    devRepair(w);
    expect(b.sensors.hp).toBe(b.sensors.max);
    expect(b.armor.frontLeft.hp).toBe(b.armor.frontLeft.max);
    expect(b.treads.hp).toBe(b.treads.max);
    expect(b.immobilized).toBe(false);
    expect(w.lastStand).toBeNull();
  });

  it('repair defuses a burning reactor', () => {
    const w = world();
    damageComponent(w.behemoth, 'reactor', Infinity, w.events);
    expect(w.behemoth.reactorFuse).not.toBeNull();
    devRepair(w);
    expect(w.behemoth.reactorFuse).toBeNull();
    run(w, 5);
    expect(w.behemoth.destroyed).toBe(false);
  });

  it('rearm refills ammo and the capacitor', () => {
    const w = world();
    const b = w.behemoth;
    const armed = b.hardpoints.filter((h) => h.ammo !== null);
    expect(armed.length).toBeGreaterThan(0);
    for (const h of armed) h.ammo = 0;
    b.power.stored = 0;
    devRearm(w);
    for (const h of armed) expect(h.ammo).toBe(h.weapon!.ammo);
    expect(b.power.stored).toBe(b.power.max);
  });

  it('an invulnerable hull takes hits without losing anything', () => {
    const w = world();
    const b = w.behemoth;
    setInvulnerable(w, true);
    applyHit(b, 'rear', 500, w.rng, w.events, b.x - 30, b.y);
    damageComponent(b, 'reactor', Infinity, w.events);
    expect(b.armor.rear.hp).toBe(b.armor.rear.max);
    expect(b.reactor.hp).toBe(b.reactor.max);
    setInvulnerable(w, false);
    applyHit(b, 'rear', 500, w.rng, w.events, b.x - 30, b.y);
    expect(b.armor.rear.hp).toBeLessThan(b.armor.rear.max);
  });
});

describe('dev console: the battle', () => {
  it('kill all clears the field and counts the kills', () => {
    const w = world();
    devSpawn(w, 'lightTank', 'near');
    devSpawn(w, 'infantry', 'near');
    expect(devKillAll(w)).toBe(2);
    run(w, 1 / 60);
    expect(w.enemies.filter((e) => e.alive)).toHaveLength(0);
    expect(w.stats.kills).toBe(2);
  });

  it('frozen enemies hold still', () => {
    const w = world();
    const e = devSpawn(w, 'lightTank', 'near')!;
    w.dev.frozen = true;
    const at = { x: e.x, y: e.y };
    run(w, 1);
    expect({ x: e.x, y: e.y }).toEqual(at);
  });

  it('sends the next alert wave straight away', () => {
    const w = createWorld(OPTS);
    devWave(w);
    run(w, 2 / 60);
    expect(w.encounter.alert.wave).toBe(1);
  });

  it('extract now wins the battle on the next step', () => {
    const w = world();
    devExtract(w);
    run(w, 2 / 60);
    expect(w.extractedAt).not.toBeNull();
  });

  it('switches the condition mid-battle; a storm squalls soon after', () => {
    const w = world();
    run(w, 30);
    devCondition(w, 'storm');
    expect(w.condition?.id).toBe('storm');
    expect(w.condition!.gust!.start).toBeGreaterThan(w.time);
    expect(w.condition!.gust!.start).toBeLessThan(w.time + 6);
    devCondition(w, null);
    expect(w.condition).toBeNull();
  });
});
