import { describe, expect, it } from 'vitest';
import { WEAPONS, type InterceptSpec, type ShellSpec } from '../../src/content/weapons';
import { IDLE_COMMAND, reactorOutput, type PlayerCommand } from '../../src/sim/behemoth';
import { spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import { spawnProjectile } from '../../src/sim/weapons';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 480, fieldRows: 16 };

function world(): World {
  const w = createWorld(OPTS);
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  return w;
}

function steps(w: World, n: number, cmd: Partial<PlayerCommand> = {}) {
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y, ...cmd });
}

/** A target that holds still and never shoots back. */
function dummy(w: World, x: number, y: number, hp = 1000): Enemy {
  const e = spawnEnemy(w, 'lightTank', x, y);
  e.def = { ...e.def, maxSpeed: 0, accel: 0, fireRange: 0, hp };
  e.hp = hp;
  e.vx = 0;
  // Broadside to the Behemoth, so its fire lands on a flank (facing armor ×1).
  e.heading = Math.PI / 2;
  return e;
}

const hp = (w: World, slot: string) => w.behemoth.hardpoints.find((h) => h.slot.id === slot)!;
const fired = (w: World, slot: string) => w.events.filter((e) => e.type === 'fire' && e.slot === slot).length;

describe('power', () => {
  it('the reactor refills the capacitor; reactor damage lowers output', () => {
    const w = world();
    const b = w.behemoth;
    const full = reactorOutput(b);
    b.power.stored = 0;
    steps(w, 60);
    expect(b.power.stored).toBeCloseTo(full, 0);
    b.reactor.hp = b.reactor.max * 0.3;
    expect(reactorOutput(b)).toBeCloseTo(full * 0.51);
  });

  it('an energy weapon stops when the capacitor runs dry', () => {
    const w = world();
    const b = w.behemoth;
    b.autoEnabled[1] = true; // PD laser
    b.reactor.hp = 1e-9; // nearly no output
    b.power.stored = (WEAPONS.pdLaser.power ?? 0) * 2;
    for (let i = 0; i < 20; i++) {
      spawnProjectile(w, 'enemy', WEAPONS.lightTankGun, b.x + 60, b.y - 40 - i * 3, Math.atan2(40, -60));
    }
    steps(w, 60);
    expect(w.events.filter((e) => e.type === 'intercept')).toHaveLength(2);
  });
});

describe('secondary (autocannon)', () => {
  it('fires bullets at the cursor while RMB is held', () => {
    const w = world();
    const b = w.behemoth;
    const e = dummy(w, b.x + 120, b.y, 12);
    steps(w, 90, { fireSecondary: true, aimX: e.x, aimY: e.y });
    expect(fired(w, 'prow')).toBeGreaterThan(3);
    expect(e.alive).toBe(false);
  });

  it("won't fire outside the prow's forward arc", () => {
    const w = world();
    const b = w.behemoth;
    steps(w, 90, { fireSecondary: true, aimX: b.x - 150, aimY: b.y });
    expect(fired(w, 'prow')).toBe(0);
  });
});

describe('missiles', () => {
  it('a salvo locks on, homes in, kills the target, and spends ammo', () => {
    const w = world();
    const b = w.behemoth;
    const e = dummy(w, b.x + 150, b.y + 70, 80);
    const rack = hp(w, 'spine');
    const ammo = rack.ammo!;
    steps(w, 1, { fireMissile: true, aimX: e.x + 20, aimY: e.y - 10 });
    steps(w, 180);
    expect(fired(w, 'spine')).toBe(WEAPONS.missileRack.salvo!.count);
    // Ammo counts shots: the whole salvo is one.
    expect(rack.ammo).toBe(ammo - 1);
    expect(e.alive).toBe(false);
  });

  it('with nothing to lock on to, the salvo bursts at the aim point', () => {
    const w = world();
    const b = w.behemoth;
    const ax = b.x + 160;
    const ay = b.y - 60;
    steps(w, 1, { fireMissile: true, aimX: ax, aimY: ay });
    const booms: { x: number; y: number }[] = [];
    for (let i = 0; i < 180; i++) {
      steps(w, 1);
      for (const ev of w.events) if (ev.type === 'explosion') booms.push(ev);
      w.events.length = 0;
    }
    expect(booms.length).toBe(WEAPONS.missileRack.salvo!.count);
    for (const p of booms) expect(Math.hypot(p.x - ax, p.y - ay)).toBeLessThan(12);
  });

  it('stops when the rack is empty', () => {
    const w = world();
    hp(w, 'spine').ammo = 0;
    steps(w, 30, { fireMissile: true });
    expect(fired(w, 'spine')).toBe(0);
  });
});

