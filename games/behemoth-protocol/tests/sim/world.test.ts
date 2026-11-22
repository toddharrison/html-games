import { describe, expect, it } from 'vitest';
import { MATERIALS, type MaterialId } from '../../src/content/terrain';
import { IDLE_COMMAND, damageComponent, footprint, speedLimits, type PlayerCommand } from '../../src/sim/behemoth';
import { spawnEnemy } from '../../src/sim/enemies';
import { spawnProjectile } from '../../src/sim/weapons';
import { createWorld, stepWorld, type World } from '../../src/sim/world';
import { WEAPONS, type ShellSpec } from '../../src/content/weapons';

const OPTS = { seed: 1, frameWidth: 480, fieldRows: 16 };

function setTile(w: World, col: number, row: number, mat: MaterialId) {
  const t = w.terrain.tile(col, row)!;
  t.mat = mat;
  t.state = 'intact';
  t.hp = MATERIALS[mat].maxHp;
}

/** No defenders or alert waves to interfere. */
function quiet(w: World) {
  w.encounter.off = true;
  return w;
}

function steps(w: World, n: number, cmd: Partial<PlayerCommand> = {}) {
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y, ...cmd });
}

describe('world determinism', () => {
  function script(seed: number) {
    const w = createWorld({ ...OPTS, seed });
    for (let i = 0; i < 3600; i++) {
      const phase = Math.floor(i / 240) % 4;
      stepWorld(w, {
        throttle: phase === 1 ? 1 : phase === 3 ? -1 : 0,
        steer: phase === 0 ? 1 : phase === 2 ? -1 : 0,
        aimX: w.behemoth.x + 150,
        aimY: w.behemoth.y + Math.sin(i / 50) * 80,
        fireMain: i % 90 < 5,
        fireSecondary: i % 200 < 30,
        fireMissile: i % 600 === 300,
        toggleAuto: i === 1000 ? 1 : null,
        selfDestruct: false,
        jettison: false,
      });
    }
    const b = w.behemoth;
    return JSON.stringify({ x: b.x, y: b.y, vx: b.vx, t: b.treads.hp, a: b.armor, k: w.stats, e: w.enemies.map((e) => [e.x, e.y, e.hp]), r: w.rng.state });
  }

  it('same seed + same inputs = identical battle', () => {
    expect(script(5)).toBe(script(5));
  });

  it('a different seed gives a different battle', () => {
    expect(script(5)).not.toBe(script(6));
  });
});

describe('collisions', () => {
  it('plowing through a building dips speed, damages front armor and treads, and flattens it', () => {
    const w = quiet(createWorld(OPTS));
    const b = w.behemoth;
    const fp = footprint(b);
    const col = Math.floor(fp.x1 / 16) + 1;
    const row = Math.floor(b.y / 16);
    setTile(w, col, row, 'building');
    const v0 = b.vx;
    let minV = v0;
    for (let i = 0; i < 60; i++) {
      steps(w, 1);
      minV = Math.min(minV, b.vx);
    }
    expect(w.terrain.tile(col, row)!.state).toBe('flattened');
    expect(minV).toBeLessThan(v0 * 0.85);
    expect(b.armor.frontLeft.hp + b.armor.frontRight.hp).toBeLessThan(b.armor.frontLeft.max + b.armor.frontRight.max);
    expect(b.treads.hp).toBeLessThan(b.treads.max);
    // The dip is brief: it recovers to its (now tread-scaled) cruise.
    steps(w, 600);
    expect(b.vx).toBeCloseTo(speedLimits(b).cruise, 3);
    expect(speedLimits(b).cruise).toBeLessThan(b.chassis.speed.cruise);
  });

  it('crushing forest costs no speed', () => {
    const w = quiet(createWorld(OPTS));
    const b = w.behemoth;
    const col = Math.floor(footprint(b).x1 / 16) + 1;
    const row = Math.floor(b.y / 16);
    setTile(w, col, row, 'forest');
    let minV = b.vx;
    for (let i = 0; i < 60; i++) {
      steps(w, 1);
      minV = Math.min(minV, b.vx);
    }
    expect(w.terrain.tile(col, row)!.state).toBe('flattened');
    // No dip, only negligible tread wear.
    expect(minV).toBeGreaterThan(b.chassis.speed.cruise * 0.995);
  });

  it('drives over light tanks and crushes them', () => {
    const w = quiet(createWorld(OPTS));
    const b = w.behemoth;
    const e = spawnEnemy(w, 'lightTank', b.x + 10, b.y);
    steps(w, 1);
    expect(e.alive).toBe(false);
    expect(w.stats.kills).toBe(1);
    expect(w.events.some((ev) => ev.type === 'enemyDestroyed' && ev.cause === 'crushed')).toBe(true);
  });
});

