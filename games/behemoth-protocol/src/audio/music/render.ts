import { place, type EngineState, type ReactorState, type SoundId } from '../cues';
import { Synth } from '../synth';
import { timeline, type MusicInput } from './director';
import { duckFor } from './duck';
import { MusicEngine } from './engine';
import { writeMidi } from './midi';
import { barSeconds, type Piece } from './score';
import { PIECES } from './scores';

/**
 * Offline renders for listening outside the game (dev only; nothing in the game imports this).
 * `npm run render:music` loads it in headless Chrome and writes each piece's WAV and MIDI.
 */

const SAMPLE_RATE = 44100;
const TAIL_SECONDS = 4;

const bars = (n: number, heat: number, bosses: string[] = [], downed: string[] = []): MusicInput[] =>
  Array.from({ length: n }, (_, i) => ({ heat, bosses, downed: i === 0 ? downed : [] }));

/** The demo run: the music builds level by level, a siege tank arrives and is killed, the fight cools. */
export const DEMO: MusicInput[] = [
  ...bars(4, 0.05),
  ...bars(4, 0.2),
  ...bars(4, 0.4),
  ...bars(4, 0.8),
  ...bars(12, 0.8, ['siegeTank']),
  ...bars(4, 0.35, [], ['siegeTank']),
  ...bars(4, 0.05),
];

export interface Render {
  name: string;
  /** base64 */
  wav: string;
  /** base64 */
  mid?: string;
  /** One line per bar: its level, layers, and stingers. */
  log: string[];
}

async function render(name: string, piece: Piece, inputs: readonly MusicInput[]): Promise<Render> {
  const { plans, notes } = timeline(piece, inputs);
  const bar = barSeconds(piece);
  const beat = bar / piece.beatsPerBar;
  const ctx = new OfflineAudioContext(2, Math.ceil((plans.length * bar + TAIL_SECONDS) * SAMPLE_RATE), SAMPLE_RATE);
  const engine = new MusicEngine(ctx, ctx.destination);
  engine.playBar(notes, 0, beat);
  const audio = await ctx.startRendering();
  const log = plans.map(
    (p) => `${String(p.bar + 1).padStart(2)} L${p.level} ${p.layers.join(' ')}${p.stingers.map((s) => ` [${s.id}]`).join('')}`,
  );
  const data = [audio.getChannelData(0), audio.getChannelData(1)];
  return { name, wav: base64(wav(data, audio.sampleRate)), mid: base64(writeMidi(notes, piece.tempo, piece.beatsPerBar, piece.beatUnit)), log };
}

/** Every piece: the demo on its own, and (unless `demosOnly`: they're slow) under the scripted battle. */
export async function renderAll(demosOnly = false): Promise<Render[]> {
  const out: Render[] = [];
  for (const piece of new Set(Object.values(PIECES))) {
    out.push(await render(`${piece.id}-demo`, piece, DEMO));
    if (!demosOnly) out.push(await renderBattle(piece));
  }
  return out;
}

/** A sound effect at a time in the scripted battle; no position = on board the Behemoth. */
interface Sfx {
  t: number;
  sound: SoundId;
  size: number;
  x?: number;
  y?: number;
}

/** A small seeded generator, so every render of the battle is the same battle. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How often each kind of action happens (per second) over a stretch of the battle. */
interface Activity {
  enemyShots: number;
  autos: number;
  mainGun: number;
  blasts: number;
  kills: number;
  missiles: number;
}

/**
 * A battle's worth of real sound effects that follows `DEMO`'s story bar for bar: a quiet
 * approach, the fight building, a siege tank (its gun every 5 s, a critical alarm), its death,
 * and the fight dying down. Positions are sim units from the Behemoth (+x ahead).
 */
