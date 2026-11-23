import type { NoteEvent } from './director';
import type { Duck } from './duck';
import type { VoiceId } from './score';

/**
 * The music's instruments and bus (SPEC §11.4 "Music"), on Web Audio. Synth-orchestral, after
 * Tomita's Moog *Planets*: no samples, every voice an analog-style patch (sawtooths through
 * resonant filters, slow vibrato, pitch scoops), all in a generated concert-hall reverb.
 *
 * Mixing levels: `MUSIC_LEVEL` for the whole bus, `CHANNEL` per voice, the layer gains in the score.
 */

/** The music bus's level, under the sound effects. */
export const MUSIC_LEVEL = 0.4;

/** Per voice: level, stereo position, and reverb send. */
const CHANNEL: Record<VoiceId, { level: number; pan: number; wet: number }> = {
  legno: { level: 0.6, pan: -0.15, wet: 0.25 },
  strings: { level: 0.3, pan: 0, wet: 0.6 },
  brass: { level: 0.38, pan: 0.15, wet: 0.4 },
  lowBrass: { level: 0.3, pan: 0.05, wet: 0.35 },
  timpani: { level: 0.6, pan: -0.1, wet: 0.45 },
  snare: { level: 0.3, pan: 0.1, wet: 0.3 },
  tamtam: { level: 0.6, pan: 0, wet: 0.7 },
  bells: { level: 0.35, pan: 0.25, wet: 0.7 },
  choir: { level: 0.18, pan: -0.1, wet: 0.7 },
  anvil: { level: 0.18, pan: 0.2, wet: 0.35 },
  reed: { level: 0.2, pan: -0.2, wet: 0.45 },
};
const HALL_SECONDS = 2.6;
/** Ducking: how fast the music dips under a big sound, and how slowly it comes back (time constants, s). */
const DUCK_ATTACK = 0.015;
const DUCK_RELEASE = 0.4;
/** The bus's high-pass: the octaves below it belong to the engine's rumble (§11.4). */
const LOW_CUT = 90;
const WET = 0.5;

type Voice = (ctx: BaseAudioContext, out: AudioNode, f: number, t: number, dur: number, vel: number) => void;

const noises = new WeakMap<BaseAudioContext, AudioBuffer>();
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const hz = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12);

