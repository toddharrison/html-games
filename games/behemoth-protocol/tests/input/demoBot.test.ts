import { describe, expect, it } from 'vitest';
import { BIOME_IDS } from '../../src/content/biomes';
import { MODE_IDS } from '../../src/content/modes';
import { demoCommand } from '../../src/input/demoBot';
import { spawnEnemy } from '../../src/sim/enemies';
import { frameRight } from '../../src/sim/frame';
import { createWorld, stepWorld } from '../../src/sim/world';
import { DEMO, demoClip } from '../../src/scenes/demo';

const OPTS = { seed: 2, frameWidth: 324, fieldRows: 36 };

describe('attract-mode autopilot', () => {
  it('holds the lane, keeps rolling, and shoots what it sees', () => {
    const w = createWorld({ ...OPTS, threat: DEMO.threat });
    let fired = 0;
    for (let i = 0; i < 60 * 30 && !w.behemoth.destroyed; i++) {
      const cmd = demoCommand(w);
      if (cmd.fireMain) fired++;
      stepWorld(w, cmd);
      w.events.length = 0;
    }
    expect(w.behemoth.x).toBeGreaterThan(70 + 600);
    expect(Math.abs(w.behemoth.y - w.terrain.laneY(w.behemoth.x))).toBeLessThan(48);
    expect(fired).toBeGreaterThan(0);
  });

  it('aims at a battle mode’s target before anything nearer', () => {
    const w = createWorld({ ...OPTS, objective: { mode: 'chase', strength: 'normal' } });
    w.encounter.posts = [];
    const b = w.behemoth;
    const near = spawnEnemy(w, 'lightTank', b.x + 60, b.y);
    const hauler = w.enemies.find((e) => e.objective)!;
    hauler.x = frameRight(w.frame) - 20;
    const cmd = demoCommand(w);
    expect(cmd.aimX).toBe(hauler.x);
    expect(near.alive).toBe(true);
  });

  it('surges after a convoy; brakes for fortress guns in sight', () => {
    const chase = createWorld({ ...OPTS, objective: { mode: 'chase', strength: 'normal' } });
    expect(demoCommand(chase).throttle).toBe(1);
    const breach = createWorld({ ...OPTS, objective: { mode: 'breach', strength: 'normal' }, battleLength: 1100 });
    expect(demoCommand(breach).throttle).toBe(0);
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