function battle(bar: number): Sfx[] {
  const rng = seeded(7);
  const r = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const out: Sfx[] = [];
  const at = (t: number, sound: SoundId, size: number, x?: number, y?: number) => out.push({ t, sound, size, x, y });
  const ahead = (near = 120, far = 320): [number, number] => [r(near, far), r(-150, 150)];
  const stretch = (from: number, to: number, a: Activity) => {
    const each = (rate: number, fn: (t: number) => void) => {
      for (let t = from + r(0, 1 / rate); rate > 0 && t < to; t += r(0.5, 1.5) / rate) fn(t);
    };
    each(a.enemyShots, (t) => {
      const [x, y] = ahead(160, 340);
      at(t, 'cannon', r(0.3, 0.55), x, y);
      if (rng() < 0.35) at(t + 0.3, 'hullHit', r(0.3, 0.5));
      else at(t + 0.3, 'impact', 0.3, r(30, 80), r(-60, 60));
    });
    each(a.autos, (t) => {
      if (rng() < 0.5) for (let i = 0; i < 6; i++) at(t + i * 0.08, 'rotary', 0.3);
      else for (let i = 0; i < 3; i++) at(t + i * 0.25, 'autocannon', 0.6);
    });
    each(a.mainGun, (t) => {
      at(t, 'cannon', 0.8);
      const [x, y] = ahead();
      at(t + 0.5, 'explosion', r(0.5, 0.7), x, y);
      if (rng() < 0.4) at(t + 0.6, 'vehicleKill', 0.7, x, y);
    });
    each(a.blasts, (t) => at(t, 'explosion', r(0.5, 1), ...ahead()));
    each(a.kills, (t) => at(t, 'vehicleKill', 0.7, ...ahead()));
    each(a.missiles, (t) => {
      for (let i = 0; i < 4; i++) at(t + i * 0.15, 'missile', 0.6);
      const [x, y] = ahead(200, 300);
      for (let i = 0; i < 4; i++) at(t + 1.2 + i * 0.15, 'explosion', 0.6, x + r(-20, 20), y + r(-20, 20));
    });
  };
  const b = (n: number) => n * bar;
  const quiet = { enemyShots: 0.15, autos: 0.1, mainGun: 0, blasts: 0, kills: 0, missiles: 0 };
  const hot = { enemyShots: 0.5, autos: 0.4, mainGun: 0.25, blasts: 0.2, kills: 0.1, missiles: 0.05 };
  stretch(0, b(4), quiet);
  stretch(b(4), b(8), { enemyShots: 0.3, autos: 0.25, mainGun: 0.1, blasts: 0.1, kills: 0, missiles: 0 });
  stretch(b(8), b(12), hot);
  stretch(b(12), b(16), { enemyShots: 0.7, autos: 0.5, mainGun: 0.25, blasts: 0.3, kills: 0.15, missiles: 0.08 });
  // The siege tank: sighted (the radio call), its big gun every 5 s, a component goes critical.
  stretch(b(16), b(28), hot);
  at(b(16) + 0.3, 'radio', 1);
  for (let t = b(16) + 2; t < b(28) - 1; t += 5) {
    at(t, 'cannon', 1, 220, 30);
    if (rng() < 0.6) at(t + 0.4, 'hullHit', 0.9);
    else at(t + 0.4, 'impact', 0.6, 50, 10);
  }
  at(b(22) + 0.4, 'alarm', 1);
  // It goes down.
  at(b(28), 'vehicleKill', 1, 180, 20);
  at(b(28) + 0.05, 'explosion', 1.2, 180, 20);
  stretch(b(28) + 1, b(32), { enemyShots: 0.3, autos: 0.3, mainGun: 0.1, blasts: 0.1, kills: 0, missiles: 0 });
  stretch(b(32), b(36), quiet);
  return out.sort((p, q) => p.t - q.t);
}

const DRIVE: EngineState = { speed: 0.6, load: 0.5, treadWear: 0.1, running: true };
const REACTOR: ReactorState = { charge: 0.8, damage: 0.1, meltdown: 0 };
const CRUISE_FRAC = 0.6;
/** How often the battle steps (frames, a multiple of the 128-frame render quantum: ~46 ms). */
const STEP = 128 * 16;

/** The window after a sound's start that's measured against the music under it (s). */
const ONSET = 0.15;

/**
 * The scripted battle through the game's own sound effects (`Synth`) with the demo's music
 * ducking under it, rendered as stems in one pass: the sound effects on channels 1–2, the music
 * on 3–4. The render pauses every step to fire that step's sounds and update the engine loop, as
 * the battle scene would each frame. Writes their sum, and reports how far each kind of sound
 * stands above the music in the moment it lands.
 */
