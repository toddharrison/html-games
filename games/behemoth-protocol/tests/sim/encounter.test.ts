import { describe, expect, it } from 'vitest';
import { DOCTRINES } from '../../src/content/doctrines';
import { ENEMIES, type EnemyId } from '../../src/content/enemies';
import { ENCOUNTER, SPAWNER } from '../../src/content/tuning';
import { damageComponent, IDLE_COMMAND, type PlayerCommand } from '../../src/sim/behemoth';
import { alertInterval, alertWaveBudget, battleForces, encounterMix, planDefenders, type Forces } from '../../src/sim/encounter';
import type { SimEvent } from '../../src/sim/events';
import { frameRight } from '../../src/sim/frame';
import { liveThreat } from '../../src/sim/spawner';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };

/** Nothing on the Behemoth breaks, so a long test isn't cut short. */
function unbreakable(w: World): World {
  const b = w.behemoth;
  b.reactor.hp = b.reactor.max = 1e9;
  b.treads.hp = b.treads.max = 1e9;
  b.autoEnabled.fill(false);
  return w;
}

interface Arrival {
  id: EnemyId;
  x: number;
  y: number;
  frameLeft: number;
  frameRight: number;
  time: number;
}

/** Steps, logging events and where each new unit first appeared. */
function run(w: World, n: number, cmd: Partial<PlayerCommand> = {}, log: { events: SimEvent[]; arrivals: Arrival[] } = { events: [], arrivals: [] }) {
  const seen = new Set(w.enemies.map((e) => e.id));
  for (let i = 0; i < n; i++) {
    stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y, ...cmd });
    log.events.push(...w.events);
    w.events.length = 0;
    for (const e of w.enemies) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      log.arrivals.push({ id: e.def.id, x: e.x, y: e.y, frameLeft: w.frame.left, frameRight: frameRight(w.frame), time: w.time });
    }
  }
  return log;
}

const threatOf = (ids: EnemyId[]) => ids.reduce((s, id) => s + ENEMIES[id].threat, 0);

describe('encounter mix', () => {
  it('is the doctrine’s mix, shaded by the biome and approach; units the doctrine lacks stay out', () => {
    const plain = encounterMix('combined', 'temperate', null);
    expect(plain).toEqual(DOCTRINES.combined.mix);
    const share = (m: Partial<Record<EnemyId, number>>, id: EnemyId) => m[id]! / Object.values(m).reduce((s, v) => s + v!, 0);
    expect(share(encounterMix('combined', 'temperate', 'urban'), 'infantry')).toBeGreaterThan(share(plain, 'infantry'));
    expect(share(encounterMix('combined', 'desert', 'plain'), 'infantry')).toBeLessThan(share(plain, 'infantry'));
    expect(Object.keys(encounterMix('raiders', 'industrial', 'urban'))).toEqual(Object.keys(DOCTRINES.raiders.mix));
  });

  it('the doctrine splits the force: entrenched holds its posts, raiders keep it mobile', () => {
    const dug = battleForces(7, 'entrenched', 'temperate', null);
    const raid = battleForces(7, 'raiders', 'temperate', null);
    expect(dug.postScale).toBeGreaterThan(1);
    expect(dug.waveScale).toBeLessThan(1);
    expect(raid.postScale).toBeLessThan(1);
    expect(raid.waveScale).toBeGreaterThan(1);
    const total = (f: Forces) => planDefenders(4, f, 0, 5000).reduce((s, p) => s + threatOf(p.units), 0);
    expect(total(dug)).toBeGreaterThan(total(raid));
  });
});

describe('defenders (placed by distance)', () => {
  const d = ENCOUNTER.defenders;
  const force = (threat: number, mix: Forces['mix'] = DOCTRINES.combined.mix): Forces => ({ threat, mix, postScale: 1, waveScale: 1 });

  it('posts are spread from the start to short of the exit, each sized by the threat', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const posts = planDefenders(seed, force(7), 0, 5000);
      expect(posts.length).toBeGreaterThanOrEqual(5);
      expect(posts[0]!.x).toBeGreaterThanOrEqual(d.first[0]);
      expect(posts[0]!.x).toBeLessThanOrEqual(d.first[1]);
      expect(posts.at(-1)!.x).toBeLessThan(5000 - d.clearOfExit);
      for (let i = 1; i < posts.length; i++) {
        const gap = posts[i]!.x - posts[i - 1]!.x;
        expect(gap).toBeGreaterThanOrEqual(d.spacing[0]);
        expect(gap).toBeLessThanOrEqual(d.spacing[1]);
      }
      for (const p of posts) {
        expect(p.units.length).toBeGreaterThan(0);
        expect(threatOf(p.units)).toBeLessThanOrEqual(7 * d.share[1]);
      }
    }
  });

  it('the same seed always plans the same posts; more threat means more defenders', () => {
    expect(planDefenders(5, force(7), 0, 5000)).toEqual(planDefenders(5, force(7), 0, 5000));
    const total = (t: number) => planDefenders(5, force(t), 0, 5000).reduce((s, p) => s + threatOf(p.units), 0);
    expect(total(12)).toBeGreaterThan(total(6) * 1.5);
  });

  it('only fields units from the mix', () => {
    const posts = planDefenders(2, force(10, { infantry: 1, heavyTank: 1 }), 0, 5000);
    expect(posts.flatMap((p) => p.units).every((id) => id === 'infantry' || id === 'heavyTank')).toBe(true);
  });

  it('a post’s units appear beyond the frame’s leading edge once the frame reaches it, not before', () => {
    const w = unbreakable(createWorld({ ...OPTS, threat: 8 }));
    // Waves off: only the posts.
    w.encounter.alert.next = 1e9;
    const first = w.encounter.posts[0]!;
    const log = run(w, 60 * 40);
    expect(w.encounter.posts[0]?.x ?? Infinity).toBeGreaterThan(first.x);
    const fromFirst = log.arrivals.slice(0, first.units.length);
    expect(fromFirst.map((a) => a.id).sort()).toEqual([...first.units].sort());
    for (const a of log.arrivals) {
      expect(a.frameRight + SPAWNER.spawnDistance).toBeGreaterThanOrEqual(first.x);
      expect(a.x).toBeGreaterThan(a.frameRight);
    }
  });
});

