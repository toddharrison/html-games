import { describe, expect, it } from 'vitest';
import { BIOME_IDS } from '../../src/content/biomes';
import { MODE_IDS } from '../../src/content/modes';
import { BOT, demoCommand } from '../../src/input/demoBot';
import type { MaterialId } from '../../src/content/terrain';
import { TERRAIN_GEN } from '../../src/content/tuning';
import { spawnEnemy } from '../../src/sim/enemies';
import { frameRight } from '../../src/sim/frame';
import { createWorld, stepWorld, type World } from '../../src/sim/world';
import { DEMO, demoClip } from '../../src/scenes/demo';

const OPTS = { seed: 2, frameWidth: 324, fieldRows: 36 };

const TS = TERRAIN_GEN.tileSize;

/** Clears the ground ahead of the hull (open ground, nothing hidden), so a test can lay out what it needs. */
function clearAhead(w: World): void {
  const b = w.behemoth;
  for (let col = Math.floor(b.x / TS) - 2; col < Math.floor((b.x + BOT.lookAhead + 80) / TS); col++)
    for (let row = 0; row < w.terrain.rows; row++) {
      const t = w.terrain.tile(col, row)!;
      t.mat = 'ground';
      t.state = 'intact';
      t.seen = false;
    }
}

/** Fills tiles ahead of the nose, across rows [y0, y1). */
function lay(w: World, mat: MaterialId, dx0: number, dx1: number, y0: number, y1: number, seen = false): void {
  const nose = w.behemoth.x + w.behemoth.chassis.length / 2;
  for (let col = Math.floor((nose + dx0) / TS); col <= Math.floor((nose + dx1) / TS); col++)
    for (let row = Math.floor(y0 / TS); row < Math.ceil(y1 / TS); row++) {
      const t = w.terrain.tile(col, row)!;
      t.mat = mat;
      t.state = 'intact';
      t.seen = seen;
    }
}

/** No enemies, and the hull on the line the lane takes (so on clear ground it has no reason to steer). */
function quiet(w: World): World {
  w.encounter.posts = [];
  w.enemies.length = 0;
  w.behemoth.y = w.terrain.laneY(w.behemoth.x + BOT.lookAhead);
  return w;
}

