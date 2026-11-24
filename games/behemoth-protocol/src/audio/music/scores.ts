import type { BiomeId } from '../../content/biomes';
import { layer, parse, transpose, type Layer, type Piece, type Stinger, type Theme, type VoiceId } from './score';

/**
 * The scores (SPEC §11.4 "Music"). Mars-inspired, not a transcription: an odd or lopsided meter,
 * a hammered single-note ostinato, chords clashing over a pedal, brass in tritones, a relentless
 * build. One piece per biome, each in its own key, meter, and tempo, with its own colour:
 *
 * | Biome | Piece | Meter, tempo | Key | Its colour |
 * |---|---|---|---|---|
 * | Temperate | *Advance* | 5/4 (3+2), 138 | C | col legno and brass: the baseline |
 * | Arctic | *Whiteout* | 6/4 (3+3), 132 | E Phrygian | bells glinting from the start, a wordless choir |
 * | Industrial | *Foundry* | 7/4 (2+2+3), 176 | G | an anvil, a grinding machine ostinato, the snare |
 * | Desert | *Mirage* | 9/8 (2+2+2+3), 264 | D Phrygian dominant | a double reed snaking over a frame drum |
 * | Wasteland | *Ashes* | 4/4 (3+3+2), 88 | B♭ minor | a dirge: a tolling bell, the choir, low brass |
 *
 * Each is 16 bars over its pedal, in two halves.
 * - **The theme** (bars 1–8): the harmony leaves home for the chord a semitone up (the clash Mars
 *   is built on), wanders, reaches the tritone (the darkest), and turns home.
 * - **The climb** (bars 9–16): the bass leaves the pedal and walks, the theme's opening is taken up
 *   step by step to the piece's highest note, and it breaks on the tritone, where everyone hammers
 *   the ostinato's rhythm (bar 15) before the turn home.
 *
 * Intensity adds layers in four levels, the same in every piece:
 * 0. the ostinato over a shiver of tremolo strings (plus the piece's bells);
 * 1. the string chords, the drums, and the bass (silent on the pedal, in when the harmony strains);
 * 2. the melody, the snare, and an answering voice in the melody's long notes (horn calls, as
 *    Mars's brass answer each other);
 * 3. the melody doubled above and harmonised below, the tam-tam, and cymbals: a roll swelling
 *    into each half, a crash on the climb.
 *
 * The siege tank's theme is the same in every piece, in that piece's key and meter (`siegeTank`).
 */

/** The heat at which each level above the first begins (calibrated on *Advance* with the bot). */
const THRESHOLDS = [0.12, 0.3, 0.55];

/** Bars in a piece. */
const FORM = 16;

/** A piece's parts, all in its meter: `L` from one string, `S` silent but for the bars given (numbered from 1). */
function parts(beatsPerBar: number) {
  const L = (voice: VoiceId, gain: number, src: string | readonly string[]): Layer =>
    layer(voice, gain, typeof src === 'string' ? src : src.join(' | '), beatsPerBar);
  const S = (voice: VoiceId, gain: number, bars: Record<number, string>, length = FORM): Layer =>
    L(
      voice,
      gain,
      Array.from({ length }, (_, i) => bars[i + 1] ?? `.:${beatsPerBar}`),
    );
  return { L, S };
}

/** Bars 1–8 of the string chords: what the siege tank's march was written against. */
const THEME_BARS = 8;

/**
 * The siege tank's music, for a piece `key` semitones from C (written in C, then transposed).
 * - `groups`: how the piece's bar divides (in beats): its treads accent each group, and the march
 *   stamps a long note and a short one, the short one as long as the last group.
 * - `pulse`: the piece's beat in quarter notes' worth of its own beats (2 when the beat is an
 *   eighth), so the stingers' hammering keeps the same speed in every piece.
 * - `melodic`: the piece's melody layers, which its stinger silences and its march replaces.
 * - `drum`: the piece's drum layer, which its treads replace.
 *
 * The march was written against the theme's chords, so while it plays the strings stay on the
 * theme (`siegeTank.ground`, added by `piece`) and the bass, which walks in the climb, drops out.
 */
