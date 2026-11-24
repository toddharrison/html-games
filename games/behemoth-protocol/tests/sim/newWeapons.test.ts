import { describe, expect, it } from 'vitest';
import { DEPOT_WEAPONS } from '../../src/content/depot';
import { FIRE } from '../../src/content/tuning';
import { WEAPONS, type ArcSpec, type FlameSpec, type PulseSpec, type RailSpec, type ShellSpec, type WeaponId } from '../../src/content/weapons';
import { defaultBindingFor, IDLE_COMMAND, type PlayerCommand } from '../../src/sim/behemoth';
import { destroyEnemy, spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import { burning, fireKey, igniteTile } from '../../src/sim/fire';
import { newRun } from '../../src/sim/run';
import { createWorld, stepWorld, type World } from '../../src/sim/world';
import { spawnProjectile } from '../../src/sim/weapons';
import type { EnemyId } from '../../src/content/enemies';

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

function steps(w: World, n: number, cmd: Partial<PlayerCommand> = {}): void {
  const b = w.behemoth;
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: b.x + 150, aimY: b.y, ...cmd });
}

/** A target that holds still and never shoots back. */
function dummy(w: World, x: number, y: number, id: EnemyId = 'lightTank', hp = 1000): Enemy {
  const e = spawnEnemy(w, id, x, y);
  e.def = { ...e.def, maxSpeed: 0, accel: 0, fireRange: 0, hp };
  e.hp = hp;
  e.vx = 0;
  e.vy = 0;
  e.heading = Math.PI / 2;
  return e;
}

const slot = (w: World, id: string) => w.behemoth.hardpoints.find((h) => h.slot.id === id)!;

/** Paints a block of tiles as a material, whole. */
function paint(w: World, mat: 'forest' | 'building' | 'rock', c0: number, c1: number, r0: number, r1: number): void {
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      const t = w.terrain.tile(c, r)!;
      Object.assign(t, { mat, state: 'intact', hp: mat === 'forest' ? 30 : mat === 'building' ? 120 : 0 });
    }
  }
}

describe('the new weapons', () => {
  it('are M weapons sold at depots, with the roles and categories the spec gives', () => {
    expect(WEAPONS.swarmPod).toMatchObject({ size: 'M', role: 'missile', category: 'munitions' });
    expect(WEAPONS.empEmitter).toMatchObject({ size: 'M', role: 'auto', category: 'energy' });
    expect(WEAPONS.flamethrower).toMatchObject({ size: 'M', role: 'auto', category: 'munitions' });
    for (const id of ['swarmPod', 'empEmitter', 'flamethrower'] as const) expect(DEPOT_WEAPONS[id]).toBeDefined();
  });
});

