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
 * Each runs an 8-bar loop over its pedal. The harmony leaves home for the chord a semitone up
 * (the clash Mars is built on), wanders, reaches the tritone (the darkest), and turns home.
 * Intensity adds layers in four levels, as in *Advance*.
 *
 * The siege tank's theme is the same in every piece, in that piece's key and meter (`siegeTank`).
 */

/** The heat at which each level above the first begins (calibrated on *Advance* with the bot). */
const THRESHOLDS = [0.12, 0.3, 0.55];

/** A piece's parts, all in its meter. */
function parts(beatsPerBar: number) {
  return (voice: VoiceId, gain: number, src: string): Layer => layer(voice, gain, src, beatsPerBar);
}

/** An empty 8-bar phrase with one stroke on the downbeat (the tam-tam). */
function stroke(beatsPerBar: number, every = 8): string {
  return Array.from({ length: 8 }, (_, i) => (i % every === 0 ? `E3:${beatsPerBar}!` : `.:${beatsPerBar}`)).join(' | ');
}

/**
 * The siege tank's music, for a piece `key` semitones from C (written in C, then transposed).
 * - `groups`: how the piece's bar divides (in beats): its treads accent each group, and the march
 *   stamps a long note and a short one, the short one as long as the last group.
 * - `pulse`: the piece's beat in quarter notes' worth of its own beats (2 when the beat is an
 *   eighth), so the stingers' hammering keeps the same speed in every piece.
 * - `melodic`: the piece's melody layers, which its stinger silences and its march replaces.
 * - `drum`: the piece's drum layer, which its treads replace.
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
        ],
      },
      // The one bright chord in the score: the major chord on the root, when the siege tank goes down.
      siegeTankDown: {
        mutes: ['ground', ...melodic],
        parts: [
          C('brass', 0.7, `C3+G3+C4+E4+G4:${u}/3! C3+G3+C4+E4+G4' C3+G3+C4+E4+G4' C3+G3+C4+E4+G4:${B - u}!`),
          C('timpani', 0.6, `C3:${u}/3! C3' C3' C3:${B - u}!`),
          C('tamtam', 0.5, `E3:${B}!`),
        ],
      },
    },
    theme: {
      stinger: 'siegeTank',
      resolve: 'siegeTankDown',
      layers: ['siegeTank.march', 'siegeTank.treads'],
      replaces: [...melodic, drum],
      floor: 2,
    },
  };
}

/** A piece from its own layers and levels, with the siege tank's theme added. */
function piece(
  p: Omit<Piece, 'thresholds' | 'stingers' | 'themes'>,
  tank: ReturnType<typeof siegeTank>,
): Piece {
  return {
    ...p,
    layers: { ...p.layers, ...tank.layers },
    thresholds: THRESHOLDS,
    stingers: tank.stingers,
    themes: { siegeTank: tank.theme },
  };
}

/**
 * **Advance** (temperate): over a C pedal the harmony steps C5 → Db/C → Bb/C → Gb/C and turns home
 * through G/C. The ostinato groups each bar 3 + 2, accents on beats 1 and 4.
 */
export const ADVANCE: Piece = (() => {
  const L = parts(5);
  const OSTINATO = "C3:1/3! C3' C3' C3:1 C3:1/2 C3' C3:1! C3:1";
  const PICKUP = "C3:1/3! C3' C3' C3:1 C3:1/2 C3' C3:1/3! C3 C3 C3:1/3 C3 C3";
  const melody = L(
    'brass',
    0.5,
    [
      'G3:3! C4:2',
      '-:2 D4:1 Eb4:2',
      'F4:3! Eb4:1 Db4:1',
      'C4:4 Db4:1',
      'D4:3! C4:1 Bb3:1',
      'F3:3 Bb3:1/3 C4 D4 F4:1',
      'Gb4:3! F4:1 Db4:1',
      'C4:3 B3:1 D4:1',
    ].join(' | '),
  );
  return piece(
    {
      id: 'advance',
      tempo: 138,
      beatsPerBar: 5,
      layers: {
        pulse: L('legno', 0.8, `${OSTINATO} | % | % | % | % | % | % | ${PICKUP}`),
        ground: L(
          'strings',
          0.24,
          'C3+G3+C4:5 | -:5 | C3+Ab3+Db4+F4:5 | -:5 | C3+Bb3+D4+F4:5 | -:5 | C3+Bb3+Db4+Gb4:5 | -:3 C3+B3+D4+G4:2',
        ),
        timpani: L(
          'timpani',
          0.5,
          "C3:3! G2:2 | C3:5' | C3:3! G2:2 | C3:5' | C3:3! G2:2 | C3:5' | C3:3! G2:2 | C3:3 G2:1/3! G2 G2 G2:1!",
        ),
        snare: L('snare', 0.35, "D2:1/3! D2' D2' .:2 D2:1/2' D2' D2:1! | % | % | % | % | % | % | D2:1/3! D2' D2' .:1 D2:1/6*18"),
        brass: melody,
        high: { voice: 'strings', gain: 0.3, bars: transpose(melody.bars, 12) },
        tamtam: L('tamtam', 0.4, stroke(5)),
      },
      levels: [
        ['pulse'],
        ['pulse', 'ground', 'timpani'],
        ['pulse', 'ground', 'timpani', 'snare', 'brass'],
        ['pulse', 'ground', 'timpani', 'snare', 'brass', 'high', 'tamtam'],
      ],
    },
    siegeTank(0, [3, 2], ['brass', 'high'], 'timpani'),
  );
})();

