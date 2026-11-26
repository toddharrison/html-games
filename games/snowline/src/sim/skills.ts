// Skills (SPEC 8.4): five skills, each 0–5, rising with use (failures too). No points to spend.

import { BACKGROUNDS, type SkillId } from '../content/protagonists.ts';
import type { GameState } from './state.ts';

export const SKILLS: readonly SkillId[] = ['firecraft', 'foraging', 'fishing', 'hunting', 'crafting'];
/** Experience needed for each level, 0–5. */
const LEVELS = [0, 8, 24, 50, 90, 150];

export function level(s: GameState, skill: SkillId): number {
  const xp = s.skills[skill];
  let l = 0;
  while (l < 5 && xp >= LEVELS[l + 1]!) l++;
  return l;
}

/** Starting experience from the background's head start. */
export function startingSkills(background: string): Record<SkillId, number> {
  const mods = BACKGROUNDS.find((b) => b.id === background)?.mods.skills ?? {};
  const out = {} as Record<SkillId, number>;
  for (const k of SKILLS) out[k] = LEVELS[mods[k] ?? 0]!;
  return out;
}

export function practise(s: GameState, skill: SkillId, xp: number): void {
  const mult = BACKGROUNDS.find((b) => b.id === s.protagonist.background)?.mods.skillGain ?? 1;
  s.skills[skill] += xp * mult;
}

/** Work goes this much faster at each level (a multiplier on time). */
export function speedAt(s: GameState, skill: SkillId): number {
  return 1 - 0.07 * level(s, skill);
}
