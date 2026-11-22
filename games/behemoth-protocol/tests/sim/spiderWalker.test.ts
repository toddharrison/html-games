import { describe, expect, it } from 'vitest';
import { DOCTRINES, DOCTRINE_IDS } from '../../src/content/doctrines';
import { ENEMIES } from '../../src/content/enemies';
import { groundMobility, MATERIALS, walkerSpeed } from '../../src/content/terrain';
import { WALKER } from '../../src/content/tuning';
import { IDLE_COMMAND, hitched } from '../../src/sim/behemoth';
import { spawnEnemy } from '../../src/sim/enemies';
import { encounterMix } from '../../src/sim/encounter';
import type { SimEvent } from '../../src/sim/events';
import { newRun } from '../../src/sim/run';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const DEF = ENEMIES.spiderWalker;

function world(trailer = false): World {
  const w = createWorld({
    seed: 1,
    frameWidth: 324,
    fieldRows: 21,
    recipe: { biome: 'wasteland', approach: null },
    ...(trailer ? { behemoth: newRun(1, 'class2', ['trailer']).behemoth } : {}),
  });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  for (let c = 0; c < 160; c++) {
    for (let r = 0; r < w.terrain.rows; r++) {
      const t = w.terrain.tile(c, r);
      if (t) Object.assign(t, { mat: 'ground', state: 'intact', hp: 0 });
    }
  }
  return w;
}

function steps(w: World, n: number, log: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < n; i++) {
    stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y });
    log.push(...w.events);
    w.events.length = 0;
  }
  return log;
}

describe('spider walker', () => {
  it('is the wasteland’s own unit, mostly with the raiders, gunning for the trailer and the rear', () => {
    expect(DEF.biome).toBe('wasteland');
    expect(DEF.mobility).toBe('walker');
    expect(DEF.behavior).toBe('stalker');
    expect(DEF.target).toBe('support');
    expect(DEF.callout?.per).toBe('run');
    const most = Math.max(...DOCTRINE_IDS.map((d) => DOCTRINES[d].mix.spiderWalker ?? 0));
    expect(DOCTRINES.raiders.mix.spiderWalker).toBe(most);
    expect(encounterMix('raiders', 'wasteland', null).spiderWalker).toBeGreaterThan(0);
    for (const biome of ['temperate', 'arctic', 'industrial', 'desert'] as const) expect(encounterMix('raiders', biome, null).spiderWalker).toBeUndefined();
  });

  it('strides over the ground that stops or slows everything else, but not deep water', () => {
    for (const mat of ['rock', 'wreck', 'crater', 'tankTrap', 'dune', 'glass', 'ground'] as const) expect(walkerSpeed(mat, 'intact', WALKER.climb)).toBe(1);
    expect(MATERIALS.rock.speed.tracked.intact).toBe(0);
    expect(walkerSpeed('building', 'intact', WALKER.climb)).toBe(WALKER.climb);
    expect(walkerSpeed('building', 'destroyed', WALKER.climb)).toBe(1);
    expect(walkerSpeed('water', 'intact', WALKER.climb)).toBe(0);
    // It fords like a tank.
    expect(groundMobility('walker')).toBe('tracked');
  });

  it('met ahead, it steps out of the way, lets the hull by, and settles in behind, in view', () => {
    const w = world();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'spiderWalker', b.x + 150, b.y);
    const log = steps(w, 60 * 15);
    expect(e.alive).toBe(true);
    expect(log.some((ev) => ev.type === 'enemyDestroyed')).toBe(false);
    expect(e.x).toBeLessThan(b.x - b.chassis.length / 2);
    expect(e.x).toBeGreaterThan(w.frame.left);
  });

  it('shoots into the rear armor', () => {
    const w = world();
    const b = w.behemoth;
    spawnEnemy(w, 'spiderWalker', b.x - 120, b.y + 30);
    const arcs = steps(w, 60 * 12).flatMap((ev) => (ev.type === 'behemothHit' ? [ev.arc] : []));
    expect(arcs.length).toBeGreaterThan(3);
    expect(arcs.filter((a) => a === 'rear').length / arcs.length).toBeGreaterThan(0.7);
  });

  it('goes for the trailer when one is in tow, holding behind it', () => {
    const w = world(true);
    const b = w.behemoth;
    const t = hitched(b)!;
    const e = spawnEnemy(w, 'spiderWalker', b.x - 150, b.y + 30);
    const log = steps(w, 60 * 12);
    expect(log.some((ev) => ev.type === 'trailerHit')).toBe(true);
    expect(e.x).toBeLessThan(t.x);
  });

  it('is called out the first time a run meets one', () => {
    const w = world();
    spawnEnemy(w, 'spiderWalker', w.behemoth.x + 120, w.behemoth.y + 50);
    expect(steps(w, 1).filter((ev) => ev.type === 'sighted' && ev.enemy === 'spiderWalker')).toHaveLength(1);
  });
});
