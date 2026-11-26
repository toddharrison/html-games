// The HUD (SPEC 2 pillar 2, 7.1, 12.1): as little as possible. The day; the six vitals as small marks
// that fill and empty (exact numbers are in the journal); words for what the survivor feels (wet,
// cold, queasy); what they are doing; and the last few lines of the log.

import { CONDITIONS } from '../content/conditions.ts';
import { partOfDay } from '../content/text.ts';
import type { GameState } from '../sim/state.ts';
import { clock, formatClock } from '../sim/time.ts';
import { h } from './dom.ts';

const VITALS: [keyof GameState['vitals'], string, string][] = [
  ['health', '♥', 'health'],
  ['hydration', '◊', 'water'],
  ['nutrition', '●', 'food'],
  ['rest', '☾', 'rest'],
  ['warmth', '≈', 'warmth'],
  ['morale', '☼', 'spirits'],
];

function state(v: number): string {
  return v > 60 ? 'good' : v > 30 ? 'fair' : v > 10 ? 'low' : 'critical';
}

export class Hud {
  readonly el = h('div', { class: 'hud' });
  private readonly when = h('div', { class: 'when' });
  private readonly vitals = h('div', { class: 'vitals' });
  private readonly feel = h('div', { class: 'feel' });
  private readonly task = h('div', { class: 'task' }, h('span', { class: 'label' }), h('span', { class: 'bar' }, h('span', { class: 'fill' })));
  private readonly lines = h('div', { class: 'lines' });
  private readonly caption = h('div', { class: 'caption' });
  private readonly marks: HTMLElement[] = [];
  private lastKey = '';
  private shownLog = 0;
  private captionTimer = 0;

  constructor() {
    for (const [, icon, name] of VITALS) {
      const m = h('span', { class: 'vital', title: name }, h('span', { class: 'icon' }, icon), h('span', { class: 'pips' }));
      this.marks.push(m);
      this.vitals.append(m);
    }
    this.el.append(this.when, this.vitals, this.feel, this.task, this.lines, this.caption);
  }

  /** Start fresh for a new run, showing nothing older than now. */
  reset(state: GameState): void {
    this.shownLog = state.log.length;
    this.lines.replaceChildren();
    this.lastKey = '';
  }

  update(s: GameState, taskLabel: string | null): void {
    const c = clock(s.tick);
    const watch = s.inventory.some((i) => i.k === 'watch');
    const sleeping = s.sleep ? (s.sleep.awake ? ' · resting' : ' · asleep') : '';
    const text = `Day ${c.day} · ${watch ? formatClock(c) : partOfDay(c.minute)}${sleeping}`;
    if (text !== this.when.textContent) this.when.textContent = text;

    const v = s.vitals;
    const conds = s.conditions.filter((x) => x.since <= s.tick);
    const words: string[] = [];
    if (s.player.wet > 40) words.push('wet');
    if (v.warmth < 30) words.push(v.warmth < 10 ? 'freezing' : 'cold');
    if (v.hydration < 25) words.push('thirsty');
    if (v.nutrition < 20) words.push('hungry');
    if (v.rest < 20) words.push('exhausted');
    for (const cd of conds) words.push(`${CONDITIONS[cd.id].shape} ${CONDITIONS[cd.id].word}`);
    const key = VITALS.map(([k]) => `${state(v[k])}${Math.round(v[k] / 25)}`).join() + words.join();
    if (key !== this.lastKey) {
      this.lastKey = key;
      VITALS.forEach(([k], i) => {
        const m = this.marks[i]!;
        m.className = `vital ${state(v[k])}`;
        const pips = Math.round(v[k] / 25);
        (m.lastChild as HTMLElement).textContent = '▮'.repeat(pips) + '▯'.repeat(4 - pips);
      });
      this.feel.textContent = words.join(' · ');
    }

    this.task.classList.toggle('on', !!s.task && !!taskLabel);
    if (s.task && taskLabel) {
      (this.task.firstChild as HTMLElement).textContent = taskLabel;
      ((this.task.lastChild as HTMLElement).firstChild as HTMLElement).style.width = `${Math.round(100 * (1 - s.task.left / s.task.total))}%`;
    }

    if (s.log.length < this.shownLog) this.shownLog = 0;
    if (s.log.length > this.shownLog) {
      for (const l of s.log.slice(this.shownLog)) {
        const p = h('p', {}, l.text);
        this.lines.append(p);
        setTimeout(() => p.classList.add('old'), 9000);
        setTimeout(() => p.remove(), 11000);
      }
      while (this.lines.childElementCount > 4) this.lines.firstElementChild!.remove();
      this.shownLog = s.log.length;
    }
  }

  /** Show lines of text in the middle of the screen, fading after `ms`. */
  say(lines: readonly string[], ms = 6000): void {
    this.caption.replaceChildren(...lines.map((l) => h('p', {}, l)));
    this.caption.classList.add('on');
    clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => this.caption.classList.remove('on'), ms);
  }
}
