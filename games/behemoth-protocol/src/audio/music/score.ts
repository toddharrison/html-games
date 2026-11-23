/**
 * Music as data (SPEC §11.4 "Music"): a piece is a set of looping layers written in a compact text
 * notation, plus stingers (one-off phrases on a downbeat) and themes (a big enemy's stinger, layer,
 * and resolution). Pure: no Web Audio here, so scores are tested like any other content.
 *
 * Notation, one string per layer, bars split by `|`, tokens by spaces:
 * - a pitch (`C3`, `Eb4`, `F#2`), a chord (`C3+G3+C4`), a rest (`.`), a tie (`-`, holds the last
 *   notes on), or `%` alone in a bar (repeat the previous bar);
 * - then optionally `:dur` in beats (`1`, `1/3`, `0.5`; defaults to the previous token's), `*n` to
 *   repeat the token n times, and `!` (accent) or `'` (ghost).
 * Every bar must add up to the meter; the parser throws otherwise.
 */

export type VoiceId =
  | 'legno'
  | 'strings'
  | 'brass'
  | 'lowBrass'
  | 'timpani'
  | 'snare'
  | 'tamtam'
  | 'bells'
  | 'choir'
  | 'anvil'
  | 'reed';

export interface Note {
  /** Start, in beats from the bar's downbeat. */
  beat: number;
  /** Length in beats; may run past the bar line (ties). */
  dur: number;
  /** MIDI note number (60 = middle C). */
  pitch: number;
  /** 0–1. */
  vel: number;
}

/** A looping part: bar `n` of the piece plays `bars[n % bars.length]`. */
export interface Layer {
  voice: VoiceId;
  gain: number;
  bars: Note[][];
}

/** A one-off phrase that starts on a downbeat; its parts play together, bar by bar. */
export interface Stinger {
  parts: Layer[];
  /** Layers silenced while it plays. */
  mutes: string[];
}

/** A big enemy's music: a stinger when it arrives, its own layers while it's alive, a resolution. */
export interface Theme {
  stinger?: string;
  resolve?: string;
  layers: string[];
  /** Layers its own layers take the place of. */
  replaces: string[];
  /** The intensity level it holds the music at, at least. */
  floor: number;
}

export interface Piece {
  id: string;
  /** Beats a minute. */
  tempo: number;
  beatsPerBar: number;
  /** The note value of a beat (4, a quarter, unless it says 8), for the MIDI file's time signature. */
  beatUnit?: 4 | 8;
  layers: Record<string, Layer>;
  /** The layers at each intensity level, quietest first. */
  levels: string[][];
  /** The heat (0–1) at which each level above the first begins. */
  thresholds: number[];
  stingers: Record<string, Stinger>;
  themes: Record<string, Theme>;
}

const VEL = { normal: 0.7, accent: 1, ghost: 0.4 };
const EPS = 1e-6;
const PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const TOKEN = /^([^:*!']+)(?::([\d./]+))?(?:\*(\d+))?([!']?)$/;

/** `C4` → 60, `Eb3` → 51, `F#2` → 42. */
export function midi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad pitch "${name}"`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + PITCH_CLASS[m[1]!]! + acc;
}

function duration(src: string): number {
  const [n, d] = src.split('/');
  const v = d === undefined ? Number(n) : Number(n) / Number(d);
  if (!(v > 0)) throw new Error(`bad duration "${src}"`);
  return v;
}

/** Parses one layer's notation into bars of notes. */
export function parse(src: string, beatsPerBar: number): Note[][] {
  const bars: Note[][] = [];
  let dur = 1;
  let held: Note[] = [];
  src.split('|').forEach((barSrc, i) => {
    const tokens = barSrc.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 1 && tokens[0] === '%') {
      const prev = bars[i - 1];
      if (!prev) throw new Error(`bar ${i + 1}: % with no bar before it`);
      bars.push(prev.map((n) => ({ ...n })));
      held = [];
      return;
    }
    const bar: Note[] = [];
    let beat = 0;
    for (const token of tokens) {
      const m = TOKEN.exec(token);
      if (!m) throw new Error(`bar ${i + 1}: bad token "${token}"`);
      const [, head, durSrc, times, mark] = m;
      if (durSrc) dur = duration(durSrc);
      const vel = mark === '!' ? VEL.accent : mark === "'" ? VEL.ghost : VEL.normal;
      for (let k = 0; k < Number(times ?? 1); k++) {
        if (head === '-') {
          for (const n of held) n.dur += dur;
        } else if (head === '.') {
          held = [];
        } else {
          held = head!.split('+').map((p) => ({ beat, dur, pitch: midi(p), vel }));
          bar.push(...held);
        }
        beat += dur;
      }
    }
    if (Math.abs(beat - beatsPerBar) > EPS) throw new Error(`bar ${i + 1}: ${+beat.toFixed(3)} beats, not ${beatsPerBar}`);
    bars.push(bar);
  });
  return bars;
}

/** Shifts every note by `semis` semitones. */
export function transpose(bars: Note[][], semis: number): Note[][] {
  return bars.map((bar) => bar.map((n) => ({ ...n, pitch: n.pitch + semis })));
}

/** A layer from notation. */
export function layer(voice: VoiceId, gain: number, src: string, beatsPerBar: number): Layer {
  return { voice, gain, bars: parse(src, beatsPerBar) };
}

/** Seconds per bar. */
export function barSeconds(piece: Pick<Piece, 'tempo' | 'beatsPerBar'>): number {
  return (piece.beatsPerBar * 60) / piece.tempo;
}
