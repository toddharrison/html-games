import { CONCEALMENT } from '../../src/content/tuning';
import { describe, expect, it } from 'vitest';
import type { EnemyId } from '../../src/content/enemies';
import { MATERIALS } from '../../src/content/terrain';
import { WEAPONS } from '../../src/content/weapons';
import { IDLE_COMMAND, revealRadius, type PlayerCommand } from '../../src/sim/behemoth';
import { spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import { SIM_DT } from '../../src/sim/loop';
import { missileLockTarget, spawnProjectile } from '../../src/sim/weapons';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };

function world(): World {
  const w = createWorld(OPTS);
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  return w;
}

function steps(w: World, n: number, cmd: Partial<PlayerCommand> = {}) {
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y, ...cmd });
}

/** Plant intact forest on the tiles around a point (the start zone is clear ground). */
function plantForest(w: World, x: number, y: number): void {
  const ts = w.terrain.tileSize;
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const t = w.terrain.tile(Math.floor(x / ts) + dc, Math.floor(y / ts) + dr)!;
      t.mat = 'forest';
      t.state = 'intact';
      t.hp = MATERIALS.forest.maxHp;
    }
  }
}

/** A unit that holds still; by default it never fires. */
function parked(w: World, id: EnemyId, x: number, y: number, fire = false): Enemy {
  const e = spawnEnemy(w, id, x, y);
  e.def = { ...e.def, maxSpeed: 0, accel: 0, ...(fire ? {} : { fireRange: 0 }) };
  e.vx = 0;
  e.cooldown = 0;
  e.turret = Math.atan2(w.behemoth.y - y, w.behemoth.x - x);
  return e;
}

/** A spot in forest at a given distance ahead-and-left of the Behemoth. */
function forestSpot(w: World, distance: number): { x: number; y: number } {
  const b = w.behemoth;
  const x = b.x + distance * 0.8;
  const y = b.y - distance * 0.6;
  plantForest(w, x, y);
  return { x, y };
}

describe('concealment', () => {
  it('infantry in forest is hidden outside the reveal radius and seen inside it', () => {
    const w = world();
    const far = forestSpot(w, 160);
    const near = forestSpot(w, 60);
    const hidden = parked(w, 'infantry', far.x, far.y);
    const seen = parked(w, 'infantry', near.x, near.y);
    steps(w, 1);
    expect(hidden.hidden).toBe(true);
    expect(seen.hidden).toBe(false);
  });

  it('nothing hides in the open, and vehicles never hide', () => {
    const w = world();
    const b = w.behemoth;
    const open = parked(w, 'infantry', b.x + 140, b.y + 60);
    const spot = forestSpot(w, 160);
    const tank = parked(w, 'lightTank', spot.x, spot.y);
    steps(w, 1);
    expect(open.hidden).toBe(false);
    expect(tank.hidden).toBe(false);
  });

  it('clearing the trees reveals the unit', () => {
    const w = world();
    const spot = forestSpot(w, 160);
    const e = parked(w, 'infantry', spot.x, spot.y);
    steps(w, 1);
    expect(e.hidden).toBe(true);
    const ts = w.terrain.tileSize;
    w.terrain.damage(Math.floor(e.x / ts), Math.floor(e.y / ts), 1000, w.events);
    steps(w, 1);
    expect(e.hidden).toBe(false);
  });

  it('sensor damage shrinks the reveal radius', () => {
    const w = world();
    const b = w.behemoth;
    const full = revealRadius(b);
    const spot = forestSpot(w, full - 15);
    const e = parked(w, 'infantry', spot.x, spot.y);
    steps(w, 1);
    expect(e.hidden).toBe(false);
    b.sensors.hp = 0;
    expect(revealRadius(b)).toBeLessThan(full * 0.5);
    steps(w, 1);
    expect(e.hidden).toBe(true);
  });

  it('lining up a shot and firing give it away, then it fades back into the trees', () => {
    const w = world();
    // Blind sensors, so the Behemoth rolling closer doesn't reveal it either.
    w.behemoth.sensors.hp = 0;
    const spot = forestSpot(w, 110);
    const e = parked(w, 'infantry', spot.x, spot.y, true);
    e.cooldown = 1;
    steps(w, 1);
    expect(e.hidden).toBe(true);
    // Wait for the telegraph to start: it reveals the squad.
    let n = 0;
    while (e.windup <= 0 && n++ < 120) steps(w, 1);
    expect(e.windup).toBeGreaterThan(0);
    expect(e.hidden).toBe(false);
    // Fire, then stay visible for the exposure window.
    while (e.windup > 0) steps(w, 1);
    expect(e.exposed).toBeGreaterThan(0);
    steps(w, Math.floor((CONCEALMENT.afterFire * 0.9) / SIM_DT));
    expect(e.hidden).toBe(false);
    e.cooldown = 99;
    steps(w, Math.ceil((CONCEALMENT.afterFire * 0.2) / SIM_DT));
    expect(e.hidden).toBe(true);
  });

  it('autos ignore hidden units and missiles cannot lock on to them', () => {
    const w = world();
    const b = w.behemoth;
    b.autoEnabled[0] = true; // AP guns
    // Hidden squad: in forest, inside AP reach but outside a shrunken reveal radius.
    b.sensors.hp = 0;
    const spot = forestSpot(w, 60);
    const e = parked(w, 'infantry', spot.x, spot.y);
    steps(w, 1);
    expect(e.hidden).toBe(true);
    expect(missileLockTarget(w, e.x, e.y, 20)).toBeNull();
    steps(w, 60);
    expect(e.hp).toBe(e.def.hp);
    expect(w.projectiles.filter((p) => p.owner === 'player')).toHaveLength(0);
  });

  it('being hit reveals it briefly', () => {
    const w = world();
    const spot = forestSpot(w, 160);
    const e = parked(w, 'infantry', spot.x, spot.y);
    e.hp = 1000;
    steps(w, 1);
    expect(e.hidden).toBe(true);
    // A stray bullet (bullets don't clear the trees).
    spawnProjectile(w, 'player', WEAPONS.apGuns, e.x - 20, e.y, 0, { spreadMul: 0 });
    let n = 0;
    while (e.hp === 1000 && n++ < 30) steps(w, 1);
    expect(e.hp).toBeLessThan(1000);
    expect(e.hidden).toBe(false);
    expect(w.terrain.concealsAt(e.x, e.y)).toBe(true);
    steps(w, Math.ceil((CONCEALMENT.afterHit + 0.1) / SIM_DT));
    expect(e.hidden).toBe(true);
  });
});
