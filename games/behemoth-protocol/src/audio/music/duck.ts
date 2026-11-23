import type { Placement, SoundId } from '../cues';

/**
 * Ducking (SPEC §11.4 "Music"): the music must never drown out the sound effects, so it dips
 * under the big ones and comes back up. Pure: which sounds duck it, how far, and for how long.
 *
 * A sound's depth is scaled by how loud it lands (its size and its distance falloff), so the
 * Behemoth's own main gun ducks the music and a light tank's far-off shot doesn't. Cab sounds
 * (alarms, the lock tone, the radio) always land at full level: missing one costs the fight.
 */

export interface Duck {
  /** 0–1: the share of the music's level taken away. */
  depth: number;
  /** Seconds it stays down before easing back. */
  hold: number;
}

const DUCK: Partial<Record<SoundId, Duck>> = {
  cannon: { depth: 0.45, hold: 0.25 },
  heavyLaser: { depth: 0.45, hold: 0.25 },
  rocket: { depth: 0.3, hold: 0.2 },
  missile: { depth: 0.25, hold: 0.2 },
  explosion: { depth: 0.5, hold: 0.4 },
  vehicleKill: { depth: 0.45, hold: 0.4 },
  collapse: { depth: 0.35, hold: 0.5 },
  hullHit: { depth: 0.45, hold: 0.3 },
  ram: { depth: 0.35, hold: 0.3 },
  componentBlown: { depth: 0.6, hold: 0.8 },
  immobilized: { depth: 0.7, hold: 1.5 },
  alarm: { depth: 0.55, hold: 1 },
  missileWarning: { depth: 0.55, hold: 1 },
  lockOn: { depth: 0.45, hold: 0.8 },
  incoming: { depth: 0.35, hold: 1.2 },
  // Deep: a sighting call lands on top of the big enemy's stinger.
  radio: { depth: 0.7, hold: 1.2 },
  horn: { depth: 0.35, hold: 1.5 },
  detonation: { depth: 1, hold: 4 },
};

/** Ducks shallower than this aren't worth moving the music for. */
const MIN_DEPTH = 0.08;

/** How a sound ducks the music, or null if it doesn't. */
export function duckFor(sound: SoundId, size: number, at: Placement): Duck | null {
  const d = DUCK[sound];
  if (!d) return null;
  const depth = Math.min(1, d.depth * Math.min(1, Math.max(size, 0.5)) * at.gain);
  return depth < MIN_DEPTH ? null : { depth, hold: d.hold };
}