describe('swarm pod', () => {
  it("shares a salvo's missiles out over the units in view, each its own, nearest the lock first", () => {
    const w = battle({ spine: 'swarmPod' });
    const b = w.behemoth;
    const units = [dummy(w, b.x + 120, b.y - 60), dummy(w, b.x + 140, b.y + 60), dummy(w, b.x + 160, b.y), dummy(w, b.x + 200, b.y + 30)];
    const pod = slot(w, 'spine');
    steps(w, 1, { fireMissile: true, aimX: units[2]!.x, aimY: units[2]!.y });
    const targets: number[] = [];
    for (let i = 0; i < 40; i++) {
      for (const p of w.projectiles) if (p.weapon.id === 'swarmPod' && !targets.includes(p.id)) targets.push(p.id);
      steps(w, 1);
    }
    const missiles = w.projectiles.filter((p) => p.weapon.id === 'swarmPod');
    expect(missiles.length).toBe(WEAPONS.swarmPod.salvo!.count);
    const per = new Map<number, number>();
    for (const m of missiles) per.set(m.targetId!, (per.get(m.targetId!) ?? 0) + 1);
    // Four units, eight missiles: two each.
    expect([...per.keys()].sort()).toEqual(units.map((u) => u.id).sort());
    expect([...per.values()]).toEqual([2, 2, 2, 2]);
    // The first missile goes for the unit under the cursor.
    expect(missiles[0]!.targetId).toBe(units[2]!.id);
    expect(pod.ammo).toBe(WEAPONS.swarmPod.ammo! - 1);
  });

  it('with nothing in view, the salvo flies to the aim point', () => {
    const w = battle({ spine: 'swarmPod' });
    const b = w.behemoth;
    steps(w, 1, { fireMissile: true, aimX: b.x + 160, aimY: b.y - 40 });
    steps(w, 40);
    const missiles = w.projectiles.filter((p) => p.weapon.id === 'swarmPod');
    expect(missiles.length).toBeGreaterThan(0);
    for (const m of missiles) expect(m.targetId).toBeNull();
  });

  it('a missile whose target dies turns onto the nearest unit in view', () => {
    const w = battle({ spine: 'swarmPod' });
    const b = w.behemoth;
    const doomed = dummy(w, b.x + 200, b.y);
    const other = dummy(w, b.x + 210, b.y + 40);
    w.enemies = [doomed];
    steps(w, 1, { fireMissile: true, aimX: doomed.x, aimY: doomed.y });
    steps(w, 10);
    w.enemies.push(other);
    destroyEnemy(w, doomed, 'shot');
    steps(w, 2);
    const live = w.projectiles.filter((p) => p.alive && p.weapon.id === 'swarmPod');
    expect(live.length).toBeGreaterThan(0);
    for (const m of live) expect(m.targetId).toBe(other.id);
  });
});

describe('EMP emitter', () => {
  const spec = WEAPONS.empEmitter.projectile as PulseSpec;

  it('stops every vehicle in reach dead, spares troops and what is out of reach, and costs power', () => {
    const w = battle({ prow: 'empEmitter' });
    const b = w.behemoth;
    slot(w, 'prow').binding = 'rmb';
    const tank = spawnEnemy(w, 'lightTank', b.x + 80, b.y + 30);
    const heavy = spawnEnemy(w, 'heavyTank', b.x + 60, b.y - 40);
    const troops = spawnEnemy(w, 'infantry', b.x + 70, b.y);
    const far = spawnEnemy(w, 'lightTank', b.x + 22 + spec.radius + 60, b.y);
    b.power.stored = b.power.max;
    steps(w, 1, { fireSecondary: true });
    expect(w.events.some((e) => e.type === 'emp' && e.caught === 2)).toBe(true);
    expect(tank.stunned).toBeCloseTo(spec.stun, 1);
    // Heavier machines come back sooner.
    expect(heavy.stunned).toBeCloseTo(spec.stun * spec.stunVs!.heavy!, 1);
    expect(troops.stunned).toBeUndefined();
    expect(far.stunned).toBeUndefined();
    expect(b.power.stored).toBeLessThan(b.power.max - WEAPONS.empEmitter.power! + 1);

    // Dead in the water while it lasts, then it drives again.
    const at = { x: tank.x, y: tank.y };
    steps(w, 60);
    expect(tank.x).toBe(at.x);
    expect(tank.y).toBe(at.y);
    expect(tank.windup).toBe(0);
    steps(w, Math.ceil(spec.stun * 60));
    expect(tank.stunned).toBeUndefined();
    steps(w, 30);
    expect(Math.hypot(tank.x - at.x, tank.y - at.y)).toBeGreaterThan(1);
  });

  it('fries enemy missiles in flight within reach', () => {
    const w = battle({ prow: 'empEmitter' });
    const b = w.behemoth;
    slot(w, 'prow').binding = 'rmb';
    const m = spawnProjectile(w, 'enemy', WEAPONS.launcherMissiles, b.x + 80, b.y + 20, Math.PI);
    b.power.stored = b.power.max;
    steps(w, 1, { fireSecondary: true });
    expect(m.alive).toBe(false);
  });

  it('on Auto, waits for a crowd of vehicles, a bomb truck, or a missile', () => {
    const w = battle({ prow: 'empEmitter' });
    const b = w.behemoth;
    w.behemoth.autoEnabled.fill(true);
    b.power.stored = b.power.max;
    const pulses = () => w.events.filter((e) => e.type === 'emp').length;
    dummy(w, b.x + 80, b.y + 20);
    dummy(w, b.x + 70, b.y - 50, 'infantry');
    steps(w, 2);
    expect(pulses()).toBe(0);
    dummy(w, b.x + 90, b.y - 30);
    steps(w, 1);
    expect(pulses()).toBe(1);

    const w2 = battle({ prow: 'empEmitter' });
    w2.behemoth.autoEnabled.fill(true);
    w2.behemoth.power.stored = w2.behemoth.power.max;
    dummy(w2, w2.behemoth.x + 90, w2.behemoth.y, 'bombTruck');
    steps(w2, 1);
    expect(w2.events.some((e) => e.type === 'emp')).toBe(true);
  });

  it("waits for the power to fire", () => {
    const w = battle({ prow: 'empEmitter' });
    slot(w, 'prow').binding = 'rmb';
    dummy(w, w.behemoth.x + 80, w.behemoth.y + 40);
    w.behemoth.power.stored = WEAPONS.empEmitter.power! - 10;
    steps(w, 1, { fireSecondary: true });
    expect(w.events.some((e) => e.type === 'emp')).toBe(false);
    let fired = false;
    for (let i = 0; i < 180 && !fired; i++) {
      steps(w, 1, { fireSecondary: true });
      fired = w.events.some((e) => e.type === 'emp');
    }
    expect(fired).toBe(true);
  });
});

