// The title screen: the name, the in-development notice (SPEC 11.1), and a way into a valley.

import { TEXT } from '../content/text.ts';
import { DEFAULT_SEED } from '../sim/newGame.ts';
import { VERSION } from '../platform/version.ts';
import { h, settings } from './dom.ts';

const WORDS_A = ['quiet', 'cold', 'high', 'lost', 'grey', 'still', 'far', 'thin', 'late', 'pale', 'long', 'deep'];
const WORDS_B = ['larch', 'tarn', 'ridge', 'scree', 'cirque', 'col', 'fir', 'aspen', 'moraine', 'saddle', 'basin', 'spur'];

/** A new seed for a new valley. Outside the simulation, so ordinary randomness is fine here. */
export function randomSeed(): string {
  const pick = (l: string[]) => l[Math.floor(Math.random() * l.length)]!;
  return `${pick(WORDS_A)}-${pick(WORDS_B)}-${Math.floor(Math.random() * 900) + 100}`;
}

export interface TitleActions {
  /** Start with a seed, or a run code (SPEC 4.3). */
  start(seedOrCode: string): void;
  continue(): void;
  importSave(file: File): void;
}

/** The title screen. It shows "Carry on" once it hears (a `saved` event) that a run is saved. */
export function titleScreen(actions: TitleActions): HTMLElement {
  const last = settings.get<string>('lastSeed', '');
  const seedBox = h('input', { type: 'text', placeholder: 'a seed or run code', value: last, spellcheck: 'false', 'aria-label': 'Seed or run code' });
  const go = (seed: string) => {
    const s = seed.trim();
    if (!s) return;
    if (!s.startsWith('SL1.')) settings.set('lastSeed', s);
    actions.start(s);
  };
  seedBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go(seedBox.value);
  });
  const file = h('input', { type: 'file', accept: '.json,application/json' });
  file.addEventListener('change', () => {
    if (file.files?.[0]) actions.importSave(file.files[0]);
    file.value = '';
  });
  const fromDisk = location.protocol === 'file:';
  const menu = h(
    'div',
    { class: 'menu' },
    h('button', { onclick: () => go(DEFAULT_SEED), autofocus: true }, 'First valley'),
    h('button', { onclick: () => go(randomSeed()) }, 'A new valley'),
    h('div', { class: 'seed' }, seedBox, h('button', { onclick: () => go(seedBox.value) }, 'Go')),
  );
  const screen = h(
    'div',
    { class: 'screen title' },
    h('h1', {}, TEXT.title),
    h('p', { class: 'tagline' }, TEXT.tagline),
    TEXT.inDevelopment ? h('p', { class: 'notice' }, TEXT.inDevelopment) : null,
    menu,
    h('p', { class: 'keys' }, 'WASD or arrows to walk (Shift to turn) · E act · I carry · C make · J journal · R rest · M map · Esc pause'),
    h(
      'div',
      { class: 'foot' },
      import.meta.env.PROD && !fromDisk
        ? h('a', { href: './standalone.html', download: 'snowline.html', title: 'One file that runs from disk, offline' }, 'Download (single file)')
        : h('span'),
      h('label', { class: 'file link' }, 'Load a saved file', file),
      h('span', { class: 'version' }, VERSION),
    ),
  );
  screen.addEventListener('saved', (e) => {
    const r = (e as CustomEvent<{ name: string; day: number; seed: string }>).detail;
    const b = h('button', { onclick: () => actions.continue() }, `Carry on: ${r.name}, day ${r.day}`);
    menu.prepend(b);
    b.focus();
  });
  return screen;
}