function siegeTank(
  key: number,
  groups: readonly number[],
  melodic: readonly string[],
  drum: string,
  pulse = 1,
): { layers: Record<string, Layer>; stingers: Record<string, Stinger>; theme: Theme } {
  const B = groups.reduce((a, b) => a + b, 0);
  const C = (voice: VoiceId, gain: number, src: string): Layer => ({ voice, gain, bars: transpose(parse(src, B), key) });
  const u = pulse;
  const short = groups[groups.length - 1]!;
  const long = B - short;
  const half = short / 2;
  // The arrival: a chord hammered (a triplet, a beat, a rest), then held to the bar line.
  const hammer = (x: string) => `${x}:${u}/3! ${x} ${x} ${x}:${u}! .:${u} ${x}:${B - 3 * u}!`;
  // The treads: eighths grinding between the root and the fifth below, an accent on each group.
  const eighth = u / 2;
  const starts = new Set(groups.map((_, i) => groups.slice(0, i).reduce((a, b) => a + b, 0)));
  const treads = Array.from({ length: B / eighth }, (_, i) => {
    const note = i % 2 === 0 ? 'C3' : 'G2';
    const mark = starts.has(i * eighth) ? '!' : i % 2 === 0 ? '' : "'";
    return `${note}:${eighth}${mark}`;
  }).join(' ');
  return {
    layers: {
      // Low brass stamping out tritones in octaves.
      'siegeTank.march': C(
        'lowBrass',
        0.6,
        [
          `C3+C4:${long}! Gb2+Gb3:${short}`,
          `G2+G3:${B}`,
          `Ab2+Ab3:${long}! Db3+Db4:${short}`,
          `C3+C4:${B}`,
          `Bb2+Bb3:${long}! E2+E3:${short}`,
          `F2+F3:${B}`,
          `Gb2+Gb3:${long}! C3+C4:${short}`,
          `Db3+Db4:${long} B2+B3:${half} D3+D4:${half}`,
        ].join(' | '),
      ),
      'siegeTank.treads': C('timpani', 0.38, treads),
    },
    stingers: {
      // The chord a semitone up hammered over the pedal's root and fifth.
      siegeTank: {
        mutes: [...melodic],
        parts: [
          C('brass', 0.75, hammer('C3+G3+Db4+F4+Ab4')),
          C('lowBrass', 0.7, hammer('C2+C3')),
          C('timpani', 0.6, `C3:${u}/3! C3 C3 C3:${u}! G2:${u}/6*6 C3:${B - 3 * u}!`),
          C('tamtam', 0.6, `E3:${B}!`),
        ],
      },
      // After the detonation's silence: the clash hammered one last time, landing on a bare open fifth.
      finale: {
        mutes: [],
        parts: [
          C('brass', 0.8, `Db3+Ab3+Db4+F4:${u}/3! Db3+Ab3+Db4+F4 Db3+Ab3+Db4+F4 C3+G3+C4+G4:${B - u}!`),
          C('lowBrass', 0.75, `Db2+Db3:${u}/3! Db2+Db3 Db2+Db3 C2+C3:${B - u}!`),
          C('strings', 0.35, `.:${u} C3+G3+C4+G4+C5:${B - u}`),
          C('timpani', 0.7, `G2:${u}/3! G2 G2 C3:${B - u}!`),
          C('tamtam', 0.7, `.:${u} E3:${B - u}!`),
          C('cymbal', 0.45, `.:${u} E4:${B - u}!`),
        ],
      },
      // The one bright chord in the score: the major chord on the root, when the siege tank goes down.
      siegeTankDown: {
        mutes: ['ground', ...melodic],
        parts: [
          C('brass', 0.7, `C3+G3+C4+E4+G4:${u}/3! C3+G3+C4+E4+G4' C3+G3+C4+E4+G4' C3+G3+C4+E4+G4:${B - u}!`),
          C('timpani', 0.6, `C3:${u}/3! C3' C3' C3:${B - u}!`),
          C('tamtam', 0.5, `E3:${B}!`),
          C('cymbal', 0.4, `E4:${B}!`),
        ],
      },
    },
    theme: {
      stinger: 'siegeTank',
      resolve: 'siegeTankDown',
      layers: ['siegeTank.march', 'siegeTank.treads', 'siegeTank.ground'],
      replaces: [...melodic, drum, 'ground', 'bass'],
      floor: 2,
    },
  };
}

/** A piece from its own layers and levels, with the siege tank's theme and the arrival at the top level added. */
function piece(p: Omit<Piece, 'thresholds' | 'stingers' | 'themes' | 'rises'>, tank: ReturnType<typeof siegeTank>): Piece {
  const ground = p.layers.ground!;
  return {
    ...p,
    layers: { ...p.layers, ...tank.layers, 'siegeTank.ground': { ...ground, bars: ground.bars.slice(0, THEME_BARS) } },
    thresholds: THRESHOLDS,
    stingers: {
      ...tank.stingers,
      // Reaching full intensity: a crash on that downbeat.
      arrival: { mutes: [], parts: [layer('cymbal', 0.45, `E4:${p.beatsPerBar}!`, p.beatsPerBar)] },
    },
    themes: { siegeTank: tank.theme },
    rises: { [p.levels.length - 1]: 'arrival' },
  };
}

/** The four levels, from each one's new layers. */
function stack(...added: string[][]): string[][] {
  return added.map((_, i) => added.slice(0, i + 1).flat());
}

/** Bars of a part: `n` of `bar`. */
const times = (n: number, bar: string): string[] => Array.from({ length: n }, () => bar);

/**
 * **Advance** (temperate). The theme: over a C pedal the harmony steps C5 → Db/C → Bb/C → Gb/C and
 * turns home through G/C. The climb: Fm/C → Ab/C, the theme's rising fourth taken up twice to a
 * high Db over Db/C, breaking on Gb/C. The ostinato groups each bar 3 + 2, accents on beats 1 and 4.
 */
