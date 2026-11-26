// Keyboard to commands (SPEC 11.3 rule 4, 12.4). Held direction keys stack, so letting go of one goes
// back to the one still held. Every other key becomes a named action for the UI. Keys are remappable:
// the bindings live in settings (`snowline/keys`).

import type { Dir } from '../sim/state.ts';
import { settings } from '../ui/dom.ts';
import type { CommandBody } from './session.ts';

export type Action =
  | 'up'
  | 'right'
  | 'down'
  | 'left'
  | 'act'
  | 'inventory'
  | 'craft'
  | 'journal'
  | 'map'
  | 'rest'
  | 'pause'
  | 'debug'
  | 'confirm'
  | `slot${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

/** The default bindings: action -> key codes (SPEC 12.4). */
export const DEFAULT_KEYS: Record<string, string[]> = {
  up: ['KeyW', 'ArrowUp'],
  right: ['KeyD', 'ArrowRight'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  act: ['KeyE', 'Space'],
  inventory: ['KeyI'],
  craft: ['KeyC'],
  journal: ['KeyJ'],
  map: ['KeyM'],
  rest: ['KeyR'],
  pause: ['Escape'],
  debug: ['Backquote'],
  confirm: ['Enter', 'NumpadEnter'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
  slot5: ['Digit5'],
  slot6: ['Digit6'],
  slot7: ['Digit7'],
  slot8: ['Digit8'],
  slot9: ['Digit9'],
};

const MOVES: Record<string, Dir> = { up: 0, right: 1, down: 2, left: 3 };

export function loadBindings(): Record<string, string[]> {
  const saved = settings.get<Record<string, string[]>>('keys', {});
  return { ...DEFAULT_KEYS, ...saved };
}

export class Input {
  private held: Dir[] = [];
  private byCode = new Map<string, Action>();
  /** When false (a menu is open), direction keys become actions for the menu, not movement. */
  playing = false;

  private readonly command: (c: CommandBody) => void;
  private readonly action: (a: Action, e: KeyboardEvent) => void;

  constructor(command: (c: CommandBody) => void, action: (a: Action, e: KeyboardEvent) => void) {
    this.command = command;
    this.action = action;
    this.rebind(loadBindings());
    addEventListener('keydown', (e) => this.down(e));
    addEventListener('keyup', (e) => this.up(e));
    addEventListener('blur', () => this.release());
  }

  rebind(keys: Record<string, string[]>): void {
    this.byCode.clear();
    for (const [a, codes] of Object.entries(keys)) for (const c of codes) this.byCode.set(c, a as Action);
  }

  /** The first key bound to an action, for hints ("E"). */
  keyName(a: Action): string {
    for (const [code, act] of this.byCode) if (act === a) return code.replace(/^Key|^Digit/, '').replace('Escape', 'Esc');
    return '?';
  }

  /** Let go of everything (a menu opened, or the window lost focus). */
  release(): void {
    if (this.held.length) this.command({ c: 'halt' });
    this.held = [];
  }

  private down(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const a = this.byCode.get(e.code);
    if (!a) return;
    const dir = MOVES[a];
    if (dir !== undefined && this.playing) {
      e.preventDefault();
      if (e.repeat) return;
      this.held = this.held.filter((d) => d !== dir);
      this.held.push(dir);
      this.command({ c: 'move', dir });
      return;
    }
    // Out of play, let Space and Enter press the focused button.
    if (!this.playing && (a === 'act' || a === 'confirm') && document.activeElement instanceof HTMLButtonElement) return;
    e.preventDefault();
    if (e.repeat && dir === undefined) return;
    this.action(a, e);
  }

  private up(e: KeyboardEvent): void {
    const a = this.byCode.get(e.code);
    const dir = a ? MOVES[a] : undefined;
    if (dir === undefined || !this.held.includes(dir)) return;
    this.held = this.held.filter((d) => d !== dir);
    const top = this.held[this.held.length - 1];
    this.command(top === undefined ? { c: 'halt' } : { c: 'move', dir: top });
  }
}
