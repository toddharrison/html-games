// The Make page (C, SPEC 8.2, 12.4): a page of the kid's notebook listing what they know how to make,
// grouped by what it's for, each with a picture and its parts. A part the kid hasn't identified in this
// valley yet is written as what it should be, with a question mark ("wood that burns well?"). The fire
// is placed in the world with a preview; the rest are made or built as before.

import { L } from '../content/loose.ts';
import { NEEDS, type Need } from '../content/recipes.ts';
import { drawLay } from '../render/fireArt.ts';
import { LooseArt } from '../render/looseArt.ts';
import { makeBook, type MakeEntry, type MakePart } from '../sim/craft.ts';
import type { GameState } from '../sim/state.ts';
import type { World } from '../sim/world.ts';
import { h } from './dom.ts';

const art = new LooseArt();

/** The loose thing an item is drawn as, where there's a drawing for it. */
const DRAWN_AS: Record<string, number> = {
  stick: L.twigs,
  firewood: L.driftwood,
  tinder: L.grass,
  stone: L.stones,
  boughs: L.branch,
  fibre: L.stalks,
  feathers: L.feather,
};

function picture(paint: (g: CanvasRenderingContext2D) => void, cls: string): HTMLCanvasElement {
  const c = h('canvas', { width: 16, height: 16, class: cls });
  paint(c.getContext('2d')!);
  return c;
}

function itemPicture(k: string, cls: string): HTMLCanvasElement | null {
  const src = k in DRAWN_AS ? art.get(DRAWN_AS[k]!, 0) : art.item(k);
  return src ? picture((g) => g.drawImage(src, 0, 0), cls) : null;
}

function entryPicture(e: MakeEntry): HTMLCanvasElement | null {
  if (e.id === 'fire') return picture((g) => drawLay(g, 0, 0, { tinder: true, sticks: 2, wood: true }), 'big');
  return e.parts.map((p) => itemPicture(p.k, 'big')).find((c) => c) ?? null;
}

function part(p: MakePart): HTMLElement {
  const enough = p.have >= p.n;
  const count = p.n > 1 ? `${p.n} ` : '';
  // A bare item name counts up ("8 sticks"); a phrase ("sticks for kindling") is already written for its count.
  const name = p.n > 1 && /^[a-z]+$/.test(p.name) && !p.name.endsWith('s') ? `${p.name}s` : p.name;
  return h(
    'span',
    { class: `part${enough ? ' got' : ''}${p.unknown ? ' unknown' : ''}` },
    ...[itemPicture(p.k, 'icon')].filter((c): c is HTMLCanvasElement => !!c),
    `${count}${name}${p.unknown ? '?' : ''}${p.optional ? ' (if I have it)' : ''}`,
    h('span', { class: 'tick' }, enough ? ' ✓' : p.n > 1 && p.have > 0 ? ` (${p.have})` : ''),
  );
}

function note(e: MakeEntry): string {
  if (e.where === 'placed') return 'click to choose where it goes';
  if (e.missing) return `need ${e.missing}`;
  return `${e.minutes} min${e.where === 'here' ? ', right here' : e.where === 'front' ? ', where I face' : ''}`;
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
          ...[entryPicture(e)].filter((c): c is HTMLCanvasElement => !!c),
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
