import type { NoteEvent } from './director';
import type { VoiceId } from './score';

/**
 * Standard MIDI File export (type 1), so a score can be opened in GarageBand, MuseScore, or any
 * DAW. One track per layer or stinger part, with a General MIDI stand-in for each synth voice.
 */

const PPQ = 480;
/** Every channel but 10 (index 9), which General MIDI keeps for drums. */
const MELODIC = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];

/** GM program (0-based) or, for drums, the channel-10 key. */
const GM: Record<VoiceId, { program: number } | { drum: number }> = {
  legno: { program: 45 }, // pizzicato strings
  strings: { program: 48 }, // string ensemble
  tremolo: { program: 44 }, // tremolo strings
  basses: { program: 43 }, // contrabass
  brass: { program: 61 }, // brass section
  lowBrass: { program: 57 }, // trombone
  horn: { program: 60 }, // French horn
  timpani: { program: 47 },
  snare: { drum: 38 },
  tamtam: { drum: 52 }, // Chinese cymbal, the nearest GM has to a tam-tam
  cymbal: { drum: 49 }, // crash
  swell: { drum: 55 }, // splash, the nearest GM has to a suspended cymbal's roll
  bells: { program: 14 }, // tubular bells
  choir: { program: 52 }, // choir aahs
  anvil: { drum: 56 }, // cowbell, the nearest GM has to an anvil
  reed: { program: 68 }, // oboe
};

/** A variable-length quantity, as MIDI writes delta times. */
export function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  while ((n >>= 7) > 0) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const text = (s: string) => [...new TextEncoder().encode(s)];

function chunk(type: string, body: number[]): number[] {
  return [...text(type), ...u32(body.length), ...body];
}

function trackChunk(events: { tick: number; bytes: number[] }[]): number[] {
  events.sort((a, b) => a.tick - b.tick);
  const body: number[] = [];
  let last = 0;
  for (const e of events) {
    body.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  body.push(0, 0xff, 0x2f, 0); // end of track
  return chunk('MTrk', body);
}

/** `tempo` and `beat` positions are in the piece's beats, which are eighths when `beatUnit` is 8. */
export function writeMidi(notes: readonly NoteEvent[], tempo: number, beatsPerBar: number, beatUnit: 4 | 8 = 4): Uint8Array {
  const quarters = 4 / beatUnit;
  const conductor = trackChunk([
    { tick: 0, bytes: [0xff, 0x51, 3, ...u32(Math.round(60e6 / (tempo * quarters))).slice(1)] },
    // n/4 or n/8 time, a click every beat.
    { tick: 0, bytes: [0xff, 0x58, 4, beatsPerBar, Math.log2(beatUnit), 24 * quarters, 8] },
  ]);
  const tracks = new Map<string, NoteEvent[]>();
  for (const n of notes) tracks.set(n.track, [...(tracks.get(n.track) ?? []), n]);

  const chunks: number[][] = [conductor];
  let nextChannel = 0;
  for (const [name, list] of tracks) {
    const gm = GM[list[0]!.voice];
    const drum = 'drum' in gm;
    const ch = drum ? 9 : MELODIC[nextChannel++ % MELODIC.length]!;
    const events: { tick: number; bytes: number[] }[] = [{ tick: 0, bytes: [0xff, 0x03, ...vlq(name.length), ...text(name)] }];
    if (!drum) events.push({ tick: 0, bytes: [0xc0 | ch, gm.program] });
    for (const n of list) {
      const key = drum ? gm.drum : n.pitch;
      const on = Math.round(n.beat * quarters * PPQ);
      // Drum hits get a short fixed length; offs sort before ons at the same tick.
      const off = Math.max(on + 1, Math.round((n.beat * quarters + (drum ? 0.25 : n.dur * quarters)) * PPQ) - 1);
      // A note's level is its gain; velocity is closer to loudness, so take the square root.
      const vel = Math.max(1, Math.min(127, Math.round(Math.sqrt(n.vel) * 127)));
      events.push({ tick: on, bytes: [0x90 | ch, key, vel] }, { tick: off, bytes: [0x80 | ch, key, 0] });
    }
    chunks.push(trackChunk(events));
  }
  const header = chunk('MThd', [...u16(1), ...u16(chunks.length), ...u16(PPQ)]);
  return new Uint8Array([...header, ...chunks.flat()]);
}
