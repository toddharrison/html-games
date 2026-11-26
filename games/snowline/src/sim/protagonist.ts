// Protagonists (SPEC 4). A candidate is drawn from the seed's `protagonist` stream, one sub-stream per
// candidate number, so "seed X, candidate 2" is always the same person however many rerolls came first.

import { BACKGROUNDS, LOOKS, NAMES, POCKET_ITEMS, TOOLS, TRAITS } from '../content/protagonists.ts';
import { chance, makeRng, nextInt, nextRange, pick, shuffle } from './rng.ts';

export interface Protagonist {
  name: string;
  gender: 'boy' | 'girl';
  age: number;
  looks: { skin: number; hair: number; hairStyle: number; shirt: number; pants: number };
  background: string;
  trait: string;
  tool: string;
  pockets: string[];
}

/** Candidate number `index` for a seed. The selection screen shows 0–2, a reroll 3–5, and so on. */
export function candidate(seed: string, index: number): Protagonist {
  const rng = makeRng(seed, `protagonist:${index}`);
  const gender = chance(rng, 0.5) ? 'girl' : 'boy';
  const name = pick(rng, NAMES[gender]);
  const age = nextRange(rng, 12, 15);
  const looks = {
    skin: nextInt(rng, LOOKS.skin),
    hair: nextInt(rng, LOOKS.hair),
    hairStyle: nextInt(rng, LOOKS.hairStyle),
    shirt: nextInt(rng, LOOKS.shirt),
    pants: nextInt(rng, LOOKS.pants),
  };
  const background = pick(rng, BACKGROUNDS).id;
  const trait = pick(rng, TRAITS).id;
  const tool = pick(rng, TOOLS).id;
  const pockets = shuffle(rng, POCKET_ITEMS.map((p) => p.id)).slice(0, nextRange(rng, 1, 2));
  return { name, gender, age, looks, background, trait, tool, pockets };
}

/** Problems with a protagonist definition (one built by hand, or read from a run code). Empty if valid. */
export function protagonistProblems(p: Protagonist): string[] {
  const out: string[] = [];
  if (!p.name) out.push('no name');
  if (p.gender !== 'boy' && p.gender !== 'girl') out.push('unknown gender');
  if (!(p.age >= 12 && p.age <= 15)) out.push('age outside 12–15');
  if (!BACKGROUNDS.some((b) => b.id === p.background)) out.push(`unknown background ${p.background}`);
  if (!TRAITS.some((t) => t.id === p.trait)) out.push(`unknown trait ${p.trait}`);
  if (!TOOLS.some((t) => t.id === p.tool)) out.push(`unknown tool ${p.tool}`);
  for (const id of p.pockets) if (!POCKET_ITEMS.some((i) => i.id === id)) out.push(`unknown pocket item ${id}`);
  return out;
}

/** He or she, and friends, for the message log. */
export function pronouns(p: Protagonist): { they: string; them: string; their: string } {
  return p.gender === 'girl' ? { they: 'she', them: 'her', their: 'her' } : { they: 'he', them: 'him', their: 'his' };
}
