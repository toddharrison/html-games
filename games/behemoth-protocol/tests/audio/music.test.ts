import { describe, expect, it } from 'vitest';
import { barEvents, Director, HOLD_BARS, levelFor, timeline, type MusicInput } from '../../src/audio/music/director';
import { duckFor } from '../../src/audio/music/duck';
import { vlq, writeMidi } from '../../src/audio/music/midi';
import { barSeconds, layer, midi, parse, transpose, type Piece } from '../../src/audio/music/score';
import { ADVANCE, MIRAGE, PIECES } from '../../src/audio/music/scores';

const calm: MusicInput = { heat: 0, bosses: [] };
const at = (heat: number, bosses: string[] = [], downed: string[] = []): MusicInput => ({ heat, bosses, downed });

describe('notation', () => {
  it('names pitches in MIDI numbers', () => {
    expect(midi('C4')).toBe(60);
    expect(midi('A4')).toBe(69);
    expect(midi('Eb3')).toBe(51);
    expect(midi('F#2')).toBe(42);
    expect(midi('C-1')).toBe(0);
    expect(() => midi('H2')).toThrow();
  });

  it('lays tokens end to end, carrying the last duration', () => {
    const [bar] = parse("C3:1/3! C3' C3' D3:1 .:2 E3:1", 5);
    expect(bar!.map((n) => [n.pitch, +n.beat.toFixed(3), +n.dur.toFixed(3), n.vel])).toEqual([
      [48, 0, 0.333, 1],
      [48, 0.333, 0.333, 0.4],
      [48, 0.667, 0.333, 0.4],
      [50, 1, 1, 0.7],
      [52, 4, 1, 0.7],
    ]);
  });

  it('reads chords, repeats, ties across bar lines, and bar repeats', () => {
    const bars = parse('C3+G3:3 -:2 | -:1 D3:1/2*8 | %', 5);
    expect(bars[0]!.map((n) => [n.pitch, n.dur])).toEqual([
      [48, 6],
      [55, 6],
    ]);
    expect(bars[1]!).toHaveLength(8);
    expect(bars[1]![7]!.beat).toBe(4.5);
    expect(bars[2]).toEqual(bars[1]);
    expect(bars[2]).not.toBe(bars[1]);
  });

  it('rejects a bar that does not fill the meter', () => {
    expect(() => parse('C3:4 | C3:5', 5)).toThrow(/bar 1: 4 beats, not 5/);
    expect(() => parse('C3:5 | C3:6', 5)).toThrow(/bar 2/);
    expect(() => parse('%', 5)).toThrow();
    expect(() => parse('C3:x', 5)).toThrow();
  });

  it('transposes', () => {
    expect(transpose(parse('C3:5', 5), 12)[0]![0]!.pitch).toBe(60);
  });
});

describe('scores', () => {
  const pieces: Piece[] = Object.values(PIECES);

  it('every biome has a piece of its own', () => {
    expect(new Set(pieces.map((p) => p.id)).size).toBe(pieces.length);
  });

  for (const piece of pieces) {
    it(`${piece.id}: every name it uses exists, and every layer loops in step`, () => {
      const phrase = Math.max(...Object.values(piece.layers).map((l) => l.bars.length));
      for (const l of Object.values(piece.layers)) expect(phrase % l.bars.length).toBe(0);
      expect(piece.levels).toHaveLength(piece.thresholds.length + 1);
      for (const level of piece.levels) for (const id of level) expect(piece.layers[id], id).toBeDefined();
      for (const theme of Object.values(piece.themes)) {
        for (const id of [...theme.layers, ...theme.replaces]) expect(piece.layers[id], id).toBeDefined();
        for (const id of [theme.stinger, theme.resolve]) if (id) expect(piece.stingers[id], id).toBeDefined();
        expect(theme.floor).toBeLessThan(piece.levels.length);
      }
      for (const s of Object.values(piece.stingers)) for (const id of s.mutes) expect(piece.layers[id], id).toBeDefined();
    });

    it(`${piece.id}: bars of 2–3 s, so a change in the fight is heard within one`, () => {
      expect(barSeconds(piece)).toBeGreaterThan(2);
      expect(barSeconds(piece)).toBeLessThan(3);
    });

    it(`${piece.id}: the siege tank's theme, stingers, and finale, each a bar long`, () => {
      expect(piece.themes.siegeTank).toMatchObject({ stinger: 'siegeTank', resolve: 'siegeTankDown' });
      for (const id of ['siegeTank', 'siegeTankDown', 'finale']) {
        for (const p of piece.stingers[id]!.parts) expect(p.bars, id).toHaveLength(1);
      }
      const { plans } = timeline(piece, [at(0.9, ['siegeTank']), at(0.9, ['siegeTank'])]);
      expect(plans[1]!.layers).toEqual(expect.arrayContaining(piece.themes.siegeTank!.layers));
      for (const id of piece.themes.siegeTank!.replaces) expect(plans[1]!.layers).not.toContain(id);
    });

    it(`${piece.id}: each level adds to the one below`, () => {
      piece.levels.slice(1).forEach((level, i) => {
        for (const id of piece.levels[i]!) expect(level).toContain(id);
      });
    });
  }

  it('advance: 5/4 at 138, a bar lasting about 2.17 s', () => {
    expect(barSeconds(ADVANCE)).toBeCloseTo(2.174, 3);
  });
});

