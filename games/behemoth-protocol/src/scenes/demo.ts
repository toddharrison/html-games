import { APPROACH_IDS, type ApproachId } from '../content/approaches';
import { BIOME_IDS, type BiomeId } from '../content/biomes';
import type { BattleModeId } from '../content/modes';
import { hashSeed } from '../sim/rng';

/**
 * The title screen's attract mode: a run of short clips, one per biome in turn, each a battle the
 * autopilot (`input/demoBot.ts`) plays behind the menu. Every clip opens mid-fight: the sim is run
 * ahead (`preroll`) before the first frame is drawn.
 */

export interface DemoClip {
  seed: number;
  biome: BiomeId;
  approach: ApproachId | null;
  mode: BattleModeId;
  /** Seconds of battle simulated before the clip is shown. */
  preroll: number;
  /** Seconds it's shown before the next one. */
  length: number;
  /** A shorter strip for a Breach, so its fortress is in view. */
  battleLength?: number;
  threat: number;
}

/** Shown per clip, and how busy the battles are (above the opening battle's threat, for the show). */
export const DEMO = { length: 10, threat: 10, fade: 0.4 };

/** Modes in the order the clips walk through them (offset per pass, so a biome doesn't always get the same one). */
const MODE_ORDER: readonly BattleModeId[] = ['assault', 'chase', 'breach'];

/** Clip `i` of the show: biomes in turn, modes rotating, the approach drawn from the seed. */
export function demoClip(i: number, seed: number): DemoClip {
  // Biome b on pass k gets mode b + k, so each pass gives every biome the next mode.
  const b = i % BIOME_IDS.length;
  const pass = Math.floor(i / BIOME_IDS.length);
  const biome = BIOME_IDS[b]!;
  const mode = MODE_ORDER[(b + pass) % MODE_ORDER.length]!;
  const approaches: (ApproachId | null)[] = [null, ...APPROACH_IDS];
  const approach = approaches[hashSeed(seed, 0xde30) % approaches.length]!;
  const base = { seed, biome, approach, mode, length: DEMO.length, threat: DEMO.threat };
  // Start where the action is: a few posts in (Assault), the convoy just caught up with (Chase),
  // the fortress coming into range (Breach, on a short strip).
  if (mode === 'chase') return { ...base, preroll: 5 };
  if (mode === 'breach') return { ...base, preroll: 7, battleLength: 1100 };
  return { ...base, preroll: 16 };
}