/**
 * **Whiteout** (arctic): slower and heavier, a 6/4 tread of 3 + 3 over an E pedal. Glass bells
 * glint over the ostinato even when it's calm; a wordless choir carries the melody, horns an
 * octave under it. E minor → F/E (the Phrygian semitone) → D/E (cold, bright) → Bb/E (the
 * tritone) → B/E. No snare: the cold is quiet.
 */
export const WHITEOUT: Piece = (() => {
  const L = parts(6);
  const OSTINATO = "E3:1! E3:1/2' E3' E3:1 E3:1! E3:1/2' E3' E3:1";
  const PICKUP = "E3:1! E3:1/2' E3' E3:1 E3:1/3! E3 E3 E3:1/3 E3 E3 E3:1/3! E3 E3";
  const melody = L(
    'choir',
    0.5,
    [
      'B4:4! G4:2',
      '-:2 A4:2 B4:2',
      'C5:4! B4:1 A4:1',
      'F4:4 E4:1 F4:1',
      'F#4:4! A4:2',
      'D5:4 C#5:1 A4:1',
      'Bb4:4! A4:1 F4:1',
      'F#4:3 E4:1 D#4:2',
    ].join(' | '),
  );
  return piece(
    {
      id: 'whiteout',
      tempo: 132,
      beatsPerBar: 6,
      layers: {
        pulse: L('legno', 0.8, `${OSTINATO} | % | % | % | % | % | % | ${PICKUP}`),
        glint: L(
          'bells',
          0.35,
          'B5:1/2! E5:1/2 .:5 | .:6 | C6:1/2! F5:1/2 .:5 | .:6 | D6:1/2! F#5:1/2 .:5 | .:6 | Bb5:1/2! E5:1/2 .:5 | .:3 D#6:1/2 B5:1/2 .:2',
        ),
        ground: L(
          'strings',
          0.24,
          'E3+B3+E4+G4:6 | -:6 | E3+A3+C4+F4:6 | -:6 | E3+A3+D4+F#4:6 | -:6 | E3+Bb3+D4+F4:6 | -:3 E3+B3+D#4+F#4:3',
        ),
        timpani: L(
          'timpani',
          0.5,
          "E3:3! B2:3 | E3:6' | E3:3! B2:3 | E3:6' | E3:3! B2:3 | E3:6' | E3:3! B2:3 | E3:3 B2:1/3! B2 B2 B2:1! B2:1!",
        ),
        choir: melody,
        horns: { voice: 'brass', gain: 0.3, bars: transpose(melody.bars, -12) },
        high: { voice: 'strings', gain: 0.3, bars: transpose(melody.bars, 12) },
        tamtam: L('tamtam', 0.4, stroke(6)),
      },
      levels: [
        ['pulse', 'glint'],
        ['pulse', 'glint', 'ground', 'timpani'],
        ['pulse', 'glint', 'ground', 'timpani', 'choir', 'horns'],
        ['pulse', 'glint', 'ground', 'timpani', 'choir', 'horns', 'high', 'tamtam'],
      ],
    },
    siegeTank(4, [3, 3], ['choir', 'horns', 'high'], 'timpani'),
  );
})();

/**
 * **Foundry** (industrial): fast and mechanical, 7/4 in 2 + 2 + 3. The ostinato is a machine,
 * eighths jumping G2–G3 with a grinding Ab at the end of each bar; an anvil strikes the groups
 * from the second level. Open fifths on G → Ab/G → F/G → Db/G (the tritone) → D/G. The brass
 * melody is angular, the snare drives.
 */
