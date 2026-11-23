import type { RaiderDef } from '../../content/behaviors';
import { hullWidth } from '../behemoth';
import type { Enemy } from '../entities';
import type { World } from '../world';
import type { Goal } from './nav';
import { inFrame, tailX } from './steer';

/**
 * Raider (SPEC §7 hovercraft): hit-and-run from the rear, a cycle of stage → run → break (see
 * `RaiderDef`). It stages wide on its side of the hull (`orbitDir`), riding deep water when there's
 * some near, makes a pass across the rear quarter, firing as it goes, and breaks out on the far
 * side. A run that costs it too much is cut short. Every point is kept in view (`inFrame`).
 */
export function raider(e: Enemy, d: RaiderDef, w: World, dt: number): Goal {
  const b = w.behemoth;
  const ai = e.ai;
  if (!ai.raid) {
    // It starts on the side it's on: no cutting across the prow to get to the other one.
    ai.orbitDir = e.y < b.y ? -1 : 1;
    enter(e, d, w, 'stage');
  }
  ai.raidT = (ai.raidT ?? 0) - dt;
  const side = ai.orbitDir;
  const flank = hullWidth(b) / 2;
  // Every point moves with the hull: steering for them relative to it keeps a pass behind the tail
  // from flying out of the back of the frame.
  let x: number;
  let y: number;
  switch (ai.raid) {
    case 'run': {
      // A pass across the rear quarter: in from its side, aimed well past the hull's line so it's
      // still flat out as it crosses behind the tail.
      const tail = tailX(b);
      ({ x, y } = inFrame(e, w, tail - d.run.depth, b.y - side * d.run.lane));
      const hurt = (ai.raidHp ?? e.hp) - e.hp >= d.run.flinch * e.def.hp;
      // Through: across the hull's line behind the tail.
      const across = side * (e.y - b.y) <= 0 && e.x < tail;
      if (hurt || ai.raidT! <= 0 || across || near(e, x, y, d.arrive)) {
        // It carries on across and breaks out on the far side.
        ai.orbitDir = side === 1 ? -1 : 1;
        enter(e, d, w, 'break');
      }
      break;
    }
    case 'break':
      ({ x, y } = onWater(e, w, b.x + d.break.ahead, b.y + side * (flank + d.break.out), d.water));
      if (ai.raidT! <= 0 || near(e, x, y, d.arrive)) {
        if (w.rng.chance(d.flip)) ai.orbitDir = side === 1 ? -1 : 1;
        enter(e, d, w, 'stage');
      }
      break;
    default: {
      ({ x, y } = onWater(e, w, b.x + (ai.raidAhead ?? 0), b.y + side * (flank + (ai.raidOut ?? 0)), d.water));
      // The wait counts once it's on its spot (or it has waited out the longest wait again getting there).
      const there = near(e, x, y, 2 * d.arrive);
      if (!there && ai.raidT! <= 0 && ai.raidT! > -d.stage.wait[1]) ai.raidT! += dt;
      if (ai.raidT! <= 0 && (there || ai.raidT! <= -d.stage.wait[1])) enter(e, d, w, 'run');
    }
  }
  const p = inFrame(e, w, x, y);
  return { x: p.x, y: p.y, mode: 'pace' };
}

/** Into a step of the cycle: the clock for it, and for a stage a fresh spot and wait. */
function enter(e: Enemy, d: RaiderDef, w: World, step: 'stage' | 'run' | 'break'): void {
  const ai = e.ai;
  ai.raid = step;
  if (step === 'stage') {
    ai.raidAhead = w.rng.range(...d.stage.ahead);
    ai.raidOut = w.rng.range(...d.stage.out);
    ai.raidT = w.rng.range(...d.stage.wait);
  } else if (step === 'run') {
    ai.raidT = d.run.max;
    ai.raidHp = e.hp;
  } else {
    ai.raidT = d.break.max;
  }
}

function near(e: Enemy, x: number, y: number, r: number): boolean {
  return Math.hypot(e.x - x, e.y - y) <= r;
}

/** The nearest deep water (impassable on tracks, open to a hovercraft) within `reach` of (x, y); else (x, y). */
function onWater(e: Enemy, w: World, x: number, y: number, reach: number): { x: number; y: number } {
  if (reach <= 0 || e.def.mobility !== 'hover') return { x, y };
  const t = w.terrain;
  const ts = t.tileSize;
  const k = Math.ceil(reach / ts);
  const c0 = Math.floor(x / ts);
  const r0 = Math.floor(y / ts);
  let best = { x, y };
  let bestD = Infinity;
  for (let c = c0 - k; c <= c0 + k; c++) {
    for (let r = Math.max(0, r0 - k); r <= Math.min(t.rows - 1, r0 + k); r++) {
      const cx = (c + 0.5) * ts;
      const cy = (r + 0.5) * ts;
      const dist = Math.hypot(cx - x, cy - y);
      if (dist > reach || dist >= bestD) continue;
      if (t.speedAt(cx, cy, 'tracked') === 0 && t.speedAt(cx, cy, 'hover') > 0) {
        best = { x: cx, y: cy };
        bestD = dist;
      }
    }
  }
  return best;
}