describe('flamethrower', () => {
  const spec = WEAPONS.flamethrower.projectile as FlameSpec;

  /** Fit the flamethrower to the prow on RMB and hold it at a point for `n` steps. */
  function flame(w: World, n: number, x: number, y: number): void {
    steps(w, n, { fireSecondary: true, aimX: x, aimY: y });
  }

  it('strikes and sets alight what is in its cone, not what is wide of it or past its reach, and burns fuel', () => {
    const w = battle({ prow: 'flamethrower' });
    const b = w.behemoth;
    slot(w, 'prow').binding = 'rmb';
    const near = dummy(w, b.x + 70, b.y, 'infantry', 100);
    const wide = dummy(w, b.x + 70, b.y + 45, 'infantry', 100);
    const far = dummy(w, b.x + 22 + spec.range + 40, b.y, 'infantry', 100);
    flame(w, 20, b.x + 200, b.y);
    expect(near.hp).toBeLessThan(100);
    expect(near.burn).toBeDefined();
    expect(wide.hp).toBe(100);
    expect(far.hp).toBe(100);
    expect(slot(w, 'prow').ammo).toBeLessThan(WEAPONS.flamethrower.ammo!);
  });

  it('a burning unit keeps taking damage after the flame stops, until it burns out', () => {
    const w = battle({ prow: 'flamethrower' });
    const b = w.behemoth;
    slot(w, 'prow').binding = 'rmb';
    // Off to the side, so the hull doesn't run it down.
    const tank = dummy(w, b.x + 75, b.y + 45, 'lightTank', 500);
    flame(w, 30, tank.x, tank.y);
    expect(tank.burn).toBeDefined();
    const after = tank.hp;
    steps(w, 60);
    expect(tank.hp).toBeLessThan(after);
    // The fuel on the ground under it burns out first, then the tank does.
    steps(w, Math.ceil((FIRE.fuel.flame + FIRE.burn.duration + spec.burn.duration) * 60));
    expect(tank.burn).toBeUndefined();
    const out = tank.hp;
    steps(w, 30);
    expect(tank.hp).toBe(out);
  });

  it('sets a wood alight; it burns down to a clearing and spreads through the trees', () => {
    const w = battle({ prow: 'flamethrower' });
    const b = w.behemoth;
    slot(w, 'prow').binding = 'rmb';
    const ts = w.terrain.tileSize;
    // A wood off the hull's track, so the treads don't flatten it.
    const c0 = Math.floor((b.x + 70) / ts);
    const r = Math.floor((b.y + 40) / ts);
    paint(w, 'forest', c0, c0 + 6, r, r + 4);
    flame(w, 30, (c0 + 0.5) * ts, (r + 0.5) * ts);
    expect(burning(w, c0, r)).toBe(true);
    // Let it burn for a while with no more flame.
    let most = 0;
    for (let i = 0; i < 60 * 12; i++) {
      steps(w, 1);
      most = Math.max(most, w.fires.size);
    }
    expect(w.terrain.tile(c0, r)!.state).toBe('destroyed');
    // It spread well past the tiles the flame itself lit.
    let burnt = 0;
    for (let c = c0; c <= c0 + 6; c++) for (let rr = r; rr <= r + 4; rr++) if (w.terrain.tile(c, rr)!.state === 'destroyed') burnt++;
    expect(burnt).toBeGreaterThan(10);
    expect(most).toBeLessThanOrEqual(FIRE.maxTiles);
  });

  it('a burning tile scorches and sets alight a unit standing in it', () => {
    const w = battle();
    const b = w.behemoth;
    const ts = w.terrain.tileSize;
    const c = Math.floor((b.x + 120) / ts);
    const r = Math.floor(b.y / ts);
    paint(w, 'building', c, c, r, r);
    const troops = dummy(w, (c + 0.5) * ts, (r + 0.5) * ts, 'infantry', 100);
    expect(igniteTile(w, c, r)).toBe(true);
    expect(igniteTile(w, c, r)).toBe(false);
    steps(w, 30);
    expect(troops.hp).toBeLessThan(100);
    expect(troops.burn).toBeDefined();
    expect(w.fires.has(fireKey(c, r))).toBe(true);
  });

  it('stops at a building, and sets it alight', () => {
    const w = battle({ prow: 'flamethrower' });
    const b = w.behemoth;
    slot(w, 'prow').binding = 'rmb';
    const ts = w.terrain.tileSize;
    const c = Math.floor((b.x + 60) / ts);
    const r = Math.floor(b.y / ts);
    paint(w, 'building', c, c, r - 1, r + 1);
    const behind = dummy(w, (c + 2.5) * ts, b.y, 'infantry', 100);
    flame(w, 10, b.x + 200, b.y);
    expect(burning(w, c, r)).toBe(true);
    expect(behind.hp).toBe(100);
  });

  it("doesn't light what can't burn or is already down", () => {
    const w = battle();
    const b = w.behemoth;
    const ts = w.terrain.tileSize;
    const c = Math.floor((b.x + 120) / ts);
    const r = Math.floor(b.y / ts);
    expect(igniteTile(w, c, r)).toBe(false);
    paint(w, 'forest', c, c, r, r);
    w.terrain.tile(c, r)!.state = 'flattened';
    expect(igniteTile(w, c, r)).toBe(false);
  });
});

