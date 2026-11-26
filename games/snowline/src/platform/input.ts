// Keyboard to commands (SPEC 11.3 rule 4, 12.4). Held direction keys stack, so letting go of one goes
// back to the one still held. Other keys become actions for the UI.

import type { Dir } from '../sim/state.ts';
import type { CommandBody } from './session.ts';

export type Action = 'map' | 'pause' | 'debug';

const DIRS: Record<string, Dir> = {
  ArrowUp: 0,
  KeyW: 0,
  ArrowRight: 1,
  KeyD: 1,
  ArrowDown: 2,
  KeyS: 2,
  ArrowLeft: 3,
  KeyA: 3,
};

const ACTIONS: Record<string, Action> = {
  KeyM: 'map',
  Escape: 'pause',
  Backquote: 'debug',
};

export class Input {
  private held: Dir[] = [];
  /** When false (a menu is open), direction keys do nothing and actions still fire. */
  playing = false;

  private readonly command: (c: CommandBody) => void;
  private readonly action: (a: Action) => void;

  constructor(command: (c: CommandBody) => void, action: (a: Action) => void) {
    this.command = command;
    this.action = action;
    addEventListener('keydown', (e) => this.down(e));
    addEventListener('keyup', (e) => this.up(e));
    addEventListener('blur', () => this.release());
  }

  /** Let go of everything (a menu opened, or the window lost focus). */
  release(): void {
    if (this.held.length) this.command({ c: 'halt' });
    this.held = [];
  }

  private down(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const dir = DIRS[e.code];
    if (dir !== undefined) {
      e.preventDefault();
      if (e.repeat || !this.playing) return;
      this.held = this.held.filter((d) => d !== dir);
      this.held.push(dir);
      this.command({ c: 'move', dir });
      return;
    }
    const a = ACTIONS[e.code];
    if (a && !e.repeat) {
      e.preventDefault();
      this.action(a);
    }
  }

  private up(e: KeyboardEvent): void {
    const dir = DIRS[e.code];
    if (dir === undefined || !this.held.includes(dir)) return;
    this.held = this.held.filter((d) => d !== dir);
    const top = this.held[this.held.length - 1];
    this.command(top === undefined ? { c: 'halt' } : { c: 'move', dir: top });
  }
}