export const ADVANCE: Piece = (() => {
  const { L, S } = parts(5);
  const OSTINATO = "C3:1/3! C3' C3' C3:1 C3:1/2 C3' C3:1! C3:1";
  const PICKUP = "C3:1/3! C3' C3' C3:1 C3:1/2 C3' C3:1/3! C3 C3 C3:1/3 C3 C3";
  // The ostinato's rhythm, hammered on any note.
  const hammer = (x: string) => `${x}:1/3! ${x}' ${x}' ${x}:1 ${x}:1/2 ${x}' ${x}:1! ${x}:1`;
  const melody = L('brass', 0.5, [
    'G3:3! C4:2',
    '-:2 D4:1 Eb4:2',
    'F4:3! Eb4:1 Db4:1',
    'C4:4 Db4:1',
    'D4:3! C4:1 Bb3:1',
    'F3:3 Bb3:1/3 C4 D4 F4:1',
    'Gb4:3! F4:1 Db4:1',
    'C4:3 B3:1 D4:1',
    'C4:3! F4:2',
    '-:2 G4:1 Ab4:2',
    'Eb4:3! Ab4:2',
    '-:2 Bb4:1 C5:2',
    'Db5:3! C5:1 Ab4:1',
    'Gb4:3 Ab4:1 Bb4:1',
    "Gb4:1/3! Gb4' Gb4' Gb4:1 Gb4:1/2 Gb4' F4:1! Db4:1",
    'D4:3! B3:1 G3:1',
  ]);
  const SNARE = "D2:1/3! D2' D2' .:2 D2:1/2' D2' D2:1!";
  const SNARE_TURN = "D2:1/3! D2' D2' .:1 D2:1/2' D2' D2:1/2' D2' D2:1!";
  const SNARE_ROLL = "D2:1/3! D2' D2' .:1 D2:1/6*18";
  return piece(
    {
      id: 'advance',
      tempo: 138,
      beatsPerBar: 5,
      layers: {
        pulse: L('legno', 0.8, [...times(7, OSTINATO), PICKUP]),
        drone: S('tremolo', 0.15, { 1: 'C3+G3:5', 2: '-:5', 7: 'C3+Gb3:5', 8: '-:3 .:2', 11: 'C3+Ab3:5', 12: '-:5', 14: 'C3+Gb3:5', 15: '-:5' }),
        ground: L('strings', 0.22, [
          'C3+G3+C4:5',
          '-:5',
          'C3+Ab3+Db4+F4:5',
          '-:5',
          'C3+Bb3+D4+F4:5',
          '-:5',
          'C3+Bb3+Db4+Gb4:5',
          '-:3 C3+B3+D4+G4:2',
          'C3+Ab3+C4+F4:5',
          '-:5',
          'C3+Ab3+C4+Eb4:5',
          '-:5',
          'C3+Ab3+Db4+F4:5',
          'C3+Bb3+Db4+Gb4:5',
          '-:5',
          'C3+B3+D4+G4:5',
        ]),
        timpani: L('timpani', 0.45, [
          'C3:3! G2:2',
          "C3:5'",
          'C3:3! G2:2',
          "C3:5'",
          'C3:3! G2:2',
          "C3:5'",
          'C3:3! G2:2',
          'C3:3 G2:1/3! G2 G2 G2:1!',
          'C3:3! C3:2',
          "C3:5'",
          'C3:3! C3:2',
          "C3:5'",
          'C3:3! G2:2',
          'Gb2:3! Gb2:2',
          hammer('Gb2'),
          'G2:3! G2:1/3 G2 G2 G2:1/6*6',
        ]),
        bass: S('basses', 0.22, {
          7: 'Gb2:3! Gb2:2',
          8: 'Gb2:3 G2:2',
          9: 'F2:3! F2:2',
          10: 'F2:3 G2:2',
          11: 'Ab2:3! Ab2:2',
          12: 'Ab2:5',
          13: 'Ab2:3! Ab2:2',
          14: 'Gb2:3! Gb2:2',
          15: hammer('Gb2'),
          16: 'G2:3! G2:1 B2:1',
        }),
        snare: L('snare', 0.35, [
          ...times(3, SNARE),
          SNARE_TURN,
          ...times(3, SNARE),
          SNARE_ROLL,
          ...times(3, SNARE),
          SNARE_TURN,
          ...times(2, SNARE),
          "D2:1/3! D2' D2' D2:1! D2:1/2 D2' D2:1! D2:1!",
          SNARE_ROLL,
        ]),
        brass: melody,
        // Horn calls in the melody's long notes: a triplet on the upbeat, landing on the bar.
        answer: S('horn', 0.3, {
          3: '.:4 F3:1/3 F3 F3',
          4: 'Ab3:3! .:2',
          5: '.:4 F3:1/3 F3 F3',
          6: 'Bb3:3! .:2',
          7: '.:4 Bb3:1/3 Bb3 Bb3',
          8: 'Gb3:3! .:2',
          9: '.:4 Ab3:1/3 Ab3 Ab3',
          10: 'C4:2! .:3',
          11: '.:4 C4:1/3 C4 C4',
          12: 'Eb4:2! .:3',
          13: '.:4 F4:1/3 F4 F4',
          14: 'Db4:3! .:2',
          15: hammer('Gb3'),
          16: 'G3:3! .:2',
        }),
        high: { voice: 'strings', gain: 0.3, bars: transpose(melody.bars, 12) },
        // Trombones under the melody: thirds and fourths, and a tritone where the harmony has one.
        harmony: L('lowBrass', 0.22, [
          'Eb3:3 G3:2',
          '-:2 Bb3:1 C4:2',
          'Db4:3 C4:1 Ab3:1',
          'Ab3:5',
          'Bb3:3 A3:1 G3:1',
          'D3:3 G3:1/3 A3 Bb3 D4:1',
          'Db4:4 Bb3:1',
          'Gb3:3 G3:1 B3:1',
          'Ab3:3 C4:2',
          '-:2 Eb4:1 F4:2',
          'C4:3 Eb4:2',
          '-:2 G4:1 Ab4:2',
          'Ab4:4 F4:1',
          'Db4:3 Eb4:1 Gb4:1',
          "C4:1/3! C4' C4' C4:1 C4:1/2 C4' C4:1! Bb3:1",
          'B3:3 G3:1 D3:1',
        ]),
        tamtam: S('tamtam', 0.4, { 1: 'E3:5!' }),
        swell: S('swell', 0.3, { 8: '.:3 E4:2', 16: '.:2 E4:3' }),
        cymbal: S('cymbal', 0.3, { 9: 'E4:5!' }),
      },
      levels: stack(['pulse', 'drone'], ['ground', 'timpani', 'bass'], ['snare', 'brass', 'answer'], ['high', 'harmony', 'tamtam', 'swell', 'cymbal']),
    },
    siegeTank(0, [3, 2], ['brass', 'answer', 'high', 'harmony'], 'timpani'),
  );
})();

