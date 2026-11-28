// A run in the browser: the state, its world, and the command log. Input queues commands here; each
// tick stamps them with the tick number, logs them (for replay files), and hands them to the sim.

import { TICKS_PER_SECOND } from '../content/balance.ts';
import type { Protagonist } from '../sim/protagonist.ts';
import type { Rules } from '../sim/rules.ts';
import type { Command, GameState, SimEvent } from '../sim/state.ts';
import { step } from '../sim/step.ts';
import type { World } from '../sim/world.ts';
import { newGame } from '../sim/newGame.ts';

/** A command before it has a tick. */
export type CommandBody = Command extends infer C ? (C extends Command ? Omit<C, 't'> : never) : never;

export const TICK_MS = 1000 / TICKS_PER_SECOND;

export class Session {
  state: GameState;
  readonly log: Command[] = [];
  private pending: CommandBody[] = [];

  readonly seed: string;
  readonly protagonist: Protagonist;
  readonly world: World;
  readonly rules: Rules;

  constructor(seed: string, protagonist: Protagonist, world: World, rules: Rules) {
    this.seed = seed;
    this.protagonist = protagonist;
    this.world = world;
    this.rules = rules;
    this.state = newGame(seed, protagonist, world, structuredClone(rules));
  }

  queue(cmd: CommandBody): void {
    this.pending.push(cmd);
  }

  tick(): SimEvent[] {
    const now = this.pending.map((c) => ({ ...c, t: this.state.tick }) as Command);
    this.pending = [];
    this.log.push(...now);
    return step(this.state, this.world, now);
  }
}

/**
 * The fixed-step loop (SPEC 5.1, 11.3 rule 3): the sim advances in whole ticks at 20 a second, times
 * `speed`; the renderer draws every frame, sliding between ticks. Never more than `maxBehind` ticks
 * are run in one frame, so a stall (a hidden tab) doesn't come back as a burst.
 */
export class Loop {
  speed = 1;
  paused = false;
  private acc = 0;
  private last = 0;
  private raf = 0;

  private readonly onTick: () => void;
  private readonly onFrame: (alpha: number, now: number) => void;

  constructor(onTick: () => void, onFrame: (alpha: number, now: number) => void) {
    this.onTick = onTick;
    this.onFrame = onFrame;
  }

  start(): void {
    this.last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(250, now - this.last);
      this.last = now;
      if (!this.paused) {
        this.acc += dt * this.speed;
        const max = Math.max(5, Math.ceil(this.speed * 3));
        let n = 0;
        // A tick can pause the loop (a note pops up): stop there, not at the end of the frame.
        while (!this.paused && this.acc >= TICK_MS && n < max) {
          this.onTick();
          this.acc -= TICK_MS;
          n++;
        }
        if (n >= max) this.acc = 0;
      }
      // Paused, the picture holds where it was (not back at the last tick, which jolted when a note popped up).
      this.onFrame(Math.min(1, this.acc / TICK_MS), now);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }
}