function noise(ctx: BaseAudioContext): AudioBufferSourceNode {
  let buf = noises.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noises.set(ctx, buf);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

function osc(ctx: BaseAudioContext, type: OscillatorType, f: number, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = detune;
  return o;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

/** A gain that jumps to `peak` over `attack` and decays exponentially to silence by `t + decay`. */
function hit(ctx: BaseAudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0003, t + decay);
  return g;
}

/** Col legno ostinato: a sawtooth through a resonant low-pass snapping shut, plus a wooden click. */
const legno: Voice = (ctx, out, f, t, _dur, vel) => {
  const o = osc(ctx, 'sawtooth', f, rand(-4, 4));
  const lp = filter(ctx, 'lowpass', f, 9);
  lp.frequency.setValueAtTime(Math.min(f * (6 + 10 * vel), 8000), t);
  lp.frequency.exponentialRampToValueAtTime(f * 1.1, t + 0.11);
  o.connect(lp).connect(hit(ctx, t, vel, 0.002, 0.16)).connect(out);
  o.start(t);
  o.stop(t + 0.18);
  const n = noise(ctx);
  n.connect(filter(ctx, 'highpass', 2500)).connect(hit(ctx, t, vel * 0.25, 0.001, 0.02)).connect(out);
  n.start(t, rand(0, 1.5));
  n.stop(t + 0.03);
};

/** String ensemble: three detuned sawtooths spread across the stereo field, slow bow, vibrato. */
const strings: Voice = (ctx, out, f, t, dur, vel) => {
  const attack = Math.min(0.35, dur * 0.4);
  const end = t + dur;
  const stop = end + 1.2;
  const lp = filter(ctx, 'lowpass', Math.min(1300 + 1500 * vel, f * 10 + 500), 0.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.33, t + attack);
  g.gain.setTargetAtTime(0, end, 0.22);
  const lfo = osc(ctx, 'sine', rand(4.8, 5.6));
  const depth = ctx.createGain();
  depth.gain.value = 6;
  lfo.connect(depth);
  lfo.start(t);
  lfo.stop(stop);
  for (const [cents, pan] of [
    [-9, -0.5],
    [0, 0],
    [8, 0.5],
  ] as const) {
    const o = osc(ctx, 'sawtooth', f, cents + rand(-2, 2));
    depth.connect(o.detune);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(p).connect(lp);
    o.start(t);
    o.stop(stop);
  }
  lp.connect(g).connect(out);
};

/** Brass: two sawtooths that scoop up into pitch while the filter blares open and settles. */
function brassVoice(bright: number): Voice {
  return (ctx, out, f, t, dur, vel) => {
    const end = Math.max(t + dur, t + 0.08);
    const lp = filter(ctx, 'lowpass', f * 1.3, 1.2);
    lp.frequency.setValueAtTime(f * 1.3, t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(f * (5 + 5 * vel) * bright, 7000), t + 0.07);
    lp.frequency.setTargetAtTime(Math.min(f * (2.2 + 1.8 * vel) * bright, 5000), t + 0.07, 0.18);
    lp.frequency.setTargetAtTime(f * 1.2, end, 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.035);
    g.gain.setTargetAtTime(vel * 0.75, t + 0.035, 0.15);
    g.gain.setTargetAtTime(0, end, 0.09);
    for (const cents of [-6, 6]) {
      const d = cents + rand(-2, 2);
      const o = osc(ctx, 'sawtooth', f);
      o.detune.setValueAtTime(d - 35, t);
      o.detune.linearRampToValueAtTime(d, t + 0.06);
      o.connect(lp);
      o.start(t);
      o.stop(end + 0.6);
    }
    lp.connect(g).connect(out);
  };
}

/** Timpani: a few drum-head partials that settle in pitch as they ring, over a felt thump. */
const timpani: Voice = (ctx, out, f, t, _dur, vel) => {
  const partials = [
    [1, 1, 1.4],
    [1.5, 0.45, 0.8],
    [1.99, 0.25, 0.55],
    [2.44, 0.12, 0.4],
  ] as const;
  for (const [ratio, amp, decay] of partials) {
    const o = osc(ctx, 'sine', f * ratio);
    o.frequency.setValueAtTime(f * ratio * 1.02, t);
    o.frequency.exponentialRampToValueAtTime(f * ratio, t + 0.12);
    const len = decay * (0.6 + 0.5 * vel);
    o.connect(hit(ctx, t, amp * vel, 0.004, len)).connect(out);
    o.start(t);
    o.stop(t + len + 0.05);
  }
  const n = noise(ctx);
  n.connect(filter(ctx, 'bandpass', 140, 0.9)).connect(hit(ctx, t, vel * 0.5, 0.002, 0.06)).connect(out);
  n.start(t, rand(0, 1.5));
  n.stop(t + 0.08);
};

/** Snare: a band of noise for the wires and a short falling tone for the shell. */
const snare: Voice = (ctx, out, _f, t, _dur, vel) => {
  const n = noise(ctx);
  n.connect(filter(ctx, 'bandpass', 2400, 0.8)).connect(hit(ctx, t, vel * 0.8, 0.001, 0.16)).connect(out);
  n.start(t, rand(0, 1.5));
  n.stop(t + 0.18);
  const o = osc(ctx, 'triangle', 200);
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(150, t + 0.07);
  o.connect(hit(ctx, t, vel * 0.5, 0.001, 0.07)).connect(out);
  o.start(t);
  o.stop(t + 0.09);
};

/** Tam-tam: inharmonic partials whose upper ones bloom late, over a swelling band of noise. */
const tamtam: Voice = (ctx, out, _f, t, _dur, vel) => {
  const ratios = [1, 1.42, 1.93, 2.61, 3.17, 3.88, 4.52, 5.31, 6.7, 8.1];
  ratios.forEach((ratio, i) => {
    const o = osc(ctx, 'sine', 72 * ratio * rand(0.99, 1.01));
    const len = 4.5 - i * 0.25;
    o.connect(hit(ctx, t, (vel * 0.12) / Math.sqrt(i + 1), 0.02 + i * 0.04, len)).connect(out);
    o.start(t);
    o.stop(t + len + 0.05);
  });
  const n = noise(ctx);
  const bp = filter(ctx, 'bandpass', 500, 1.5);
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.exponentialRampToValueAtTime(2500, t + 1.2);
  n.connect(bp).connect(hit(ctx, t, vel * 0.2, 0.4, 3.5)).connect(out);
  n.start(t, rand(0, 1.5));
  n.stop(t + 3.6);
};

/** Bells (glass high up, a tolling bell low down): a sine frequency-modulated at an inharmonic ratio, its brightness dying first, over a hum an octave down. */
const bells: Voice = (ctx, out, f, t, _dur, vel) => {
  const len = Math.min(4.5, 1 + 900 / f);
  const car = osc(ctx, 'sine', f);
  const mod = osc(ctx, 'sine', f * 3.5);
  const index = ctx.createGain();
  index.gain.setValueAtTime(f * (0.8 + 1.6 * vel), t);
  index.gain.exponentialRampToValueAtTime(f * 0.05, t + len * 0.5);
  mod.connect(index).connect(car.frequency);
  car.connect(hit(ctx, t, vel * 0.5, 0.002, len)).connect(out);
  const hum = osc(ctx, 'sine', f / 2);
  hum.connect(hit(ctx, t, vel * 0.15, 0.01, len * 1.2)).connect(out);
  for (const o of [car, mod, hum]) {
    o.start(t);
    o.stop(t + len * 1.2 + 0.05);
  }
};

/** Vowel formants ("ah" leaning to "oh"): centre, level, Q. */
const FORMANTS = [
  [650, 1, 5],
  [1080, 0.5, 7],
  [2650, 0.2, 9],
] as const;

/** A wordless choir, as Tomita voiced one: detuned sawtooths through vowel formants, a slow swell, vibrato. */
const choir: Voice = (ctx, out, f, t, dur, vel) => {
  const attack = Math.min(0.45, dur * 0.4);
  const end = t + dur;
  const stop = end + 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + attack);
  g.gain.setTargetAtTime(0, end, 0.25);
  const lfo = osc(ctx, 'sine', rand(4.5, 5.2));
  const depth = ctx.createGain();
  depth.gain.value = 9;
  lfo.connect(depth);
  lfo.start(t);
  lfo.stop(stop);
  const sum = ctx.createGain();
  for (const cents of [-10, 0, 10]) {
    const o = osc(ctx, 'sawtooth', f, cents + rand(-3, 3));
    depth.connect(o.detune);
    o.connect(sum);
    o.start(t);
    o.stop(stop);
  }
  for (const [centre, level, q] of FORMANTS) {
    const amp = ctx.createGain();
    amp.gain.value = level * 3;
    sum.connect(filter(ctx, 'bandpass', centre, q)).connect(amp).connect(g);
  }
  g.connect(out);
};

