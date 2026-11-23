import { describe, expect, it } from 'vitest';
import { DOCTRINES, DOCTRINE_IDS } from '../../src/content/doctrines';
import { ENEMIES } from '../../src/content/enemies';
import { MATERIALS } from '../../src/content/terrain';
import { EVASION, SKI } from '../../src/content/tuning';
import { IDLE_COMMAND } from '../../src/sim/behemoth';
import { spawnEnemy } from '../../src/sim/enemies';
import { encounterMix } from '../../src/sim/encounter';
import type { SimEvent } from '../../src/sim/events';
import { evasionSpread, trackable } from '../../src/sim/weapons';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const DEF = ENEMIES.skiTroops;

function world(seed = 1): World {
  const w = createWorld({ seed, frameWidth: 324, fieldRows: 21, recipe: { biome: 'arctic', approach: null } });
  w.encounter.off = true;
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

describe('ski troops', () => {
  it('are arctic’s own troops: fast, in the open, weaving, mostly with the raiders', () => {
    expect(DEF.biome).toBe('arctic');
    expect(DEF.targetClass).toBe('infantry');
    expect(DEF.mobility).toBe('ski');
    expect(DEF.canHide).toBe(false);
    expect(DEF.behavior.weave).toBeDefined();
    expect(DEF.callout?.per).toBe('run');
    expect(DEF.maxSpeed).toBeGreaterThan(ENEMIES.infantry.maxSpeed * 3);
    const most = Math.max(...DOCTRINE_IDS.map((d) => DOCTRINES[d].mix.skiTroops ?? 0));
    expect(DOCTRINES.raiders.mix.skiTroops).toBe(most);
    expect(encounterMix('raiders', 'arctic', null).skiTroops).toBeGreaterThan(0);
    for (const biome of ['temperate', 'industrial', 'desert', 'wasteland'] as const) expect(encounterMix('raiders', biome, null).skiTroops).toBeUndefined();
  });

  it('glide over snow, drifts, and ice, and slog over anything else', () => {
    const w = world();
    const t = w.terrain;
    const at = (mat: 'ground' | 'snowdrift' | 'ice' | 'thinIce' | 'forest' | 'water') => {
      Object.assign(t.tile(40, 5)!, { mat, state: 'intact', hp: MATERIALS[mat].maxHp });
      return t.speedAt(40.5 * t.tileSize, 5.5 * t.tileSize, 'ski');
    };
    for (const mat of ['ground', 'snowdrift', 'ice', 'thinIce'] as const) expect(at(mat)).toBe(1);
    expect(at('forest')).toBeCloseTo(MATERIALS.forest.speed.foot.intact * SKI.offSnow);
    // Drifts bog everyone else down.
    expect(MATERIALS.snowdrift.speed.foot.intact).toBeLessThan(1);
    // Deep water: wading, like troops on foot (routes go round it or across a ford).
    expect(at('water')).toBeCloseTo(MATERIALS.water.speed.foot.intact * SKI.offSnow);
  });

  it('weave from side to side as they go, and fire on the move', () => {
    const w = world();
    const b = w.behemoth;
    const e = spawnEnemy(w, 'skiTroops', b.x + 140, b.y + 60);
    let flips = 0;
    let last = e.ai.weave;
    let movingShots = 0;
    let shots = 0;
    for (let i = 0; i < 60 * 8 && e.alive; i++) {
      const speed = Math.hypot(e.vx, e.vy);
      for (const ev of steps(w, 1)) {
        if (ev.type === 'fire' && ev.owner === 'enemy') {
          shots++;
          if (speed > 20) movingShots++;
        }
      }
      if (e.ai.weave !== last) flips++;
      last = e.ai.weave;
    }
    expect(flips).toBeGreaterThan(5);
    expect(shots).toBeGreaterThan(0);
    expect(movingShots).toBe(shots);
  });

  it('the fire control can’t track them: automatic fire spreads wider, and they last longer for it', () => {
    const w = world();
    expect(evasionSpread(spawnEnemy(w, 'skiTroops', 300, 80))).toBe(EVASION.autoSpread);
    expect(evasionSpread(spawnEnemy(w, 'infantry', 300, 80))).toBe(1);
    // The stock autos against one team, and against the same team that doesn't weave or dodge the fire control.
    const lasts = (evasive: boolean) => {
      let total = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const v = world(seed);
        const b = v.behemoth;
        const e = spawnEnemy(v, 'skiTroops', b.x + 140, b.y + (seed % 2 ? 60 : -60));
        if (!evasive) e.def = { ...e.def, behavior: { ...e.def.behavior, weave: undefined } };
        let i = 0;
        for (; i < 60 * 40 && e.alive; i++) steps(v, 1);
        total += i;
      }
      return total;
    };
    expect(lasts(true)).toBeGreaterThan(lasts(false) * 1.5);
  });

  it('the autos hold fire until a skier has held a line for a moment after each jink', () => {
    const w = world();
    const e = spawnEnemy(w, 'skiTroops', 300, 80);
    e.ai.weaveAge = 0;
    expect(trackable(e)).toBe(false);
    e.ai.weaveAge = EVASION.settle;
    expect(trackable(e)).toBe(true);
    expect(trackable(spawnEnemy(w, 'infantry', 300, 80))).toBe(true);
  });

  it('keep clear of the hull rather than weave under it', () => {
    let crushed = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const w = world(seed);
      w.behemoth.autoEnabled.fill(false);
      const b = w.behemoth;
      const e = spawnEnemy(w, 'skiTroops', b.x + 140, b.y + (seed % 2 ? 60 : -60));
      for (const ev of steps(w, 60 * 20)) if (ev.type === 'enemyDestroyed' && ev.cause === 'crushed') crushed++;
      void e;
    }
    expect(crushed).toBeLessThanOrEqual(1);
  });

  it('are called out the first time a run meets them', () => {
    const w = world();
    spawnEnemy(w, 'skiTroops', w.behemoth.x + 120, w.behemoth.y + 60);
    const log = steps(w, 1);
    expect(log.filter((ev) => ev.type === 'sighted' && ev.enemy === 'skiTroops')).toHaveLength(1);
  });
});
