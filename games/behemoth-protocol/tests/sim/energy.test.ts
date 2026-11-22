import { POOL } from '../../src/content/tuning';
import { describe, expect, it } from 'vitest';
import { DEPOT_WEAPONS } from '../../src/content/depot';
import { WEAPONS, type ShellSpec, type WeaponId } from '../../src/content/weapons';
import { defaultBindingFor, IDLE_COMMAND, type PlayerCommand } from '../../src/sim/behemoth';
import { spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import { SIM_DT } from '../../src/sim/loop';
import { spawnPool } from '../../src/sim/pools';
import { newRun } from '../../src/sim/run';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

/** A quiet battle (no spawns, autos off) on bare ground, with these weapons fitted. */
function battle(fit: Record<string, WeaponId> = {}, bays?: Parameters<typeof newRun>[4]): World {
  const run = bays ? newRun(1, 'class2', ['trailer'], {}, bays) : newRun(1);
  const w = createWorld({ seed: 1, frameWidth: 480, fieldRows: 16, behemoth: run.behemoth });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  for (let c = 0; c < 80; c++) {
    for (let r = 0; r < 16; r++) {
      const t = w.terrain.tile(c, r);
      if (t) Object.assign(t, { mat: 'ground', state: 'intact', hp: 0 });
    }
  }
  for (const [slot, id] of Object.entries(fit)) {
    const h = w.behemoth.hardpoints.find((x) => x.slot.id === slot)!;
    h.weapon = WEAPONS[id];
    h.ammo = WEAPONS[id].ammo ?? null;
    h.binding = defaultBindingFor(WEAPONS[id], h.slot);
  }
  return w;
}

/** Steps the world; aims straight ahead of the hull unless told otherwise. */
function steps(w: World, n: number, cmd: Partial<PlayerCommand> = {}): void {
  const b = w.behemoth;
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: b.x + 150, aimY: b.y, ...cmd });
}

/** A target that holds still and never shoots back. */
function dummy(w: World, x: number, y: number, id: 'lightTank' | 'infantry' = 'lightTank', hp = 1000): Enemy {
  const e = spawnEnemy(w, id, x, y);
  e.def = { ...e.def, maxSpeed: 0, accel: 0, fireRange: 0, hp };
  e.hp = hp;
  e.vx = 0;
  // Broadside to the Behemoth, so its fire lands on a flank (facing armor ×1).
  e.heading = Math.PI / 2;
  e.vy = 0;
  return e;
}

const beams = (w: World) => w.events.filter((e) => e.type === 'beam');

describe('lasers', () => {
  it('there is one for each hardpoint size, all energy, all sold at depots', () => {
    const lasers = (['pulseLaser', 'beamLaser', 'heavyLaser'] as const).map((id) => WEAPONS[id]);
    expect(lasers.map((l) => l.size)).toEqual(['S', 'M', 'L']);
    for (const l of lasers) {
      expect(l.category).toBe('energy');
      expect(l.power).toBeGreaterThan(0);
      expect(l.ammo).toBeUndefined();
      expect(DEPOT_WEAPONS[l.id]).toBeDefined();
    }
  });

  it('a heavy laser strikes the first unit in line the moment it fires, and costs power', () => {
    const w = battle({ turret: 'heavyLaser' });
    const b = w.behemoth;
    const front = dummy(w, b.x + 90, b.y);
    const behind = dummy(w, b.x + 140, b.y);
    b.power.stored = 50;
    let shotAt = -1;
    for (let i = 0; i < 60 && shotAt < 0; i++) {
      w.events.length = 0;
      steps(w, 1, { fireMain: true });
      if (beams(w).length) shotAt = i;
    }
    expect(shotAt).toBeGreaterThanOrEqual(0);
    const dmg = WEAPONS.heavyLaser.projectile.kind === 'beam' ? WEAPONS.heavyLaser.projectile.damage : 0;
    expect(front.hp).toBeCloseTo(1000 - dmg, 5);
    expect(behind.hp).toBe(1000);
    const ev = beams(w)[0]!;
    expect(ev.type === 'beam' && ev.hit).toBe(true);
    expect(b.power.stored).toBeLessThan(50 - WEAPONS.heavyLaser.power! + 1);
  });

  it('cover stops a beam and takes the damage', () => {
    const w = battle({ turret: 'heavyLaser' });
    const b = w.behemoth;
    const ts = w.terrain.tileSize;
    // A wall of buildings across the field, ahead of the muzzle.
    const col = Math.floor((b.x + 70) / ts);
    for (let r = 0; r < 16; r++) Object.assign(w.terrain.tile(col, r)!, { mat: 'building', state: 'intact', hp: 120 });
    const e = dummy(w, b.x + 130, b.y);
    steps(w, 60, { fireMain: true });
    expect(beams(w).length).toBeGreaterThan(0);
    expect(e.hp).toBe(1000);
    expect(w.terrain.tile(col, Math.floor(b.y / ts))!.hp + w.terrain.tile(col, Math.floor(b.y / ts) - 1)!.hp).toBeLessThan(240);
  });

  it("won't fire without the power for a shot", () => {
    const w = battle({ turret: 'heavyLaser' });
    const b = w.behemoth;
    b.reactor.hp = 1e-9; // 30% output: 3/s
    b.power.stored = 0;
    steps(w, 120, { fireMain: true });
    expect(beams(w)).toHaveLength(0);
  });

  it('a beam laser fires a near-continuous beam until the capacitor runs low, then throttles to the reactor', () => {
    const w = battle({ prow: 'beamLaser' });
    const b = w.behemoth;
    b.power.stored = b.power.max;
    steps(w, Math.round(1 / SIM_DT), { fireSecondary: true });
    // Charged: a pulse every reload (about 8–10 a second at 60 steps a second).
    const charged = beams(w).length;
    expect(charged).toBeGreaterThanOrEqual(8);
    expect(b.power.stored).toBeLessThan(b.power.max);
    // Dry: the reactor's 10/s pays for about 6 pulses a second (1.6 each).
    b.power.stored = 0;
    w.events.length = 0;
    steps(w, Math.round(3 / SIM_DT), { fireSecondary: true });
    const dry = beams(w).length / 3;
    expect(dry).toBeGreaterThan(5);
    expect(dry).toBeLessThan(7);
  });

  it('a pulse laser on Auto picks off infantry by itself', () => {
    const w = battle({ flankL: 'pulseLaser' });
    const b = w.behemoth;
    b.autoEnabled[0] = true;
    const inf = dummy(w, b.x + 30, b.y - 50, 'infantry', 50);
    steps(w, 120);
    expect(beams(w).length).toBeGreaterThan(0);
    expect(inf.hp).toBeLessThan(50);
  });
});