export const FOUNDRY: Piece = (() => {
  const L = parts(7);
  const OSTINATO = "G2:1/2! G2' G3 G2' G2! G2' G3 G2' G2! G2' G3 G2' Ab2 G2'";
  const PICKUP = "G2:1/2! G2' G3 G2' G2! G2' G3 G2' G2:1/3! G2 G2 G2 G2 G2 G2:1/2! Ab2!";
  const melody = L(
    'brass',
    0.5,
    [
      'D3:2! G3:2 Bb3:3',
      'A3:2 G3:1 F3:1 G3:3',
      'Ab3:2! C4:2 Eb4:3',
      'D4:2 C4:1 Bb3:1 Ab3:3',
      'A3:2! C4:2 F4:3',
      'G4:2 F4:1 Eb4:1 C4:3',
      'Ab3:2! Db4:2 F4:3',
      'F#3:3! G3:1 A3:1 D3:2',
    ].join(' | '),
  );
  return piece(
    {
      id: 'foundry',
      tempo: 176,
      beatsPerBar: 7,
      layers: {
        pulse: L('legno', 0.75, `${OSTINATO} | % | % | % | % | % | % | ${PICKUP}`),
        hammer: L('anvil', 0.5, "D5:2! D5:2 D5:1! .:1 D5:1/2' D5'"),
        ground: L(
          'strings',
          0.24,
          'G2+D3+G3:7 | -:7 | G2+Ab3+C4+Eb4:7 | -:7 | G2+A3+C4+F4:7 | -:7 | G2+Ab3+Db4+F4:7 | -:4 G2+A3+D4+F#4:3',
        ),
        timpani: L(
          'timpani',
          0.5,
          "G2:2! G2:2 D3:3 | G2:7' | G2:2! G2:2 D3:3 | G2:7' | G2:2! G2:2 D3:3 | G2:7' | G2:2! G2:2 D3:3 | G2:4 D3:1/3! D3 D3 D3:1! D3:1!",
        ),
        snare: L(
          'snare',
          0.35,
          "D2:1/2! D2' .:1 D2:1/2! D2' .:1 D2:1/2! D2' D2' D2' .:1 | % | % | % | % | % | % | D2:1/2! D2' .:1 D2:1/2! D2' .:1 D2:1/6*18",
        ),
        brass: melody,
        high: { voice: 'strings', gain: 0.3, bars: transpose(melody.bars, 12) },
        tamtam: L('tamtam', 0.4, stroke(7)),
      },
      levels: [
        ['pulse'],
        ['pulse', 'hammer', 'ground', 'timpani'],
        ['pulse', 'hammer', 'ground', 'timpani', 'snare', 'brass'],
        ['pulse', 'hammer', 'ground', 'timpani', 'snare', 'brass', 'high', 'tamtam'],
      ],
    },
    siegeTank(-5, [2, 2, 3], ['brass', 'high'], 'timpani'),
  );
})();

/**
 * **Mirage** (desert): 9/8 in 2 + 2 + 2 + 3 (the beat is an eighth), D Phrygian dominant. A frame
 * drum (the timpani, tuned up) under a double reed that snakes and ornaments; horns double it an
 * octave down at the top. D → Eb/D → Gm/D → Ab/D (the tritone) → A/D.
 */