/** Steps until a projectile of `weapon` bursts (or `n` steps pass); returns each burst's center. */
function bursts(w: World, n: number): { x: number; y: number; radius: number }[] {
  const out: { x: number; y: number; radius: number }[] = [];
  for (let i = 0; i < n; i++) {
    w.events.length = 0;
    steps(w, 1);
    for (const ev of w.events) if (ev.type === 'explosion') out.push(ev);
  }
  return out;
}

/** A unit facing the hull, so its front armor meets fire from it. */
function facing(w: World, x: number, y: number, hp = 1000): Enemy {
  const e = dummy(w, x, y, 'lightTank', hp);
  e.heading = Math.PI;
  return e;
}

describe('railgun and coilgun', () => {
  const spec = WEAPONS.railgun.projectile as RailSpec;

  it('a slug goes through every unit in its line, less past each, straight through front armor', () => {
    const w = battle({ turret: 'railgun' });
    const b = w.behemoth;
    b.power.stored = b.power.max;
    const line = [facing(w, b.x + 100, b.y), facing(w, b.x + 140, b.y), facing(w, b.x + 180, b.y)];
    steps(w, 1, { fireMain: true });
    expect(w.events.some((e) => e.type === 'rail')).toBe(true);
    line.forEach((e, i) => expect(1000 - e.hp).toBeCloseTo(spec.damage * spec.falloff ** i, 3));
  });

  it('punches through a building (damaging it), but stops at rock', () => {
    const w = battle({ turret: 'railgun' });
    const b = w.behemoth;
    b.power.stored = b.power.max;
    const ts = w.terrain.tileSize;
    const c = Math.floor((b.x + 90) / ts);
    const r = Math.floor(b.y / ts);
    // Two rows: the slug runs along the boundary between them.
    paint(w, 'building', c, c, r - 1, r);
    const behind = facing(w, (c + 3) * ts, b.y);
    steps(w, 1, { fireMain: true });
    expect(Math.min(w.terrain.tile(c, r)!.hp, w.terrain.tile(c, r - 1)!.hp)).toBeLessThan(120);
    expect(1000 - behind.hp).toBeCloseTo(spec.damage * spec.wallLoss, 3);

    const w2 = battle({ turret: 'railgun' });
    w2.behemoth.power.stored = w2.behemoth.power.max;
    paint(w2, 'rock', c, c, r - 1, r);
    const shielded = facing(w2, (c + 3) * ts, w2.behemoth.y);
    steps(w2, 1, { fireMain: true });
    expect(shielded.hp).toBe(1000);
  });

  it('the coilgun is the M sibling: through a unit, but losing more', () => {
    const coil = WEAPONS.coilgun;
    expect(coil.size).toBe('M');
    expect((coil.projectile as RailSpec).falloff).toBeLessThan(spec.falloff);
    const w = battle({ prow: 'coilgun' });
    const b = w.behemoth;
    slot(w, 'prow').binding = 'rmb';
    b.power.stored = b.power.max;
    const pair = [facing(w, b.x + 100, b.y), facing(w, b.x + 130, b.y)];
    steps(w, 20, { fireSecondary: true, aimX: b.x + 200, aimY: b.y });
    expect(pair[0]!.hp).toBeLessThan(1000);
    expect(pair[1]!.hp).toBeLessThan(1000);
  });
});

