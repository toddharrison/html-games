import { describe, expect, it } from 'vitest';
import { DOCTRINES, DOCTRINE_IDS } from '../../src/content/doctrines';
import { ENEMIES } from '../../src/content/enemies';
import { SPAWNER } from '../../src/content/tuning';
import { fromV13, parseRun, serializeRun } from '../../src/save/runSave';
import { IDLE_COMMAND } from '../../src/sim/behemoth';
import { spawnEnemy } from '../../src/sim/enemies';
import { encounterMix } from '../../src/sim/encounter';
import type { Enemy } from '../../src/sim/entities';
import { frameRight } from '../../src/sim/frame';
import { angleDiff } from '../../src/sim/math';
import { completeBattle, newRun, type RunState } from '../../src/sim/run';
import { hedgeSpot, mobileMix } from '../../src/sim/spawner';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const OPTS = { seed: 1, frameWidth: 324, fieldRows: 21 };
const DEF = ENEMIES.hedgeGun;

function world(sighted: RunState['sighted'] = []): World {
  const w = createWorld({ ...OPTS, sighted });
  w.encounter.off = true;
  w.behemoth.autoEnabled.fill(false);
  paint(w, 'ground');
  return w;
}

/** Lays the first 120 columns to one material. */
function paint(w: World, mat: 'ground' | 'forest') {
  for (let c = 0; c < 120; c++) {
    for (let r = 0; r < w.terrain.rows; r++) {
      const t = w.terrain.tile(c, r);
      if (t) Object.assign(t, { mat, state: 'intact', hp: mat === 'forest' ? 40 : 0 });
    }
  }
}

/** A hedgerow tile at a world point. */
function hedge(w: World, x: number, y: number) {
  const ts = w.terrain.tileSize;
  const t = w.terrain.tile(Math.floor(x / ts), Math.floor(y / ts))!;
  Object.assign(t, { mat: 'hedgerow', state: 'intact', hp: 25 });
}

function steps(w: World, n: number) {
  for (let i = 0; i < n; i++) stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y });
}

/** A hedge gun ahead of the Behemoth and off to one side, ready to fire. */
function gun(w: World, ahead: number, across: number): Enemy {
  const b = w.behemoth;
  const e = spawnEnemy(w, 'hedgeGun', b.x + ahead, b.y + across);
  e.cooldown = 0;
  return e;
}

const shots = (w: World) => w.events.filter((ev) => ev.type === 'fire' && ev.owner === 'enemy' && ev.weapon === 'hedgeGunShot');

