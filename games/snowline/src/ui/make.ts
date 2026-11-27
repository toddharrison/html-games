// The Make page (C, SPEC 8.2, 12.4): a page of the kid's notebook listing what they know how to make,
// grouped by what it's for, each with a picture and its parts. A part the kid can't name yet is written
// as what it's for, with a question mark ("a way to start a fire?"), and gets no tick: the kid doesn't
// know whether what they carry will do. Things for the world (the fire, every build) are placed with a
// preview; the rest are made in the hands.

import { NEEDS, RECIPES, type Need } from '../content/recipes.ts';
import { sketchCopy } from '../render/sketch.ts';
import { makeBook, type MakeEntry, type MakePart } from '../sim/craft.ts';
import type { GameState } from '../sim/state.ts';
import type { World } from '../sim/world.ts';
import { h } from './dom.ts';

const picture = (k: string, cls: string) => sketchCopy({ k }, `sketch ${cls}`);

/** What the entry makes, sketched: the fire, the build, or the made thing. */
function entryPicture(e: MakeEntry): HTMLCanvasElement {
  if (e.id === 'fire' || e.id.startsWith('build:')) return picture(e.id, 'big');
  return picture(RECIPES.find((r) => r.id === e.id)?.out.k ?? e.id, 'big');
}

function part(p: MakePart): HTMLElement {
  // An unknown part has no count or tick: the kid doesn't know what will do, or how much.
  const enough = !p.unknown && p.have >= p.n;
  const count = p.n > 1 && !p.unknown ? `${p.n} ` : '';
  // A bare item name counts up ("8 sticks"); a phrase ("sticks for kindling") is already written for its count.
  const name = p.n > 1 && /^[a-z]+$/.test(p.name) && !p.name.endsWith('s') ? `${p.name}s` : p.name;
  return h(
    'span',
    { class: `part${enough ? ' got' : ''}${p.unknown ? ' unknown' : ''}` },
    // An unknown part gets a question mark, not a drawing of the answer.
    picture(p.unknown ? '?' : p.k, 'icon'),
    `${count}${name}${p.unknown ? '?' : ''}${p.optional ? ' (if I have it)' : ''}`,
    h('span', { class: 'tick' }, p.unknown ? '' : enough ? ' ✓' : p.n > 1 && p.have > 0 ? ` (${p.have})` : ''),
  );
}

function note(e: MakeEntry): string {
  if (e.where === 'placed') return e.id === 'fire' ? 'click to choose where it goes' : `about ${e.minutes} min · click to choose where it goes`;
  if (e.missing) return `need ${e.missing}`;
  return `${e.minutes} min`;
}

/** The page. `choose` is called with an entry that can be started. Number keys pick the first nine. */
export function makePage(s: GameState, w: World, choose: (e: MakeEntry) => void): { el: HTMLElement; entries: MakeEntry[] } {
  const entries = makeBook(s, w);
  const sections: HTMLElement[] = [];
  let n = 0;
  for (const need of Object.keys(NEEDS) as Need[]) {
    const mine = entries.filter((e) => e.need === need);
    if (!mine.length) continue;
    sections.push(h('h3', {}, NEEDS[need]));
    for (const e of mine) {
      n++;
      const blocked = !!e.missing && e.where !== 'placed';
      sections.push(
        h(
          'button',
          { class: `entry${blocked ? ' blocked' : ''}`, onclick: () => !blocked && choose(e), ...(n === 1 ? { autofocus: true } : {}) },
          h('span', { class: 'num' }, n <= 9 ? String(n) : ''),
          entryPicture(e),
          h('span', { class: 'what' }, h('b', {}, e.label), h('span', { class: 'parts' }, ...e.parts.map(part)), h('span', { class: 'note' }, note(e))),
        ),
      );
    }
  }
  const el = h(
    'div',
    { class: 'screen make notebook' },
    h('div', { class: 'tabs' }, h('button', { class: 'on' }, 'Things I can make')),
    h('div', { class: 'page' }, ...sections),
    h('p', { class: 'keys' }, 'Click, or a number key · C or Esc to close'),
  );
  return { el, entries };
}