describe('plasma', () => {
  const spec = WEAPONS.plasmaThrower.projectile as ShellSpec;
  const pool = spec.pool!;

  it('a glob splashes at the cursor and leaves a pool that keeps burning, then dies out', () => {
    const w = battle({ prow: 'plasmaThrower' });
    const b = w.behemoth;
    b.power.stored = b.power.max;
    // Off to the side, so the hull doesn't drive into it.
    const e = dummy(w, b.x + 110, b.y - 70);
    // One shot at the unit, then hold fire.
    let i = 0;
    while (w.pools.length === 0 && i++ < 120) steps(w, 1, { fireSecondary: i < 30, aimX: e.x, aimY: e.y });
    expect(w.pools).toHaveLength(1);
    const afterSplash = e.hp;
    expect(afterSplash).toBeLessThan(1000);
    // The unit sits in the pool for its whole burn: dps × duration more.
    steps(w, Math.round((pool.duration + 0.5) / SIM_DT), { aimX: e.x, aimY: e.y });
    expect(afterSplash - e.hp).toBeCloseTo(pool.dps * pool.duration, 0);
    expect(w.pools).toHaveLength(0);
  });

  it('melts the terrain under it', () => {
    const w = battle();
    const b = w.behemoth;
    const ts = w.terrain.tileSize;
    const col = Math.floor((b.x + 150) / ts);
    const row = Math.floor((b.y - 70) / ts);
    const x = (col + 0.5) * ts;
    const y = (row + 0.5) * ts;
    Object.assign(w.terrain.tile(col, row)!, { mat: 'building', state: 'intact', hp: 120 });
    spawnPool(w, x, y, spec, pool);
    steps(w, Math.round(pool.duration / SIM_DT) + 5);
    expect(w.terrain.tile(col, row)!.hp).toBeCloseTo(120 - pool.tileDps * pool.duration, 0);
  });

  it('burns the Behemoth too: its treads take damage while it drives over a pool', () => {
    const w = battle();
    const b = w.behemoth;
    const before = b.treads.hp;
    spawnPool(w, b.x, b.y, spec, pool);
    steps(w, Math.round(1 / SIM_DT));
    const lost = before - b.treads.hp;
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThanOrEqual(pool.dps * POOL.treads * 1.01);
    expect(w.events.some((e) => e.type === 'plasmaBurn')).toBe(true);
  });

  it('a pool off to the side leaves the treads alone', () => {
    const w = battle();
    const b = w.behemoth;
    const before = b.treads.hp;
    spawnPool(w, b.x, b.y + 60, spec, pool);
    steps(w, Math.round(1 / SIM_DT));
    expect(b.treads.hp).toBe(before);
  });

  it('burns a trailer towed through it', () => {
    const w = battle({}, ['ammoBunker', null]);
    const t = w.behemoth.trailer!;
    const armor = t.armor.hp;
    spawnPool(w, t.x, t.y, spec, pool);
    steps(w, 30);
    expect(t.armor.hp).toBeLessThan(armor);
  });

  it('fizzles in water', () => {
    const w = battle();
    const b = w.behemoth;
    const x = b.x + 150;
    Object.assign(w.terrain.tileAt(x, b.y)!, { mat: 'water' });
    spawnPool(w, x, b.y, spec, pool);
    expect(w.pools).toHaveLength(0);
  });
});
