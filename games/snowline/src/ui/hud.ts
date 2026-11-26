// The HUD (SPEC 2, pillar 2; 12.1): as little as possible. The day and a word for the time, and a
// caption line for the few things worth saying.

import { partOfDay } from '../content/text.ts';
import type { GameState } from '../sim/state.ts';
import { clock } from '../sim/time.ts';
import { h } from './dom.ts';

export class Hud {
  readonly el = h('div', { class: 'hud' });
  private readonly when = h('div', { class: 'when' });
  private readonly caption = h('div', { class: 'caption' });
  private text = '';
  private captionTimer = 0;

  constructor() {
    this.el.append(this.when, this.caption);
  }

  update(state: GameState): void {
    const c = clock(state.tick);
    const text = `Day ${c.day} · ${partOfDay(c.minute)}`;
    if (text !== this.text) {
      this.text = text;
      this.when.textContent = text;
    }
  }

  /** Show lines of text at the foot of the screen, fading after `ms`. */
  say(lines: readonly string[], ms = 6000): void {
    this.caption.replaceChildren(...lines.map((l) => h('p', {}, l)));
    this.caption.classList.add('on');
    clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => this.caption.classList.remove('on'), ms);
  }
}
