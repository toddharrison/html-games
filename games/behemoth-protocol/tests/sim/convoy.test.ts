import { describe, expect, it } from 'vitest';
import type { ConvoyDef } from '../../src/content/behaviors';
import { ENEMIES } from '../../src/content/enemies';
import { MODES } from '../../src/content/modes';
import { IDLE_COMMAND, type PlayerCommand } from '../../src/sim/behemoth';
import { destroyEnemy } from '../../src/sim/enemies';
import type { Enemy } from '../../src/sim/entities';
import type { SimEvent } from '../../src/sim/events';
import { createWorld, stepWorld, type World } from '../../src/sim/world';

const C = MODES.chase.convoy!;

/** A Chase battle on a quiet field (no posts, no waves) with a Behemoth that can't break or shoot. */
function world(seed = 1): World {
  const w = createWorld({ seed, frameWidth: 324, fieldRows: 21, battleLength: 1e5, objective: { mode: 'chase', strength: 'strong' } });
  w.encounter.posts = [];
  w.encounter.alert.next = 1e9;
  const b = w.behemoth;
  b.reactor.hp = b.reactor.max = 1e9;
  b.treads.hp = b.treads.max = 1e9;
  for (const z of Object.values(b.armor)) z.hp = z.max = 1e9;
  b.autoEnabled.fill(false);
  return w;
}

function run(w: World, n: number, cmd: Partial<PlayerCommand> = {}, events: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < n; i++) {
    stepWorld(w, { ...IDLE_COMMAND, aimX: w.behemoth.x + 200, aimY: w.behemoth.y, ...cmd });
    events.push(...w.events);
    w.events.length = 0;
  }
  return events;
}

const convoy = (w: World) => w.enemies.filter((e) => e.alive && e.def.behavior.kind === 'convoy');
const haulers = (w: World) => w.enemies.filter((e) => e.alive && e.objective);
const escorts = (w: World) => w.enemies.filter((e) => e.alive && e.role?.kind === 'screen');
/** Slides the convoy and its escorts back toward the hull, so it starts `dx` nearer. */
function bringBack(w: World, dx: number) {
  for (const e of [...convoy(w), ...escorts(w)]) e.x -= dx;
}
const offLane = (w: World, e: Enemy) => Math.abs(e.y - w.terrain.laneY(e.x));

describe('chase convoy', () => {
  it('holds its column: a healthy vehicle that fell behind closes up', () => {
    const w = world();
    const col = convoy(w).sort((a, b) => b.x - a.x);
    const last = col[col.length - 1]!;
    last.x -= 90;
    run(w, 60 * 12, { throttle: -1 });
    const ahead = convoy(w)
      .filter((e) => e.x > last.x)
      .sort((a, b) => a.x - b.x)[0]!;
    expect(ahead.x - last.x).toBeLessThan(C.spacing * 1.6);
    // Out of the Behemoth's reach, nobody's alarmed.
    expect(w.objective.alarm).toBe(0);
  });

  it('the Behemoth closing in alarms it once: healthy vehicles sprint and spread across the lane', () => {
    const w = world();
    const b = w.behemoth;
    const tail = Math.min(...convoy(w).map((e) => e.x));
    bringBack(w, tail - (b.x + C.alarm.range + 120));
    const calm = run(w, 60 * 2);
    expect(calm.some((e) => e.type === 'convoyAlarm')).toBe(false);
    const x0 = haulers(w).map((e) => e.x);
    bringBack(w, 140);
    const events = run(w, 60 * 4);
    expect(events.filter((e) => e.type === 'convoyAlarm')).toHaveLength(1);
    expect(w.objective.alarm).toBeGreaterThan(0);
    const spread = haulers(w).map((e) => offLane(w, e));
    expect(Math.max(...spread)).toBeGreaterThan(C.spread * 0.7);
    // Faster than the convoy's plain pace (4 s, less the 140 they were moved back).
    const gained = haulers(w).map((e, i) => e.x + 140 - x0[i]!);
    expect(Math.max(...gained) / 4).toBeGreaterThan(w.objective.convoySpeed);
  });

  it('triage: a badly hurt hauler pulls aside and the rest go on without it', () => {
    const w = world();
    const col = haulers(w).sort((a, b) => b.x - a.x);
    const hurt = col[0]!;
    hurt.hp = hurt.def.hp * (C.hurtAt * 0.5);
    run(w, 60 * 10, { throttle: -1 });
    expect(offLane(w, hurt)).toBeGreaterThan(C.aside * 0.6);
    // It led; now the healthy ones are past it.
    for (const e of col.slice(1)) if (e.alive) expect(e.x).toBeGreaterThan(hurt.x);
  });

  it('the mine layer saves its mines while nothing follows, and lays them on the hull\'s line', () => {
    const w = world();
    const b = w.behemoth;
    const range = (ENEMIES.mineLayer.behavior as ConvoyDef).mines!.range;
    // Out of range ahead (and pulling away from a braking hull).
    const tail = Math.min(...convoy(w).map((e) => e.x));
    bringBack(w, tail - (b.x + range + 20));
    const far = run(w, 60 * 8, { throttle: -1 });
    expect(far.filter((e) => e.type === 'mineLaid')).toHaveLength(0);

    const layer = w.enemies.find((e) => e.alive && e.def.id === 'mineLayer')!;
    layer.x = b.x + range * 0.6;
    layer.y = b.y + 60;
    const laid = run(w, 60 * 8).filter((e) => e.type === 'mineLaid');
    expect(laid.length).toBeGreaterThan(0);
    for (const m of laid) if (m.type === 'mineLaid') expect(Math.abs(m.y - b.y)).toBeLessThan(40);
  });

  it('escorts screen the hauler nearest the hull, and go back to their own behavior once the convoy is gone', () => {
    const w = world();
    const b = w.behemoth;
    expect(escorts(w).length).toBe(C.escorts.strong);
    const lead = Math.max(...convoy(w).map((e) => e.x));
    bringBack(w, lead - (b.x + 260));
    run(w, 60 * 4);
    const ward = haulers(w).sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0]!;
    const toWard = Math.hypot(ward.x - b.x, ward.y - b.y);
    for (const e of escorts(w)) expect(Math.hypot(e.x - b.x, e.y - b.y)).toBeLessThan(toWard);

    const guards = escorts(w);
    for (const h of haulers(w)) destroyEnemy(w, h, 'shot');
    run(w, 2);
    for (const e of guards) if (e.alive) expect(e.role).toBeUndefined();
  });
});