describe('director', () => {
  const piece = ADVANCE;

  it('maps heat to levels by the thresholds', () => {
    expect(levelFor(0, [0.15, 0.4, 0.7])).toBe(0);
    expect(levelFor(0.4, [0.15, 0.4, 0.7])).toBe(2);
    expect(levelFor(1, [0.15, 0.4, 0.7])).toBe(3);
  });

  it('rises at once and falls a level at a time after the hold', () => {
    const d = new Director(piece);
    expect(d.next(calm).level).toBe(0);
    expect(d.next(at(0.9)).level).toBe(3);
    const levels = Array.from({ length: HOLD_BARS * 3 + 1 }, () => d.next(calm).level);
    expect(levels).toEqual([3, 2, 2, 1, 1, 0, 0]);
  });

  it('a brief lull does not drop the level', () => {
    const d = new Director(piece);
    d.next(at(0.9));
    expect(d.next(calm).level).toBe(3);
    expect(d.next(at(0.9)).level).toBe(3);
    expect(d.next(calm).level).toBe(3);
  });

  it('a big enemy brings its stinger on the next bar, then its layers in place of the ones it replaces', () => {
    const d = new Director(piece);
    d.next(calm);
    const arrive = d.next(at(0, ['siegeTank']));
    expect(arrive.stingers).toEqual([{ id: 'siegeTank', bar: 0 }]);
    expect(arrive.level).toBe(piece.themes.siegeTank!.floor);
    expect(arrive.layers).not.toContain('brass'); // muted by the stinger
    const fight = d.next(at(0, ['siegeTank']));
    expect(fight.stingers).toEqual([]);
    expect(fight.layers).toEqual(expect.arrayContaining(['siegeTank.march', 'siegeTank.treads', 'pulse']));
    expect(fight.layers).not.toContain('timpani');
    const down = d.next(at(0, [], ['siegeTank']));
    expect(down.stingers).toEqual([{ id: 'siegeTankDown', bar: 0 }]);
    expect(down.layers).not.toContain('siegeTank.march');
    expect(down.layers).not.toContain('ground'); // the resolution has the stage
  });

  it('a big enemy left behind alive just drops its layers, with no resolution', () => {
    const d = new Director(piece);
    d.next(at(0, ['siegeTank']));
    d.next(at(0, ['siegeTank']));
    const gone = d.next(calm);
    expect(gone.stingers).toEqual([]);
    expect(gone.layers).not.toContain('siegeTank.march');
  });

  it('ignores bosses with no theme', () => {
    const d = new Director(piece);
    expect(d.next(at(0, ['nobody']))).toMatchObject({ level: 0, stingers: [] });
  });

  it('plays layers by bar number, with velocities scaled by the part gain', () => {
    const p: Piece = {
      id: 't',
      tempo: 120,
      beatsPerBar: 4,
      layers: { a: layer('legno', 0.5, 'C3:4 | D3:4', 4) },
      levels: [['a']],
      thresholds: [],
      stingers: {},
      themes: {},
    };
    const second = barEvents(p, { bar: 3, level: 0, layers: ['a'], stingers: [] });
    expect(second).toEqual([{ beat: 0, dur: 4, pitch: 50, vel: 0.35, track: 'a', voice: 'legno' }]);
    const { notes } = timeline(p, [calm, calm, calm]);
    expect(notes.map((n) => [n.beat, n.pitch])).toEqual([
      [0, 48],
      [4, 50],
      [8, 48],
    ]);
  });
});

