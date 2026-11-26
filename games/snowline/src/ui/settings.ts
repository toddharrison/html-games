// Settings (SPEC 12.4): text size, fewer lightning flashes, sound, music, and remappable keys. Kept in
// localStorage under `snowline/...` (SPEC 11.6): small conveniences, per browser.

import { DEFAULT_KEYS } from '../platform/input.ts';
import { h, settings } from './dom.ts';

export interface Prefs {
  textSize: number;
  reduceFlashes: boolean;
}

export function loadPrefs(): Prefs {
  return { textSize: 1, reduceFlashes: false, ...settings.get<Partial<Prefs>>('settings', {}) };
}

const ACTION_NAMES: [string, string][] = [
  ['up', 'Walk north'],
  ['down', 'Walk south'],
  ['left', 'Walk west'],
  ['right', 'Walk east'],
  ['act', 'Act on what you face'],
  ['inventory', 'What you carry'],
  ['craft', 'Make something'],
  ['journal', 'Journal'],
  ['rest', 'Rest or sleep'],
  ['map', 'Map'],
  ['pause', 'Pause'],
];

export interface SettingsHooks {
  prefs: Prefs;
  volume: number;
  muted: boolean;
  music: boolean;
  apply(p: Prefs): void;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  setMusic(m: boolean): void;
  rebind(keys: Record<string, string[]>): void;
  back(): void;
}

const keyLabel = (code: string) => code.replace(/^Key|^Digit/, '').replace('Arrow', '').replace('Escape', 'Esc');

export function settingsScreen(hooks: SettingsHooks): HTMLElement {
  const prefs = { ...hooks.prefs };
  const root = h('div', { class: 'screen panel settings' });
  let keys: Record<string, string[]> = { ...DEFAULT_KEYS, ...settings.get<Record<string, string[]>>('keys', {}) };
  let waiting: string | null = null;

  const save = () => {
    settings.set('settings', prefs);
    hooks.apply(prefs);
  };

  const draw = () => {
    const sizes = [0.9, 1, 1.2, 1.4];
    root.replaceChildren(
      h('h2', {}, 'Settings'),
      h(
        'div',
        { class: 'row' },
        h('span', {}, 'Text size'),
        ...sizes.map((z) =>
          h('button', { class: prefs.textSize === z ? 'on' : '', onclick: () => ((prefs.textSize = z), save(), draw()) }, `${Math.round(z * 100)}%`),
        ),
      ),
      h(
        'label',
        { class: 'row' },
        h('input', { type: 'checkbox', ...(prefs.reduceFlashes ? { checked: true } : {}), onchange: (e: Event) => ((prefs.reduceFlashes = (e.target as HTMLInputElement).checked), save()) }),
        'Fewer, softer lightning flashes',
      ),
      h(
        'label',
        { class: 'row' },
        'Volume',
        h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: hooks.volume, oninput: (e: Event) => hooks.setVolume(Number((e.target as HTMLInputElement).value)) }),
      ),
      h(
        'label',
        { class: 'row' },
        h('input', { type: 'checkbox', ...(!hooks.muted ? { checked: true } : {}), onchange: (e: Event) => hooks.setMuted(!(e.target as HTMLInputElement).checked) }),
        'Sound',
      ),
      h(
        'label',
        { class: 'row' },
        h('input', { type: 'checkbox', ...(hooks.music ? { checked: true } : {}), onchange: (e: Event) => hooks.setMusic((e.target as HTMLInputElement).checked) }),
        'Music at the moments that matter',
      ),
      h('h3', {}, 'Keys'),
      h(
        'table',
        { class: 'keys-table' },
        ...ACTION_NAMES.map(([a, name]) =>
          h(
            'tr',
            {},
            h('td', {}, name),
            h('td', {}, (keys[a] ?? []).map(keyLabel).join(', ')),
            h('td', {}, h('button', { onclick: () => listen(a) }, waiting === a ? 'Press a key…' : 'Change')),
          ),
        ),
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { onclick: () => ((keys = { ...DEFAULT_KEYS }), settings.set('keys', {}), hooks.rebind(keys), draw()) }, 'Default keys'),
        h('button', { onclick: hooks.back, autofocus: true }, 'Done'),
      ),
      h('p', { class: 'keys' }, 'Shift and a direction turns on the spot. 1–9 use what you carry.'),
    );
  };

  // Listen at the window, before the game's own keys, for the one key press that rebinds.
  const onKey = (e: KeyboardEvent) => {
    removeEventListener('keydown', onKey, true);
    if (!waiting) return;
    e.preventDefault();
    e.stopPropagation();
    const code = e.code;
    if (code !== 'Escape') {
      // A key does one thing: take it from wherever else it was.
      for (const k of Object.keys(keys)) keys[k] = (keys[k] ?? []).filter((c) => c !== code);
      keys[waiting] = [code, ...(keys[waiting] ?? []).slice(1)];
      const changed: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(keys)) if (JSON.stringify(v) !== JSON.stringify(DEFAULT_KEYS[k])) changed[k] = v;
      settings.set('keys', changed);
      hooks.rebind(keys);
    }
    waiting = null;
    draw();
  };
  const listen = (a: string) => {
    waiting = a;
    removeEventListener('keydown', onKey, true);
    addEventListener('keydown', onKey, true);
    draw();
  };
  draw();
  return root;
}
