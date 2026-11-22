import { TERRAIN_GEN } from '../../src/content/tuning';
import { describe, expect, it } from 'vitest';
import { ENEMIES, type EnemyId } from '../../src/content/enemies';
import { WEAPONS, type BulletSpec } from '../../src/content/weapons';
import { applyHit, IDLE_COMMAND, type PlayerCommand } from '../../src/sim/behemoth';
import { spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import { damageMultiplier } from '../../src/sim/projectiles';
import { Rng } from '../../src/sim/rng';
import { spawnProjectile } from '../../src/sim/weapons';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };

function world(seed = 1): World {
  const w = createWorld({ ...OPTS, seed });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  return w;
}

/** Levels the first `cols` columns to open ground, so a chase isn't decided by what grew there. */
function openGround(w: World, cols: number) {
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < w.terrain.rows; r++) {
      const t = w.terrain.tile(c, r);
      if (t) Object.assign(t, { mat: 'ground', state: 'intact', hp: 0 });
    }
  }
}

function steps(w: World, n: number, cmd: Partial<PlayerCommand> = {}) {
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y, ...cmd });
}

/** A unit that holds still (so tests control where it is), facing the Behemoth with its weapon ready. */
function parked(w: World, id: EnemyId, x: number, y: number, opts: { fire?: boolean; hp?: number } = {}): Enemy {
  const e = spawnEnemy(w, id, x, y);
  e.def = { ...e.def, maxSpeed: 0, accel: 0, ...(opts.fire === false ? { fireRange: 0 } : {}), ...(opts.hp ? { hp: opts.hp } : {}) };
  if (opts.hp) e.hp = opts.hp;
  e.vx = 0;
  // Broadside to the Behemoth, so its fire lands on a flank (facing armor ×1).
  e.heading = Math.PI / 2;
  e.cooldown = 0;
  e.turret = Math.atan2(w.behemoth.y - y, w.behemoth.x - x);
  return e;
}

const enemyRounds = (w: World) => w.projectiles.filter((p) => p.owner === 'enemy');

describe('damage vs target class', () => {
  it('AP guns shred infantry and barely scratch heavy armor', () => {
    const ap = WEAPONS.apGuns.projectile as BulletSpec;
    expect(damageMultiplier(ap, 'infantry')).toBeGreaterThan(2);
    expect(damageMultiplier(ap, 'light')).toBeLessThan(1);
    expect(damageMultiplier(ap, 'heavy')).toBeLessThan(0.2);
    // Unlisted classes take normal damage.
    expect(damageMultiplier(WEAPONS.missileRack.projectile as BulletSpec, 'heavy')).toBe(1);
  });

  it('the same bullet does more to a squad than to a heavy tank', () => {
    const w = world();
    const b = w.behemoth;
    const inf = parked(w, 'infantry', b.x + 100, b.y - 60, { fire: false, hp: 1000 });
    const tank = parked(w, 'heavyTank', b.x + 100, b.y + 60, { fire: false, hp: 1000 });
    const ap = { ...WEAPONS.apGuns, projectile: { ...(WEAPONS.apGuns.projectile as BulletSpec), spread: 0, range: 400 } };
    for (const e of [inf, tank]) spawnProjectile(w, 'player', ap, e.x - 20, e.y, 0);
    steps(w, 20);
    const dmg = (WEAPONS.apGuns.projectile as BulletSpec).damage;
    expect(1000 - inf.hp).toBeCloseTo(dmg * 2.5, 5);
    expect(1000 - tank.hp).toBeCloseTo(dmg * 0.1, 5);
  });

  it('AP guns pick a squad over a closer tank', () => {
    const w = world();
    const b = w.behemoth;
    b.autoEnabled[0] = true;
    // The tank is closer to the left flank mount, but off the line of fire to the squad.
    const tank = parked(w, 'lightTank', b.x + 20, b.y - 40, { fire: false, hp: 1000 });
    const inf = parked(w, 'infantry', b.x - 10, b.y - 62, { fire: false, hp: 1000 });
    steps(w, 60);
    expect(inf.hp).toBeLessThan(1000);
    expect(tank.hp).toBe(1000);
  });
});

describe('strikes past the armor', () => {
  it('infantry rockets go straight into the treads', () => {
    const w = world();
    const b = w.behemoth;
    const before = b.treads.hp;
    spawnProjectile(w, 'enemy', WEAPONS.infantryRockets, b.x + 60, b.y, Math.PI);
    steps(w, 40);
    expect(b.treads.hp).toBeCloseTo(before - (WEAPONS.infantryRockets.projectile as BulletSpec).damage, 5);
    expect(b.armor.frontLeft.hp).toBe(b.armor.frontLeft.max);
    expect(b.armor.frontRight.hp).toBe(b.armor.frontRight.max);
  });

  it('launcher missiles split their damage between a hardpoint and the armor', () => {
    const w = world();
    const b = w.behemoth;
    const events: never[] = [];
    applyHit(b, 'frontRight', 10, new Rng(3), events, b.x, b.y, { target: 'hardpoints', bypass: 0.5 });
    expect(b.armor.frontRight.hp).toBe(b.armor.frontRight.max - 5);
    const hurt = b.hardpoints.filter((h) => h.integrity.hp < h.integrity.max);
    expect(hurt).toHaveLength(1);
    expect(hurt[0]!.integrity.max - hurt[0]!.integrity.hp).toBe(5);
    // Only mounts exposed on the struck arc are candidates.
    expect(hurt[0]!.slot.exposure.frontRight ?? 0).toBeGreaterThan(0);
  });
});

