import { describe, expect, it } from 'vitest';
import { ENEMIES, type EnemyId } from '../../src/content/enemies';
import { WEAPONS, type BulletSpec } from '../../src/content/weapons';
import { IDLE_COMMAND } from '../../src/sim/behemoth';
import { hitFacing, spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import { angleDiff } from '../../src/sim/math';
import { damageEnemy, damageMultiplier, shotSpec } from '../../src/sim/projectiles';
import { spawnProjectile } from '../../src/sim/weapons';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

/** Facing armor on enemy vehicles (SPEC §7): front, flank, and rear multipliers. */

const OPTS = { seed: 1, frameWidth: 480, fieldRows: 16 };

function world(): World {
  const w = createWorld(OPTS);
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  return w;
}

function steps(w: World, n: number) {
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y });
}

/** A unit that holds still with its hull pointing along `heading`, and never shoots. */
function parked(w: World, id: EnemyId, x: number, y: number, heading: number): Enemy {
  const e = spawnEnemy(w, id, x, y);
  e.def = { ...e.def, maxSpeed: 0, accel: 0, fireRange: 0, hp: 1000 };
  e.hp = 1000;
  e.vx = 0;
  e.heading = heading;
  return e;
}

/** A straight, spread-free autocannon round fired from 20 units away, traveling along `angle`. */
function shoot(w: World, e: Enemy, angle: number): void {
  const spec = { ...(WEAPONS.autocannon.projectile as BulletSpec), spread: 0, range: 400 };
  const gun = { ...WEAPONS.autocannon, projectile: spec };
  spawnProjectile(w, 'player', gun, e.x - Math.cos(angle) * 20, e.y - Math.sin(angle) * 20, angle);
}

const facingHits = (w: World) => w.events.filter((ev) => ev.type === 'facingHit');

describe('hit facing', () => {
  it('reads the side struck from the way the round travels, against the hull heading', () => {
    const w = world();
    const e = parked(w, 'lightTank', 0, 0, 0);
    expect(hitFacing(e, -1, 0)).toBe('front'); // flying back down its nose
    expect(hitFacing(e, -1, 0.9)).toBe('front'); // within 45°
    expect(hitFacing(e, 1, 0)).toBe('rear');
    expect(hitFacing(e, 0, 1)).toBe('flank');
    expect(hitFacing(e, 0.5, -1)).toBe('flank');
    e.heading = Math.PI / 2;
    expect(hitFacing(e, 0, -1)).toBe('front');
    expect(hitFacing(e, -1, 0)).toBe('flank');
  });
});