/**
 * **Whiteout** (arctic): slower and heavier, a 6/4 tread of 3 + 3 over an E pedal. Glass bells
 * glint over the ostinato even when it's calm; a wordless choir carries the melody, horns an
 * octave under it and rising through the chords beneath. The theme: E minor → F/E (the Phrygian
 * semitone) → D/E (cold, bright) → Bb/E (the tritone) → B/E. The climb: C/E (sun on the ice) →
 * Am/E → F/E, breaking on Bb/E, where the choir and its second voice trade the tritone's two
 * notes. No snare: the cold is quiet.
 */
export const WHITEOUT: Piece = (() => {
  const { L, S } = parts(6);
  const OSTINATO = "E3:1! E3:1/2' E3' E3:1 E3:1! E3:1/2' E3' E3:1";
  const PICKUP = "E3:1! E3:1/2' E3' E3:1 E3:1/3! E3 E3 E3:1/3 E3 E3 E3:1/3! E3 E3";
  const melody = L('choir', 0.5, [
    'B4:4! G4:2',
    '-:2 A4:2 B4:2',
    'C5:4! B4:1 A4:1',
    'F4:4 E4:1 F4:1',
    'F#4:4! A4:2',
    'D5:4 C#5:1 A4:1',
    'Bb4:4! A4:1 F4:1',
    'F4:3 E4:1 D#4:2',
    'G4:4! C5:2',
    '-:2 D5:2 E5:2',
    'E5:4! D5:1 C5:1',
    'A4:4 B4:1 C5:1',
    'C5:4! A4:2',
    'D5:4! Bb4:1 F4:1',
    'E4:3! Bb4:3',
    'B4:3! F#4:1 D#4:2',
  ]);
  return piece(
    {
      id: 'whiteout',
      tempo: 132,
      beatsPerBar: 6,
      layers: {
        pulse: L('legno', 0.8, [...times(7, OSTINATO), PICKUP]),
        glint: L('bells', 0.35, [
          'B5:1/2! E5:1/2 .:5',
          '.:6',
          'C6:1/2! F5:1/2 .:5',
          '.:6',
          'D6:1/2! F#5:1/2 .:5',
          '.:6',
          'Bb5:1/2! E5:1/2 .:5',
          '.:3 D#6:1/2 B5:1/2 .:2',
          'E6:1/2! C6:1/2 G5:1/2 .:4.5',
          '.:6',
          'E6:1/2! C6:1/2 A5:1/2 .:4.5',
          '.:6',
          'C6:1/2! A5:1/2 F5:1/2 .:4.5',
          'Bb5:1/2! F5:1/2 .:5',
          '.:3 E5:1/2 Bb5:1/2 .:2',
          '.:3 D#6:1/2 B5:1/2 .:2',
        ]),
        drone: S('tremolo', 0.15, { 1: 'E4+B4:6', 2: '-:6', 5: 'E4+A4:6', 6: '-:6', 9: 'E4+G4:6', 10: '-:6', 14: 'E4+Bb4:6', 15: '-:6' }),
        ground: L('strings', 0.22, [
          'E3+B3+E4+G4:6',
          '-:6',
          'E3+A3+C4+F4:6',
          '-:6',
          'E3+A3+D4+F#4:6',
          '-:6',
          'E3+Bb3+D4+F4:6',
          '-:3 E3+B3+D#4+F#4:3',
          'E3+G3+C4+E4:6',
          '-:6',
          'E3+A3+C4+E4:6',
          '-:6',
          'E3+A3+C4+F4:6',
          'E3+Bb3+D4+F4:6',
          '-:6',
          'E3+B3+D#4+F#4:6',
        ]),
        timpani: L('timpani', 0.45, [
          'E3:3! B2:3',
          "E3:6'",
          'E3:3! B2:3',
          "E3:6'",
          'E3:3! B2:3',
          "E3:6'",
          'E3:3! B2:3',
          'E3:3 B2:1/3! B2 B2 B2:1! B2:1!',
          'E3:3! E3:3',
          "E3:6'",
          'E3:3! E3:3',
          "E3:6'",
          'E3:3! E3:3',
          'E3:3! Bb2:3',
          'E3:3! Bb2:3',
          'B2:3! B2:1/3! B2 B2 B2:1! B2:1!',
        ]),
        bass: S('basses', 0.22, {
          7: 'Bb2:3! Bb2:3',
          8: 'Bb2:3 B2:3',
          9: 'C3:3! C3:3',
          10: 'C3:6',
          11: 'A2:3! A2:3',
          12: 'A2:3 G2:3',
          13: 'F2:3! F2:3',
          14: 'Bb2:3! Bb2:3',
          15: 'Bb2:3! Bb2:3',
          16: 'B2:3! B2:3',
        }),
        choir: melody,
        horns: { voice: 'horn', gain: 0.35, bars: transpose(melody.bars, -12) },
        // A horn climbing through each chord under the choir's long note.
        answer: S('horn', 0.28, {
          1: '.:1 E3:1 G3:1 B3:2 .:1',
          3: '.:1 F3:1 A3:1 C4:2 .:1',
          4: '.:1 C4:1 A3:1 F3:2 .:1',
          5: '.:1 D3:1 F#3:1 A3:2 .:1',
          6: '.:1 A3:1 F#3:1 D3:2 .:1',
          7: '.:1 D3:1 F3:1 Bb3:2 .:1',
          8: '.:3 B2:1 D#3:1 F#3:1',
          9: '.:1 E3:1 G3:1 C4:2 .:1',
          11: '.:1 E3:1 A3:1 C4:2 .:1',
          12: '.:1 C4:1 A3:1 E3:2 .:1',
          13: '.:1 F3:1 A3:1 C4:2 .:1',
          14: '.:1 F3:1 Bb3:1 D4:2 .:1',
          15: '.:1 D4:1 Bb3:1 F3:2 .:1',
          16: '.:1 B2:1 D#3:1 F#3:1 B3:2',
        }),
        high: { voice: 'strings', gain: 0.3, bars: transpose(melody.bars, 12) },
        // The choir's second voice.
        harmony: L('choir', 0.28, [
          'G4:4 E4:2',
          '-:2 E4:2 G4:2',
          'A4:4 G4:1 F4:1',
          'C4:6',
          'D4:4 F#4:2',
          'A4:5 F#4:1',
          'F4:5 D4:1',
          'D4:3 B3:3',
          'E4:4 G4:2',
          '-:2 G4:2 C5:2',
          'C5:4 B4:1 A4:1',
          'E4:4 G4:1 A4:1',
          'A4:4 F4:2',
          'Bb4:4 F4:1 D4:1',
          'Bb3:3 E4:3',
          'F#4:3 D#4:1 B3:2',
        ]),
        tamtam: S('tamtam', 0.4, { 1: 'E3:6!' }),
        swell: S('swell', 0.3, { 8: '.:3 E4:3', 16: '.:3 E4:3' }),
        cymbal: S('cymbal', 0.3, { 9: 'E4:6!' }),
      },
      levels: stack(['pulse', 'glint', 'drone'], ['ground', 'timpani', 'bass'], ['choir', 'horns', 'answer'], ['high', 'harmony', 'tamtam', 'swell', 'cymbal']),
    },
    siegeTank(4, [3, 3], ['choir', 'horns', 'answer', 'high', 'harmony'], 'timpani'),
  );
})();

