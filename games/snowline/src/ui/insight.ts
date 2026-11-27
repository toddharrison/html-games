// What an insight card says (SPEC 8.1, 12.2): when the kid works something out, a slip of notebook paper
// in the middle of the screen says what, and what it opens up in Make. Built from what the state knows
// for the discovery's key; never from the deal.

import { TECHNIQUES } from '../content/insights.ts';
import { BUILDS, RECIPES } from '../content/recipes.ts';
import { lookName, ROWS, type Row } from '../sim/knowledge.ts';
import type { GameState } from '../sim/state.ts';

export interface InsightText {
  title: string;
  line: string;
  sub: string;
}

/** What a learned value means, as the kid would write it. */
const MEANS: Record<string, string> = {
  sparks: 'throws sparks off steel',
  edge: 'flakes to a sharp edge',
  crumbles: 'just crumbles',
  inert: 'does nothing',
  catches: 'catches a spark',
  slow: 'catches, but slowly',
  fails: "won't catch",
  'long-burning': 'burns long and slow',
  smoky: 'burns smoky',
  quick: 'burns up fast',
  plain: 'burns okay',
  drill: 'works for the bow drill',
  'not for the drill': 'no good for the bow drill',
};

export function insightText(s: GameState, key: string): InsightText | null {
  if (key.startsWith('technique:')) {
    const id = key.slice('technique:'.length);
    const t = TECHNIQUES.find((x) => x.id === id);
    if (!t) return null;
    const opens = [...RECIPES, ...BUILDS].filter((r) => r.technique === id).map((r) => r.label);
    return { title: 'New idea!', line: t.name, sub: opens.length ? `${t.text} Now in Make: ${opens.join(', ')}.` : t.text };
  }
  const f = s.known.facts.find((x) => x.key === key);
  if (!f) return null;
  const [row, i] = key.split(':');
  if (!ROWS.some((r) => r.row === row)) return null;
  const name = lookName(row as Row, Number(i));
  const what = MEANS[f.value];
  const end = f.level === 'known' ? '.' : '?';
  return { title: f.level === 'known' ? 'Now I know' : 'I think...', line: what ? `The ${name} ${what}${end}` : `The ${name}: ${f.value}${end}`, sub: `(${f.how})` };
}
