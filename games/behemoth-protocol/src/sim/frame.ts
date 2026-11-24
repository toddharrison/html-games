import { approach } from './math';

/**
 * Camera-follow frame (SPEC §4.2). There's no auto-scroll: the frame follows the Behemoth's
 * forward progress with smoothing lag and never scrolls backward, except to center the
 * Immobilized Behemoth for its last stand (`centerFrame`). Spawning and terrain
 * generation key off the frame, so it lives in the sim rather than in the renderer.
 */

export interface FrameConfig {
  /** Frame length along the direction of travel, in world units. */
  width: number;
  /** Where the Behemoth rests, as a fraction of the frame from its trailing edge, at full cruise speed. */
  anchor: number;
  /**
   * Where the Behemoth rests while enemies are behind it: further ahead, so more of the rear is
   * visible. The frame gets there by slowing its scroll, never by moving backward.
   */
  rearAnchor: number;
  /** How fast the anchor shifts between the two (fraction of frame per second). */
  anchorShiftRate: number;
  /** Follow rate (1/s): higher = tighter. Lag is what lets a surge pull ahead in the frame. */
  followRate: number;
  /** Hard limit: the Behemoth's center never gets further ahead than this fraction of the frame. */
  maxAnchor: number;
  /** Last stand: rate (1/s) at which the frame eases to center the stopped Behemoth. */
  centerRate: number;
}

export interface FrameState {
  config: FrameConfig;
  /**
   * World x of the frame's trailing edge (named `left` from the sim's +x-forward axes). Never
   * decreases while the Behemoth can drive.
   */
  left: number;
  /** Current anchor, easing between `anchor` and `rearAnchor`. */
  anchorNow: number;
}

/**
 * @param referenceSpeed speed at which the Behemoth should sit exactly at `anchor`
 *   (its full-health cruise). Faster = it sits further right, slower = further left.
 */
export function createFrame(config: FrameConfig, behemothX: number, referenceSpeed: number): FrameState {
  return { config, left: targetLeft(config, config.anchor, behemothX, referenceSpeed), anchorNow: config.anchor };
}

function targetLeft(c: FrameConfig, anchor: number, bx: number, referenceSpeed: number): number {
  // An exponential follower trails a target moving at speed v by v / rate. Shift the target so
  // that at reference speed the Behemoth lands right on the anchor.
  return bx - c.width * anchor + referenceSpeed / c.followRate;
}

/** @param threatBehind enemies are behind the Behemoth: shift the view to show more of the rear. */
export function stepFrame(f: FrameState, behemothX: number, referenceSpeed: number, dt: number, threatBehind = false): void {
  const c = f.config;
  f.anchorNow = approach(f.anchorNow, threatBehind ? c.rearAnchor : c.anchor, c.anchorShiftRate * dt);
  const target = targetLeft(c, f.anchorNow, behemothX, referenceSpeed);
  if (target > f.left) f.left += (target - f.left) * (1 - Math.exp(-c.followRate * dt));
  const hardMin = behemothX - c.width * c.maxAnchor;
  if (hardMin > f.left) f.left = hardMin;
}

/**
 * Last stand (SPEC §5.1): the frame eases until the stopped Behemoth sits in its middle, so the
 * siege closes in from every side. The one time the frame may move backward.
 */
export function centerFrame(f: FrameState, behemothX: number, dt: number): void {
  const target = behemothX - f.config.width / 2;
  f.left += (target - f.left) * (1 - Math.exp(-f.config.centerRate * dt));
}

export function frameRight(f: FrameState): number {
  return f.left + f.config.width;
}

/** How far inside the frame's ends (beyond its own radius) a unit has to be before it may act. */
const ACT_MARGIN = 4;

/**
 * Whether a unit is far enough inside the frame, along the direction of travel, to act (SPEC §7
 * fairness: nothing opens fire, lifts a lid, drops a mask, or throws a mine from off screen).
 */
export function inFrame(f: FrameState, e: { x: number; def: { radius: number } }): boolean {
  const margin = e.def.radius + ACT_MARGIN;
  return e.x >= f.left + margin && e.x <= frameRight(f) - margin;
}