async function renderBattle(piece: Piece): Promise<Render> {
  const { plans, notes } = timeline(piece, DEMO);
  const bar = barSeconds(piece);
  const ctx = new OfflineAudioContext(4, Math.ceil((plans.length * bar + TAIL_SECONDS) * SAMPLE_RATE), SAMPLE_RATE);
  const merge = ctx.createChannelMerger(4);
  merge.connect(ctx.destination);
  ctx.destination.channelCount = 4;
  ctx.destination.channelInterpretation = 'discrete';
  const stem = (first: number) => {
    const input = ctx.createGain();
    const split = ctx.createChannelSplitter(2);
    input.connect(split);
    split.connect(merge, 0, first);
    split.connect(merge, 1, first + 1);
    return input;
  };
  const synth = new Synth(ctx as unknown as AudioContext, stem(0));
  // A paused offline context reads as not running, and the synth frees voices on wall-clock
  // timers (far behind a render running faster than real time): lift both.
  Object.defineProperty(synth, 'running', { get: () => true });
  const voices = synth as unknown as { voices: number };
  synth.startMachine();
  const music = new MusicEngine(ctx, stem(2));
  music.playBar(notes, 0, bar / piece.beatsPerBar);
  const sfx = battle(bar);
  let next = 0;
  for (let frame = STEP; frame < ctx.length - STEP; frame += STEP) {
    const t = frame / SAMPLE_RATE;
    void ctx.suspend(t).then(() => {
      voices.voices = 0;
      synth.update(DRIVE, false, CRUISE_FRAC, REACTOR);
      for (; next < sfx.length && sfx[next]!.t < t + STEP / SAMPLE_RATE; next++) {
        const e = sfx[next]!;
        e.t = t; // when it actually played
        const placed = place({ x: 0, y: 0 }, e);
        synth.play(e.sound, e.size, placed);
        const duck = duckFor(e.sound, e.size, placed);
        if (duck) music.duck(duck);
      }
      void ctx.resume();
    });
  }
  const audio = await ctx.startRendering();
  const ch = [0, 1, 2, 3].map((c) => audio.getChannelData(c));
  const fx = [ch[0]!, ch[1]!];
  const mu = [ch[2]!, ch[3]!];
  const sum = [0, 1].map((c) => fx[c]!.map((v, i) => v + mu[c]![i]!));
  return { name: `${piece.id}-battle`, wav: base64(wav(sum, audio.sampleRate)), log: audibility(sfx, fx, mu, audio.sampleRate) };
}

/** RMS level in dB over a window, both channels together. */
function rmsDb(data: Float32Array[], from: number, to: number): number {
  let sum = 0;
  for (const d of data) for (let i = from; i < to; i++) sum += d[i]! * d[i]!;
  return 10 * Math.log10(sum / (data.length * (to - from)) + 1e-12);
}

/** For each kind of sound: how far above the (ducked) music it lands, over its first `ONSET`. */
function audibility(sfx: readonly Sfx[], fx: Float32Array[], mu: Float32Array[], sr: number): string[] {
  const by = new Map<string, number[]>();
  const under: string[] = [];
  for (const e of sfx) {
    const from = Math.round(e.t * sr);
    const to = Math.min(fx[0]!.length, from + Math.round(ONSET * sr));
    const key = e.x === undefined ? `${e.sound} (on board)` : e.sound;
    const margin = rmsDb(fx, from, to) - rmsDb(mu, from, to);
    by.set(key, [...(by.get(key) ?? []), margin]);
    if (margin < 0) under.push(`  ${e.t.toFixed(2).padStart(6)} s  ${key} ${margin.toFixed(1)} dB`);
  }
  const lines = [...by].map(([key, v]) => {
    v.sort((a, b) => a - b);
    const f = (n: number) => n.toFixed(1).padStart(6);
    return `${key.padEnd(22)} ${String(v.length).padStart(3)}  worst ${f(v[0]!)}  median ${f(v[Math.floor(v.length / 2)]!)} dB`;
  });
  return [
    `Sound effects over the music in each sound's first ${ONSET * 1000} ms (sound, count, worst, median):`,
    ...lines.sort(),
    `Under the music (${under.length} of ${sfx.length}):`,
    ...under,
  ];
}

/** 16-bit PCM WAV. */
function wav(data: Float32Array[], sampleRate: number): Uint8Array {
  const chans = data.length;
  const len = data[0]!.length;
  const out = new DataView(new ArrayBuffer(44 + len * chans * 2));
  const str = (at: number, s: string) => [...s].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  out.setUint32(4, 36 + len * chans * 2, true);
  str(8, 'WAVEfmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, chans, true);
  out.setUint32(24, sampleRate, true);
  out.setUint32(28, sampleRate * chans * 2, true);
  out.setUint16(32, chans * 2, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, len * chans * 2, true);
  for (let i = 0, at = 44; i < len; i++) {
    for (let c = 0; c < chans; c++, at += 2) out.setInt16(at, Math.max(-1, Math.min(1, data[c]![i]!)) * 0x7fff, true);
  }
  return new Uint8Array(out.buffer);
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
