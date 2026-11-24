import { describe, expect, it } from 'vitest';
import { rainy } from '../../src/content/conditions';
import type { EnemyId } from '../../src/content/enemies';
import { MATERIALS, type MaterialId } from '../../src/content/terrain';
import { FIRE } from '../../src/content/tuning';
import { WEAPONS, withShell, type BeamSpec, type ShellSpec, type WeaponId } from '../../src/content/weapons';
import { defaultBindingFor, IDLE_COMMAND, loadShell, type PlayerCommand } from '../../src/sim/behemoth';
import { destroyEnemy, spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import { concealed } from '../../src/sim/concealment';
import { burning, fireBurst, fireKey, igniteBlast, igniteEnemy, igniteTile, ignitesOf, smoky, splashFuel } from '../../src/sim/fire';
import { spawnPool } from '../../src/sim/pools';
import { fireBeam } from '../../src/sim/projectiles';
import { newRun } from '../../src/sim/run';
import { spawnProjectile } from '../../src/sim/weapons';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

/** A quiet battle (no spawns, autos off) on bare ground, with these weapons fitted. */
function battle(fit: Record<string, WeaponId> = {}, opts: Partial<Parameters<typeof createWorld>[0]> = {}): World {
  const w = createWorld({ seed: 1, frameWidth: 480, fieldRows: 16, behemoth: newRun(1).behemoth, ...opts });
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
  return e;
}

function paint(w: World, mat: MaterialId, c0: number, c1: number, r0: number, r1: number): void {
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) Object.assign(w.terrain.tile(c, r)!, { mat, state: 'intact', hp: MATERIALS[mat].maxHp });
}

/** A tile well ahead of the hull and off its track. */
function spot(w: World, ahead = 150, side = 60): { c: number; r: number; x: number; y: number } {
  const ts = w.terrain.tileSize;
  const c = Math.floor((w.behemoth.x + ahead) / ts);
  const r = Math.floor((w.behemoth.y + side) / ts);
  return { c, r, x: (c + 0.5) * ts, y: (r + 0.5) * ts };
}

/** Runs `body` with a tuning value swapped, then puts it back. */
function withValue<T extends object, K extends keyof T>(table: T, key: K, value: T[K], body: () => void): void {
  const was = table[key];
  table[key] = value;
  try {
    body();
  } finally {
    table[key] = was;
  }
}

const slot = (w: World, id: string) => w.behemoth.hardpoints.find((h) => h.slot.id === id)!;

describe('burning fuel on the ground', () => {
  it('a flamethrower leaves the ground burning where its stream lands, not at the nozzle; it burns out', () => {
    const w = battle({ prow: 'flamethrower' });
    const b = w.behemoth;
    slot(w, 'prow').binding = 'rmb';
    const ts = w.terrain.tileSize;
    steps(w, 20, { fireSecondary: true, aimX: b.x + 120, aimY: b.y + 50 });
    const lit = [...w.fires.values()];
    expect(lit.length).toBeGreaterThan(1);
    for (const f of lit) {
      expect(f.fuel).toBeDefined();
      expect(Math.hypot((f.col + 0.5) * ts - b.x, (f.row + 0.5) * ts - b.y)).toBeGreaterThan(FIRE.fuel.from);
    }
    steps(w, Math.ceil((FIRE.fuel.flame + 0.5) * 60));
    expect(w.fires.size).toBe(0);
  });

  it("doesn't burn on water or on a standing wall, and scorches a unit standing in it", () => {
    const w = battle();
    const { c, r, x, y } = spot(w);
    paint(w, 'water', c, c, r, r);
    paint(w, 'wall', c + 1, c + 1, r, r);
    splashFuel(w, c, r, 3);
    splashFuel(w, c + 1, r, 3);
    expect(w.fires.size).toBe(0);
    splashFuel(w, c + 2, r, 3);
    expect(burning(w, c + 2, r)).toBe(true);
    const troops = dummy(w, x + 2 * w.terrain.tileSize, y, 'infantry', 100);
    steps(w, 30);
    expect(troops.hp).toBeLessThan(100);
    expect(troops.burn).toBeDefined();
  });

  it('lands as a real fire on what burns, and can catch a wood beside it', () => {
    const w = battle();
    const { c, r } = spot(w);
    paint(w, 'forest', c + 1, c + 4, r, r);
    splashFuel(w, c + 1, r, 3);
    expect(w.fires.get(fireKey(c + 1, r))!.fuel).toBeUndefined();
    w.fires.clear();
    withValue(FIRE.fuel, 'spread', 4, () => {
      splashFuel(w, c, r, 3);
      steps(w, 60);
    });
    expect(burning(w, c + 1, r)).toBe(true);
  });

  it('the treads put out what they roll over', () => {
    const w = battle();
    const b = w.behemoth;
    const ts = w.terrain.tileSize;
    const c = Math.floor(b.x / ts);
    const r = Math.floor(b.y / ts);
    splashFuel(w, c, r, 10);
    const { c: c2, r: r2 } = spot(w);
    splashFuel(w, c2, r2, 10);
    steps(w, 20);
    expect(burning(w, c, r)).toBe(false);
    expect(burning(w, c2, r2)).toBe(true);
  });
});

