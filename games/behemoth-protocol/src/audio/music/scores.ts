import type { BiomeId } from '../../content/biomes';
import { layer, transpose, type Layer, type Piece, type VoiceId } from './score';

/**
 * The scores (SPEC §11.4 "Music"). Mars-inspired, not a transcription: 5/4, a hammered
 * single-note ostinato, chords clashing over a pedal, brass in tritones, a relentless build.
 *
 * **Advance** (temperate): an 8-bar loop over a C pedal. The harmony steps C5 → Db/C → Bb/C →
 * Gb/C (the tritone, the darkest) and turns home through G/C. The ostinato groups each bar 3 + 2,
 * accents on beats 1 and 4.
 */

const B = 5;
const L = (voice: VoiceId, gain: number, src: string): Layer => layer(voice, gain, src, B);

const OSTINATO = "C3:1/3! C3' C3' C3:1 C3:1/2 C3' C3:1! C3:1";
const PICKUP = "C3:1/3! C3' C3' C3:1 C3:1/2 C3' C3:1/3! C3 C3 C3:1/3 C3 C3";
const MELODY = [
  'G3:3! C4:2',
  '-:2 D4:1 Eb4:2',
  'F4:3! Eb4:1 Db4:1',
  'C4:4 Db4:1',
  'D4:3! C4:1 Bb3:1',
  'F3:3 Bb3:1/3 C4 D4 F4:1',
  'Gb4:3! F4:1 Db4:1',
  'C4:3 B3:1 D4:1',
].join(' | ');

const melody = L('brass', 0.5, MELODY);

export const ADVANCE: Piece = {
  id: 'advance',
  tempo: 138,
  beatsPerBar: B,
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
    tamtam: L('tamtam', 0.4, 'E3:5! | .:5 | .:5 | .:5 | .:5 | .:5 | .:5 | .:5'),

    // Siege tank: low brass stamping out tritones in octaves, and timpani like grinding treads.
    'siegeTank.march': L(
      'lowBrass',
      0.6,
      'C3+C4:3! Gb2+Gb3:2 | G2+G3:5 | Ab2+Ab3:3! Db3+Db4:2 | C3+C4:5 | Bb2+Bb3:3! E2+E3:2 | F2+F3:5 | Gb2+Gb3:3! C3+C4:2 | Db3+Db4:3 B2+B3:1 D3+D4:1',
    ),
    'siegeTank.treads': L('timpani', 0.38, "C3:1/2! G2:1/2' C3:1/2 G2:1/2' C3:1/2 G2:1/2' C3:1/2! G2:1/2' C3:1/2 G2:1/2'"),
  },
  levels: [
    ['pulse'],
    ['pulse', 'ground', 'timpani'],
    ['pulse', 'ground', 'timpani', 'snare', 'brass'],
    ['pulse', 'ground', 'timpani', 'snare', 'brass', 'high', 'tamtam'],
  ],
  thresholds: [0.12, 0.3, 0.55],
  stingers: {
    // Db major hammered over the C/G pedal, the clash Mars is built on.
    siegeTank: {
      mutes: ['brass', 'high'],
      parts: [
        L('brass', 0.75, 'C3+G3+Db4+F4+Ab4:1/3! C3+G3+Db4+F4+Ab4 C3+G3+Db4+F4+Ab4 C3+G3+Db4+F4+Ab4:1! .:1 C3+G3+Db4+F4+Ab4:2!'),
        L('lowBrass', 0.7, 'C2+C3:1/3! C2+C3 C2+C3 C2+C3:1! .:1 C2+C3:2!'),
        L('timpani', 0.6, 'C3:1/3! C3 C3 C3:1! G2:1/6*6 C3:2!'),
        L('tamtam', 0.6, 'E3:5!'),
      ],
    },
    // After the detonation's silence: the clash hammered one last time, landing on a bare open C.
    finale: {
      mutes: [],
      parts: [
        L('brass', 0.8, 'Db3+Ab3+Db4+F4:1/3! Db3+Ab3+Db4+F4 Db3+Ab3+Db4+F4 C3+G3+C4+G4:4!'),
        L('lowBrass', 0.75, 'Db2+Db3:1/3! Db2+Db3 Db2+Db3 C2+C3:4!'),
        L('strings', 0.35, '.:1 C3+G3+C4+G4+C5:4'),
        L('timpani', 0.7, 'G2:1/3! G2 G2 C3:4!'),
        L('tamtam', 0.7, '.:1 E3:4!'),
      ],
    },
    // The one bright chord in the score: C major, when the siege tank goes down.
    siegeTankDown: {
      mutes: ['ground', 'brass', 'high'],
      parts: [
        L('brass', 0.7, "C3+G3+C4+E4+G4:1/3! C3+G3+C4+E4+G4' C3+G3+C4+E4+G4' C3+G3+C4+E4+G4:4!"),
        L('timpani', 0.6, "C3:1/3! C3' C3' C3:4!"),
        L('tamtam', 0.5, 'E3:5!'),
      ],
    },
  },
  themes: {
    siegeTank: {
      stinger: 'siegeTank',
      resolve: 'siegeTankDown',
      layers: ['siegeTank.march', 'siegeTank.treads'],
      replaces: ['brass', 'high', 'timpani'],
      floor: 2,
    },
  },
};

/** Each biome's piece. Only the temperate one is written so far: the rest borrow it (SPEC §11.4). */
export const PIECES: Record<BiomeId, Piece> = {
  temperate: ADVANCE,
  arctic: ADVANCE,
  industrial: ADVANCE,
  desert: ADVANCE,
  wasteland: ADVANCE,
};
