import type { Note, Piece, VoiceId } from './score';

/**
 * The music director (SPEC §11.4 "Music"): once a bar, just before its downbeat, turns the
 * battle's state into that bar's plan (which layers play, which stingers start). Every change
 * lands on a bar line, so layers stay in step: they all loop on the same bar count.
 *
 * Intensity rises at once and falls one level at a time, only after the heat has stayed low for
 * `HOLD_BARS`, so the music doesn't flap with every lull in the shooting.
 */

/** What the music hears from the battle, read once a bar. */
export interface MusicInput {
  /** 0–1: how hot the fight is. */
  heat: number;
  /** The big enemies on the field that have a theme. */
  bosses: readonly string[];
  /** Themed kinds destroyed since the last bar: only a kill plays a theme's resolution, not leaving it behind. */
  downed?: readonly string[];
}

export interface StingerPlay {
  id: string;
  /** Which of the stinger's bars plays. */
  bar: number;
}

export interface BarPlan {
  bar: number;
  level: number;
  layers: string[];
  stingers: StingerPlay[];
}

/** One note to play, `beat` counted from the bar's downbeat, `vel` already scaled by its part's gain. */
export interface NoteEvent extends Note {
  track: string;
  voice: VoiceId;
}

/** Bars the heat must stay below the current level before the music drops a level. */
export const HOLD_BARS = 2;

export class Director {
  private bar = 0;
  private level = 0;
  private lowFor = 0;
  private present: string[] = [];
  private playing: StingerPlay[] = [];

  constructor(private readonly piece: Piece) {}

  next(input: MusicInput): BarPlan {
    const { piece } = this;
    const bosses = input.bosses.filter((id) => piece.themes[id]);
    for (const id of bosses) if (!this.present.includes(id)) this.start(piece.themes[id]!.stinger);
    for (const id of this.present) if (!bosses.includes(id) && input.downed?.includes(id)) this.start(piece.themes[id]!.resolve);
    this.present = bosses;

    const floor = Math.max(0, ...bosses.map((id) => piece.themes[id]!.floor));
    const target = Math.max(floor, levelFor(input.heat, piece.thresholds));
    if (target > this.level) {
      this.level = target;
      this.lowFor = 0;
    } else if (target < this.level && ++this.lowFor >= HOLD_BARS) {
      this.level--;
      this.lowFor = 0;
    } else if (target === this.level) {
      this.lowFor = 0;
    }

    let layers = [...piece.levels[this.level]!];
    for (const id of bosses) {
      const theme = piece.themes[id]!;
      layers = layers.filter((l) => !theme.replaces.includes(l));
      for (const l of theme.layers) if (!layers.includes(l)) layers.push(l);
    }
    const stingers = this.playing;
    const muted = new Set(stingers.flatMap((s) => piece.stingers[s.id]!.mutes));
    layers = layers.filter((l) => !muted.has(l));

    const plan: BarPlan = { bar: this.bar++, level: this.level, layers, stingers };
    this.playing = stingers
      .map((s) => ({ id: s.id, bar: s.bar + 1 }))
      .filter((s) => piece.stingers[s.id]!.parts.some((p) => s.bar < p.bars.length));
    return plan;
  }

  private start(id: string | undefined): void {
    if (!id) return;
    if (!this.piece.stingers[id]) throw new Error(`${this.piece.id}: no stinger "${id}"`);
    this.playing.push({ id, bar: 0 });
  }
}

/** The intensity level for a heat: how many thresholds it has reached. */
export function levelFor(heat: number, thresholds: readonly number[]): number {
  return thresholds.filter((t) => heat >= t).length;
}

/** The notes a bar plan plays. Layers loop over the piece's bar count; stingers play their own bar. */
export function barEvents(piece: Piece, plan: BarPlan): NoteEvent[] {
  const out: NoteEvent[] = [];
  const add = (track: string, part: { voice: VoiceId; gain: number }, notes: Note[] | undefined) => {
    for (const n of notes ?? []) out.push({ ...n, vel: n.vel * part.gain, track, voice: part.voice });
  };
  for (const id of plan.layers) {
    const l = piece.layers[id];
    if (!l) throw new Error(`${piece.id}: no layer "${id}"`);
    add(id, l, l.bars[plan.bar % l.bars.length]);
  }
  for (const s of plan.stingers) {
    piece.stingers[s.id]!.parts.forEach((p, i) => add(`${s.id}.${i}`, p, p.bars[s.bar]));
  }
  return out;
}

/** A scripted run of bars (for offline renders and MIDI export): plans and their notes, `beat` from bar 0. */
export function timeline(piece: Piece, inputs: readonly MusicInput[]): { plans: BarPlan[]; notes: NoteEvent[] } {
  const director = new Director(piece);
  const plans = inputs.map((input) => director.next(input));
  const notes = plans.flatMap((plan) =>
    barEvents(piece, plan).map((n) => ({ ...n, beat: n.beat + plan.bar * piece.beatsPerBar })),
  );
  return { plans, notes };
}