describe('burning units spread fire', () => {
  const burn = { dps: 1, duration: 30 };

  it('a burning unit sets alight the wood it stands in', () => {
    const w = battle();
    const { c, r, x, y } = spot(w);
    paint(w, 'forest', c, c, r, r);
    const troops = dummy(w, x, y, 'infantry', 1000);
    igniteEnemy(troops, WEAPONS.flamethrower.projectile as never, burn);
    steps(w, 20);
    expect(burning(w, c, r)).toBe(true);
  });

  it('and can light a unit touching it, but not one standing off', () => {
    const w = battle();
    const { x, y } = spot(w);
    const a = dummy(w, x, y, 'lightTank');
    const touching = dummy(w, x + a.def.radius * 2 + 1, y, 'lightTank');
    const off = dummy(w, x, y + 60, 'lightTank');
    igniteEnemy(a, WEAPONS.flamethrower.projectile as never, burn);
    let caught = false;
    for (let i = 0; i < 600 && !caught; i++) {
      steps(w, 1);
      caught = !!touching.burn;
    }
    expect(caught).toBe(true);
    expect(off.burn).toBeUndefined();
  });

  it("burning terrain's fire goes hard on troops and easy on heavy armor", () => {
    expect(FIRE.vs.infantry).toBeGreaterThan(1);
    expect(FIRE.vs.heavy).toBeLessThan(0.5);
  });
});

describe('wrecks', () => {
  it('a vehicle shot dead leaves a burning wreck; one crushed, or a squad, leaves none', () => {
    const w = battle();
    const ts = w.terrain.tileSize;
    const { x, y } = spot(w);
    const at = (e: Enemy) => burning(w, Math.floor(e.x / ts), Math.floor(e.y / ts));
    const shot = dummy(w, x, y, 'lightTank');
    const crushed = dummy(w, x + 3 * ts, y, 'lightTank');
    const squad = dummy(w, x + 6 * ts, y, 'infantry');
    destroyEnemy(w, shot, 'shot');
    destroyEnemy(w, crushed, 'crushed');
    destroyEnemy(w, squad, 'shot');
    expect(at(shot)).toBe(true);
    expect(at(crushed)).toBe(false);
    expect(at(squad)).toBe(false);
  });
});