describe('combat', () => {
  it('main gun fires, reloads, and the shell bursts at the aim point', () => {
    const w = quiet(createWorld(OPTS));
    const b = w.behemoth;
    // Let the turret settle on a target dead ahead.
    steps(w, 30);
    steps(w, 1, { fireMain: true, aimX: b.x + 150, aimY: b.y });
    expect(w.projectiles).toHaveLength(1);
    steps(w, 1, { fireMain: true, aimX: b.x + 150, aimY: b.y });
    expect(w.projectiles).toHaveLength(1); // still reloading
    w.events.length = 0;
    steps(w, 60);
    const boom = w.events.find((e) => e.type === 'explosion');
    expect(boom).toBeDefined();
    expect(w.projectiles).toHaveLength(0);
  });

  it('a shell kills a light tank it hits', () => {
    const w = quiet(createWorld(OPTS));
    const b = w.behemoth;
    steps(w, 30);
    const e = spawnEnemy(w, 'lightTank', b.x + 120, b.y);
    e.def = { ...e.def, maxSpeed: 0, accel: 0 }; // hold still
    steps(w, 1, { fireMain: true, aimX: e.x, aimY: e.y });
    steps(w, 60);
    expect(e.alive).toBe(false);
  });

  it('shells clear forest at the aim point', () => {
    const w = quiet(createWorld(OPTS));
    const b = w.behemoth;
    const col = Math.floor((b.x + 140) / 16);
    const row = Math.floor(b.y / 16);
    setTile(w, col, row, 'forest');
    steps(w, 30);
    steps(w, 1, { fireMain: true, aimX: (col + 0.5) * 16, aimY: (row + 0.5) * 16 });
    steps(w, 60);
    expect(w.terrain.tile(col, row)!.state).toBe('destroyed');
  });

  it('enemy shells damage the armor arc facing the shooter', () => {
    const w = quiet(createWorld(OPTS));
    const b = w.behemoth;
    b.autoEnabled.fill(false); // keep point defense out of it
    // Shot coming from above (-y), moving +y: strikes the left arc.
    spawnProjectile(w, 'enemy', { ...WEAPONS.lightTankGun, projectile: { ...(WEAPONS.lightTankGun.projectile as ShellSpec), spread: 0 } }, b.x, b.y - 60, Math.PI / 2, { fuse: 200 });
    steps(w, 30);
    expect(b.armor.left.hp).toBeLessThan(b.armor.left.max);
    expect(b.armor.frontLeft.hp).toBe(b.armor.frontLeft.max);
    expect(b.armor.frontRight.hp).toBe(b.armor.frontRight.max);
  });

  it('an enemy shell from straight ahead lands on the front half on its side of the centerline', () => {
    const shoot = (dy: number) => {
      const w = quiet(createWorld(OPTS));
      const b = w.behemoth;
      b.autoEnabled.fill(false);
      const spec = { ...WEAPONS.lightTankGun, projectile: { ...(WEAPONS.lightTankGun.projectile as ShellSpec), spread: 0 } };
      spawnProjectile(w, 'enemy', spec, b.x + 80, b.y + dy, Math.PI, { fuse: 200 });
      steps(w, 30);
      return { left: b.armor.frontLeft.max - b.armor.frontLeft.hp, right: b.armor.frontRight.max - b.armor.frontRight.hp };
    };
    expect(shoot(8)).toMatchObject({ left: 0 });
    expect(shoot(8).right).toBeGreaterThan(0);
    expect(shoot(-8)).toMatchObject({ right: 0 });
    expect(shoot(-8).left).toBeGreaterThan(0);
  });

  it('light tanks spawn, approach, and open fire', () => {
    const w = createWorld(OPTS);
    steps(w, 60 * 20);
    expect(w.stats.kills + w.enemies.length).toBeGreaterThan(0);
    const b = w.behemoth;
    const damaged = Object.values(b.armor).some((a) => a.hp < a.max);
    expect(damaged).toBe(true);
  });
});

describe('reactor detonation', () => {
  it('the fuse burns down, then the blast vaporizes nearby units and levels terrain', () => {
    const w = quiet(createWorld(OPTS));
    const b = w.behemoth;
    const near = spawnEnemy(w, 'lightTank', b.x + 20, b.y - 60);
    const far = spawnEnemy(w, 'lightTank', b.x + 400, b.y);
    for (const e of [near, far]) e.def = { ...e.def, maxSpeed: 0, accel: 0, fireRange: 0 };
    // Off to the side, so the coasting Behemoth doesn't flatten it first.
    const col = Math.floor((b.x + 30) / 16);
    const row = Math.floor(b.y / 16) - 4;
    setTile(w, col, row, 'building');

    damageComponent(b, 'reactor', 1e6, w.events);
    steps(w, Math.round((b.chassis.reactor.fuse - 0.2) * 60));
    expect(b.destroyed).toBe(false);
    expect(near.alive).toBe(true);
    steps(w, 30);

    expect(b.destroyed).toBe(true);
    expect(near.alive).toBe(false);
    expect(far.alive).toBe(true);
    expect(w.stats.blastKills).toBe(1);
    expect(w.stats.kills).toBe(1);
    expect(w.terrain.tile(col, row)!.state).toBe('destroyed');
    const det = w.events.find((e) => e.type === 'detonation');
    expect(det?.type === 'detonation' && det.kills).toBe(1);
  });

  it('after the blast the battle winds down: no movement, no spawns, no hits', () => {
    const w = createWorld(OPTS);
    const b = w.behemoth;
    damageComponent(b, 'reactor', 1e6, w.events);
    steps(w, 60 * 3);
    const x = b.x;
    const count = w.enemies.length;
    steps(w, 60 * 20, { fireMain: true, throttle: 1 });
    expect(b.x).toBe(x);
    expect(w.enemies.length).toBeLessThanOrEqual(count);
    expect(w.projectiles.every((p) => p.owner === 'enemy')).toBe(true);
  });

  it('holding self-destruct while Immobilized detonates', () => {
    const w = quiet(createWorld(OPTS));
    const b = w.behemoth;
    damageComponent(b, 'treads', 1e6, w.events);
    steps(w, 60 * 4, { selfDestruct: true });
    expect(b.destroyed).toBe(true);
  });
});