describe('missile launcher', () => {
  it('telegraphs a long lock, then fires a full volley of homing missiles', () => {
    const w = world();
    const b = w.behemoth;
    const e = parked(w, 'missileLauncher', b.x + 160, b.y + 60);
    steps(w, 1);
    expect(e.windup).toBeGreaterThan(0.9);
    steps(w, Math.ceil(e.def.aimTime * 60) + 2);
    expect(enemyRounds(w)).toHaveLength(1);
    steps(w, 60);
    const missiles = w.events.filter((ev) => ev.type === 'fire' && ev.owner === 'enemy');
    expect(missiles.length + enemyRounds(w).length).toBeGreaterThanOrEqual(WEAPONS.launcherMissiles.salvo!.count);
    expect(enemyRounds(w).every((p) => p.kind === 'missile')).toBe(true);
  });

  it('point defense picks its missiles off', () => {
    const w = world();
    const b = w.behemoth;
    b.autoEnabled[1] = true;
    parked(w, 'missileLauncher', b.x + 160, b.y + 60);
    const armor = () => Object.values(b.armor).reduce((s, a) => s + a.hp, 0);
    const before = armor();
    steps(w, 60 * 4);
    const hits = w.events.filter((ev) => ev.type === 'intercept' && ev.hit).length;
    expect(hits).toBeGreaterThan(0);
    expect(armor()).toBeGreaterThan(before - WEAPONS.launcherMissiles.salvo!.count * 9 * 0.5);
  });
});

describe('heavy tank (hold ahead)', () => {
  it('stays in front of a cruising Behemoth, inside its arc', () => {
    const w = world();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'heavyTank', b.x + 200, b.y + 30);
    e.def = { ...e.def, fireRange: 0 };
    steps(w, 60 * 10);
    expect(e.alive).toBe(true);
    expect(e.x).toBeGreaterThan(b.x + b.chassis.length / 2);
    const bearing = Math.abs(Math.atan2(e.y - b.y, e.x - b.x));
    expect(bearing).toBeLessThan(((ENEMIES.heavyTank.engage.arc + 15) * Math.PI) / 180);
  });

  it('a surge runs it down', () => {
    const w = world();
    openGround(w, 120);
    const b = w.behemoth;
    const e = spawnEnemy(w, 'heavyTank', b.x + 140, b.y);
    e.def = { ...e.def, fireRange: 0 };
    let crushed = false;
    for (let i = 0; i < 60 * 30 && !crushed; i++) {
      steps(w, 1, { throttle: 1, aimY: b.y });
      crushed = w.events.some((ev) => ev.type === 'enemyDestroyed' && ev.cause === 'crushed');
      w.events.length = 0;
    }
    expect(crushed).toBe(true);
  });

  it('starting beside the Behemoth, it gains on it up a lane instead of cutting under the treads', () => {
    const w = world();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'heavyTank', b.x - 20, b.y + b.chassis.width / 2 + 16);
    e.def = { ...e.def, fireRange: 0 };
    const rel0 = e.x - b.x;
    // Four seconds, so it stays inside the clear start zone (forest would slow it below cruise).
    for (let i = 0; i < 60 * 4; i++) {
      steps(w, 1);
      if (e.x < b.x + b.chassis.length / 2) expect(Math.abs(e.y - b.y)).toBeGreaterThan(b.chassis.width / 2);
    }
    expect(e.alive).toBe(true);
    expect(e.x - b.x).toBeGreaterThan(rel0 + 10);
  });
});

describe('infantry (ambusher)', () => {
  /**
   * A seed and a cover tile ahead of the Behemoth (past the clear start zone, still generated),
   * so the test doesn't depend on one map.
   */
  function withCover(): { w: World; x: number; y: number } {
    for (let seed = 1; seed < 50; seed++) {
      const w = world(seed);
      const b = w.behemoth;
      const ts = w.terrain.tileSize;
      for (let c = TERRAIN_GEN.clearStartCols; c < Math.floor((b.x + 400) / ts); c++) {
        for (let r = 0; r < w.terrain.rows; r++) {
          const y = (r + 0.5) * ts;
          if (w.terrain.isCover(c, r) && Math.abs(y - b.y) > 40) return { w, x: (c + 0.5) * ts, y };
        }
      }
    }
    throw new Error('no cover found');
  }

  it('walks into nearby cover and holds there', () => {
    const { w, x, y } = withCover();
    const e = spawnEnemy(w, 'infantry', x + 30, y);
    e.def = { ...e.def, fireRange: 0 };
    steps(w, 60 * 7);
    const ts = w.terrain.tileSize;
    expect(w.terrain.isCover(Math.floor(e.x / ts), Math.floor(e.y / ts))).toBe(true);
    const at = { x: e.x, y: e.y };
    steps(w, 60);
    expect(Math.hypot(e.x - at.x, e.y - at.y)).toBeLessThan(2);
  });

  it('is left behind once the Behemoth rolls past', () => {
    const { w, x, y } = withCover();
    const e = spawnEnemy(w, 'infantry', x, y);
    e.def = { ...e.def, fireRange: 0 };
    steps(w, 60 * 16);
    expect(e.x).toBeLessThan(w.behemoth.x);
  });

  it('fires rockets at the treads as the Behemoth passes', () => {
    const w = world();
    const b = w.behemoth;
    parked(w, 'infantry', b.x + 90, b.y - 50);
    const before = b.treads.hp;
    steps(w, 60 * 3);
    expect(b.treads.hp).toBeLessThan(before);
  });
});
