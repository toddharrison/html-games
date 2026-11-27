// What I've got (I, SPEC 7.8, 12.4): a page of the kid's notebook, an inventory they keep themselves.
// What they're carrying, each thing sketched in pencil with a note in their words and what they've
// learned about it; and what they've found in the valley so far, sketched the same way. Built from what
// the state knows (GameState.known), never from the deal.

import { PLANTS } from '../content/decks.ts';
import { carryLimit, load, maxSlots } from '../sim/inventory.ts';
import { itemDef } from '../content/items.ts';
import { ITEM_NOTES } from '../content/itemNotes.ts';
import { TOOLS } from '../content/protagonists.ts';
import { itemName } from '../sim/food.ts';
import { fact, lookName, ROWS, type Row } from '../sim/knowledge.ts';
import type { Fact, GameState, Item } from '../sim/state.ts';
import { sketchCopy, type SketchOf } from '../render/sketch.ts';
import { h } from './dom.ts';

export type PackTab = 'carrying' | 'found';

/** What a learned value means, as the kid wrote it beside the sketch. */
const KNOWN: Record<string, string> = {
  sparks: 'It throws sparks off steel!',
  edge: 'It flakes to a sharp edge.',
  crumbles: 'It just crumbles.',
  inert: 'Nothing happens when I strike it.',
  catches: 'It catches a spark.',
  slow: 'It catches, but slowly.',
  fails: "It won't catch.",
  'long-burning': 'It burns long and slow.',
  smoky: 'It burns smoky.',
  quick: 'It burns up fast.',
  plain: 'It burns okay.',
  drill: 'It works for the bow drill.',
  'not for the drill': 'No good for the bow drill.',
  safe: 'Safe to eat.',
  nourishing: 'Good food.',
  poor: 'Not much food in it.',
  sickening: "It made me sick. Don't eat it.",
  deadly: 'Poison! Never eat this.',
  insects: 'It keeps the insects off.',
  irritant: 'It stings. No good.',
  nothing: 'It does nothing.',
};

/** The row a carried dealt thing belongs to. */
function rowOf(k: string): Row | null {
  return k === 'plant' ? 'plant' : k === 'herb' ? 'remedy' : k === 'stone' ? 'stone' : k === 'firewood' ? 'wood' : k === 'tinder' ? 'tinder' : null;
}

function knownLine(f: Fact | null): string {
  if (!f) return "I don't know what it does yet.";
  const said = KNOWN[f.value] ?? `${f.value[0]!.toUpperCase()}${f.value.slice(1)}.`;
  return f.level === 'known' ? said : `${said.replace(/[.!]$/, '')}, I think.`;
}

function sketchOf(row: Row, i: number): SketchOf {
  if (row === 'plant') return { k: 'plant', plant: { kind: PLANTS[i]!.kind, tint: PLANTS[i]!.tint } };
  if (row === 'remedy') return { k: 'herb' };
  if (row === 'stone') return { k: 'stone' };
  if (row === 'wood') return { k: 'firewood' };
  return { k: 'tinder' };
}

const art = (of: SketchOf) => sketchCopy(of, 'sketch');

/** The kid's note on a carried thing: what it is to them, and what they've learned of it. */
export function noteOn(s: GameState, it: Item): string {
  const row = rowOf(it.k);
  if (row && it.d !== undefined) {
    const f = fact(s, row, it.d);
    return f || row === 'plant' || row === 'remedy' ? knownLine(f) : (ITEM_NOTES[it.k] ?? '');
  }
  const tool = TOOLS.find((t) => t.id === it.k);
  if (tool) return ITEM_NOTES[it.k] ?? `Good for ${tool.strong}.`;
  return ITEM_NOTES[it.k] ?? '';
}

function freshness(s: GameState, it: Item): string {
  const food = itemDef(it.k).food;
  if (!food?.spoils || it.t === undefined) return '';
  const left = food.spoils - (s.tick - it.t) / 10;
  return left < 240 ? 'going off!' : left < 1440 ? 'eat soon' : '';
}

function carrying(s: GameState, use: (slot: number) => void): HTMLElement[] {
  const inv = s.inventory;
  const head = h(
    'p',
    { class: 'keys' },
    `Pockets and hands: ${inv.length} of ${maxSlots(s)} full. Weight: ${load(s).toFixed(1)} of ${carryLimit(s)}${load(s) > carryLimit(s) * 0.85 ? ', heavy!' : '.'}`,
  );
  if (!inv.length) return [head, h('p', { class: 'empty' }, 'Nothing. Not even a pocket of lint.')];
  return [
    head,
    ...inv.map((it, i) => {
      const fresh = freshness(s, it);
      return h(
        'button',
        { class: 'thing', onclick: () => use(i), ...(i === 0 ? { autofocus: true } : {}) },
        h('span', { class: 'num' }, i < 9 ? String(i + 1) : ''),
        art({ k: it.k, ...(it.k === 'plant' && it.d !== undefined ? { plant: { kind: PLANTS[it.d]!.kind, tint: PLANTS[it.d]!.tint } } : {}) }),
        h(
          'span',
          { class: 'what' },
          h('b', {}, itemName(s, it), it.n > 1 ? h('span', { class: 'count' }, ` ×${it.n}`) : null, fresh ? h('span', { class: 'fresh' }, ` ${fresh}`) : null),
          h('span', { class: 'note' }, noteOn(s, it)),
        ),
      );
    }),
  ];
}

/** Every thing the kid has come across that can be picked up, by kind, with what they know of it. */
function found(s: GameState): HTMLElement[] {
  const out: HTMLElement[] = [h('p', { class: 'keys' }, "Everything I've found here so far, and what I know about it.")];
  for (const r of ROWS) {
    if (!['plant', 'remedy', 'stone', 'wood', 'tinder'].includes(r.row)) continue;
    // Seen somewhere, or in the pockets now.
    const carried = (i: number) => s.inventory.some((it) => rowOf(it.k) === r.row && it.d === i);
    const seen = r.things.map((_, i) => i).filter((i) => s.known.seen.includes(`${r.row}:${i}`) || carried(i));
    if (!seen.length) continue;
    out.push(h('h3', {}, r.title));
    for (const i of seen) {
      const f = fact(s, r.row, i);
      out.push(
        h(
          'div',
          { class: `thing found${f ? ` ${f.level}` : ''}` },
          art(sketchOf(r.row, i)),
          h('span', { class: 'what' }, h('b', {}, lookName(r.row, i)), h('span', { class: 'note' }, knownLine(f)), f ? h('span', { class: 'how' }, `(${f.how})`) : null),
        ),
      );
    }
  }
  if (out.length === 1) out.push(h('p', { class: 'empty' }, 'Nothing yet. I should look around.'));
  return out;
}

/** The page. `use` opens a carried thing's uses; `choose` turns to the other tab. */
export function packPage(s: GameState, tab: PackTab, use: (slot: number) => void, choose: (t: PackTab) => void): HTMLElement {
  const tabs: [PackTab, string][] = [
    ['carrying', "What I'm carrying"],
    ['found', "What I've found"],
  ];
  return h(
    'div',
    { class: 'screen pack notebook' },
    h('div', { class: 'tabs' }, ...tabs.map(([t, name]) => h('button', { class: t === tab ? 'on' : '', onclick: () => choose(t) }, name))),
    h('div', { class: 'page' }, ...(tab === 'carrying' ? carrying(s, use) : found(s))),
    h('p', { class: 'keys' }, tab === 'carrying' ? 'Click a thing, or its number, for what I can do with it · ← → to turn the page · I or Esc to close' : '← → to turn the page · I or Esc to close'),
  );
}