describe('weapons that start fires', () => {
  it('each kind of round has its odds, and a weapon can set its own', () => {
    expect(ignitesOf(WEAPONS.heavyCannon.projectile as ShellSpec)).toBe(FIRE.ignites.shell);
    expect(ignitesOf(WEAPONS.autocannon.projectile as never)).toBe(0);
    expect(ignitesOf(WEAPONS.heavyLaser.projectile as BeamSpec)).toBeGreaterThan(0.3);
    expect(ignitesOf(WEAPONS.flamethrower.projectile as never)).toBe(1);
  });

  it('a blast lights what is left standing in and around it, by its odds', () => {
    const w = battle();
    const { c, r, x, y } = spot(w);
    paint(w, 'forest', c - 3, c + 3, r - 3, r + 3);
    igniteBlast(w, x, y, 18, 0);
    expect(w.fires.size).toBe(0);
    igniteBlast(w, x, y, 18, 1);
    expect(w.fires.size).toBeGreaterThan(8);
    expect(burning(w, c + 3, r + 3)).toBe(false);
  });

  it('a high-explosive shell into a wood can leave the trees round its clearing burning', () => {
    withValue(FIRE.ignites, 'shell', 1, () => {
      const w = battle();
      const b = w.behemoth;
      const { c, r, x } = spot(w, 150, 0);
      paint(w, 'forest', c - 3, c + 3, r - 3, r + 3);
      spawnProjectile(w, 'player', WEAPONS.heavyCannon, b.x + 30, b.y, 0, { fuse: x - b.x - 30, spreadMul: 0 });
      steps(w, 40);
      // The trees it landed in are down; the ones beyond them burn.
      expect(w.terrain.tile(c, r)!.state).toBe('destroyed');
      expect(w.fires.size).toBeGreaterThan(0);
    });
  });

  it('a heavy laser can set alight the house it strikes', () => {
    const laser = WEAPONS.heavyLaser;
    withValue(laser.projectile as BeamSpec, 'ignites', 1, () => {
      const w = battle();
      const b = w.behemoth;
      const { c, r } = spot(w, 150, 0);
      paint(w, 'building', c, c, r - 1, r + 1);
      fireBeam(w, laser, b.x + 30, b.y, 0);
      expect(burning(w, c, r)).toBe(true);
    });
  });

  it('plasma sets alight what burns under it', () => {
    const w = battle();
    const { c, r, x, y } = spot(w);
    paint(w, 'building', c, c, r, r);
    const spec = WEAPONS.plasmaThrower.projectile as ShellSpec;
    spawnPool(w, x, y, spec, spec.pool!);
    steps(w, 40);
    expect(burning(w, c, r)).toBe(true);
  });

  it('a fuel tank going up throws fire over the ground and the units round it', () => {
    const w = battle();
    const { c, r, x, y } = spot(w);
    paint(w, 'fuelTank', c, c, r, r);
    const tank = dummy(w, x + 20, y, 'lightTank');
    w.terrain.damage(c, r, 1000, w.events);
    steps(w, 30);
    expect(tank.burn).toBeDefined();
    expect(w.fires.size).toBeGreaterThan(3);
    expect(w.events.some((e) => e.type === 'explosion' && e.fire)).toBe(true);
  });

  it('a fireball sets units burning and leaves the ground alight for a while', () => {
    const w = battle();
    const { c, r, x, y } = spot(w);
    const troops = dummy(w, x + 6, y, 'infantry', 500);
    fireBurst(w, x, y, 20, { dps: 5, duration: 3 });
    expect(troops.burn).toBeDefined();
    expect(w.fires.get(fireKey(c, r))!.fuel).toBe(FIRE.fuel.burst);
    steps(w, Math.ceil((FIRE.fuel.burst + 0.5) * 60));
    expect(w.fires.size).toBe(0);
  });
});

describe('incendiary shells', () => {
  it('the heavy cannon and the siege howitzer take them: less blast, and a fireball', () => {
    for (const id of ['heavyCannon', 'siegeHowitzer'] as const) {
      const he = WEAPONS[id].projectile as ShellSpec;
      const inc = WEAPONS[id].shells!.incendiary as ShellSpec;
      expect(inc.incendiary).toBeDefined();
      expect(inc.damage).toBeLessThan(he.damage);
      expect(inc.tileDamage).toBeLessThan(he.tileDamage);
      expect(inc.lobbed).toBe(he.lobbed);
    }
  });

  it('an incendiary shell sets the troops and the wood it bursts in alight, and leaves the trees standing to burn', () => {
    const w = battle();
    const b = w.behemoth;
    const turret = slot(w, 'turret');
    loadShell(turret, 'incendiary');
    expect(turret.weapon).toBe(withShell(WEAPONS.heavyCannon, 'incendiary'));
    // Off the hull's track, so the treads don't flatten the wood.
    const { c, r, x, y } = spot(w, 150, 70);
    paint(w, 'forest', c - 2, c + 2, r - 2, r + 2);
    const troops = dummy(w, x, y, 'infantry', 500);
    spawnProjectile(w, 'player', turret.weapon!, b.x, b.y, Math.atan2(y - b.y, x - b.x), { fuse: Math.hypot(x - b.x, y - b.y), spreadMul: 0 });
    w.events.length = 0;
    steps(w, 40);
    expect(troops.hp).toBeLessThan(500);
    expect(burning(w, c, r)).toBe(true);
    expect(w.terrain.tile(c, r)!.state).not.toBe('destroyed');
    // Left alone, the wood burns down.
    steps(w, 60 * 10);
    expect(w.terrain.tile(c, r)!.state).toBe('destroyed');
  });
});

