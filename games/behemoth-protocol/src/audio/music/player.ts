import { barEvents, Director, type BarPlan, type MusicInput } from './director';
import type { Duck } from './duck';
import { MusicEngine } from './engine';
import { barSeconds, type Piece } from './score';

/**
 * Plays a piece live (SPEC §11.4 "Music"): a timer checks the audio clock and, just before each
 * downbeat, asks for the battle's state, lets the director plan the bar, and schedules its notes
 * on the audio clock, so timing never depends on the frame rate.
 *
 * Pausing only fades the music: the bar clock keeps running underneath, so it comes back mid-phrase
 * with no notes doubled up. A suspended context (before the first click, or a hidden tab) stops
 * the audio clock, and the music simply waits with it.
 */

/** Plan a bar this long before its downbeat (s): enough to survive a slow timer tick. */
const LOOKAHEAD = 0.3;
const TICK_MS = 50;
/** The detonation: seconds of silence before the finale lands. */
const FINALE_DELAY = 3;

export class MusicPlayer {
  private readonly engine: MusicEngine;
  private readonly director: Director;
  private readonly bar: number;
  private nextBar: number;
  private timer: ReturnType<typeof setInterval> | null;
  private last: { input: MusicInput; plan: BarPlan } | null = null;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    private readonly piece: Piece,
    private readonly input: () => MusicInput,
  ) {
    this.engine = new MusicEngine(ctx, out);
    this.director = new Director(piece);
    this.bar = barSeconds(piece);
    this.nextBar = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  private tick(): void {
    const now = this.ctx.currentTime;
    // Fell behind (a throttled timer): start again on a fresh downbeat rather than cram bars in.
    if (this.nextBar < now) this.nextBar = now + 0.05;
    while (this.nextBar - now < LOOKAHEAD) {
      const input = this.input();
      const plan = this.director.next(input);
      this.last = { input, plan };
      this.engine.playBar(barEvents(this.piece, plan), this.nextBar, this.bar / this.piece.beatsPerBar);
      this.nextBar += this.bar;
    }
  }

  /** For the debug overlay: the last bar planned (level, heat, bosses, stingers). */
  status(): string {
    if (!this.last) return 'MUSIC -';
    const { input, plan } = this.last;
    const extra = [...input.bosses, ...plan.stingers.map((s) => `[${s.id}]`)].join(' ');
    return `MUSIC L${plan.level} HEAT ${input.heat.toFixed(2)}${this.timer ? '' : ' OFF'}${extra ? ` ${extra}` : ''}`;
  }

  duck(d: Duck): void {
    this.engine.duck(d);
  }

  setPaused(paused: boolean): void {
    if (this.timer) this.engine.fade(paused ? 0 : 1, paused ? 0.1 : 0.6);
  }

  /** The reactor's gone: the music stops dead, and after a silence the finale lands. */
  detonate(): void {
    if (!this.timer) return;
    this.halt();
    const at = this.ctx.currentTime + FINALE_DELAY;
    this.engine.silenceUntil(at);
    if (this.piece.stingers.finale) {
      const notes = barEvents(this.piece, { bar: 0, level: 0, layers: [], stingers: [{ id: 'finale', bar: 0 }] });
      this.engine.playBar(notes, at, this.bar / this.piece.beatsPerBar);
    }
  }

  /** The battle's won: the music fades out as the Behemoth rolls off the field. */
  fadeOut(seconds: number): void {
    if (!this.timer) return;
    this.halt();
    this.engine.fade(0, seconds);
  }

  /** The scene's ending. */
  destroy(): void {
    this.halt();
    this.engine.fade(0, 0.3);
    setTimeout(() => this.engine.destroy(), 400);
  }

  private halt(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