/**
 * **Foundry** (industrial): fast and mechanical, 7/4 in 2 + 2 + 3. The ostinato is a machine,
 * eighths jumping G2–G3 with a grinding Ab at the end of each bar; an anvil strikes the groups
 * from the second level, and trombones stamp twice in the melody's long notes. The theme: open
 * fifths on G → Ab/G → F/G → Db/G (the tritone) → D/G. The climb: Gm7 → C/G (the furnace door
 * opens) → Eb/G, breaking on Db/G in stabs with silence between. The brass melody is angular,
 * the snare drives.
 */
export const FOUNDRY: Piece = (() => {
  const { L, S } = parts(7);
  const OSTINATO = "G2:1/2! G2' G3 G2' G2! G2' G3 G2' G2! G2' G3 G2' Ab2 G2'";
  const PICKUP = "G2:1/2! G2' G3 G2' G2! G2' G3 G2' G2:1/3! G2 G2 G2 G2 G2 G2:1/2! Ab2!";
  // The break: stabs on the groups, silence between.
  const stabs = (x: string) => `${x}:1! .:1 ${x}:1! .:1 ${x}:1/2! ${x}' ${x}:1! .:1`;
  const stamp = (x: string) => `.:4 ${x}:1/2! ${x}' ${x}:1! .:1`;
  const melody = L('brass', 0.5, [
    'D3:2! G3:2 Bb3:3',
    'A3:2 G3:1 F3:1 G3:3',
    'Ab3:2! C4:2 Eb4:3',
    'F4:2 Eb4:1 C4:1 Ab3:3',
    'A3:2! C4:2 F4:3',
    'G4:2 F4:1 Eb4:1 C4:3',
    'Ab3:2! Db4:2 F4:3',
    'F3:3! G3:1 A3:1 D3:2',
    'G3:2! Bb3:2 D4:3',
    'F4:2 D4:1 C4:1 D4:3',
    'C4:2! E4:2 G4:3',
    'A4:2 G4:1 F4:1 E4:3',
    'G4:2! Eb4:2 Bb3:3',
    'F4:2! Db4:2 Ab3:3',
    stabs('Db4'),
    'D4:3! A3:1 F#3:1 D3:2',
  ]);
  const SNARE = "D2:1/2! D2' .:1 D2:1/2! D2' .:1 D2:1/2! D2' D2' D2' .:1";
  const SNARE_TURN = "D2:1/2! D2' .:1 D2:1/2! D2' .:1 D2:1/2! D2' D2' D2' D2! D2'";
  const SNARE_ROLL = "D2:1/2! D2' .:1 D2:1/2! D2' .:1 D2:1/6*18";
  return piece(
    {
      id: 'foundry',
      tempo: 176,
      beatsPerBar: 7,
      layers: {
        pulse: L('legno', 0.75, [...times(7, OSTINATO), PICKUP]),
        // The machine's whine: the grinding semitone, then the tritone.
        drone: S('tremolo', 0.15, { 3: 'G3+Ab3:7', 4: '-:7', 9: 'G3+D4:7', 10: '-:7', 14: 'G3+Db4:7', 15: '-:7' }),
        hammer: L('anvil', 0.5, "D5:2! D5:2 D5:1! .:1 D5:1/2' D5'"),
        ground: L('strings', 0.22, [
          'G2+D3+G3:7',
          '-:7',
          'G2+Ab3+C4+Eb4:7',
          '-:7',
          'G2+A3+C4+F4:7',
          '-:7',
          'G2+Ab3+Db4+F4:7',
          '-:4 G2+A3+D4+F#4:3',
          'G2+Bb3+D4+F4:7',
          '-:7',
          'G2+G3+C4+E4:7',
          '-:7',
          'G2+Bb3+Eb4+G4:7',
          'G2+Ab3+Db4+F4:7',
          '-:7',
          'G2+A3+D4+F#4:7',
        ]),
        timpani: L('timpani', 0.45, [
          'G2:2! G2:2 D3:3',
          "G2:7'",
          'G2:2! G2:2 G2:3',
          "G2:7'",
          'G2:2! G2:2 D3:3',
          "G2:7'",
          'G2:2! G2:2 G2:3',
          'G2:4 D3:1/3! D3 D3 D3:1! D3:1!',
          'G2:2! G2:2 D3:3',
          "G2:7'",
          'G2:2! G2:2 G2:3',
          "G2:7'",
          'G2:2! G2:2 G2:3',
          'G2:2! G2:2 G2:3',
          stabs('G2'),
          'D3:4! D3:1/3! D3 D3 D3:1! D3:1!',
        ]),
        bass: S('basses', 0.22, {
          7: 'Db3:2! Db3:2 Db3:3',
          8: 'Db3:4 D3:3',
          9: 'Bb2:2! Bb2:2 Bb2:3',
          10: 'Bb2:4 D3:3',
          11: 'C3:2! C3:2 C3:3',
          12: 'C3:4 D3:3',
          13: 'Eb3:2! Eb3:2 Eb3:3',
          14: 'Db3:2! Db3:2 Db3:3',
          15: stabs('Db3'),
          16: 'D3:4! D3:3',
        }),
        snare: L('snare', 0.35, [
          ...times(3, SNARE),
          SNARE_TURN,
          ...times(3, SNARE),
          SNARE_ROLL,
          ...times(3, SNARE),
          SNARE_TURN,
          ...times(2, SNARE),
          stabs('D2'),
          SNARE_ROLL,
        ]),
        brass: melody,
        // Trombones stamping in the melody's long notes, a step higher each time.
        answer: S('lowBrass', 0.3, { 2: stamp('D3'), 4: stamp('Eb3'), 6: stamp('F3'), 10: stamp('G3'), 12: stamp('G3') }),
        high: { voice: 'strings', gain: 0.3, bars: transpose(melody.bars, 12) },
        harmony: L('lowBrass', 0.22, [
          'Bb2:2 D3:2 G3:3',
          'F3:2 D3:5',
          'Eb3:2 Ab3:2 C4:3',
          'C4:3 Ab3:1 Eb3:3',
          'F3:2 A3:2 C4:3',
          'C4:4 A3:3',
          'F3:2 Ab3:2 Db4:3',
          'Db3:4 F#3:1 A2:2',
          'D3:2 G3:2 Bb3:3',
          'D4:2 Bb3:1 A3:1 Bb3:3',
          'G3:2 C4:2 E4:3',
          'E4:3 D4:1 C4:3',
          'Eb4:2 Bb3:2 G3:3',
          'Db4:2 Ab3:2 F3:3',
          stabs('G3'),
          'A3:3 F#3:1 D3:1 A2:2',
        ]),
        tamtam: S('tamtam', 0.4, { 1: 'E3:7!' }),
        swell: S('swell', 0.3, { 8: '.:4 E4:3', 16: '.:4 E4:3' }),
        cymbal: S('cymbal', 0.3, { 9: 'E4:7!' }),
      },
      levels: stack(['pulse', 'drone'], ['hammer', 'ground', 'timpani', 'bass'], ['snare', 'brass', 'answer'], ['high', 'harmony', 'tamtam', 'swell', 'cymbal']),
    },
    siegeTank(-5, [2, 2, 3], ['brass', 'answer', 'high', 'harmony'], 'timpani'),
  );
})();

