// Protagonist selection (SPEC 4.1): three generated candidates for the seed, a reroll for three more,
// or one built by hand.

import { BACKGROUNDS, NAMES, POCKET_ITEMS, TOOLS, TRAITS } from '../content/protagonists.ts';
import { candidate, type Protagonist } from '../sim/protagonist.ts';
import { h } from './dom.ts';

function card(p: Protagonist, pick: () => void, autofocus: boolean): HTMLElement {
  const bg = BACKGROUNDS.find((b) => b.id === p.background)!;
  const tr = TRAITS.find((t) => t.id === p.trait)!;
  const tool = TOOLS.find((t) => t.id === p.tool)!;
  const pockets = p.pockets.map((id) => POCKET_ITEMS.find((i) => i.id === id)?.name ?? id).join(' and ');
  return h(
    'button',
    { class: 'card', onclick: pick, autofocus },
    h('span', { class: 'name' }, `${p.name}, ${p.age}`),
    h('span', { class: 'line' }, h('b', {}, bg.name), ': ', bg.blurb),
    h('span', { class: 'line' }, h('b', {}, tr.name), ': ', tr.blurb),
    h('span', { class: 'line' }, `Carries a ${tool.name} (${tool.strong}), and ${pockets}.`),
  );
}

export function selectScreen(seed: string, start: (p: Protagonist) => void, back: () => void, page = 0): HTMLElement {
  const root = h('div', { class: 'screen select' });
  const draw = (pg: number) => {
    const cands = [0, 1, 2].map((i) => candidate(seed, pg * 3 + i));
    root.replaceChildren(
      h('h2', {}, 'Who walked away from the plane?'),
      h('p', { class: 'keys' }, `Valley: ${seed}`),
      h('div', { class: 'cards' }, ...cands.map((p, i) => card(p, () => start(p), i === 0))),
      h(
        'div',
        { class: 'row' },
        h('button', { onclick: () => draw(pg + 1) }, 'Three others'),
        h('button', { onclick: () => root.replaceChildren(builder(seed, start, () => draw(pg))) }, 'Choose for myself'),
        h('button', { onclick: back }, 'Back'),
      ),
    );
    (root.querySelector('button.card') as HTMLButtonElement | null)?.focus();
  };
  draw(page);
  return root;
}

function builder(seed: string, start: (p: Protagonist) => void, back: () => void): HTMLElement {
  const base = candidate(seed, 0);
  const sel = (label: string, opts: [string, string][], value: string) =>
    h('label', {}, label, h('select', { 'data-k': label }, ...opts.map(([v, t]) => h('option', { value: v, ...(v === value ? { selected: true } : {}) }, t))));
  const gender = sel('Boy or girl', [['girl', 'Girl'], ['boy', 'Boy']], base.gender);
  const name = h('input', { type: 'text', value: base.name, maxlength: 16 });
  const age = sel('Age', ['12', '13', '14', '15'].map((a) => [a, a]), String(base.age));
  const bg = sel('Background', BACKGROUNDS.map((b) => [b.id, `${b.name}: ${b.blurb}`]), base.background);
  const tr = sel('Trait', TRAITS.map((t) => [t.id, `${t.name}: ${t.blurb}`]), base.trait);
  const tool = sel('Tool', TOOLS.map((t) => [t.id, t.name]), base.tool);
  const val = (l: HTMLElement) => (l.querySelector('select') as HTMLSelectElement).value;
  return h(
    'div',
    { class: 'builder' },
    h('h2', {}, 'Choose for yourself'),
    h('label', {}, 'Name', name),
    gender,
    age,
    bg,
    tr,
    tool,
    h(
      'div',
      { class: 'row' },
      h('button', {
        onclick: () => {
          const g = val(gender) as 'boy' | 'girl';
          const nm = name.value.trim() || NAMES[g][0]!;
          start({ ...base, name: nm, gender: g, age: Number(val(age)), background: val(bg), trait: val(tr), tool: val(tool) });
        },
      }, 'Begin'),
      h('button', { onclick: back }, 'Back'),
    ),
  );
}