describe('autopilot', () => {
  it('keeps rolling, shoots what it sees, and wears its treads less than holding the lane', () => {
    // A naive lane-follower (the old attract bot) against the autopilot, over the same battles.
    const laneBot = (w: World) => {
      const b = w.behemoth;
      const cmd = demoCommand(w);
      const lane = w.terrain.laneY(b.x + 80);
      return { ...cmd, throttle: 0 as const, steer: (Math.abs(lane - b.y) <= 8 ? 0 : lane > b.y ? 1 : -1) as -1 | 0 | 1 };
    };
    const run = (seed: number, bot: (w: World) => ReturnType<typeof demoCommand>) => {
      const w = createWorld({ ...OPTS, seed, threat: DEMO.threat });
      let fired = 0;
      for (let i = 0; i < 60 * 90 && !w.behemoth.destroyed; i++) {
        const cmd = bot(w);
        if (cmd.fireMain) fired++;
        stepWorld(w, cmd);
        w.events.length = 0;
      }
      return { x: w.behemoth.x, treads: w.behemoth.treads.hp, fired };
    };
    let lane = 0;
    let auto = 0;
    for (const seed of [100, 102, 104]) {
      const a = run(seed, demoCommand);
      expect(a.x).toBeGreaterThan(70 + 1800);
      expect(a.fired).toBeGreaterThan(0);
      auto += a.treads;
      lane += run(seed, laneBot).treads;
    }
    expect(auto).toBeGreaterThan(lane);
  }, 30_000); // Full battles: ~2.6 s here, over vitest's 5 s default on a CI runner.

  it('steers round a block of buildings on its line, and brakes into one it can’t miss', () => {
    const w = quiet(createWorld(OPTS));
    clearAhead(w);
    const b = w.behemoth;
    lay(w, 'building', 40, 100, b.y - 24, b.y + 24);
    expect(demoCommand(w).steer).not.toBe(0);

    const wall = quiet(createWorld(OPTS));
    clearAhead(wall);
    lay(wall, 'building', 8, 40, 0, wall.terrain.height);
    expect(demoCommand(wall).throttle).toBe(-1);
  });

  it('drives round a swept mine, but over one it hasn’t seen (it knows only what a player would)', () => {
    const w = quiet(createWorld(OPTS));
    clearAhead(w);
    const b = w.behemoth;
    lay(w, 'mine', 48, 64, b.y - 8, b.y + 8, false);
    expect(demoCommand(w).steer).toBe(0);

    const swept = quiet(createWorld(OPTS));
    clearAhead(swept);
    lay(swept, 'mine', 48, 64, swept.behemoth.y - 8, swept.behemoth.y + 8, true);
    expect(demoCommand(swept).steer).not.toBe(0);
  });

  it('steers out of a marked artillery zone on its line', () => {
    const w = quiet(createWorld(OPTS));
    clearAhead(w);
    const b = w.behemoth;
    w.barrages.push({ x: b.x + 120, y: b.y, radius: 30, from: 0, lands: 2, until: 4 });
    expect(demoCommand(w).steer).not.toBe(0);
  });

  it('surges over open ground with nothing in sight', () => {
    const w = quiet(createWorld(OPTS));
    clearAhead(w);
    expect(demoCommand(w).throttle).toBe(1);
  });

  it('aims at a battle mode’s target before anything nearer, leading it', () => {
    const w = createWorld({ ...OPTS, objective: { mode: 'chase', strength: 'normal' } });
    w.encounter.posts = [];
    const b = w.behemoth;
    const near = spawnEnemy(w, 'lightTank', b.x + 60, b.y);
    const hauler = w.enemies.find((e) => e.objective)!;
    hauler.x = frameRight(w.frame) - 20;
    hauler.vx = 40;
    hauler.vy = 0;
    const cmd = demoCommand(w);
    expect(cmd.aimX).toBeGreaterThan(hauler.x);
    expect(cmd.aimY).toBeCloseTo(hauler.y);
    expect(cmd.fireMissile).toBe(true);
    expect(near.alive).toBe(true);
  });

  it('saves its missiles for the big ones', () => {
    const w = quiet(createWorld(OPTS));
    const b = w.behemoth;
    spawnEnemy(w, 'infantry', b.x + 100, b.y);
    expect(demoCommand(w).fireMain).toBe(true);
    expect(demoCommand(w).fireMissile).toBe(false);
    w.enemies.length = 0;
    spawnEnemy(w, 'siegeTank', b.x + 150, b.y);
    expect(demoCommand(w).fireMissile).toBe(true);
  });

  it('surges after a convoy; brakes for fortress guns in sight', () => {
    const chase = createWorld({ ...OPTS, objective: { mode: 'chase', strength: 'normal' } });
    expect(demoCommand(chase).throttle).toBe(1);
    const breach = createWorld({ ...OPTS, objective: { mode: 'breach', strength: 'normal' }, battleLength: 1100 });
    expect(demoCommand(breach).throttle).not.toBe(1);
    for (let i = 0; i < 60 * 30 && breach.objective.fortress; i++) {
      stepWorld(breach, demoCommand(breach));
      breach.events.length = 0;
    }
    const guns = breach.enemies.filter((e) => e.objective && e.x < frameRight(breach.frame));
    if (guns.length > 0) expect(demoCommand(breach).throttle).toBe(-1);
  });
});

describe('attract-mode clips', () => {
  it('walks through every biome in turn and every mode, each a 10 s clip', () => {
    const clips = Array.from({ length: BIOME_IDS.length * MODE_IDS.length }, (_, i) => demoClip(i, 1000 + i));
    expect(clips.slice(0, BIOME_IDS.length).map((c) => c.biome)).toEqual(BIOME_IDS);
    for (const b of BIOME_IDS) expect(new Set(clips.filter((c) => c.biome === b).map((c) => c.mode)).size).toBe(MODE_IDS.length);
    for (const c of clips) expect(c.length).toBe(DEMO.length);
    expect(clips.find((c) => c.mode === 'breach')!.battleLength).toBeDefined();
    // Every so often a clip at night or in a storm, both turning up.
    const weather = clips.filter((c) => c.condition !== null);
    expect(weather.length).toBe(Math.floor(clips.length / DEMO.conditionEvery));
    expect(new Set(weather.map((c) => c.condition))).toEqual(new Set(['night', 'storm']));
  });
});