describe('auto weapons', () => {
  it('AP guns engage a nearby enemy on their side; toggling the group off stops them', () => {
    const w = world();
    const b = w.behemoth;
    b.autoEnabled[0] = true;
    dummy(w, b.x - 10, b.y - 50);
    steps(w, 60);
    expect(fired(w, 'flankL')).toBeGreaterThan(3);
    expect(fired(w, 'flankR')).toBe(0);

    w.events.length = 0;
    steps(w, 1, { toggleAuto: 1 });
    steps(w, 60);
    expect(b.autoEnabled[0]).toBe(false);
    expect(fired(w, 'flankL')).toBe(0);
  });

  it('AP guns ignore enemies beyond their reach', () => {
    const w = world();
    w.behemoth.autoEnabled[0] = true;
    dummy(w, w.behemoth.x + 200, w.behemoth.y);
    steps(w, 60);
    expect(fired(w, 'flankL') + fired(w, 'flankR')).toBe(0);
  });

  it('point defense shoots down incoming shells and spends power', () => {
    const w = world();
    const b = w.behemoth;
    b.autoEnabled[1] = true;
    const pd = hp(w, 'pd');
    pd.weapon = { ...WEAPONS.pdLaser, projectile: { ...(WEAPONS.pdLaser.projectile as InterceptSpec), chance: { shell: 1, missile: 1 } } };
    const slow = { ...WEAPONS.lightTankGun, projectile: { ...(WEAPONS.lightTankGun.projectile as ShellSpec), speed: 60, spread: 0 } };
    const shell = spawnProjectile(w, 'enemy', slow, b.x + 150, b.y, Math.PI);
    b.power.stored = 30;
    steps(w, 120);
    expect(shell.alive).toBe(false);
    expect(w.events.some((e) => e.type === 'intercept' && e.hit)).toBe(true);
    expect(b.armor.frontLeft.hp).toBe(b.armor.frontLeft.max);
    expect(b.armor.frontRight.hp).toBe(b.armor.frontRight.max);
    // Two seconds of regen, minus at least one shot.
    expect(b.power.stored).toBeCloseTo(30 + reactorOutput(b) * 2 - WEAPONS.pdLaser.power! * w.events.filter((e) => e.type === 'intercept').length, 3);
  });
});

describe('lobbed shells (indirect fire)', () => {
  it('a lobbed shell flies over a unit in its path and bursts at the aim distance', () => {
    const w = world();
    const b = w.behemoth;
    const near = dummy(w, b.x + 60, b.y);
    const far = dummy(w, b.x + 200, b.y);
    const p = spawnProjectile(w, 'player', WEAPONS.siegeHowitzer, b.x + 20, b.y, 0, { fuse: 180 });
    steps(w, 120);
    expect(p.alive).toBe(false);
    expect(near.hp).toBe(1000);
    expect(far.hp).toBeLessThan(1000);
  });

  it('an auto mortar shells a unit behind cover and bursts on it, not at max range', () => {
    const w = world();
    const b = w.behemoth;
    // Swap the spine's missile rack for a mortar.
    const spine = hp(w, 'spine');
    spine.weapon = WEAPONS.mortar;
    spine.ammo = WEAPONS.mortar.ammo!;
    spine.binding = 'auto';
    b.autoEnabled[2] = true;
    const e = dummy(w, b.x + 150, b.y);
    // A building between them would block direct fire.
    const t = w.terrain;
    const col = Math.floor((b.x + 100) / t.tileSize);
    const row = Math.floor(b.y / t.tileSize);
    const tile = t.tile(col, row)!;
    tile.mat = 'building';
    tile.state = 'intact';
    tile.hp = 1e9;
    steps(w, 240, { aimX: b.x + 150, aimY: b.y });
    expect(fired(w, 'spine')).toBeGreaterThan(0);
    expect(e.hp).toBeLessThan(1000);
    expect(spine.ammo).toBeLessThan(WEAPONS.mortar.ammo!);
  });
});
