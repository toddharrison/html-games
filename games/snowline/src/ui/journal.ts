// The journal (J, SPEC 8.1, 6.6): the message log, the valley notes chart, the techniques learned, and
// the body in numbers. The notes show only what the survivor knows (GameState.known), never the deal.

import { CONDITIONS } from '../content/conditions.ts';
import {
  BOLDNESS_DECK,
  DETERRENT_DECK,
  PLANT_DECK,
  REMEDY_DECK,
  SIGN_DECK,
  STONE_DECK,
  TINDER_DECK,
  WATER_DECK,
  WOOD_DECK,
  type Deck,
} from '../content/decks.ts';
import { TECHNIQUES } from '../content/insights.ts';
import { ROWS, type Row } from '../sim/knowledge.ts';
import { level, SKILLS } from '../sim/skills.ts';
import type { GameState } from '../sim/state.ts';
import { clock, formatClock } from '../sim/time.ts';
import { h } from './dom.ts';

const DECKS: Record<Row, Deck<string>[]> = {
  plant: [PLANT_DECK],
  remedy: [REMEDY_DECK],
  stone: [STONE_DECK],
  wood: [WOOD_DECK],
  tinder: [TINDER_DECK],
  water: [WATER_DECK],
  temper: [BOLDNESS_DECK, DETERRENT_DECK],
  sign: [SIGN_DECK],
};

export type JournalTab = 'notes' | 'log' | 'skills' | 'body';

/** What a row's deck can hold: each outcome with its possible count, and how many are pinned. */
function deckLine(row: Row, size: number, s: GameState): HTMLElement {
  const parts: HTMLElement[] = [];
  for (const deck of DECKS[row]) {
    const outcomes = [...new Set([...deck.core, ...deck.spares])];
    for (const o of outcomes) {
      const core = deck.core.filter((x) => x === o).length;
      const spare = deck.spares.filter((x) => x === o).length;
      const max = Math.min(core + spare, size - (deck.core.length - core));
      const pinned = s.known.facts.filter((f) => f.key.startsWith(`${row}:`) && f.level === 'known' && f.value.startsWith(o)).length;
      const range = core === max ? `${core}` : `${core}–${max}`;
      const done = pinned >= max;
      parts.push(h('span', { class: `outcome${done ? ' done' : pinned ? ' some' : ''}` }, `${o} ${range}`, pinned ? ` (${pinned} found)` : ''));
    }
  }
  return h('div', { class: 'deck' }, ...parts);
}

function notes(s: GameState): HTMLElement {
  const blocks: HTMLElement[] = [];
  for (const r of ROWS) {
    const seen = r.things.map((_, i) => i).filter((i) => s.known.seen.includes(`${r.row}:${i}`));
    const rows = seen.map((i) => {
      const f = s.known.facts.find((x) => x.key === `${r.row}:${i}`);
      const status = !f ? 'unknown' : f.level === 'known' ? f.value : `${f.value}?`;
      return h(
        'tr',
        { class: f ? f.level : 'unknown' },
        h('td', {}, r.things[i]!.name),
        h('td', { class: 'status' }, status),
        h('td', { class: 'how' }, f ? f.how : ''),
      );
    });
    blocks.push(
      h(
        'section',
        {},
        h('h3', {}, r.title, h('span', { class: 'count' }, ` ${seen.length} of ${r.things.length} found`)),
        deckLine(r.row, r.things.length, s),
        rows.length ? h('table', {}, ...rows) : h('p', { class: 'empty' }, 'None come across yet.'),
      ),
    );
  }
  return h('div', { class: 'notes' }, h('p', { class: 'keys' }, 'What this valley is made of, as far as I can tell. The lists say what each kind of thing can turn out to be.'), ...blocks);
}

function log(s: GameState): HTMLElement {
  const lines = s.log.slice(-120).reverse();
  return h(
    'div',
    { class: 'log' },
    ...lines.map((l) => {
      const c = clock(l.t);
      return h('p', {}, h('span', { class: 'when' }, `Day ${c.day} ${formatClock(c)}`), ' ', l.text);
    }),
  );
}

function skills(s: GameState): HTMLElement {
  const known = TECHNIQUES.filter((t) => s.known.techniques.includes(t.id));
  return h(
    'div',
    { class: 'skills' },
    h('h3', {}, 'Skills'),
    h('table', {}, ...SKILLS.map((k) => h('tr', {}, h('td', {}, k), h('td', {}, '●'.repeat(level(s, k)) + '○'.repeat(5 - level(s, k)))))),
    h('h3', {}, 'What I have worked out'),
    known.length ? h('ul', {}, ...known.map((t) => h('li', {}, h('b', {}, t.name), ': ', t.text))) : h('p', { class: 'empty' }, 'Nothing yet.'),
  );
}

function body(s: GameState): HTMLElement {
  const v = s.vitals;
  const row = (name: string, value: number) => h('tr', {}, h('td', {}, name), h('td', {}, String(Math.round(value))), h('td', {}, h('span', { class: 'bar', style: `width:${Math.round(value)}%` })));
  const conds = s.conditions.filter((c) => c.since <= s.tick);
  return h(
    'div',
    { class: 'body' },
    h('table', {}, row('Health', v.health), row('Water', v.hydration), row('Food', v.nutrition), row('Rest', v.rest), row('Warmth', v.warmth), row('Spirits', v.morale), row('Wet', s.player.wet)),
    h('h3', {}, 'Conditions'),
    conds.length ? h('ul', {}, ...conds.map((c) => h('li', {}, `${CONDITIONS[c.id].shape} ${CONDITIONS[c.id].name} (${Math.round(c.sev)})`))) : h('p', { class: 'empty' }, 'None.'),
  );
}

export function journal(s: GameState, tab: JournalTab, choose: (t: JournalTab) => void): HTMLElement {
  const tabs: [JournalTab, string][] = [
    ['notes', 'Valley notes'],
    ['log', 'Log'],
    ['skills', 'Skills'],
    ['body', 'Body'],
  ];
  return h(
    'div',
    { class: 'screen panel journal' },
    h('div', { class: 'tabs' }, ...tabs.map(([t, name]) => h('button', { class: t === tab ? 'on' : '', onclick: () => choose(t) }, name))),
    h('div', { class: 'page' }, tab === 'notes' ? notes(s) : tab === 'log' ? log(s) : tab === 'skills' ? skills(s) : body(s)),
    h('p', { class: 'keys' }, '← → to turn the page · J or Esc to close'),
  );
}