export const MIRAGE: Piece = (() => {
  const L = parts(9);
  const OSTINATO = "D3:1! D3:1/2' D3' D3:1! D3' D3:1! D3:1/2' D3' D3:1! D3' D3'";
  const PICKUP = "D3:1! D3:1/2' D3' D3:1! D3' D3:1! D3:1/2' D3' D3:1/2! D3 D3 D3 D3 D3";
  const melody = L(
    'reed',
    0.5,
    [
      'A4:3! Bb4:1 A4:1 G4:1 F#4:1 G4:2',
      'F#4:4 G4:1 A4:1 Bb4:1 C5:1 D5:1',
      'Eb5:4! D5:1 Eb5:1 D5:1 C5:1 Bb4:1',
      'G4:6 A4:1 Bb4:1 C5:1',
      'D5:3! C5:1/2 Bb4:1/2 A4:2 G4:3',
      'Bb4:4 A4:1 G4:1 F#4:1 Eb4:1 D4:1',
      'Ab4:3! C5:1 Eb5:2 D5:1 C5:1 Ab4:1',
      'C#5:4 E5:2 C#5:1 A4:2',
    ].join(' | '),
  );
  const DRUM = "D3:2! A2:2 D3:2! A2:1 A2:1' A2:1'";
  return piece(
    {
      id: 'mirage',
      tempo: 264,
      beatsPerBar: 9,
      beatUnit: 8,
      layers: {
        pulse: L('legno', 0.75, `${OSTINATO} | % | % | % | % | % | % | ${PICKUP}`),
        ground: L(
          'strings',
          0.24,
          'D3+A3+D4+F#4:9 | -:9 | D3+Bb3+Eb4+G4:9 | -:9 | D3+G3+Bb3+D4:9 | -:9 | D3+Ab3+C4+Eb4:9 | -:6 D3+A3+C#4+E4:3',
        ),
        drum: L('timpani', 0.45, `${DRUM} | D3:9' | ${DRUM} | D3:9' | ${DRUM} | D3:9' | ${DRUM} | D3:6 A2:2/3! A2 A2 A2:1!`),
        snare: L(
          'snare',
          0.3,
          "D2:1! .:1 D2:1/2' D2' D2:1! .:1 D2:1/2' D2' .:1 D2:1! D2:1/2' D2' | % | % | % | % | % | % | D2:1! .:1 D2:1/2' D2' D2:1! .:1 D2:1/3*12",
        ),
        reed: melody,
        horns: { voice: 'brass', gain: 0.3, bars: transpose(melody.bars, -12) },
        tamtam: L('tamtam', 0.4, stroke(9)),
      },
      levels: [
        ['pulse'],
        ['pulse', 'ground', 'drum'],
        ['pulse', 'ground', 'drum', 'snare', 'reed'],
        ['pulse', 'ground', 'drum', 'snare', 'reed', 'horns', 'tamtam'],
      ],
    },
    siegeTank(2, [2, 2, 2, 3], ['reed', 'horns'], 'drum', 2),
  );
})();

/**
 * **Ashes** (blasted wasteland): the aftermath, a slow dirge in 4/4 that limps 3 + 3 + 2 (in
 * eighths), B♭ minor. A deep bell tolls each chord's root even when it's calm; the choir laments,
 * low brass under it, and at the top the brass takes the melody. Bbm → B/Bb (the semitone) →
 * Gb/Bb → E/Bb (the tritone) → F/Bb.
 */
export const ASHES: Piece = (() => {
  const L = parts(4);
  const OSTINATO = "Bb2:1/2! Bb2' . Bb2! Bb2' . Bb2! .";
  const PICKUP = "Bb2:1/2! Bb2' . Bb2! Bb2' . Bb2:1/6! Bb2 Bb2 Bb2 Bb2 Bb2";
  const melody = L(
    'choir',
    0.5,
    [
      'F4:3! Gb4:1',
      'F4:2 Eb4:1 Db4:1',
      'F#4:3! D#4:1',
      'C#4:2 B3:1 A#3:1',
      'Db4:3! Eb4:1',
      'Gb4:2 F4:1 Eb4:1',
      'E4:2! G#4:2',
      'B4:2 A4:1 F4:1',
    ].join(' | '),
  );
  return piece(
    {
      id: 'ashes',
      tempo: 88,
      beatsPerBar: 4,
      layers: {
        pulse: L('legno', 0.8, `${OSTINATO} | % | % | % | % | % | % | ${PICKUP}`),
        toll: L('bells', 0.45, 'Bb3:4! | .:4 | B3:4! | .:4 | Gb3:4! | .:4 | E3:4! | .:2 F3:2'),
        ground: L(
          'strings',
          0.24,
          'Bb2+F3+Bb3+Db4:4 | -:4 | Bb2+F#3+B3+D#4:4 | -:4 | Bb2+Gb3+Bb3+Db4:4 | -:4 | Bb2+E3+G#3+B3:4 | -:2 Bb2+F3+A3+C4:2',
        ),
        timpani: L(
          'timpani',
          0.5,
          "Bb2:2! F3:2 | Bb2:4' | Bb2:2! F3:2 | Bb2:4' | Bb2:2! F3:2 | Bb2:4' | Bb2:2! F3:2 | Bb2:2 F3:1/3! F3 F3 F3:1!",
        ),
        choir: melody,
        horns: { voice: 'lowBrass', gain: 0.35, bars: transpose(melody.bars, -12) },
        brass: { voice: 'brass', gain: 0.35, bars: melody.bars },
        tamtam: L('tamtam', 0.4, stroke(4, 4)),
      },
      levels: [
        ['pulse', 'toll'],
        ['pulse', 'toll', 'ground', 'timpani'],
        ['pulse', 'toll', 'ground', 'timpani', 'choir', 'horns'],
        ['pulse', 'toll', 'ground', 'timpani', 'choir', 'horns', 'brass', 'tamtam'],
      ],
    },
    siegeTank(-2, [1.5, 1.5, 1], ['choir', 'horns', 'brass'], 'timpani'),
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
