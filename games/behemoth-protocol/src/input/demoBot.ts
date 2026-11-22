import { IDLE_COMMAND, type PlayerCommand } from '../sim/behemoth';
import type { Enemy } from '../sim/entities';
import { frameRight } from '../sim/frame';
import type { World } from '../sim/world';

/**
 * The title screen's autopilot (attract mode): turns the battle into commands the way a player's
 * input would, so the sim plays itself. Not meant to play well, just to look like a fight: it holds
 * the guaranteed lane, shoots the nearest thing it can see (a battle mode's targets first), surges
 * after a convoy, and brakes for a fortress's guns. Pure, no Phaser.
 */

/** How far up the lane it steers for, and how far off the lane's center it lets the hull wander. */
const LOOK_AHEAD = 80;
const DEADBAND = 8;
/** Secondary weapons (autocannon) only open up this close. */
const SECONDARY_RANGE = 200;

export function demoCommand(w: World): PlayerCommand {
  const b = w.behemoth;
  const top = frameRight(w.frame);
  const seen = w.enemies.filter((e) => e.alive && !e.hidden && e.x > w.frame.left && e.x < top && e.y > 0 && e.y < w.terrain.height);
  const near = (list: Enemy[]) => list.reduce<Enemy | null>((best, e) => (!best || dist(b, e) < dist(b, best) ? e : best), null);
  const target = near(seen.filter((e) => e.objective)) ?? near(seen);

  const lane = w.terrain.laneY(b.x + LOOK_AHEAD);
  const steer: -1 | 0 | 1 = Math.abs(lane - b.y) <= DEADBAND ? 0 : lane > b.y ? 1 : -1;

  // A convoy still ahead: run it down. Fortress guns ahead and in sight: slow down and shoot.
  const objectivesAhead = w.enemies.filter((e) => e.alive && e.objective && e.x > b.x);
  let throttle: -1 | 0 | 1 = 0;
  if (w.objective.mode === 'chase' && objectivesAhead.length > 0) throttle = 1;
  else if (w.objective.mode === 'breach' && objectivesAhead.some((e) => e.x < top)) throttle = -1;

  return {
    ...IDLE_COMMAND,
    throttle,
    steer,
    aimX: target?.x ?? b.x + 200,
    aimY: target?.y ?? b.y,
    fireMain: target !== null,
    fireSecondary: target !== null && dist(b, target) < SECONDARY_RANGE,
    fireMissile: target !== null,
  };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
