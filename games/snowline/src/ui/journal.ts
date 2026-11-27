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
import { partOfDay } from '../content/text.ts';
import { diaryLine } from '../content/diary.ts';
import { h } from './dom.ts';
import { notebookWear, type NotebookWear } from '../sim/notebook.ts';
import { rh } from '../render/tiles.ts';

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

/**
 * Water damage on what was written at tick `t` (SPEC 8.1): only writing from before the last soaking,
 * and then by chance (by hash, the same every time) as the damage grows: smudged, or washed half away.
 */
function blot(wear: NotebookWear, t: number, salt: number): string {
  if (wear.soakedAt < 0 || t > wear.soakedAt || wear.damage <= 0) return '';
  const r = rh(salt, t, 610);
  if (r < Math.max(0, (wear.damage - 25) / 120)) return ' washed';
  if (r < Math.min(0.85, wear.damage / 30)) return ' smudged';
  return '';
}

/** Tide marks, one for each soaking (up to seven), where the water dried on the page. */
function stains(wear: NotebookWear): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let k = 0; k < Math.min(7, wear.soakings); k++) {
    const size = 6 + rh(k, 1, 611) * 9;
    out.push(h('span', { class: 'stain', style: `left:${Math.round(rh(k, 2, 612) * 85)}%;top:${Math.round(rh(k, 3, 613) * 80)}%;width:${size.toFixed(1)}em;height:${(size * (0.7 + rh(k, 4, 614) * 0.4)).toFixed(1)}em` }));
  }
  return out;
}

/** What turned out badly, written in red in the notes; anything else known is written in green. */
const BAD = new Set(['deadly', 'sickening', 'foul', 'irritant', 'crumbles', 'fails', 'inert', 'nothing', 'bold']);

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

function notes(s: GameState, wear: NotebookWear): HTMLElement {
  const blocks: HTMLElement[] = [];
  for (const r of ROWS) {
    const seen = r.things.map((_, i) => i).filter((i) => s.known.seen.includes(`${r.row}:${i}`));
    const rows = seen.map((i) => {
      const f = s.known.facts.find((x) => x.key === `${r.row}:${i}`);
      const status = !f ? '?' : f.level === 'known' ? f.value : `${f.value}?`;
      const verdict = f && f.level === 'known' ? (BAD.has(f.value.split(' ')[0]!) ? ' bad' : ' good') : '';
      return h(
        'tr',
        { class: (f ? f.level : 'unknown') + verdict + blot(wear, f ? f.tick : 0, i * 7 + r.row.length) },
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
        rows.length ? h('table', {}, ...rows) : h('p', { class: 'empty' }, 'None found yet.'),
      ),
    );
  }
  return h('div', { class: 'notes' }, h('p', { class: 'keys' }, 'What this valley is made of, as far as I can tell. The lists say what each kind of thing can turn out to be.'), ...blocks);
}

/**
 * The diary: newest first, under a heading for each stretch of a day ("day 2, early morning"), as the
 * kid would write it: they have no clock, so the part of the day (the time only with a watch); each
 * line in the first person and their own words (content/diary.ts).
 */
function log(s: GameState, wear: NotebookWear): HTMLElement {
  const lines = s.log.slice(-120).reverse();
  const watch = s.inventory.some((i) => i.k === 'watch');
  const out: HTMLElement[] = [];
  let last = '';
  for (const l of lines) {
    const c = clock(l.t);
    const when = watch ? `day ${c.day}, ${formatClock(c)}` : `day ${c.day}, ${partOfDay(c.minute)}`;
    if (when !== last) out.push(h('p', { class: 'when' + blot(wear, l.t, 1) }, when));
    last = when;
    out.push(h('p', { class: blot(wear, l.t, l.text.length).trim() }, diaryLine(l.text, s.protagonist.name, s.protagonist.gender)));
  }
  return h('div', { class: 'log' }, ...out);
}

function skills(s: GameState): HTMLElement {
  const known = TECHNIQUES.filter((t) => s.known.techniques.includes(t.id));
  return h(
    'div',
    { class: 'skills' },
    h('h3', {}, 'What I can do'),
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
    h('h3', {}, 'How I feel'),
    h('table', {}, row('Health', v.health), row('Water', v.hydration), row('Food', v.nutrition), row('Rest', v.rest), row('Warmth', v.warmth), row('Spirits', v.morale), row('Wet', s.player.wet)),
    h('h3', {}, "What's wrong"),
    conds.length ? h('ul', {}, ...conds.map((c) => h('li', {}, `${CONDITIONS[c.id].shape} ${CONDITIONS[c.id].name} (${Math.round(c.sev)})`))) : h('p', { class: 'empty' }, 'Nothing, for now.'),
  );
}

export function journal(s: GameState, tab: JournalTab, choose: (t: JournalTab) => void): HTMLElement {
  // The kid's notebook: the same paper and hand as their map (render/kidMap.ts), with index tabs, and
  // whatever the water has done to it.
  const wear = notebookWear(s);
  const tabs: [JournalTab, string][] = [
    ['notes', 'Valley notes'],
    ['log', 'Diary'],
    ['skills', 'What I can do'],
    ['body', 'How I feel'],
  ];
  return h(
    'div',
    { class: 'screen journal notebook' },
    h('div', { class: 'tabs' }, ...tabs.map(([t, name]) => h('button', { class: t === tab ? 'on' : '', onclick: () => choose(t) }, name))),
    h(
      'div',
      { class: `page${wear.damp > 25 ? ' damp' : ''}` },
      ...stains(wear),
      tab === 'notes' ? notes(s, wear) : tab === 'log' ? log(s, wear) : tab === 'skills' ? skills(s) : body(s),
    ),
    h('p', { class: 'keys' }, '← → to turn the page · J or Esc to close'),
  );
}