describe('ducking under the sound effects', () => {
  const onBoard = { gain: 1, pan: 0, distance: 0 };
  const far = { gain: 0.3, pan: 0.4, distance: 400 };

  it('ducks under big sounds by how loud they land', () => {
    expect(duckFor('cannon', 0.8, onBoard)!.depth).toBeCloseTo(0.36);
    expect(duckFor('explosion', 1, far)!.depth).toBeCloseTo(0.15);
    expect(duckFor('detonation', 2, onBoard)).toEqual({ depth: 1, hold: 4 });
  });

  it('leaves the music alone for small, far, or steady sounds', () => {
    expect(duckFor('cannon', 0.3, far)).toBeNull(); // a light tank's shot across the field
    expect(duckFor('rotary', 1, onBoard)).toBeNull(); // the AP guns would make it pump
    expect(duckFor('pickup', 1, onBoard)).toBeNull();
  });

  it('cab warnings always duck it, and hold it down long enough to be heard', () => {
    for (const s of ['alarm', 'missileWarning', 'lockOn'] as const) {
      const d = duckFor(s, 1, onBoard)!;
      expect(d.depth).toBeGreaterThanOrEqual(0.45);
      expect(d.hold).toBeGreaterThanOrEqual(0.8);
    }
  });
});

describe('MIDI export', () => {
  it('writes variable-length quantities', () => {
    expect(vlq(0)).toEqual([0]);
    expect(vlq(127)).toEqual([127]);
    expect(vlq(128)).toEqual([0x81, 0]);
    expect(vlq(0x3fff)).toEqual([0xff, 0x7f]);
  });

  it('writes a type 1 file with a conductor track and one track per part', () => {
    const { notes } = timeline(ADVANCE, [at(0.9), at(0.9, ['siegeTank'])]);
    const bytes = writeMidi(notes, ADVANCE.tempo, ADVANCE.beatsPerBar);
    const tracks = new Set(notes.map((n) => n.track)).size;
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('MThd');
    expect([...bytes.subarray(8, 12)]).toEqual([0, 1, 0, tracks + 1]);
    const read = readMidi(bytes);
    expect(read.tracks).toBe(tracks + 1);
    expect(read.ons).toBe(notes.length);
    expect(read.unmatched).toBe(0);
  });

  it('writes an eighth-note meter as n/8, with the tempo in quarters', () => {
    const bytes = writeMidi([], MIRAGE.tempo, MIRAGE.beatsPerBar, MIRAGE.beatUnit);
    const at = (seq: number[]) => bytes.findIndex((_, i) => seq.every((b, j) => bytes[i + j] === b));
    const sig = at([0xff, 0x58, 4]);
    expect([...bytes.subarray(sig + 3, sig + 7)]).toEqual([9, 3, 12, 8]);
    const t = at([0xff, 0x51, 3]);
    const us = (bytes[t + 3]! << 16) | (bytes[t + 4]! << 8) | bytes[t + 5]!;
    expect(60e6 / us).toBeCloseTo(MIRAGE.tempo / 2, 1);
  });
});

/** Walks a MIDI file's tracks: counts note-ons and the ones left without a note-off. */
function readMidi(bytes: Uint8Array): { tracks: number; ons: number; unmatched: number } {
  let at = 14;
  let tracks = 0;
  let ons = 0;
  const open = new Map<number, number>();
  const vlqAt = () => {
    let v = 0;
    let b: number;
    do {
      b = bytes[at++]!;
      v = (v << 7) | (b & 0x7f);
    } while (b & 0x80);
    return v;
  };
  while (at < bytes.length) {
    expect(String.fromCharCode(...bytes.subarray(at, at + 4))).toBe('MTrk');
    const len = (bytes[at + 4]! << 24) | (bytes[at + 5]! << 16) | (bytes[at + 6]! << 8) | bytes[at + 7]!;
    const end = at + 8 + len;
    at += 8;
    tracks++;
    while (at < end) {
      vlqAt();
      const status = bytes[at++]!;
      if (status === 0xff) {
        at++;
        const len = vlqAt(); // read first: `at += vlqAt()` would add to the old `at`
        at += len;
      } else if ((status & 0xf0) === 0xc0) {
        at++;
      } else {
        const key = ((status & 0x0f) << 8) | bytes[at]!;
        if ((status & 0xf0) === 0x90) {
          ons++;
          open.set(key, (open.get(key) ?? 0) + 1);
        } else {
          expect(status & 0xf0).toBe(0x80);
          open.set(key, (open.get(key) ?? 0) - 1);
        }
        at += 2;
      }
    }
    expect(at).toBe(end);
  }
  return { tracks, ons, unmatched: [...open.values()].reduce((a, b) => a + Math.abs(b), 0) };
}