describe('arc projector and tesla coil', () => {
  const spec = WEAPONS.arcProjector.projectile as ArcSpec;

  it('a bolt strikes the first unit in line, then leaps from unit to unit, weaker each leap', () => {
    const w = battle({ turret: 'arcProjector' });
    const b = w.behemoth;
    b.power.stored = b.power.max;
    const first = dummy(w, b.x + 100, b.y);
    const second = dummy(w, b.x + 130, b.y + 20);
    const third = dummy(w, b.x + 160, b.y - 10);
    const far = dummy(w, b.x + 300, b.y + 100);
    steps(w, 1, { fireMain: true });
    expect(1000 - first.hp).toBeCloseTo(spec.damage, 3);
    expect(1000 - second.hp).toBeCloseTo(spec.damage * spec.falloff, 3);
    expect(1000 - third.hp).toBeCloseTo(spec.damage * spec.falloff ** 2, 3);
    expect(far.hp).toBe(1000);
  });

  it('cover in the way takes the bolt', () => {
    const w = battle({ turret: 'arcProjector' });
    const b = w.behemoth;
    b.power.stored = b.power.max;
    const ts = w.terrain.tileSize;
    const c = Math.floor((b.x + 90) / ts);
    const r = Math.floor(b.y / ts);
    paint(w, 'building', c, c, r - 1, r);
    const behind = dummy(w, (c + 3) * ts, b.y);
    steps(w, 1, { fireMain: true });
    expect(behind.hp).toBe(1000);
    expect(Math.min(w.terrain.tile(c, r)!.hp, w.terrain.tile(c, r - 1)!.hp)).toBeLessThan(120);
  });

  it('a tesla coil on Auto zaps troops by the hull and leaps between them', () => {
    const w = battle({ flankL: 'teslaCoil' });
    const b = w.behemoth;
    w.behemoth.autoEnabled.fill(true);
    const a = dummy(w, b.x, b.y - 55, 'infantry', 100);
    const c = dummy(w, b.x + 15, b.y - 80, 'infantry', 100);
    steps(w, 60);
    expect(a.hp).toBeLessThan(100);
    expect(c.hp).toBeLessThan(100);
  });
});

