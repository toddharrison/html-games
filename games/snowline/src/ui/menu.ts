// A list menu: the actions on offer, an item's uses, the rest choices. Number keys pick directly; the
// arrows and Enter (or E) pick too; Esc closes.

import { h } from './dom.ts';

export interface MenuItem {
  label: string;
  hint?: string;
  disabled?: boolean;
}

export class ListMenu {
  readonly el: HTMLElement;
  private cursor = 0;
  private readonly rows: HTMLElement[] = [];
  private readonly items: MenuItem[];
  private readonly pick: (i: number) => void;

  constructor(title: string, items: MenuItem[], pick: (i: number) => void, note?: string) {
    this.items = items;
    this.pick = pick;
    const list = h('ol', { class: 'menu-list' });
    items.forEach((it, i) => {
      const row = h(
        'li',
        { class: it.disabled ? 'disabled' : '', onclick: () => this.choose(i), onmouseenter: () => this.move(i) },
        h('span', { class: 'key' }, i < 9 ? String(i + 1) : ''),
        h('span', { class: 'label' }, it.label),
        it.hint ? h('span', { class: 'hint' }, it.hint) : null,
      );
      this.rows.push(row);
      list.append(row);
    });
    this.el = h(
      'div',
      { class: 'screen panel list' },
      h('h2', {}, title),
      items.length ? list : h('p', { class: 'empty' }, 'Nothing.'),
      note ? h('p', { class: 'keys' }, note) : null,
    );
    this.move(items.findIndex((i) => !i.disabled));
  }

  private move(i: number): void {
    if (i < 0 || i >= this.items.length) return;
    this.cursor = i;
    this.rows.forEach((r, k) => r.classList.toggle('on', k === i));
  }

  choose(i: number): void {
    const it = this.items[i];
    if (it && !it.disabled) this.pick(i);
  }

  /** Returns true if the key was used. */
  key(action: string): boolean {
    if (action === 'up') this.move(this.cursor - 1);
    else if (action === 'down') this.move(this.cursor + 1);
    else if (action === 'confirm' || action === 'act') this.choose(this.cursor);
    else if (action.startsWith('slot')) this.choose(Number(action.slice(4)) - 1);
    else return false;
    return true;
  }
}
