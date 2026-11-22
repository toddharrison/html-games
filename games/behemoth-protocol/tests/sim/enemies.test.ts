import { describe, expect, it } from 'vitest';
import { spawnEnemy, stepEnemies } from '../../src/sim/enemies';
import { chunkRiver, riverCenter } from '../../src/sim/terrain';
import { IDLE_COMMAND } from '../../src/sim/behemoth';
import { frameRight } from '../../src/sim/frame';
import { SIM_DT } from '../../src/sim/loop';
import { createWorld, stepWorld, threatBehind, type World } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };

function quietWorld(): World {
  const w = createWorld(OPTS);
  w.encounter.off = true;
  return w;
}

/** A light tank that holds still (so tests control where it is) with its gun ready. */
function parkedTank(w: World, x: number, y: number) {
  const e = spawnEnemy(w, 'lightTank', x, y);
  e.def = { ...e.def, maxSpeed: 0, accel: 0 };
  e.cooldown = 0;
  e.turret = Math.atan2(w.behemoth.y - y, w.behemoth.x - x);
  return e;
}

function step(w: World, n: number) {
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 100, aimY: w.behemoth.y });
}

const enemyShots = (w: World) => w.projectiles.filter((p) => p.owner === 'enemy').length;

describe('enemy fire fairness', () => {
  it('never fires from outside the visible frame', () => {
    const w = quietWorld();
    const b = w.behemoth;
    // Parked just behind the frame's trailing edge, well within gun range. The frame keeps
    // moving forward, so it stays off-screen.
    parkedTank(w, w.frame.left - 30, b.y + 30);
    let fired = 0;
    for (let i = 0; i < 300; i++) {
      step(w, 1);
      fired += enemyShots(w);
    }
    expect(fired).toBe(0);
  });

  it('telegraphs each shot: lines up for aimTime before firing', () => {
    const w = quietWorld();
    const b = w.behemoth;
    const e = parkedTank(w, b.x + 90, b.y + 50);
    expect(e.x).toBeLessThan(frameRight(w.frame));
    step(w, 1);
    expect(e.windup).toBeGreaterThan(0);
    expect(enemyShots(w)).toBe(0);
    const ticks = Math.floor(e.def.aimTime / SIM_DT) - 3;
    step(w, ticks);
    expect(enemyShots(w)).toBe(0);
    step(w, 6);
    expect(enemyShots(w)).toBe(1);
    expect(e.windup).toBe(0);
  });

  it('a shot in progress is cancelled if the unit leaves the frame', () => {
    const w = quietWorld();
    const b = w.behemoth;
    const e = parkedTank(w, b.x + 90, b.y + 50);
    step(w, 1);
    expect(e.windup).toBeGreaterThan(0);
    e.x = frameRight(w.frame) + 40; // pushed off the top of the screen
    step(w, 60);
    expect(e.windup).toBe(0);
    expect(enemyShots(w)).toBe(0);
  });
});

describe('threat behind', () => {
  it('detects enemies behind the Behemoth, on screen or closing in', () => {
    const w = quietWorld();
    const b = w.behemoth;
    expect(threatBehind(w)).toBe(false);
    const ahead = spawnEnemy(w, 'lightTank', b.x + 100, b.y);
    expect(threatBehind(w)).toBe(false);
    ahead.alive = false;
    spawnEnemy(w, 'lightTank', w.frame.left - 60, b.y);
    expect(threatBehind(w)).toBe(true);
  });
});

describe('crossing rivers', () => {
  const TS = 16;

  /** A world parked just short of its first river, with everything but the river cleared away. */
  function atRiver(seed: number) {
    const w = createWorld({ ...OPTS, seed });
    w.encounter.off = true;
    const rows = w.terrain.rows;
    let rv = null;
    for (let ci = 0; ci < 40 && !rv; ci++) rv = chunkRiver(w.terrain.seed, ci, rows);
    if (!rv) throw new Error('no river');
    let lo = Infinity;
    let hi = -Infinity;
    for (let r = 0; r <= rows; r++) {
      lo = Math.min(lo, riverCenter(rv, r, rows) - rv.half);
      hi = Math.max(hi, riverCenter(rv, r, rows) + rv.half);
    }
    const b = w.behemoth;
    b.x = (lo - 6) * TS;
    b.vx = 0;
    w.frame.left = b.x - 60;
    w.terrain.ensure(b.x - 200, (hi + 20) * TS);
    for (let c = Math.floor(lo) - 15; c <= hi + 15; c++) {
      for (let r = 0; r < rows; r++) {
        const t = w.terrain.tile(c, r)!;
        if (t.mat !== 'water' && t.mat !== 'shallows') Object.assign(t, { mat: 'ground', state: 'intact', hp: 0 });
      }
    }
    return { w, rv, lo, hi };
  }

  it('a tracked unit across the river drives to a ford and crosses, never entering deep water', () => {
    let crossed = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { w, lo, hi } = atRiver(seed);
      const b = w.behemoth;
      // Across from the Behemoth, at either edge of the field.
      const e = spawnEnemy(w, 'lightTank', (hi + 3) * TS, seed % 2 ? 20 : w.terrain.height - 20);
      for (let i = 0; i < 60 * 25 && e.x > lo * TS; i++) {
        stepEnemies(w, SIM_DT);
        expect(w.terrain.speedAt(e.x, e.y, 'tracked')).toBeGreaterThan(0);
        b.vx = 0;
      }
      if (e.x < lo * TS) crossed++;
    }
    expect(crossed).toBe(6);
  });

  it('infantry wade straight across', () => {
    const { w, lo, hi } = atRiver(1);
    const e = spawnEnemy(w, 'infantry', (hi + 2) * TS, w.behemoth.y);
    let wet = false;
    for (let i = 0; i < 60 * 30 && e.x > lo * TS; i++) {
      // Walk them toward the Behemoth's side.
      e.ai.anchor = { x: (lo - 3) * TS, y: e.y };
      e.ai.retargetIn = 10;
      stepEnemies(w, SIM_DT);
      wet ||= w.terrain.tileAt(e.x, e.y)?.mat === 'water';
    }
    expect(wet).toBe(true);
    expect(e.x).toBeLessThan(lo * TS);
  });
});