describe('facing armor', () => {
  it('a vehicle takes less from the front and more from behind', () => {
    const w = world();
    const b = w.behemoth;
    // Three tanks pointing at +x, each shot from a different side.
    const front = parked(w, 'lightTank', b.x + 120, b.y - 70, 0);
    const flank = parked(w, 'lightTank', b.x + 120, b.y, 0);
    const rear = parked(w, 'lightTank', b.x + 120, b.y + 70, 0);
    shoot(w, front, Math.PI);
    shoot(w, flank, Math.PI / 2);
    shoot(w, rear, 0);
    steps(w, 20);
    const base = shotSpec(WEAPONS.autocannon).damage * damageMultiplier(shotSpec(WEAPONS.autocannon), 'light');
    const armor = ENEMIES.lightTank.facing!;
    expect(1000 - front.hp).toBeCloseTo(base * armor.front, 5);
    expect(1000 - flank.hp).toBeCloseTo(base * armor.flank, 5);
    expect(1000 - rear.hp).toBeCloseTo(base * armor.rear, 5);
    expect(armor.front).toBeLessThan(1);
    expect(armor.rear).toBeGreaterThan(1);
  });

  it('a flank or rear hit throws its own spark; a front hit does not', () => {
    const w = world();
    const b = w.behemoth;
    const e = parked(w, 'heavyTank', b.x + 120, b.y, 0);
    shoot(w, e, Math.PI);
    steps(w, 20);
    expect(facingHits(w)).toHaveLength(0);
    shoot(w, e, 0);
    steps(w, 20);
    expect(facingHits(w).map((ev) => ev.type === 'facingHit' && ev.facing)).toEqual(['rear']);
    // The bullet's impact names the face it struck (the audio's glance or pierce).
    expect(w.events.filter((ev) => ev.type === 'impact').map((ev) => ev.type === 'impact' && ev.armor)).toEqual(['front', 'rear']);
  });

  it('splash counts as a flank hit, and a top hit (lobbed shell) as a rear hit', () => {
    const w = world();
    const e = parked(w, 'heavyTank', 0, 0, 0);
    const spec = shotSpec(WEAPONS.heavyCannon);
    const k = damageMultiplier(spec, 'heavy');
    damageEnemy(w, e, spec, 10, 'splash');
    expect(1000 - e.hp).toBeCloseTo(10 * k * ENEMIES.heavyTank.facing!.flank, 5);
    e.hp = 1000;
    damageEnemy(w, e, spec, 10, 'top');
    expect(1000 - e.hp).toBeCloseTo(10 * k * ENEMIES.heavyTank.facing!.rear, 5);
    expect(facingHits(w)).toHaveLength(0);
  });

  it('infantry have no facing', () => {
    const w = world();
    const e = parked(w, 'infantry', 0, 0, 0);
    expect(ENEMIES.infantry.facing).toBeUndefined();
    const spec = shotSpec(WEAPONS.autocannon);
    const k = damageMultiplier(spec, 'infantry');
    damageEnemy(w, e, spec, 4, { dx: 1, dy: 0, x: 0, y: 0 });
    expect(1000 - e.hp).toBeCloseTo(4 * k * (1 - 0), 5);
    expect(facingHits(w)).toHaveLength(0);
  });
});

describe('hull heading', () => {
  it('a heavy tank falling back ahead of the Behemoth backs up, front toward it', () => {
    const w = world();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'heavyTank', b.x + 90, b.y);
    e.def = { ...e.def, fireRange: 0 };
    let backing = 0;
    for (let i = 0; i < 60 * 6; i++) {
      steps(w, 1);
      if (e.vx > 4 && e.x > b.x) {
        backing++;
        // Fire from the Behemoth lands on its front.
        expect(Math.abs(angleDiff(e.heading, Math.atan2(b.y - e.y, b.x - e.x)))).toBeLessThan(Math.PI / 3);
      }
    }
    expect(backing).toBeGreaterThan(60);
    expect(e.reversing).toBe(true);
  });

  it('a tank closing on the Behemoth from behind drives nose first', () => {
    const w = world();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'lightTank', b.x - 200, b.y + 40);
    e.def = { ...e.def, fireRange: 0 };
    steps(w, 60);
    expect(e.vx).toBeGreaterThan(4);
    expect(e.reversing).toBe(false);
    expect(Math.abs(angleDiff(e.heading, Math.atan2(e.vy, e.vx)))).toBeLessThan(0.3);
  });

  it('a vehicle retreating faster than it can back up turns tail', () => {
    const w = world();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'lightTank', b.x + 100, b.y);
    e.def = { ...e.def, fireRange: 0, behavior: 'holdAhead', engage: { ...e.def.engage, minRange: 300, maxRange: 300, arc: 0 } };
    e.ai.orbitAngle = 0;
    e.ai.orbitRange = 300;
    steps(w, 90);
    expect(Math.hypot(e.vx, e.vy)).toBeGreaterThan(e.def.reverseSpeed);
    expect(e.reversing).toBe(false);
    // Running straight away: its rear is toward the Behemoth.
    expect(hitFacing(e, e.x - b.x, e.y - b.y)).toBe('rear');
  });

  it('the hull swings at a limited rate instead of snapping round', () => {
    const w = world();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'lightTank', b.x - 200, b.y + 40);
    e.heading = Math.PI; // pointing the wrong way
    steps(w, 1);
    expect(Math.abs(angleDiff(e.heading, Math.PI))).toBeLessThan(0.1);
  });
});