describe('hedge gun', () => {
  it('is temperate’s own unit: fixed, hidden, laid for crossfire, dug into the hedges', () => {
    expect(DEF.biome).toBe('temperate');
    expect(DEF.spawn).toBe('hedge');
    expect(DEF.behavior).toBe('fixed');
    expect(DEF.canHide).toBe(true);
    expect(DEF.crossfire?.arc).toBe(45);
    expect(DEF.callout?.per).toBe('run');
    // Entrenched fields the most; the last stand never brings one (it can't drive in).
    const most = Math.max(...DOCTRINE_IDS.map((d) => DOCTRINES[d].mix.hedgeGun ?? 0));
    expect(DOCTRINES.entrenched.mix.hedgeGun).toBe(most);
    expect(mobileMix(DOCTRINES.entrenched.mix).hedgeGun).toBeUndefined();
  });

  it('turns up only in the temperate biome', () => {
    expect(encounterMix('entrenched', 'temperate', null).hedgeGun).toBeGreaterThan(0);
    for (const biome of ['arctic', 'industrial', 'desert', 'wasteland'] as const) {
      expect(encounterMix('entrenched', biome, null).hedgeGun).toBeUndefined();
    }
  });

  it('faces across the field toward the Behemoth’s line', () => {
    const w = world();
    expect(gun(w, 200, -60).heading).toBeCloseTo(Math.PI / 2);
    expect(gun(w, 200, 60).heading).toBeCloseTo(-Math.PI / 2);
    // Anything else still faces the Behemoth along the field.
    expect(spawnEnemy(w, 'artillery', w.behemoth.x + 200, 20).heading).toBeCloseTo(Math.PI);
  });

  it('holds its fire until the hull comes level, then hits it in the flank', () => {
    const w = world();
    const b = w.behemoth;
    const e = gun(w, 260, -60);
    let firstAt: number | null = null;
    const arcs: string[] = [];
    for (let i = 0; i < 60 * 14; i++) {
      steps(w, 1);
      if (firstAt === null && shots(w).length > 0) firstAt = Math.abs(angleDiff(e.heading, Math.atan2(b.y - e.y, b.x - e.x)));
      for (const ev of w.events) if (ev.type === 'behemothHit') arcs.push(ev.arc);
      w.events.length = 0;
    }
    // Head-on (the hull 260 ahead, 60 across: 77° off its line) it can't fire; it waits for the hull.
    expect(firstAt).not.toBeNull();
    expect(firstAt!).toBeLessThanOrEqual((DEF.crossfire!.arc * Math.PI) / 180 + 0.15);
    expect(arcs.length).toBeGreaterThan(0);
    expect(arcs.every((a) => a === 'left' || a === 'right')).toBe(true);
    // The turret never swung past its arc.
    expect(Math.abs(angleDiff(e.heading, e.turret))).toBeLessThanOrEqual((DEF.crossfire!.arc * Math.PI) / 180 + 1e-6);
  });

  it('stays hidden in a hedge until it lines up a shot', () => {
    const w = world();
    const b = w.behemoth;
    hedge(w, b.x + 200, b.y - 70);
    const e = gun(w, 200, -70);
    e.cooldown = 99;
    steps(w, 1);
    expect(e.hidden).toBe(true);
    e.cooldown = 0;
    // Drive on until it lays its gun: the glint gives it away.
    for (let i = 0; i < 60 * 10 && e.windup <= 0; i++) steps(w, 1);
    expect(e.windup).toBeGreaterThan(0);
    expect(e.hidden).toBe(false);
  });

  it('goes under the treads', () => {
    const w = world();
    gun(w, 60, 0);
    let cause: string | null = null;
    for (let i = 0; i < 60 * 4 && !cause; i++) {
      steps(w, 1);
      for (const ev of w.events) if (ev.type === 'enemyDestroyed' && ev.enemy === 'hedgeGun') cause = ev.cause;
      w.events.length = 0;
    }
    expect(cause).toBe('crushed');
  });

  it('is found in a hedgerow off the Behemoth’s line, else a wood, else nowhere', () => {
    const w = world();
    const b = w.behemoth;
    const ts = w.terrain.tileSize;
    // Ahead of the frame, where defenders are placed.
    const from = frameRight(w.frame) + SPAWNER.coverBand[0] + ts;
    const to = from + 4 * ts;
    expect(hedgeSpot(w, from, to)).toBeNull();
    // A hedge on the Behemoth's line doesn't count; one well off it does.
    hedge(w, from + ts, b.y);
    expect(hedgeSpot(w, from, to)).toBeNull();
    hedge(w, from + ts, b.y - SPAWNER.hedgeOffset - 2 * ts);
    const spot = hedgeSpot(w, from, to)!;
    expect(Math.abs(spot.y - b.y)).toBeGreaterThanOrEqual(SPAWNER.hedgeOffset);
    expect(w.terrain.tileAt(spot.x, spot.y)?.mat).toBe('hedgerow');
    // No hedge at all: a wood will do.
    const woods = world();
    paint(woods, 'forest');
    const inWood = hedgeSpot(woods, from, to)!;
    expect(woods.terrain.tileAt(inWood.x, inWood.y)?.mat).toBe('forest');
  });

  it('is called out the first time one is seen in a run, and not again', () => {
    const w = world();
    gun(w, 150, -60);
    gun(w, 200, 60);
    steps(w, 1);
    expect(w.events.filter((ev) => ev.type === 'sighted')).toHaveLength(1);
    expect(w.sighted).toContain('hedgeGun');
    // The run remembers it after the battle is won.
    const run = completeBattle(newRun(1), w);
    expect(run.sighted).toContain('hedgeGun');
    const next = world(run.sighted);
    gun(next, 150, -60);
    steps(next, 1);
    expect(next.events.filter((ev) => ev.type === 'sighted')).toHaveLength(0);
  });

  it('a mini-boss is still called out each time, and counted as seen', () => {
    const w = world(['siegeTank']);
    spawnEnemy(w, 'siegeTank', w.behemoth.x + 150, w.behemoth.y + 40);
    steps(w, 1);
    expect(w.events.filter((ev) => ev.type === 'sighted')).toHaveLength(1);
    expect(w.sighted).toEqual(['siegeTank']);
  });
});

describe('sighted list in the run save', () => {
  it('round-trips, and a version 13 save starts with nothing seen', () => {
    const run = { ...newRun(5), sighted: ['hedgeGun', 'lightTank'] as RunState['sighted'] };
    expect(parseRun(serializeRun(run))).toEqual(run);
    const { sighted: _s, ...old } = newRun(5);
    expect((fromV13(old) as RunState).sighted).toEqual([]);
    expect(parseRun(JSON.stringify({ version: 13, run: old }))!.sighted).toEqual([]);
    // An unknown unit is a broken save.
    expect(parseRun(JSON.stringify({ version: 14, run: { ...run, sighted: ['dragon'] } }))).toBeNull();
  });
});
