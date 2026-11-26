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

export function titleScreen(onStart: (seed: string) => void): HTMLElement {
  const last = settings.get<string>('lastSeed', '');
  const seedBox = h('input', { type: 'text', placeholder: 'a seed', value: last, spellcheck: 'false', 'aria-label': 'Seed' });
  const go = (seed: string) => {
    const s = seed.trim();
    if (!s) return;
    settings.set('lastSeed', s);
    onStart(s);
  };
  seedBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go(seedBox.value);
  });
  const fromDisk = location.protocol === 'file:';
  return h(
    'div',
    { class: 'screen title' },
    h('h1', {}, TEXT.title),
    h('p', { class: 'tagline' }, TEXT.tagline),
    h('p', { class: 'notice' }, TEXT.inDevelopment),
    h(
      'div',
      { class: 'menu' },
      h('button', { onclick: () => go(DEFAULT_SEED), autofocus: true }, 'First valley'),
      h('button', { onclick: () => go(randomSeed()) }, 'A new valley'),
      h('div', { class: 'seed' }, seedBox, h('button', { onclick: () => go(seedBox.value) }, 'Go')),
    ),
    h('p', { class: 'keys' }, 'WASD or arrows to walk · M map · Esc pause'),
    h(
      'div',
      { class: 'foot' },
      import.meta.env.PROD && !fromDisk
        ? h('a', { href: './standalone.html', download: 'snowline.html', title: 'One file that runs from disk, offline' }, 'Download (single file)')
        : h('span'),
      h('span', { class: 'version' }, VERSION),
    ),
  );
}
