// A note (SPEC 12.2): when the kid has a thought or works something out, the game stops and it shows on
// a slip of the notebook's paper in the middle of the screen, in the kid's hand, until the player is done
// reading it. Several in a row come one after another.

import { h } from './dom.ts';

export type Note =
  | { kind: 'thought'; text: string; hint: string }
  | { kind: 'insight'; title: string; line: string; sub: string };

/** The note's page: the thought (with how to act on it) or the insight, and how to carry on. */
export function notePage(n: Note, more: number): HTMLElement {
  const body =
    n.kind === 'thought'
      ? [h('p', { class: 'thought' }, n.text), ...(n.hint ? [h('p', { class: 'hint' }, n.hint)] : [])]
      : [h('p', { class: 'title' }, n.title), h('p', { class: 'line' }, n.line), h('p', { class: 'sub' }, n.sub)];
  const on = more > 0 ? `more (${more})` : 'carry on';
  return h('div', { class: `note ${n.kind}` }, ...body, h('p', { class: 'keys' }, `Click or press E to ${on}`));
}
