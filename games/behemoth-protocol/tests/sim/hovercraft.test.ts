import { describe, expect, it } from 'vitest';
import { skirmisher, type RaiderDef } from '../../src/content/behaviors';
import { ENEMIES } from '../../src/content/enemies';
import { MATERIALS, type MaterialId } from '../../src/content/terrain';
import { IDLE_COMMAND, hitched } from '../../src/sim/behemoth';
import { tailX } from '../../src/sim/ai/steer';
import { spawnEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import type { SimEvent } from '../../src/sim/events';
import { newRun } from '../../src/sim/run';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const DEF = ENEMIES.hovercraft;
const RAID = DEF.behavior as RaiderDef;

/** Open ground for the first 200 columns, no encounters, the Behemoth's autos off. */
function world(seed = 1, trailer = false): World {
  const w = createWorld({ seed, frameWidth: 324, fieldRows: 21, ...(trailer ? { behemoth: newRun(1, 'class2', ['trailer']).behemoth } : {}) });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  for (let c = 0; c < 200; c++) for (let r = 0; r < w.terrain.rows; r++) setTile(w, c, r, 'ground');
  return w;
}

function setTile(w: World, c: number, r: number, mat: MaterialId) {
  const t = w.terrain.tile(c, r);
  if (t) Object.assign(t, { mat, state: 'intact', hp: MATERIALS[mat].maxHp });
}

function steps(w: World, n: number, each?: () => void, log: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < n; i++) {
    stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y });
    log.push(...w.events);
    w.events.length = 0;
    each?.();
  }
  return log;
}

/** A hovercraft that can't be killed (so a test sees a whole raid). */
function raiderAt(w: World, x: number, y: number): Enemy {
  const e = spawnEnemy(w, 'hovercraft', x, y);
  e.hp = 1e6;
  e.def = { ...e.def, hp: 1e6 };
  return e;
}

describe('hovercraft raider', () => {
  it('cycles stage, run, break, over and over, staying in view (the camera can leave it at the edge for a moment)', () => {
    const w = world();
    const b = w.behemoth;
    const e = raiderAt(w, b.x + 120, b.y + 80);
    const seen: string[] = [];
    let out = 0;
    steps(w, 60 * 30, () => {
      if (seen[seen.length - 1] !== e.ai.raid) seen.push(e.ai.raid!);
      if (e.x < w.frame.left) out++;
    });
    expect(out / (60 * 30)).toBeLessThan(0.02);
    expect(seen.filter((s) => s === 'run').length).toBeGreaterThanOrEqual(3);
    expect(seen.join(' ')).toContain('stage run break stage');
  });

  it('runs in behind the tail, so its fire falls on the rear more than a circling unit’s', () => {
    const rearShare = (raid: boolean) => {
      let rear = 0;
      let all = 0;
      let behind = false;
      for (let seed = 1; seed <= 4; seed++) {
        const w = world(seed);
        const b = w.behemoth;
        const e = raiderAt(w, b.x + 120, b.y + (seed % 2 ? 80 : -80));
        if (!raid) e.def = { ...e.def, behavior: skirmisher({ orbit: { minRange: 60, maxRange: 110, angularSpeed: 0.6 }, rearInset: 0.12, siege: null }) };
        const log = steps(w, 60 * 30, () => {
          if (e.ai.raid === 'run' && e.x < tailX(b)) behind = true;
        });
        for (const ev of log) {
          if (ev.type !== 'behemothHit') continue;
          all++;
          if (ev.arc === 'rear') rear++;
        }
      }
      return { share: rear / Math.max(1, all), all, behind };
    };
    const raid = rearShare(true);
    const circle = rearShare(false);
    expect(raid.behind).toBe(true);
    expect(raid.all).toBeGreaterThan(10);
    expect(raid.share).toBeGreaterThan(circle.share + 0.15);
  });

  it('cuts a run short when it takes a beating on the way in', () => {
    const w = world();
    const b = w.behemoth;
    const e = raiderAt(w, b.x + 60, b.y + 90);
    steps(w, 1);
    e.ai.raid = 'run';
    e.ai.raidT = RAID.run.max;
    e.ai.raidHp = e.hp;
    steps(w, 1);
    expect(e.ai.raid).toBe('run');
    e.hp -= e.def.hp * RAID.run.flinch;
    steps(w, 1);
    expect(e.ai.raid).toBe('break');
  });

  it('waits out on the water when there is some near its spot', () => {
    const w = world();
    const b = w.behemoth;
    // Deep-water bands down both sides of the field, out where it stages (it changes sides).
    const row = Math.floor(b.y / 16);
    for (let c = 0; c < 200; c++) for (const r0 of [row + 6, row - 9]) for (let r = r0; r <= r0 + 3; r++) setTile(w, c, r, 'water');
    const e = raiderAt(w, b.x + 80, b.y + 60);
    e.ai.orbitDir = 1;
    let onWater = 0;
    let staged = 0;
    steps(w, 60 * 20, () => {
      if (e.ai.raid !== 'stage' || (e.ai.raidT ?? 0) > 0.3) return;
      staged++;
      if (w.terrain.tileAt(e.x, e.y)?.mat === 'water') onWater++;
    });
    expect(staged).toBeGreaterThan(0);
    expect(onWater / staged).toBeGreaterThan(0.6);
  });

  it('goes for the trailer when one is in tow', () => {
    const w = world(1, true);
    const b = w.behemoth;
    expect(hitched(b)).toBeTruthy();
    raiderAt(w, b.x + 100, b.y + 80);
    const log = steps(w, 60 * 20);
    expect(log.filter((ev) => ev.type === 'trailerHit').length).toBeGreaterThan(2);
  });
});