/**
 * **Mirage** (desert): 9/8 in 2 + 2 + 2 + 3 (the beat is an eighth), D Phrygian dominant. A frame
 * drum (the timpani, tuned up) under a double reed that snakes and ornaments, a second reed an
 * octave down echoing each turn of it a bar later; horns double it at the top. One line and its
 * shadow, never chords: no harmony voice here. The theme: D → Eb/D → Gm/D → Ab/D (the tritone) →
 * A/D. The climb: Cm/D → Gm/D → Eb/D, the drum breaking into a dance, the reed reaching the
 * scale's augmented second at its top, breaking on Ab/D.
 */
export const MIRAGE: Piece = (() => {
  const { L, S } = parts(9);
  const OSTINATO = "D3:1! D3:1/2' D3' D3:1! D3' D3:1! D3:1/2' D3' D3:1! D3' D3'";
  const PICKUP = "D3:1! D3:1/2' D3' D3:1! D3' D3:1! D3:1/2' D3' D3:1/2! D3 D3 D3 D3 D3";
  const melody = L('reed', 0.5, [
    'A4:3! Bb4:1 A4:1 G4:1 F#4:1 G4:2',
    'F#4:4 G4:1 A4:1 Bb4:1 C5:1 D5:1',
    'Eb5:4! D5:1 Eb5:1 D5:1 C5:1 Bb4:1',
    'G4:6 A4:1 Bb4:1 C5:1',
    'D5:3! C5:1/2 Bb4:1/2 A4:2 G4:3',
    'Bb4:4 A4:1 G4:1 F#4:1 Eb4:1 D4:1',
    'Ab4:3! C5:1 Eb5:2 D5:1 C5:1 Ab4:1',
    'C5:4 Eb5:2 E5:1 C#5:1 A4:1',
    'G4:2! C5:2 Eb5:2 D5:1 C5:1 D5:1',
    'Eb5:3 D5:1 C5:1 Bb4:1 C5:3',
    'D5:2! Bb4:2 G4:2 A4:1 Bb4:1 C5:1',
    'D5:4 C5:1/2 Bb4:1/2 A4:1 G4:3',
    'G4:2! Bb4:2 Eb5:2 F#5:1 Eb5:1 D5:1',
    'Eb5:3! C5:1 Ab4:2 C5:1 Eb5:1 C5:1',
    'Ab4:2! Ab4:2! Ab4:2! C5:1 Bb4:1 Ab4:1',
    'E5:3! C#5:1 Bb4:2 A4:3',
  ]);
  // The frame drum: over the tonic and its fifth, over the octave where the fifth would grate, and the dance.
  const DRUM = "D3:2! A2:2 D3:2! A2:1 A2:1' A2:1'";
  const DRUM_HIGH = "D3:2! D4:2' D3:2! D4:1' D4:1' D4:1'";
  const DANCE = "D3:2! D4:1' D4:1' D3:2! D4:1' D3:1! D4:1'";
  const SNARE = "D2:1! .:1 D2:1/2' D2' D2:1! .:1 D2:1/2' D2' .:1 D2:1! D2:1/2' D2'";
  const SNARE_ROLL = "D2:1! .:1 D2:1/2' D2' D2:1! .:1 D2:1/3*12";
  return piece(
    {
      id: 'mirage',
      tempo: 264,
      beatsPerBar: 9,
      beatUnit: 8,
      layers: {
        pulse: L('legno', 0.75, [...times(7, OSTINATO), PICKUP]),
        // Heat haze.
        drone: S('tremolo', 0.15, { 1: 'D4+A4:9', 2: '-:9', 5: 'D4+G4:9', 6: '-:9', 9: 'D4+G4:9', 10: '-:9', 14: 'D4+Ab4:9', 15: '-:9' }),
        ground: L('strings', 0.22, [
          'D3+A3+D4+F#4:9',
          '-:9',
          'D3+Bb3+Eb4+G4:9',
          '-:9',
          'D3+G3+Bb3+D4:9',
          '-:9',
          'D3+Ab3+C4+Eb4:9',
          '-:6 D3+A3+C#4+E4:3',
          'D3+G3+C4+Eb4:9',
          '-:9',
          'D3+G3+Bb3+D4:9',
          '-:9',
          'D3+G3+Bb3+Eb4:9',
          'D3+Ab3+C4+Eb4:9',
          '-:9',
          'D3+A3+C#4+E4:9',
        ]),
        drum: L('timpani', 0.4, [DRUM, "D3:9'", DRUM_HIGH, "D3:9'", DRUM, "D3:9'", DRUM_HIGH, 'D3:6 A2:2/3! A2 A2 A2:1!', ...times(7, DANCE), 'D3:6! A2:2/3! A2 A2 A2:1!']),
        bass: S('basses', 0.22, {
          7: 'Ab2:6! Ab2:3',
          8: 'Ab2:6 A2:3',
          9: 'C3:6! C3:3',
          10: 'C3:6 Bb2:3',
          11: 'G2:6! G2:3',
          12: 'G2:9',
          13: 'Eb2:6! Eb2:3',
          14: 'Ab2:6! Ab2:3',
          15: 'Ab2:2! Ab2:2! Ab2:2! Ab2:3!',
          16: 'A2:6! A2:3',
        }),
        snare: L('snare', 0.3, [...times(7, SNARE), SNARE_ROLL, ...times(6, SNARE), "D2:2! D2:2! D2:2! D2:1! D2:1/2' D2' D2:1!", SNARE_ROLL]),
        reed: melody,
        // The second reed: each turn of the melody again, an octave down, under its long note.
        answer: S('reed', 0.3, {
          2: 'A3:1! Bb3:1 A3:1 G3:1 F#3:2 .:3',
          4: 'Eb4:1! D4:1 Eb4:1 D4:1 C4:1 Bb3:1 .:3',
          6: 'D4:1! C4:1/2 Bb3:1/2 A3:1 G3:1 .:5',
          10: 'G3:1! C4:1 Eb4:1 .:6',
          12: 'D4:1! Bb3:1 G3:2 .:5',
          15: 'Ab3:2! Ab3:2! Ab3:2! .:3',
        }),
        horns: { voice: 'horn', gain: 0.35, bars: transpose(melody.bars, -12) },
        tamtam: S('tamtam', 0.4, { 1: 'E3:9!' }),
        swell: S('swell', 0.3, { 8: '.:5 E4:4', 16: '.:5 E4:4' }),
        cymbal: S('cymbal', 0.3, { 9: 'E4:9!' }),
      },
      levels: stack(['pulse', 'drone'], ['ground', 'drum', 'bass'], ['snare', 'reed', 'answer'], ['horns', 'tamtam', 'swell', 'cymbal']),
    },
    siegeTank(2, [2, 2, 2, 3], ['reed', 'answer', 'horns'], 'drum', 2),
  );
})();

