// The opening scene's page (SPEC 12.2): a few lines of what happened, over black or over the scene, and
// how to carry on.

import type { WakingPage } from '../content/waking.ts';
import { h } from './dom.ts';

export function wakingPage(p: WakingPage, last: boolean): HTMLElement {
  return h(
    'div',
    { class: 'waking-page' },
    ...p.lines.map((l) => h('p', { class: 'line' }, l)),
    ...(p.hint ? [h('p', { class: 'hint' }, p.hint)] : []),
    h('p', { class: 'keys' }, last ? 'Click or press E to get up' : 'Click or press E · Esc to skip'),
  );
}