/** An anvil or a drop forge: a struck bar's inharmonic modes, the high ones dying fast, over a clank of noise. */
const anvil: Voice = (ctx, out, f, t, _dur, vel) => {
  const modes = [
    [1, 1, 0.9],
    [2.76, 0.55, 0.5],
    [5.4, 0.35, 0.3],
    [8.93, 0.2, 0.18],
  ] as const;
  for (const [ratio, amp, decay] of modes) {
    const o = osc(ctx, 'sine', f * ratio * rand(0.995, 1.005));
    const len = decay * (0.6 + 0.6 * vel);
    o.connect(hit(ctx, t, amp * vel * 0.5, 0.001, len)).connect(out);
    o.start(t);
    o.stop(t + len + 0.05);
  }
  const n = noise(ctx);
  n.connect(filter(ctx, 'bandpass', 3500, 1.2)).connect(hit(ctx, t, vel * 0.4, 0.001, 0.04)).connect(out);
  n.start(t, rand(0, 1.5));
  n.stop(t + 0.06);
};

/** A double reed (a shawm, an oboe): a sawtooth through a nasal formant, scooping into pitch, its vibrato blooming late. */
const reed: Voice = (ctx, out, f, t, dur, vel) => {
  const end = Math.max(t + dur, t + 0.06);
  const o = osc(ctx, 'sawtooth', f);
  o.detune.setValueAtTime(-40, t);
  o.detune.linearRampToValueAtTime(0, t + 0.05);
  const lfo = osc(ctx, 'sine', rand(5.2, 6));
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(12, t + 0.5);
  lfo.connect(depth).connect(o.detune);
  const nasal = filter(ctx, 'peaking', 1400, 2.5);
  nasal.gain.value = 8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.03);
  g.gain.setTargetAtTime(vel * 0.85, t + 0.03, 0.1);
  g.gain.setTargetAtTime(0, end, 0.05);
  o.connect(filter(ctx, 'highpass', 350)).connect(nasal).connect(filter(ctx, 'lowpass', 3800)).connect(g).connect(out);
  for (const x of [o, lfo]) {
    x.start(t);
    x.stop(end + 0.4);
  }
};

const VOICES: Record<VoiceId, Voice> = {
  legno,
  strings,
  brass: brassVoice(1),
  lowBrass: brassVoice(0.65),
  timpani,
  snare,
  tamtam,
  bells,
  choir,
  anvil,
  reed,
};