describe('ballistic missile', () => {
  const spec = WEAPONS.ballisticMissile.projectile as ShellSpec;

  it("comes down on the cursor wherever the turret points, cratering the ground and hurting what's near", () => {
    const w = battle({ turret: 'ballisticMissile' });
    const b = w.behemoth;
    const aim = { x: b.x + 160, y: b.y + 110 };
    const near = dummy(w, aim.x + 20, aim.y, 'lightTank', 1000);
    steps(w, 1, { fireMain: true, aimX: aim.x, aimY: aim.y });
    expect(slot(w, 'turret').ammo).toBe(WEAPONS.ballisticMissile.ammo! - 1);
    const booms = bursts(w, 240);
    expect(booms.length).toBe(1);
    expect(Math.hypot(booms[0]!.x - aim.x, booms[0]!.y - aim.y)).toBeLessThan(6);
    expect(booms[0]!.radius).toBe(spec.blastRadius);
    expect(near.hp).toBeLessThan(1000 - spec.damage * 0.5);
    const ts = w.terrain.tileSize;
    expect(w.terrain.tile(Math.floor(aim.x / ts), Math.floor(aim.y / ts))!.mat).toBe('crater');
  });

  it('the trailer\'s missile erector fires the same missile on Space', () => {
    const w = battle({}, ['missileErector', null]);
    const b = w.behemoth;
    const erector = b.hardpoints.find((h) => h.weapon?.id === 'erectorMissile')!;
    expect(erector.ammo).toBe(2);
    steps(w, 1, { fireMissile: true, aimX: b.x + 200, aimY: b.y + 60 });
    expect(erector.ammo).toBe(1);
    expect(w.projectiles.some((p) => p.weapon.id === 'erectorMissile')).toBe(true);
  });
});

describe('rocket artillery', () => {
  it('one pull ripples twelve rockets onto the ground around the cursor, for one shot of ammo', () => {
    const w = battle({ spine: 'rocketArtillery' });
    const b = w.behemoth;
    const spec = WEAPONS.rocketArtillery.projectile as ShellSpec;
    const aim = { x: b.x + 220, y: b.y + 30 };
    steps(w, 1, { fireMissile: true, aimX: aim.x, aimY: aim.y });
    const booms = bursts(w, 300);
    expect(booms.length).toBe(WEAPONS.rocketArtillery.salvo!.count);
    for (const p of booms) expect(Math.hypot(p.x - aim.x, p.y - aim.y)).toBeLessThan(spec.scatter! + 3);
    expect(slot(w, 'spine').ammo).toBe(WEAPONS.rocketArtillery.ammo! - 1);
  });
});

describe('thermobaric launcher', () => {
  it('a canister bursts into a fireball that sets the units and the trees in it alight', () => {
    const w = battle({ prow: 'thermobaric' });
    const b = w.behemoth;
    slot(w, 'prow').binding = 'rmb';
    const ts = w.terrain.tileSize;
    const aim = { x: b.x + 130, y: b.y + 60 };
    const c = Math.floor(aim.x / ts);
    const r = Math.floor(aim.y / ts);
    paint(w, 'forest', c - 1, c + 1, r - 1, r + 1);
    const troops = dummy(w, aim.x, aim.y, 'infantry', 500);
    steps(w, 30, { fireSecondary: true, aimX: aim.x, aimY: aim.y });
    steps(w, 60);
    expect(troops.burn ?? troops.hp < 500).toBeTruthy();
    expect(troops.hp).toBeLessThan(500);
    let lit = 0;
    for (let cc = c - 1; cc <= c + 1; cc++) for (let rr = r - 1; rr <= r + 1; rr++) if (burning(w, cc, rr) || w.terrain.tile(cc, rr)!.state === 'destroyed') lit++;
    expect(lit).toBeGreaterThan(3);
  });
});
