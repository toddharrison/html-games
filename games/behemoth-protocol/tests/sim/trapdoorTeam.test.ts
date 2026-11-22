import { describe, expect, it } from 'vitest';
import { DOCTRINES, DOCTRINE_IDS } from '../../src/content/doctrines';
import { ENEMIES } from '../../src/content/enemies';
import { SPAWNER, TRAPDOOR } from '../../src/content/tuning';
import { WEAPONS } from '../../src/content/weapons';
import { IDLE_COMMAND } from '../../src/sim/behemoth';
import { spawnEnemy } from '../../src/sim/enemies';
import { encounterMix } from '../../src/sim/encounter';
import { sealed, type Enemy } from '../../src/sim/entities';
import type { SimEvent } from '../../src/sim/events';
import { frameRight } from '../../src/sim/frame';
import { damageEnemy, roundSpec } from '../../src/sim/projectiles';
import { burrowSpot, mobileMix } from '../../src/sim/spawner';
import { blast } from '../../src/sim/trailer';
import { spawnProjectile } from '../../src/sim/weapons';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const DEF = ENEMIES.trapdoorTeam;
const SHELL = roundSpec(WEAPONS.autocannon);

function world(): World {
  const w = createWorld({ seed: 1, frameWidth: 324, fieldRows: 21, recipe: { biome: 'desert', approach: null } });
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

/** A hole ahead of the Behemoth and off to one side. */
const hole = (w: World, ahead: number, across: number): Enemy => spawnEnemy(w, 'trapdoorTeam', w.behemoth.x + ahead, w.behemoth.y + across);

describe('trapdoor team', () => {
  it('is the desert’s own unit: dug in, mostly with the entrenched', () => {
    expect(DEF.biome).toBe('desert');
    expect(DEF.spawn).toBe('burrow');
    expect(DEF.trapdoor).toBeDefined();
    expect(DEF.callout?.per).toBe('run');
    const most = Math.max(...DOCTRINE_IDS.map((d) => DOCTRINES[d].mix.trapdoorTeam ?? 0));
    expect(DOCTRINES.entrenched.mix.trapdoorTeam).toBe(most);
    expect(encounterMix('entrenched', 'desert', null).trapdoorTeam).toBeGreaterThan(0);
    for (const biome of ['temperate', 'arctic', 'industrial', 'wasteland'] as const) expect(encounterMix('entrenched', biome, null).trapdoorTeam).toBeUndefined();
    // Dug in: never arrives in the last stand.
    expect(mobileMix(DOCTRINES.entrenched.mix).trapdoorTeam).toBeUndefined();
  });

  it('is unseen until the sensors sweep it or the lid lifts, and stays marked after', () => {
    const w = world();
    const e = hole(w, 200, -60);
    steps(w, 1);
    expect(e.hidden).toBe(true);
    const log: SimEvent[] = [];
    while (!e.ai.marked && log.length < 1e5) steps(w, 1, log);
    steps(w, 1);
    expect(e.hidden).toBe(false);
    // Shut again later, it's still on the map.
    for (let i = 0; i < 60 * 3; i++) steps(w, 1);
    expect(e.hidden).toBe(false);
  });

  it('waits for the hull to come level, then lifts the lid, fires, and shuts it', () => {
    const w = world();
    const b = w.behemoth;
    const e = hole(w, 120, -50);
    let lifted: number | null = null;
    let fired = false;
    let shutAgain = false;
    for (let i = 0; i < 60 * 8; i++) {
      for (const ev of steps(w, 1)) {
        if (ev.type === 'lidOpen' && lifted === null) lifted = b.x - e.x;
        if (ev.type === 'fire' && ev.owner === 'enemy' && ev.weapon === 'trapdoorRocket') fired = true;
      }
      if (fired && e.ai.lid === 'shut') shutAgain = true;
    }
    expect(lifted).not.toBeNull();
    expect(lifted!).toBeGreaterThanOrEqual(-TRAPDOOR.lead - 1);
    expect(fired).toBe(true);
    expect(shutAgain).toBe(true);
    expect(e.ai.lidT!).toBeLessThanOrEqual(DEF.trapdoor!.shut[1]);
  });

  it('gets a second lift as the hull draws away, with the range for it', () => {
    const w = world();
    hole(w, 120, -60);
    const log = steps(w, 60 * 10);
    expect(log.filter((ev) => ev.type === 'fire' && ev.owner === 'enemy' && ev.weapon === 'trapdoorRocket').length).toBeGreaterThanOrEqual(2);
  });

  it('shut, nothing touches it: rounds, blasts, and the autos all pass it by', () => {
    const w = world();
    const b = w.behemoth;
    w.behemoth.autoEnabled.fill(true);
    const e = hole(w, 60, 30);
    e.ai.marked = true;
    e.ai.lidT = 99;
    expect(sealed(e)).toBe(true);
    damageEnemy(w, e, SHELL, 100, 'splash');
    blast(w, e.x, e.y, 60, 500, 'hazard');
    expect(e.hp).toBe(DEF.hp);
    expect(e.alive).toBe(true);
    // The autos have nothing to shoot at; a round fired straight at it flies over.
    const log = steps(w, 60);
    expect(log.some((ev) => ev.type === 'fire' && ev.owner === 'player')).toBe(false);
    void b;
  });

  it('can be hurt once the team pops up, not while the lid is still lifting', () => {
    const w = world();
    const e = hole(w, 60, 30);
    e.ai.lid = 'lifting';
    expect(sealed(e)).toBe(true);
    e.ai.lid = 'open';
    damageEnemy(w, e, SHELL, 100, 'splash');
    expect(e.alive).toBe(false);
  });

  it('pulls the lid down at fire it sees coming in time, dropping its shot; fire from close in gets there first', () => {
    // A round from far off: seen, ducked, and it flies over the shut lid.
    const far = world();
    const e = hole(far, 140, 60);
    e.ai.marked = true;
    e.ai.lid = 'open';
    e.ai.lidT = 2;
    e.windup = 0.3;
    const speed = roundSpec(WEAPONS.autocannon).speed;
    const from = { x: e.x - speed * 0.5, y: e.y };
    spawnProjectile(far, 'player', WEAPONS.autocannon, from.x, from.y, 0, { spreadMul: 0 });
    const log = steps(far, 60);
    expect(log.some((ev) => ev.type === 'lidDuck')).toBe(true);
    expect(e.alive).toBe(true);
    expect(e.hp).toBe(DEF.hp);
    expect(log.some((ev) => ev.type === 'fire' && ev.owner === 'enemy')).toBe(false);
    // From point-blank range (arriving sooner than they can react) it hits.
    const near = world();
    const f = hole(near, 140, 60);
    f.ai.lid = 'open';
    f.ai.lidT = 2;
    f.cooldown = 99;
    spawnProjectile(near, 'player', WEAPONS.autocannon, f.x - speed * (TRAPDOOR.duck.react / 3), f.y, 0, { spreadMul: 0 });
    steps(near, 30);
    expect(f.hp).toBeLessThan(DEF.hp);
  });

  it('the treads crush it, lid or no lid', () => {
    const w = world();
    const e = hole(w, 70, 0);
    e.ai.lidT = 99;
    let cause: string | null = null;
    for (const ev of steps(w, 60 * 4)) if (ev.type === 'enemyDestroyed' && ev.enemy === 'trapdoorTeam') cause = ev.cause;
    expect(cause).toBe('crushed');
  });

  it('is dug into open sand beside the Behemoth’s line, a post’s holes close together', () => {
    const w = world();
    const x = frameRight(w.frame) + 40;
    const first = burrowSpot(w, x)!;
    expect(first).not.toBeNull();
    expect(Math.abs(first.y - w.behemoth.y)).toBeGreaterThanOrEqual(SPAWNER.burrow.offset[0]);
    expect(Math.abs(first.y - w.behemoth.y)).toBeLessThanOrEqual(SPAWNER.burrow.offset[1]);
    const next = burrowSpot(w, x, first)!;
    expect(Math.abs(next.x - first.x)).toBeLessThanOrEqual(SPAWNER.burrow.cluster);
    expect(Math.abs(next.y - first.y)).toBeLessThanOrEqual(SPAWNER.burrow.cluster);
    expect(w.terrain.tileAt(next.x, next.y)?.mat).toBe('ground');
  });
});