describe('the alert clock (reinforcements by time)', () => {
  it('waves come on a shrinking interval, each bigger than the last', () => {
    for (let n = 1; n < 12; n++) {
      expect(alertWaveBudget(7, n + 1)).toBeGreaterThan(alertWaveBudget(7, n));
      expect(alertInterval(n + 1)).toBeLessThanOrEqual(alertInterval(n));
      expect(alertInterval(n)).toBeGreaterThanOrEqual(ENCOUNTER.alert.minInterval);
    }
    expect(alertInterval(100)).toBe(ENCOUNTER.alert.minInterval);

    const w = unbreakable(createWorld({ ...OPTS, threat: 7, battleLength: 1e6 }));
    w.encounter.posts = [];
    const log = run(w, 60 * (ENCOUNTER.alert.firstWave - 0.5));
    expect(log.events.some((e) => e.type === 'alert')).toBe(false);
    expect(w.enemies).toHaveLength(0);
    run(w, 60 * 100, {}, log);
    const waves = log.events.filter((e) => e.type === 'alert');
    expect(waves.map((e) => e.wave)).toEqual(waves.map((_, i) => i + 1));
    expect(waves.length).toBeGreaterThanOrEqual(4);
    expect(log.arrivals.length).toBeGreaterThan(0);
  });

  it('holds wave units back while the field is full', () => {
    const w = unbreakable(createWorld({ ...OPTS, threat: 6, battleLength: 1e6 }));
    w.encounter.posts = [];
    const cap = w.threat * ENCOUNTER.alert.cap;
    // Nothing is shot here (some are crushed or left behind), so the field fills.
    let most = 0;
    for (let i = 0; i < 60 * 240; i++) {
      run(w, 1);
      expect(liveThreat(w)).toBeLessThanOrEqual(cap + 1e-9);
      most = Math.max(most, liveThreat(w));
    }
    expect(most).toBeGreaterThan(cap - 2);
    expect(w.encounter.alert.queue).toBeLessThanOrEqual(cap);
  });

  it('heavy tanks and launchers never come from behind; troops drop into cover ahead or drive in', () => {
    const w = unbreakable(createWorld({ ...OPTS, threat: 12, battleLength: 1e6, mix: { heavyTank: 1, missileLauncher: 1, lightTank: 1, infantry: 1 } }));
    w.encounter.posts = [];
    const log = run(w, 60 * 200);
    const kinds = new Set(log.arrivals.map((a) => a.id));
    expect(kinds.size).toBe(4);
    for (const a of log.arrivals) {
      if (ENEMIES[a.id].spawn === 'ahead') expect(a.x).toBeGreaterThan(a.frameLeft);
    }
    // Light tanks come from every side.
    const light = log.arrivals.filter((a) => a.id === 'lightTank');
    expect(light.some((a) => a.x < a.frameLeft)).toBe(true);
    expect(light.some((a) => a.y < 0 || a.y > w.terrain.height)).toBe(true);
  });

  it('dawdling costs: braking meets more of the enemy on the way to the same spot', () => {
    const meet = (throttle: -1 | 1) => {
      const w = unbreakable(createWorld({ ...OPTS, seed: 3, threat: 7 }));
      const log = run(w, 1, { throttle });
      while (w.behemoth.x < 2500 && w.time < 300) run(w, 30, { throttle }, log);
      return threatOf(log.arrivals.map((a) => a.id));
    };
    expect(meet(-1)).toBeGreaterThan(meet(1) * 1.3);
  });

  it('stops for the last stand and after extraction', () => {
    const w = unbreakable(createWorld({ ...OPTS, threat: 7 }));
    run(w, 60 * 5);
    w.behemoth.treads.hp = w.behemoth.treads.max = 100;
    damageComponent(w.behemoth, 'treads', 1e6, w.events);
    run(w, 2);
    expect(w.lastStand).not.toBeNull();
    const next = w.encounter.alert.next;
    const posts = w.encounter.posts.length;
    run(w, 60 * 5);
    expect(w.encounter.alert.next).toBe(next);
    expect(w.encounter.posts.length).toBe(posts);

    const v = unbreakable(createWorld({ ...OPTS, threat: 7, battleLength: 200 }));
    run(v, 60 * 15, { throttle: 1 });
    expect(v.extractedAt).not.toBeNull();
    const before = v.encounter.alert.next;
    const log = run(v, 60 * 40);
    expect(v.encounter.alert.next).toBe(before);
    expect(log.arrivals).toHaveLength(0);
  });
});
