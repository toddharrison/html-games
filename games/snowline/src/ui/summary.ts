// The summary at the end of a run (SPEC 5.4): how long, what was found, how it ended, and the run code.
// From here: a new valley (the default), the same valley again from day 1, or the title.

import { encodeRun } from '../sim/runCode.ts';
import type { GameState } from '../sim/state.ts';
import { h } from './dom.ts';
import { DAY, HOUR } from '../content/balance.ts';

export function summaryScreen(s: GameState, actions: { newValley(): void; again(): void; title(): void }): HTMLElement {
  const o = s.over!;
  const days = Math.floor(o.tick / DAY);
  const hours = Math.floor((o.tick % DAY) / HOUR);
  const last = s.log[s.log.length - 1]?.text ?? '';
  const known = s.known.facts.filter((f) => f.level === 'known').length;
  const code = encodeRun(s.seed, s.protagonist);
  const codeBox = h('input', { type: 'text', value: code, readonly: true, class: 'code', onfocus: (e: Event) => (e.target as HTMLInputElement).select() });
  return h(
    'div',
    { class: 'screen summary' },
    h('h2', {}, o.kind === 'rescue' ? 'Rescued' : 'The valley kept them'),
    o.kind === 'rescue' ? h('p', { class: 'how' }, o.cause === 'beacon' ? 'They followed the beacon from the tail wreckage.' : o.cause === 'search aircraft' ? 'A search aircraft saw the smoke.' : 'A late aircraft crossing the range saw the smoke.') : null,
    h('p', { class: 'last' }, last),
    h(
      'table',
      {},
      h('tr', {}, h('td', {}, 'Survived'), h('td', {}, `${days} days, ${hours} hours`)),
      h('tr', {}, h('td', {}, 'Valley facts learned'), h('td', {}, String(known))),
      h('tr', {}, h('td', {}, 'Techniques'), h('td', {}, String(s.known.techniques.length))),
      h('tr', {}, h('td', {}, 'Discoveries'), h('td', {}, String(s.stats.discoveries))),
      h('tr', {}, h('td', {}, 'Tiles walked'), h('td', {}, String(s.stats.distance))),
      h('tr', {}, h('td', {}, 'Valley'), h('td', {}, s.seed)),
    ),
    h('p', { class: 'keys' }, 'Run code (the same valley and survivor, to share):'),
    codeBox,
    h(
      'div',
      { class: 'menu' },
      h('button', { onclick: actions.newValley, autofocus: true }, 'A new valley'),
      h('button', { onclick: actions.again }, 'This valley again, from day 1'),
      h('button', { onclick: actions.title }, 'Title'),
    ),
  );
}