const halls = new WeakMap<BaseAudioContext, AudioBuffer>();

/**
 * A concert hall: stereo noise decaying 60 dB over `HALL_SECONDS`, its highs dying first, after a
 * short pre-delay. Made once per audio context (every battle's music shares it).
 */
function hall(ctx: BaseAudioContext): AudioBuffer {
  const have = halls.get(ctx);
  if (have) return have;
  const sr = ctx.sampleRate;
  const len = Math.round(sr * HALL_SECONDS);
  const pre = Math.round(sr * 0.02);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      y += (0.9 - 0.8 * x) * (Math.random() * 2 - 1 - y);
      d[i] = y * Math.exp(-6.9 * x);
    }
  }
  halls.set(ctx, buf);
  return buf;
}

/**
 * The music bus: a channel per voice into a dry path and the hall, a low cut, a glue compressor,
 * the master level, then the duck (under the sound effects).
 */
export class MusicEngine {
  private readonly master: GainNode;
  private readonly ducker: GainNode;
  private readonly channels = {} as Record<VoiceId, GainNode>;
  private duckDepth = 0;
  private duckUntil = 0;
  private duckLocked = false;

  constructor(
    readonly ctx: BaseAudioContext,
    out: AudioNode,
  ) {
    this.master = ctx.createGain();
    this.master.gain.value = MUSIC_LEVEL;
    this.ducker = ctx.createGain();
    this.master.connect(this.ducker).connect(out);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 3;
    comp.attack.value = 0.008;
    comp.release.value = 0.3;
    comp.connect(this.master);
    // Two stages: 24 dB an octave.
    const lowCut = filter(ctx, 'highpass', LOW_CUT);
    lowCut.connect(filter(ctx, 'highpass', LOW_CUT)).connect(comp);
    const dry = ctx.createGain();
    dry.connect(lowCut);
    const reverb = ctx.createConvolver();
    reverb.buffer = hall(ctx);
    const wet = ctx.createGain();
    wet.gain.value = WET;
    reverb.connect(wet).connect(lowCut);
    for (const id of Object.keys(CHANNEL) as VoiceId[]) {
      const c = CHANNEL[id];
      const input = ctx.createGain();
      input.gain.value = c.level;
      const pan = ctx.createStereoPanner();
      pan.pan.value = c.pan;
      const send = ctx.createGain();
      send.gain.value = c.wet;
      input.connect(pan).connect(dry);
      pan.connect(send).connect(reverb);
      this.channels[id] = input;
    }
  }

  /** Schedules a bar's notes from its downbeat at `start` (context time). */
  playBar(notes: readonly NoteEvent[], start: number, beatSeconds: number): void {
    for (const n of notes) {
      VOICES[n.voice](this.ctx, this.channels[n.voice], hz(n.pitch), start + n.beat * beatSeconds, n.dur * beatSeconds, n.vel);
    }
  }

  /** Fades the whole bus to `level` (0–1 of `MUSIC_LEVEL`) over `seconds`. */
  fade(level: number, seconds: number): void {
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(level * MUSIC_LEVEL, now + seconds);
  }

  /**
   * Cuts the music to silence now and brings it back at `until` (the detonation's finale), with
   * ducking switched off from then on, so nothing dips the last chord.
   */
  silenceUntil(until: number): void {
    const now = this.ctx.currentTime;
    const m = this.master.gain;
    m.cancelScheduledValues(now);
    m.setValueAtTime(m.value, now);
    m.setTargetAtTime(0, now, 0.03);
    m.setValueAtTime(MUSIC_LEVEL, until);
    const d = this.ducker.gain;
    d.cancelScheduledValues(now);
    d.setValueAtTime(1, now);
    this.duckLocked = true;
  }

  /** Dips the music under a sound effect; a deeper or longer duck takes over a shallower one. */
  duck({ depth, hold }: Duck): void {
    if (this.duckLocked) return;
    const now = this.ctx.currentTime;
    const active = now < this.duckUntil;
    const d = active ? Math.max(depth, this.duckDepth) : depth;
    const until = Math.max(active ? this.duckUntil : 0, now + hold);
    if (active && d === this.duckDepth && until === this.duckUntil) return;
    const g = this.ducker.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(1 - d, now, DUCK_ATTACK);
    g.setTargetAtTime(1, until, DUCK_RELEASE);
    this.duckDepth = d;
    this.duckUntil = until;
  }

  destroy(): void {
    this.ducker.disconnect();
  }
}