/**
 * **Ashes** (blasted wasteland): the aftermath, a slow dirge in 4/4 that limps 3 + 3 + 2 (in
 * eighths), B♭ minor. A deep bell tolls each chord's root even when it's calm; the choir laments,
 * low brass under it, a lone horn calling a rising fourth in each long note, and at the top the
 * brass takes the melody. The theme: Bbm → B/Bb (the semitone) → Gb/Bb → E/Bb (the tritone) →
 * F/Bb. The climb: Ebm/Bb → Bbm7 → Gb/Bb, the lament reaching its high Db, breaking on E/Bb.
 */
export const ASHES: Piece = (() => {
  const { L, S } = parts(4);
  const OSTINATO = "Bb2:1/2! Bb2' . Bb2! Bb2' . Bb2! .";
  const PICKUP = "Bb2:1/2! Bb2' . Bb2! Bb2' . Bb2:1/6! Bb2 Bb2 Bb2 Bb2 Bb2";
  const melody = L('choir', 0.5, [
    'F4:3! Gb4:1',
    'F4:2 Eb4:1 Db4:1',
    'F#4:3! D#4:1',
    'C#4:2 B3:1 A#3:1',
    'Db4:3! Eb4:1',
    'Gb4:2 F4:1 Eb4:1',
    'E4:2! G#4:2',
    'B4:2 A4:1 F4:1',
    'Bb4:3! Gb4:1',
    'Eb4:2 F4:1 Gb4:1',
    'Ab4:3! F4:1',
    'Db4:2 Eb4:1 F4:1',
    'Bb4:3! Db5:1',
    'B4:2! G#4:2',
    'E4:3! G#4:1',
    'C5:2! A4:1 F4:1',
  ]);
  return piece(
    {
      id: 'ashes',
      tempo: 88,
      beatsPerBar: 4,
      layers: {
        pulse: L('legno', 0.8, [...times(7, OSTINATO), PICKUP]),
        toll: L('bells', 0.45, [
          'Bb3:4!',
          '.:4',
          'B3:4!',
          '.:4',
          'Gb3:4!',
          '.:4',
          'E3:4!',
          '.:2 F3:2',
          'Eb3:4!',
          '.:4',
          'Db3:4!',
          '.:4',
          'Gb3:4!',
          'E3:4!',
          '.:4',
          '.:2 F3:2',
        ]),
        // Wind over the ash.
        drone: S('tremolo', 0.15, { 1: 'Bb3+F4:4', 2: '-:4', 5: 'Bb3+Gb4:4', 6: '-:4', 9: 'Bb3+Eb4:4', 10: '-:4', 14: 'Bb3+E4:4', 15: '-:4' }),
        ground: L('strings', 0.22, [
          'Bb2+F3+Bb3+Db4:4',
          '-:4',
          'Bb2+F#3+B3+D#4:4',
          '-:4',
          'Bb2+Gb3+Bb3+Db4:4',
          '-:4',
          'Bb2+E3+G#3+B3:4',
          '-:2 Bb2+F3+A3+C4:2',
          'Bb2+Gb3+Bb3+Eb4:4',
          '-:4',
          'Bb2+F3+Ab3+Db4:4',
          '-:4',
          'Bb2+Gb3+Bb3+Db4:4',
          'Bb2+E3+G#3+B3:4',
          '-:4',
          'Bb2+F3+A3+C4:4',
        ]),
        timpani: L('timpani', 0.45, [
          'Bb2:2! F3:2',
          "Bb2:4'",
          'Bb2:2! Bb2:2',
          "Bb2:4'",
          'Bb2:2! Bb2:2',
          "Bb2:4'",
          'Bb2:2! E3:2',
          'Bb2:2 F3:1/3! F3 F3 F3:1!',
          'Bb2:2! Bb2:2',
          "Bb2:4'",
          'Bb2:2! F3:2',
          "Bb2:4'",
          'Bb2:2! Bb2:2',
          'Bb2:2! E3:2',
          'Bb2:1.5! Bb2:1.5! Bb2:1!',
          'Bb2:2 F3:1/3! F3 F3 F3:1!',
        ]),
        bass: S('basses', 0.22, { 7: 'E2:4!', 8: '-:2 F2:2', 9: 'Eb2:4!', 10: '-:4', 11: 'Db2:4!', 12: '-:4', 13: 'Gb2:4!', 14: 'E2:4!', 15: '-:4', 16: 'F2:4' }),
        choir: melody,
        horns: { voice: 'lowBrass', gain: 0.35, bars: transpose(melody.bars, -12) },
        // A lone horn: a rising fourth in each of the melody's long notes.
        answer: S('horn', 0.3, {
          1: '.:1 F3:1 Bb3:2',
          3: '.:1 F#3:1 B3:2',
          5: '.:1 Db3:1 Gb3:2',
          7: '.:1 B2:1 E3:2',
          9: '.:1 Bb3:1 Eb4:2',
          11: '.:1 Ab3:1 Db4:2',
          13: '.:1 Db3:1 Gb3:2',
          15: '.:1 B2:1 E3:2',
        }),
        brass: { voice: 'brass', gain: 0.35, bars: melody.bars },
        // The choir's second voice.
        harmony: L('choir', 0.28, [
          'Db4:3 Eb4:1',
          'Db4:2 C4:1 Bb3:1',
          'D#4:3 B3:1',
          'A#3:2 G#3:1 F#3:1',
          'Bb3:4',
          'Eb4:2 Db4:1 Bb3:1',
          'B3:2 E4:2',
          'G#4:2 F4:1 C4:1',
          'Gb4:3 Eb4:1',
          'Bb3:2 Db4:1 Eb4:1',
          'F4:3 Db4:1',
          'Ab3:2 Bb3:1 Db4:1',
          'Gb4:3 Bb4:1',
          'G#4:2 E4:2',
          'B3:3 E4:1',
          'A4:2 F4:1 C4:1',
        ]),
        tamtam: S('tamtam', 0.4, { 1: 'E3:4!', 5: 'E3:4!', 13: 'E3:4!' }),
        swell: S('swell', 0.3, { 8: '.:2 E4:2', 16: '.:2 E4:2' }),
        cymbal: S('cymbal', 0.3, { 9: 'E4:4!' }),
      },
      levels: stack(['pulse', 'toll', 'drone'], ['ground', 'timpani', 'bass'], ['choir', 'horns', 'answer'], ['brass', 'harmony', 'tamtam', 'swell', 'cymbal']),
    },
    siegeTank(-2, [1.5, 1.5, 1], ['choir', 'horns', 'answer', 'brass', 'harmony'], 'timpani'),
  );
})();

/** Each biome's piece. */
export const PIECES: Record<BiomeId, Piece> = {
  temperate: ADVANCE,
  arctic: WHITEOUT,
  industrial: FOUNDRY,
  desert: MIRAGE,
  wasteland: ASHES,
};