describe('smoke', () => {
  it('a burning wood pours smoke over itself and the tiles round it, which hangs a while after the fire is out', () => {
    const w = battle();
    const ts = w.terrain.tileSize;
    const { c, r, x, y } = spot(w, 300);
    paint(w, 'forest', c, c, r, r);
    igniteTile(w, c, r);
    steps(w, 20);
    expect(smoky(w, x, y)).toBe(false);
    steps(w, 60);
    expect(smoky(w, x, y)).toBe(true);
    expect(smoky(w, x + ts, y - ts)).toBe(true);
    expect(smoky(w, x + 3 * ts, y)).toBe(false);
    // The tree burns down in 6 s; the smoke outlasts it, then clears.
    steps(w, 60 * 6);
    expect(w.fires.size).toBe(0);
    expect(smoky(w, x, y)).toBe(true);
    steps(w, Math.ceil(FIRE.smoke.linger * 60));
    expect(smoky(w, x, y)).toBe(false);
  });

  it('burning fuel alone makes none; a burning wreck does', () => {
    const w = battle();
    const ts = w.terrain.tileSize;
    const { c, r, x, y } = spot(w, 300);
    splashFuel(w, c, r, 5);
    destroyEnemy(w, dummy(w, x + 6 * ts, y), 'shot');
    steps(w, 90);
    expect(smoky(w, x, y)).toBe(false);
    expect(smoky(w, x + 6 * ts, y)).toBe(true);
  });

  it('hides a vehicle standing in it from the player, unless it is on fire itself or gives itself away', () => {
    const w = battle();
    const ts = w.terrain.tileSize;
    const { c, r, x, y } = spot(w, 300);
    paint(w, 'forest', c, c, r, r);
    const tank = dummy(w, x + ts, y);
    expect(concealed(w, tank)).toBe(false);
    igniteTile(w, c, r);
    steps(w, 90);
    expect(concealed(w, tank)).toBe(true);
    expect(tank.hidden).toBe(true);
    tank.exposed = 1;
    expect(concealed(w, tank)).toBe(false);
    tank.exposed = 0;
    igniteEnemy(tank, WEAPONS.flamethrower.projectile as never, { dps: 1, duration: 5 });
    expect(concealed(w, tank)).toBe(false);
  });
});

describe('rain', () => {
  it('only a rainstorm is wet: not a blizzard, a sandstorm, or the night', () => {
    expect(rainy('storm', 'temperate')).toBe(true);
    expect(rainy('thunderstorm', 'industrial')).toBe(true);
    expect(rainy('storm', 'arctic')).toBe(false);
    expect(rainy('storm', 'desert')).toBe(false);
    expect(rainy('night', 'temperate')).toBe(false);
  });

  it("a squall's rain puts fires out and keeps them from spreading", () => {
    const burnt = (wet: boolean): number => {
      const w = battle({}, wet ? { condition: 'storm' } : {});
      // One long squall at full strength.
      if (w.condition) w.condition.gust = { start: -2, full: -1, ease: 1e9, end: 2e9 };
      const { c, r } = spot(w, 400);
      paint(w, 'forest', c - 3, c + 3, r - 3, r + 3);
      igniteTile(w, c, r);
      steps(w, 60 * 12);
      let n = 0;
      for (let cc = c - 3; cc <= c + 3; cc++) for (let rr = r - 3; rr <= r + 3; rr++) if (w.terrain.tile(cc, rr)?.state === 'destroyed') n++;
      return n;
    };
    expect(burnt(false)).toBeGreaterThan(20);
    expect(burnt(true)).toBeLessThan(8);
  });
});

describe("fire's own stream", () => {
  it("a fire never shifts the battle's combat draws", () => {
    const run = (fire: boolean): number => {
      const w = battle();
      const { c, r } = spot(w);
      paint(w, 'forest', c - 3, c + 3, r - 3, r + 3);
      if (fire) igniteTile(w, c, r);
      steps(w, 300);
      return w.rng.next();
    };
    expect(run(true)).toBe(run(false));
  });
});
