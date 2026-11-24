import { STEREO } from '../content/tuning';
import { HEARING, levelFactor, pitchFactor, WHISTLE_SIGNALS, type EngineState, type HoldId, type Placement, type ReactorState, type SoundId, type TrainSound, type WhistleSignal } from './cues';

/**
 * Procedural battle sound (SPEC §11.4) on Web Audio. No sample files: every sound is built from
 * noise, oscillators, and filters the way a foley artist layers a real one — a sharp transient,
 * a filtered body, a sub-bass drop, a tail. Recipes take a `size` (caliber, blast radius, hit weight).
 *
 * Where a sound is decides how it's heard, from the cab:
 * - far off it's quieter, duller (distance muffling), panned by screen side, and more of it
 *   arrives as the land's reverb and as distinct echoes rolling back (`ECHOES`);
 * - close by, its big layers spread across both ears (`wide`), and a recipe can add what's only
 *   heard up close (`Voice.near`: a breech slamming, a case ringing on the deck);
 * - on board, it rings in the cab's steel box (`cabImpulse`).
 *
 * Mixing levels are all in `LEVEL`, `ENGINE`, and `REACTOR`: tune by ear there.
 */

const SR_GUARD = 0.45;
/** Share of glancing hits on front armor that sing off as a ricochet whine. */
const RICOCHET_WHINE = 0.3;
const MAX_VOICES = 48;

/** Overall level of each one-shot, before distance. */
const LEVEL: Record<SoundId, number> = {
  cannon: 0.9,
  howitzer: 0.9,
  autocannon: 0.7,
  rotary: 0.7,
  machineGun: 0.8,
  mortar: 0.5,
  missile: 0.6,
  rocket: 1,
  pulseLaser: 0.6,
  heavyLaser: 0.85,
  plasmaShot: 0.55,
  airburst: 0.45,
  explosion: 0.85,
  plasmaSplash: 0.6,
  splash: 0.6,
  impact: 0.6,
  pierce: 0.6,
  ricochet: 0.5,
  hullHit: 0.62,
  vehicleKill: 0.8,
  crush: 0.7,
  wood: 0.8,
  collapse: 0.7,
  ram: 0.56,
  clank: 0.45,
  droneLost: 0.4,
  revive: 0.6,
  componentBlown: 0.75,
  immobilized: 0.7,
  alarm: 0.22,
  missileWarning: 0.25,
  incoming: 0.3,
  horn: 0.26,
  radio: 0.25,
  lockOn: 0.22,
  pickup: 0.12,
  emp: 0.7,
  railgun: 0.8,
  arc: 0.6,
  thunder: 0.9,
  trainWhistle: 0.26,
  raidWhistle: 0.2,
  derail: 0.75,
  trainBrakes: 0.4,
  couplings: 0.5,
  steam: 0.3,
  detonation: 1,
};

/** Engine and tread loop levels. */
const ENGINE = { level: 0.065, rumble: 0.35, treads: 0.4, wade: 0.35 };
/**
 * An armored train's loops (SPEC §7.3), before distance: `wheels` the rolling stock (its `clatter`
 * over the rail joints, the `rumble` of its weight, the `sing` of the rails), `engine` the nearest
 * engine pulling (its exhaust `chuff` and the `throb` under it).
 */
const RAILS = { wheels: 0.28, clatter: 0.9, rumble: 0.5, sing: 0.06, engine: 0.16, chuff: 0.8, throb: 0.5 };
/**
 * The weather bed (SPEC §4.6): a storm's wind and rain or sand hiss, swelling with each squall; a
 * faint wind under the night. `base` is the level between squalls, `squall` what a full one adds.
 */
const WEATHER = { night: 0.018, base: 0.02, squall: 0.11, hiss: 0.05 };
/** Reactor hum bed, meltdown whine, and siren. */
const REACTOR = { level: 0.025, whine: 0.008, siren: 0.08 };
/**
 * The land answering a loud report: each echo's delay (s), side, low-pass (Hz: each comes back
 * duller), and level. A recipe sends into them with `Voice.echo`. The sides scale with `STEREO.pan`.
 */
const ECHOES = [
  [0.21, -0.6, 1400, 0.5],
  [0.34, 0.55, 1000, 0.36],
  [0.52, -0.25, 750, 0.26],
  [0.83, 0.7, 520, 0.16],
] as const;
/** Within this distance a sound's wide layers spread fully, and its close-up details are heard. */
const NEAR = 160;
/** How much of an on-board sound, and of one right alongside, rings in the cab. */
const CAB = { aboard: 0.35, alongside: 0.2, reach: 80, wet: 0.5 };

type Color = 'white' | 'pink' | 'brown' | 'crackle';

interface Bank {
  noise: Record<Color, AudioBuffer>;
  treads: AudioBuffer;
  rails: AudioBuffer;
  impulse: AudioBuffer;
  cab: AudioBuffer;
  drive: Float32Array<ArrayBuffer>;
}

const banks = new WeakMap<BaseAudioContext, Bank>();

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const vary = (v: number, pct = 0.06) => v * (1 + (Math.random() * 2 - 1) * pct);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Noise and impulse buffers, made once per audio context (a few tens of ms of math). */
function bank(ctx: BaseAudioContext): Bank {
  const have = banks.get(ctx);
  if (have) return have;
  const sr = ctx.sampleRate;
  const mono = (seconds: number, fill: (d: Float32Array) => void) => {
    const buf = ctx.createBuffer(1, Math.floor(sr * seconds), sr);
    fill(buf.getChannelData(0));
    return buf;
  };
  const white = mono(2, (d) => {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  });
  // Paul Kellet's pink filter: -3 dB/octave, the "body" of most real noises.
  const pink = mono(2, (d) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  });
  // Brown (red) noise: integrated white, -6 dB/octave. Rumble.
  const brown = mono(2, (d) => {
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
  });
  // Sparse random clicks of random weight: debris, splinters, fire, droplets, rubble.
  const crackle = mono(4, (d) => {
    for (let i = 0; i < d.length; i++) {
      if (Math.random() > 0.0016) continue;
      const amp = Math.random() ** 2.5 * (Math.random() < 0.5 ? -1 : 1);
      const len = Math.floor(sr * rand(0.0004, 0.004));
      for (let j = 0; j < len && i + j < d.length; j++) d[i + j]! += amp * Math.exp((-5 * j) / len) * (Math.random() * 2 - 1);
    }
  });
  const made: Bank = { noise: { white, pink, brown, crackle }, treads: treadBuffer(ctx), rails: railBuffer(ctx), impulse: outdoorImpulse(ctx), cab: cabImpulse(ctx), drive: driveCurve(2.4) };
  banks.set(ctx, made);
  return made;
}

/** Seconds of track clatter before it repeats: long enough that the ear doesn't catch the loop. */
const TREAD_SECONDS = 3;
const LINKS_A_SECOND = 11;

/**
 * Track links slapping over the drive sprockets at cruise speed, both pods: a clack (noise burst)
 * and a short metallic ring per link, no two alike. Written with wrap-around so it loops
 * seamlessly; its playback rate follows ground speed.
 */
function treadBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const size = sr * TREAD_SECONDS;
  const buf = ctx.createBuffer(2, size, sr);
  const links = LINKS_A_SECOND * TREAD_SECONDS;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let k = 0; k < links; k++) {
      const at = Math.floor(((k + rand(-0.12, 0.12) + ch * 0.5) / links) * size);
      const amp = rand(0.55, 1);
      const ring = rand(110, 240);
      const thunk = rand(80, 110);
      const len = Math.floor(sr * 0.09);
      let lp = 0;
      for (let j = 0; j < len; j++) {
        const t = j / sr;
        lp += 0.15 * (Math.random() * 2 - 1 - lp);
        const v = lp * Math.exp(-t * 160) * 1.4 + Math.sin(2 * Math.PI * ring * t) * Math.exp(-t * 70) * 0.25 + Math.sin(2 * Math.PI * thunk * t) * Math.exp(-t * 40) * 0.6;
        const idx = (at + j + size) % size;
        d[idx]! += v * amp;
      }
    }
  }
  return buf;
}

/** Seconds of wheels on rail joints before it repeats, and the cars passing a joint each second at the train's full pace. */
const RAIL_SECONDS = 4;
const CARS_A_SECOND = 2.5;

/**
 * A train's wheels over the rail joints at its full pace: for every car, the trailing bogie of one
 * and the leading bogie of the next cross close together, two axles each (the clickety-clack), then
 * a gap. Each axle is a clack, the rail ringing, and a thud of the weight on it. Written with
 * wrap-around so it loops seamlessly; its playback rate follows the train's speed.
 */
function railBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const size = sr * RAIL_SECONDS;
  const buf = ctx.createBuffer(2, size, sr);
  const cars = CARS_A_SECOND * RAIL_SECONDS;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let k = 0; k < cars; k++) {
      // Two bogies across the coupling, two axles each.
      for (const [bogie, axle] of [[0, 0], [0, 1], [1, 0], [1, 1]] as const) {
        const at = Math.floor(((k + rand(-0.02, 0.02)) / cars) * size + sr * (bogie * 0.13 + axle * 0.05 + ch * 0.004));
        const amp = rand(0.6, 1) * (axle ? 0.8 : 1);
        const ring = rand(380, 640);
        const thud = rand(62, 90);
        const len = Math.floor(sr * 0.12);
        let lp = 0;
        for (let j = 0; j < len; j++) {
          const t = j / sr;
          lp += 0.22 * (Math.random() * 2 - 1 - lp);
          const v = lp * Math.exp(-t * 130) * 1.5 + Math.sin(2 * Math.PI * ring * t) * Math.exp(-t * 55) * 0.2 + Math.sin(2 * Math.PI * thud * t) * Math.exp(-t * 32) * 0.7;
          d[(at + j + size) % size]! += v * amp;
        }
      }
    }
  }
  return buf;
}

/**
 * An open battlefield. No walls, so no hall: a scatter of slaps off the ground, tree lines, and
 * buildings in the first half second, each duller than the last, then a thin diffuse tail in
 * three bands, the low end rolling on longest (a far boom outlasts its crack) and the highs dying
 * in the air at once. Decorrelated per channel for width.
 */
function outdoorImpulse(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 2.6);
  const buf = ctx.createBuffer(2, len, sr);
  const kLow = 1 - Math.exp((-2 * Math.PI * 300) / sr);
  const kMid = 1 - Math.exp((-2 * Math.PI * 2500) / sr);
  const fall = (t: number, t60: number) => Math.exp((-6.9 * t) / t60);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const pre = Math.floor(sr * 0.012);
    let low = 0;
    let mid = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const x = Math.random() * 2 - 1;
      low += kLow * (x - low);
      mid += kMid * (x - mid);
      d[i] = 0.3 * Math.min(1, t / 0.08) * (low * 2 * fall(t, 2.4) + (mid - low) * fall(t, 1.5) + (x - mid) * 0.6 * fall(t, 0.5));
    }
    for (let r = 0; r < 9; r++) {
      const t = rand(0.02, 0.45);
      const at = pre + Math.floor(sr * t);
      const amp = rand(0.5, 1) * Math.exp(-t / 0.25) * (Math.random() < 0.5 ? -1 : 1);
      // A later slap has come further: smeared over more samples, so duller.
      const smear = 2 + Math.floor(t * 60);
      for (let j = 0; j < smear * 4; j++) d[at + j]! += (amp / smear) * Math.exp(-j / smear);
    }
  }
  return buf;
}

/**
 * Inside the Behemoth: a steel box. A quarter second of close, dense reflections, with a few of
 * the box's own resonances ringing in it, so what happens on board sounds like it's in here with you.
 */
function cabImpulse(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.26);
  const buf = ctx.createBuffer(2, len, sr);
  const kLow = 1 - Math.exp((-2 * Math.PI * 2600) / sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const pre = Math.floor(sr * 0.003);
    const modes = [210, 340, 520, 760].map((f) => ({ w: (2 * Math.PI * vary(f, 0.05)) / sr, phase: rand(0, 6.28) }));
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      lp += kLow * (Math.random() * 2 - 1 - lp);
      let ring = 0;
      for (const m of modes) ring += Math.sin(m.w * i + m.phase);
      d[i] = (lp + ring * 0.12) * Math.exp((-6.9 * t) / 0.22);
    }
  }
  return buf;
}

/** Soft clipping: makes blasts punch and puts audible harmonics on sub-bass for small speakers. */
function driveCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * k) / Math.tanh(k);
  }
  return c;
}

interface Shape {
  peak: number;
  attack?: number;
  /** Seconds to fall 60 dB. */
  decay: number;
  delay?: number;
  dest?: AudioNode;
  /** A buzz: the level chopped at `f` Hz (an arc, a discharge). `depth` 0–1. */
  am?: { f: number; depth: number };
  /** Turbulence: the level shaken at random, 0–1 (a rocket motor, a fire). */
  rough?: number;
}

interface Filter {
  type?: BiquadFilterType;
  f?: number;
  /** Frequency to glide to (exponentially) over `glide` seconds. */
  f1?: number;
  glide?: number;
  q?: number;
}

type NoiseOpts = Shape &
  Filter & {
    color?: Color;
    rate?: number;
    /** 0–1: how far this layer spreads across both ears when the sound is close (`Voice.near`). */
    wide?: number;
  };
type ToneOpts = Shape & { type?: OscillatorType; f: number; f1?: number; glide?: number; filter?: Filter };

/** Builds one sound's node graph, starting at `t`, into its channel. */
class Voice {
  end: number;
  readonly out: AudioNode;
  /** Reverb send for this voice; recipes may push it up. */
  readonly send: GainNode;
  private drive: WaveShaperNode | null = null;
  private side: GainNode | null = null;

  constructor(
    readonly ctx: AudioContext,
    private readonly bank: Bank,
    readonly t: number,
    private readonly ch: Channel,
    /** This play's random pitch shift: scales every frequency and noise rate in the voice. */
    readonly pitch = 1,
    /** 1 on board or right alongside, falling to 0 at `NEAR` and beyond. */
    readonly near = 1,
  ) {
    this.end = t;
    this.out = ch.input;
    this.send = ch.send;
  }

  /** A soft-clipping stage into `out`, shared by this voice's loud layers. */
  get driven(): AudioNode {
    if (!this.drive) {
      this.drive = this.ctx.createWaveShaper();
      this.drive.curve = this.bank.drive;
      this.drive.oversample = '2x';
      const trim = this.ctx.createGain();
      trim.gain.value = 0.8;
      this.drive.connect(trim).connect(this.out);
    }
    return this.drive;
  }

  /** How much of this sound comes back off the land as distinct echoes (`ECHOES`). */
  echo(amount: number): void {
    this.ch.echo.gain.value = amount;
    this.end = Math.max(this.end, this.t + ECHOES[ECHOES.length - 1]![0] + 0.5);
  }

  /**
   * Where a wide layer's second, unrelated copy goes: added to one ear and taken from the other,
   * so the two ears hear different noise (it spreads) and a mono speaker hears only the first.
   */
  private get spread(): AudioNode {
    if (!this.side) {
      this.side = this.ctx.createGain();
      const flip = this.ctx.createGain();
      flip.gain.value = -1;
      const ears = this.ctx.createChannelMerger(2);
      this.side.connect(ears, 0, 0);
      this.side.connect(flip).connect(ears, 0, 1);
      ears.connect(this.ch.wide);
    }
    return this.side;
  }

  private envelope(s: Shape): { gain: GainNode; t0: number; stop: number } {
    const t0 = this.t + (s.delay ?? 0);
    const attack = Math.max(0.0005, s.attack ?? 0.001);
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(s.peak, t0 + attack);
    g.gain.setTargetAtTime(0, t0 + attack, s.decay / 6.9);
    const stop = t0 + attack + s.decay * 1.05;
    this.end = Math.max(this.end, stop);
    let last: AudioNode = g;
    if (s.am || s.rough) {
      const shaken = this.ctx.createGain();
      g.connect(shaken);
      last = shaken;
      const by = this.ctx.createGain();
      by.connect(shaken.gain);
      if (s.am) {
        // Between 1 - depth and 1.
        shaken.gain.value = 1 - s.am.depth / 2;
        by.gain.value = s.am.depth / 2;
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = s.am.f * this.pitch;
        osc.connect(by);
        osc.start(t0);
        osc.stop(stop);
      } else {
        by.gain.value = s.rough!;
        const src = this.ctx.createBufferSource();
        src.buffer = this.bank.noise.brown;
        src.loop = true;
        // Slowed down: a shudder, not a hiss, but quick enough to shake a short sound more than once.
        src.playbackRate.value = 0.45;
        src.connect(by);
        src.start(t0, Math.random());
        src.stop(stop);
      }
    }
    last.connect(s.dest ?? this.out);
    return { gain: g, t0, stop };
  }

  filter(f: Filter, t0: number, dest: AudioNode): BiquadFilterNode {
    const nyq = this.ctx.sampleRate * SR_GUARD;
    const node = this.ctx.createBiquadFilter();
    node.type = f.type ?? 'lowpass';
    node.Q.value = f.q ?? (node.type === 'bandpass' ? 1 : 0.7);
    const start = clamp((f.f ?? 1000) * this.pitch, 20, nyq);
    node.frequency.setValueAtTime(start, t0);
    if (f.f1 !== undefined) node.frequency.exponentialRampToValueAtTime(clamp(f.f1 * this.pitch, 20, nyq), t0 + (f.glide ?? 0.2));
    node.connect(dest);
    return node;
  }

  noise(o: NoiseOpts): void {
    this.noiseInto(o, this.envelope(o));
    const width = (o.wide ?? 0) * this.near * STEREO.width;
    if (width > 0.05) this.noiseInto(o, this.envelope({ ...o, peak: o.peak * width * 0.8, dest: this.spread }));
  }

  private noiseInto(o: NoiseOpts, { gain, t0, stop }: { gain: GainNode; t0: number; stop: number }): void {
    const src = this.ctx.createBufferSource();
    const buf = this.bank.noise[o.color ?? 'white'];
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = (o.rate ?? vary(1, 0.03)) * this.pitch;
    src.connect(o.f !== undefined || o.type ? this.filter(o, t0, gain) : gain);
    src.start(t0, Math.random() * buf.duration);
    src.stop(stop);
  }

  tone(o: ToneOpts): void {
    const { gain, t0, stop } = this.envelope(o);
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f * this.pitch, t0);
    if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1 * this.pitch), t0 + (o.glide ?? 0.2));
    osc.connect(o.filter ? this.filter(o.filter, t0, gain) : gain);
    osc.start(t0);
    osc.stop(stop);
  }

  /**
   * Struck metal: decaying partials at inharmonic ratios (a plate or beam rings this way, not
   * like a string), each slightly detuned, higher ones dying faster.
   */
  modes(base: number, ratios: readonly number[], peak: number, decay: number, delay = 0): void {
    ratios.forEach((r, i) => {
      const f = vary(base * r, 0.015);
      if (f * this.pitch > this.ctx.sampleRate * SR_GUARD) return;
      this.tone({ f, peak: (peak * 0.9) / (1 + i * 0.6), attack: 0.0008, decay: decay / (1 + i * 0.45), delay });
    });
  }
}

const PLATE = [1, 2.08, 3.47, 5.11, 7.36, 9.9] as const;
const BAR = [1, 2.76, 5.4, 8.93] as const;

/** `signal`: what a whistle is to say (the whistles' recipes only). */
type Recipe = (v: Voice, size: number, signal?: WhistleSignal) => void;

/** A steam whistle: its pipes' notes (Hz) and levels, how bright it is (a low-pass, Hz), and how much steam is heard behind it. */
interface Whistle {
  pipes: readonly (readonly [number, number])[];
  cutoff: number;
  steam: number;
}

const WHISTLES = {
  /** The armored train's: three notes of a minor chord, deep. */
  train: { pipes: [[233, 0.3], [277, 0.24], [349, 0.2]], cutoff: 1500, steam: 0.1 },
  /** An attack train's: two pipes a minor third apart, an octave up. Shriller, with more steam in it. */
  raid: { pipes: [[494, 0.3], [587, 0.25]], cutoff: 2600, steam: 0.15 },
} as const satisfies Record<string, Whistle>;

/**
 * A whistle sounding a signal (`WHISTLE_SIGNALS`: its blasts' lengths): each blast swoops up into
 * tune and sags as the valve shuts, on a hiss of steam. Short blasts speak and stop quicker, and
 * come closer together.
 */
function whistle(v: Voice, w: Whistle, signal: WhistleSignal = 'run'): void {
  const lp = v.filter({ f: w.cutoff, q: 0.8 }, v.t, v.out);
  let at = 0;
  for (const dur of WHISTLE_SIGNALS[signal]) {
    const short = dur < 0.4;
    const swoop = Math.min(0.14, dur * 0.4);
    const shut = short ? 0.15 : 0.3;
    const t0 = v.t + at;
    for (const [f, level] of w.pipes) {
      for (const detune of [1, 1.005]) {
        const fr = f * detune * v.pitch;
        const osc = v.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(fr * 0.955, t0);
        osc.frequency.exponentialRampToValueAtTime(fr, t0 + swoop);
        osc.frequency.setValueAtTime(fr, t0 + Math.max(swoop, dur - 0.1));
        osc.frequency.exponentialRampToValueAtTime(fr * 0.97, t0 + dur + shut - 0.05);
        const g = v.ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(level, t0 + Math.min(0.07, swoop));
        g.gain.setValueAtTime(level, t0 + dur);
        g.gain.linearRampToValueAtTime(0, t0 + dur + shut);
        osc.connect(g).connect(lp);
        osc.start(t0);
        osc.stop(t0 + dur + shut + 0.05);
      }
    }
    // The steam behind it.
    v.noise({ type: 'bandpass', f: 2600, q: 0.7, peak: w.steam, attack: 0.05, decay: dur + shut, delay: at });
    at += dur + (short ? 0.2 : 0.45);
  }
  v.end = Math.max(v.end, v.t + at + 0.4);
  v.send.gain.value = 0.9;
  v.echo(0.6);
}

/** A blast: shock-front crack, fireball roar, concussion drop, rolling rumble, falling debris, and its echo off the land. */
function blast(v: Voice, size: number): void {
  const k = Math.min(size, 1.5);
  const big = Math.min(k, 1);
  v.noise({ type: 'highpass', f: 1000, peak: 0.8, attack: 0.0008, decay: 0.05 + 0.05 * k });
  // The body of it: what a small speaker can carry of a bang.
  v.noise({ color: 'pink', type: 'bandpass', f: vary(520 - 200 * big), q: 1.2, peak: 4.5, attack: 0.001, decay: 0.35 + 0.35 * k });
  v.noise({ color: 'pink', f: vary(3200 - 900 * big), f1: 170, glide: 0.3 + 0.4 * k, peak: 1.1, attack: 0.002, decay: 0.6 + 1.1 * k, dest: v.driven, wide: 0.7 });
  v.noise({ color: 'brown', f: 420, f1: 90, glide: 1, peak: 0.25 + 0.8 * k, attack: 0.01, decay: 1.2 + 2 * k, delay: 0.02, wide: 1 });
  v.tone({ f: vary(72 - 25 * big), f1: 22, glide: 0.4 + 0.4 * k, peak: 0.7 + 0.6 * k, attack: 0.003, decay: 0.6 + 1.2 * k, dest: v.driven });
  // A big one comes back off the ground a moment later.
  if (k > 0.6) v.tone({ f: vary(55), f1: 24, glide: 0.5, peak: 0.45 * k, attack: 0.01, decay: 0.9 * k, delay: 0.09, dest: v.driven });
  // What it threw: the bigger the blast, the later and longer it rains, the heavy pieces thudding.
  const rain = 0.06 + 0.12 * k;
  v.noise({ color: 'crackle', type: 'bandpass', f: vary(1400, 0.15), q: 0.7, peak: 0.6 + 0.6 * k, attack: 0.03, decay: 0.5 + 1.2 * k, delay: rain });
  if (k > 0.5) v.noise({ color: 'crackle', type: 'bandpass', f: vary(380, 0.15), q: 0.6, peak: 0.9 * k, attack: 0.05, decay: 0.6 + 0.9 * k, delay: rain + 0.15 });
  v.send.gain.value *= 1 + 0.6 * k;
  v.echo(0.4 * k);
}

/** Steel being struck: a contact tick, the ringing plate, and the thud of the mass behind it. */
function strike(v: Voice, base: number, size: number, ring: readonly number[] = PLATE): void {
  v.noise({ type: 'highpass', f: 3000, peak: 0.5, attack: 0.0004, decay: 0.015 });
  v.modes(base, ring, 0.3 + 0.2 * Math.min(size, 1), 0.9 + 0.6 * size);
  v.noise({ color: 'pink', f: 650, peak: 0.3 + 0.7 * Math.min(size, 1), attack: 0.001, decay: 0.12 + 0.12 * size, dest: v.driven });
  v.tone({ f: 95, f1: 40, glide: 0.12, peak: 0.2 + 0.5 * Math.min(size, 1), attack: 0.001, decay: 0.2 + 0.15 * size });
}

/** The Behemoth's own frame answering a blow: a low gong through the hull, longer the harder it's hit. */
function hullGong(v: Voice, size: number): void {
  const k = Math.min(size, 1.2);
  v.modes(vary(92 - 18 * Math.min(k, 1), 0.08), PLATE.slice(0, 3), 0.1 + 0.14 * k, 0.9 + 0.9 * k);
}

/** Cab warning tones through a small speaker. */
function beeps(v: Voice, freqs: readonly number[], on: number, every: number, type: OscillatorType = 'square'): void {
  freqs.forEach((f, i) => {
    v.tone({ type, f, peak: 0.5, attack: 0.004, decay: on * 1.6, delay: i * every, filter: { type: 'bandpass', f: 1800, q: 0.6 } });
  });
}

interface Gun {
  /** The muzzle crack's low edge (Hz): lower for a bigger bore. */
  crack: number;
  /** The barrel's own note (Hz): what makes it a gun and not a bang. */
  bark: number;
  /** Where the blast's roar starts its sweep down (Hz). */
  roar: number;
  /** The concussion's starting pitch (Hz). */
  sub: number;
  /** Seconds the report rolls on. */
  tail: number;
  /** How much comes back off the land, at full size. */
  echo: number;
}

/**
 * A gun's report: the supersonic muzzle crack, the barrel's bark, the blast's roar sweeping down,
 * a concussive sub drop, and the report rolling back off the land.
 */
function report(v: Voice, s: number, g: Gun): void {
  v.noise({ type: 'highpass', f: g.crack, peak: 0.9, attack: 0.0008, decay: 0.05 + 0.05 * s });
  // Clean, past the drive: the sub would crush it there, and it's what a small speaker has to go on.
  v.noise({ color: 'pink', type: 'bandpass', f: vary(g.bark), q: 1.6, peak: 5, attack: 0.001, decay: 0.3 + 0.3 * s });
  v.noise({ color: 'pink', f: vary(g.roar), f1: 220, glide: 0.25, peak: 1.1, attack: 0.002, decay: 0.45 + 0.9 * s, dest: v.driven, wide: 0.7 });
  v.tone({ f: vary(g.sub, 0.08), f1: g.sub * 0.32, glide: 0.25 + 0.2 * s, peak: 0.3 + 1.1 * s, attack: 0.003, decay: 0.45 + 0.8 * s, dest: v.driven });
  v.noise({ color: 'brown', f: 280, peak: 0.6 * s, attack: 0.02, decay: g.tail, delay: 0.03, wide: 1 });
  v.send.gain.value *= 1 + s;
  v.echo(g.echo * s);
}

/** Heard only on board, after a big gun fires: the breech slamming back and the spent case ringing on the deck. */
function breech(v: Voice, s: number): void {
  if (v.near < 0.6 || s < 0.7) return;
  v.modes(vary(120, 0.1), BAR, 0.1, 0.3, 0.11);
  v.noise({ color: 'pink', f: 450, peak: 0.25, attack: 0.002, decay: 0.07, delay: 0.11 });
  v.modes(vary(640, 0.1), BAR.slice(0, 2), 0.03, 0.22, rand(0.4, 0.55));
}

const RECIPES: Record<SoundId, Recipe> = {
  // A tank or turret gun: a high-velocity crack and a hard bark.
  cannon: (v, s) => {
    report(v, s, { crack: 1800, bark: 700 - 280 * s, roar: 4200 - 1800 * s, sub: 100 - 50 * s, tail: 1.2 + 1.6 * s, echo: 0.5 });
    breech(v, s);
  },
  // Heavy artillery: less crack, a deep hollow boom, and a long roll across the land after it.
  howitzer: (v, s) => {
    report(v, s, { crack: 1100, bark: 330, roar: 2400, sub: 58, tail: 3.2, echo: 0.8 });
    v.noise({ color: 'brown', f: 160, f1: 60, glide: 1.5, peak: 0.7 * s, attack: 0.05, decay: 3, delay: 0.08, wide: 1 });
    breech(v, s);
  },
  autocannon: (v, s) => {
    v.noise({ type: 'highpass', f: 2200, peak: 0.7, attack: 0.0006, decay: 0.025 });
    v.noise({ color: 'pink', type: 'bandpass', f: vary(950 - 250 * s), q: 2, peak: 3.5, attack: 0.001, decay: 0.16 + 0.12 * s });
    v.noise({ color: 'pink', f: 3200, f1: 500, glide: 0.08, peak: 0.85, attack: 0.001, decay: 0.16 + 0.16 * s, dest: v.driven });
    v.tone({ f: vary(150 - 40 * s), f1: 55, glide: 0.08, peak: 0.7, attack: 0.002, decay: 0.15 + 0.12 * s });
    v.noise({ color: 'brown', f: 300, peak: 0.25 + 0.2 * s, decay: 0.5 + 0.4 * s, delay: 0.01 });
    // On board: the action cycling.
    if (v.near > 0.6) v.modes(vary(520, 0.08), BAR, 0.05, 0.12, 0.07);
    v.echo(0.25 * s);
  },
  // Rapid fire from spinning barrels: each round is a short bark with the barrels' ring in it, so
  // a stream of them makes the brrrt.
  rotary: (v, s) => {
    v.noise({ type: 'bandpass', f: vary(2500, 0.12), q: 0.7, peak: 0.45, attack: 0.0005, decay: 0.018 });
    v.noise({ color: 'pink', type: 'bandpass', f: 1100, q: 3, peak: 2.2, attack: 0.0008, decay: 0.035 });
    v.noise({ color: 'pink', f: 1800, peak: 0.5, attack: 0.001, decay: 0.06 + 0.04 * s });
    v.tone({ f: vary(170), f1: 80, glide: 0.04, peak: 0.25 + 0.3 * s, attack: 0.001, decay: 0.05 });
    v.echo(0.12);
  },
  // A machine gun (the anti-personnel and point-defense mounts): lighter and drier, a hard rap
  // per round, and on board a link or a case tinkling after it.
  machineGun: (v, s) => {
    v.noise({ type: 'highpass', f: 2800, peak: 0.4, attack: 0.0004, decay: 0.014 });
    v.noise({ color: 'pink', type: 'bandpass', f: vary(1300, 0.08), q: 1.6, peak: 1.5, attack: 0.0008, decay: 0.045 + 0.03 * s });
    v.tone({ f: vary(210), f1: 110, glide: 0.03, peak: 0.4, attack: 0.001, decay: 0.045 });
    if (v.near > 0.6) v.noise({ type: 'highpass', f: 5500, peak: 0.07, attack: 0.0005, decay: 0.012, delay: rand(0.03, 0.05) });
    v.echo(0.1);
  },
  // Tube artillery: the hollow "thoonk" of a round leaving a resonant pipe.
  mortar: (v) => {
    v.tone({ f: vary(240), f1: 150, glide: 0.12, peak: 0.6, attack: 0.002, decay: 0.25 });
    v.noise({ color: 'pink', type: 'bandpass', f: 380, q: 3, peak: 1.4, attack: 0.001, decay: 0.2, dest: v.driven });
    v.tone({ f: 80, f1: 40, glide: 0.2, peak: 0.9, attack: 0.002, decay: 0.35 });
    v.noise({ type: 'highpass', f: 3000, peak: 0.2, attack: 0.001, decay: 0.03 });
    v.echo(0.2);
  },
  // Ignition pop, then the motor's roar (it tears and shudders, as burning propellant does) and
  // hiss sweeping up as it leaves. A heavy missile shakes the ground under it.
  missile: (v, s) => {
    const dur = 0.7 + 0.5 * s;
    v.noise({ color: 'pink', f: 2500, peak: 0.7, attack: 0.001, decay: 0.07 });
    v.noise({ type: 'bandpass', f: vary(350), f1: vary(2600), glide: dur * 0.7, q: 1.2, peak: 0.55, attack: 0.04, decay: dur, rough: 0.6 });
    v.noise({ color: 'brown', f: 700, peak: 0.7, attack: 0.02, decay: dur * 1.2, rough: 0.7, wide: 0.5 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 1800, q: 0.8, peak: 0.6, attack: 0.02, decay: dur });
    if (s > 0.9) {
      v.tone({ f: 60, f1: 38, glide: dur, peak: 0.15, attack: 0.05, decay: dur * 1.3, dest: v.driven, rough: 0.5 });
      v.noise({ color: 'brown', f: 220, peak: 0.28, attack: 0.05, decay: dur * 1.6, wide: 1, rough: 0.6 });
    }
  },
  rocket: (v) => {
    v.noise({ color: 'pink', f: 2200, peak: 0.6, attack: 0.001, decay: 0.06 });
    v.noise({ type: 'bandpass', f: vary(600), f1: vary(2400), glide: 0.25, q: 1.4, peak: 0.5, attack: 0.02, decay: 0.4, rough: 0.6 });
    v.noise({ color: 'brown', f: 520, peak: 0.4, attack: 0.01, decay: 0.35, rough: 0.6 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 2000, q: 0.8, peak: 0.4, attack: 0.01, decay: 0.35 });
  },
  // A capacitor bank dumping into the emitter: an electrical snap, the buzz of air ionizing
  // along the path, and the thump in the housing.
  pulseLaser: (v, s) => {
    v.noise({ type: 'highpass', f: 2500, peak: 0.7, attack: 0.0004, decay: 0.02 });
    v.noise({ type: 'bandpass', f: vary(5200, 0.1), q: 2.5, peak: 0.45, attack: 0.001, decay: 0.09 + 0.1 * s, am: { f: vary(120, 0.1), depth: 0.8 } });
    v.tone({ type: 'triangle', f: vary(2400, 0.1), f1: 900, glide: 0.1, peak: 0.1 + 0.1 * s, attack: 0.001, decay: 0.12 });
    v.noise({ color: 'pink', type: 'bandpass', f: 700, q: 1.5, peak: 0.2 + 0.3 * s, attack: 0.001, decay: 0.06 });
    v.tone({ f: 120, f1: 60, glide: 0.06, peak: 0.1 + 0.35 * s, attack: 0.002, decay: 0.1 });
  },
  // A beam that hot flashes the air along its path into plasma: thunder, close up.
  heavyLaser: (v) => {
    v.noise({ type: 'highpass', f: 1500, peak: 1, attack: 0.0005, decay: 0.05 });
    v.noise({ type: 'bandpass', f: 3200, f1: 700, glide: 0.2, q: 0.9, peak: 0.75, attack: 0.001, decay: 0.35, am: { f: vary(110, 0.1), depth: 0.6 } });
    v.noise({ color: 'pink', type: 'bandpass', f: 480, q: 1.4, peak: 2.5, attack: 0.001, decay: 0.4 });
    v.noise({ color: 'brown', f: 500, f1: 120, glide: 0.8, peak: 0.9, attack: 0.01, decay: 1.8, delay: 0.04, wide: 1 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 900, q: 0.6, peak: 0.8, attack: 0.02, decay: 1.2, delay: 0.05 });
    v.tone({ f: 70, f1: 28, glide: 0.5, peak: 0.9, attack: 0.003, decay: 0.8, dest: v.driven });
    v.tone({ f: 3600, f1: 700, glide: 0.35, peak: 0.08, attack: 0.001, decay: 0.35 });
    v.send.gain.value *= 2;
    v.echo(0.6);
  },
  // A gas charge igniting: a soft "whumpf" that opens up and flutters, with a hiss.
  plasmaShot: (v) => {
    v.noise({ color: 'pink', f: 300, f1: 1600, glide: 0.08, peak: 1, attack: 0.03, decay: 0.45, dest: v.driven, rough: 0.5 });
    v.noise({ type: 'highpass', f: 4500, peak: 0.25, attack: 0.01, decay: 0.35 });
    v.tone({ f: 75, f1: 45, glide: 0.3, peak: 0.6, attack: 0.02, decay: 0.35 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 2500, q: 0.8, peak: 0.4, attack: 0.02, decay: 0.4 });
  },
  airburst: (v) => {
    v.noise({ type: 'highpass', f: 1200, peak: 0.6, attack: 0.0005, decay: 0.04 });
    v.noise({ color: 'pink', f: 1500, peak: 0.5, attack: 0.001, decay: 0.2 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 3000, q: 0.8, peak: 0.3, attack: 0.005, decay: 0.25, delay: 0.02 });
    v.echo(0.15);
  },
  explosion: blast,
  plasmaSplash: (v, s) => {
    blast(v, s * 0.7);
    v.noise({ type: 'highpass', f: 5000, peak: 0.3, attack: 0.03, decay: 0.9 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 4000, q: 1, peak: 0.5, attack: 0.03, decay: 1 });
  },
  // A shell in the river: a muffled thump, the column of water going up, then raining down.
  splash: (v, s) => {
    v.noise({ color: 'pink', f: 1200, peak: 0.7, attack: 0.002, decay: 0.25 });
    v.tone({ f: 80, f1: 40, glide: 0.2, peak: 0.2 + 0.5 * s, attack: 0.002, decay: 0.3 });
    v.noise({ type: 'bandpass', f: 1500, f1: 600, glide: 0.4, q: 0.8, peak: 0.5, attack: 0.02, decay: 0.6 + 0.4 * s, delay: 0.02, rough: 0.4 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 3500, q: 1, peak: 0.7, attack: 0.05, decay: 0.9 + 0.5 * s, delay: 0.15 });
  },
  // A round into dirt or cover: a dull thud and a patter of thrown earth.
  impact: (v) => {
    v.noise({ color: 'pink', f: 900, peak: 0.6, attack: 0.001, decay: 0.1 });
    v.tone({ f: 110, f1: 50, glide: 0.08, peak: 0.4, attack: 0.001, decay: 0.1 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 2200, q: 0.8, peak: 0.3, attack: 0.01, decay: 0.25, delay: 0.02 });
  },
  // A round punching into thin armor on a vehicle's flank or rear: a gritty crunch of torn plate,
  // a dull, short clang, and the thump through the hull. Heavier from behind. Dark on purpose
  // (user feedback): no bright crack or high ring.
  pierce: (v, s) => {
    v.noise({ color: 'pink', type: 'bandpass', f: vary(1000, 0.15), q: 1.1, peak: 0.9, attack: 0.0005, decay: 0.035, dest: v.driven });
    v.noise({ color: 'crackle', type: 'bandpass', f: vary(1300, 0.15), q: 0.7, peak: 0.45 + 0.3 * s, attack: 0.002, decay: 0.12 + 0.12 * s, delay: 0.004, dest: v.driven });
    v.modes(vary(170, 0.12), PLATE, 0.2 + 0.15 * s, 0.22 + 0.25 * s);
    v.tone({ f: 105, f1: 42, glide: 0.1, peak: 0.35 + 0.35 * s, attack: 0.001, decay: 0.14 + 0.08 * s, dest: v.driven });
  },
  // A round glancing off a vehicle's thick front plate: a dull clank and a puff of grit, and now
  // and then (`RICOCHET_WHINE`) the round sings off: the one bright hit sound.
  ricochet: (v, s) => {
    v.noise({ color: 'pink', f: 1100, peak: 0.55 + 0.3 * s, attack: 0.0005, decay: 0.04, dest: v.driven });
    v.modes(vary(230, 0.15), PLATE, 0.15 + 0.1 * s, 0.18);
    v.tone({ f: 120, f1: 55, glide: 0.08, peak: 0.25 + 0.2 * s, attack: 0.001, decay: 0.09 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 1600, q: 0.8, peak: 0.25, attack: 0.003, decay: 0.12, delay: 0.01 });
    if (Math.random() < RICOCHET_WHINE) {
      const f = vary(2400, 0.25);
      v.tone({ f, f1: f * rand(0.35, 0.5), glide: rand(0.25, 0.45), peak: 0.1, attack: 0.008, decay: rand(0.3, 0.5), delay: 0.012 });
    }
  },
  // The Behemoth's armor taking a round: lower and longer the harder the hit, the frame ringing
  // under it; big ones throw spall and shake the fittings loose.
  hullHit: (v, s) => {
    strike(v, vary(270 - 100 * Math.min(s, 1), 0.15), s);
    hullGong(v, s);
    if (s > 0.5) {
      v.noise({ color: 'crackle', type: 'bandpass', f: 2500, q: 0.8, peak: 0.5, attack: 0.002, decay: 0.4, delay: 0.01 });
      v.noise({ color: 'crackle', type: 'bandpass', f: 800, q: 0.7, peak: 0.35, attack: 0.01, decay: 0.5, delay: 0.03 });
    }
  },
  // A vehicle brewing up: the blast, its hull ringing, ammunition cooking off, and plate coming down.
  vehicleKill: (v, s) => {
    blast(v, s * 0.9);
    v.modes(vary(180, 0.15), BAR, 0.15, 0.6, 0.05);
    const pops = Math.round(1 + 3 * Math.min(s, 1) * Math.random());
    for (let i = 0; i < pops; i++) {
      const delay = rand(0.25, 1.4);
      v.noise({ color: 'pink', f: 2000, peak: 0.35, attack: 0.001, decay: 0.12, delay });
      v.noise({ type: 'highpass', f: 2000, peak: 0.25, attack: 0.0005, decay: 0.02, delay });
      v.tone({ f: vary(140, 0.1), f1: 70, glide: 0.05, peak: 0.25, attack: 0.001, decay: 0.08, delay });
    }
    for (let i = 0; i < 2; i++) v.modes(vary(210, 0.3), BAR, 0.07, 0.3, rand(0.5, 1.3));
  },
  // Steel buckling under the treads: a groan of folding plate, and it gives in stages, crunch by crunch.
  crush: (v, s) => {
    v.tone({ type: 'sawtooth', f: vary(70), f1: 36, glide: 0.45, peak: 0.4, attack: 0.01, decay: 0.55, filter: { f: 420, f1: 170, glide: 0.45, q: 8 } });
    v.noise({ color: 'crackle', type: 'bandpass', f: 1100, q: 0.6, peak: 1, attack: 0.005, decay: 0.45 });
    v.noise({ color: 'pink', f: 500, peak: 0.6 + 0.3 * s, attack: 0.002, decay: 0.2, dest: v.driven });
    let at = rand(0.06, 0.12);
    for (let i = 0; i < 2; i++) {
      v.noise({ color: 'pink', type: 'bandpass', f: vary(750, 0.3), q: 1, peak: 0.45 + 0.25 * s, attack: 0.002, decay: 0.12, delay: at, dest: v.driven });
      at += rand(0.07, 0.16);
    }
    v.modes(vary(320, 0.15), BAR, 0.15, 0.4);
    v.modes(vary(240, 0.2), BAR, 0.08, 0.3, at);
  },
  // A tree going down: the trunk creaks and snaps, splintering, the canopy thrashing, the thud.
  wood: (v, s) => {
    v.tone({ type: 'sawtooth', f: vary(260, 0.2), f1: 150, glide: 0.18, peak: 0.12 * s, attack: 0.02, decay: 0.2, filter: { type: 'bandpass', f: 700, q: 6 } });
    const snaps = 2 + Math.floor(Math.random() * 3);
    let at = 0;
    for (let i = 0; i < snaps; i++) {
      v.noise({ type: 'bandpass', f: vary(1800, 0.25), q: 2, peak: 0.6, attack: 0.0005, decay: 0.03, delay: at });
      at += rand(0.03, 0.08);
    }
    v.noise({ color: 'crackle', type: 'bandpass', f: 2400, q: 1.2, peak: 0.9 * s, attack: 0.005, decay: 0.35 + 0.2 * s });
    v.noise({ color: 'pink', type: 'highpass', f: 2500, peak: 0.2 * s, attack: 0.05, decay: 0.6, delay: 0.05 });
    v.noise({ color: 'pink', f: 300, peak: 0.6 * s, attack: 0.005, decay: 0.25, delay: 0.12 });
  },
  // A building coming down: a crack, a long rumble of masonry, the big pieces landing one after
  // another, rubble, a tinkle of glass.
  collapse: (v, s) => {
    v.noise({ type: 'highpass', f: 1500, peak: 0.5, attack: 0.001, decay: 0.04 });
    v.noise({ color: 'brown', f: 350, peak: 1, attack: 0.03, decay: 1.6 + 0.6 * s, dest: v.driven, wide: 0.8 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 900, q: 0.6, peak: 1.2, attack: 0.05, decay: 1.6, delay: 0.05 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 4500, q: 1, peak: 0.25 * s, attack: 0.02, decay: 0.8, delay: 0.03 });
    v.tone({ f: 55, f1: 30, glide: 0.8, peak: 0.6, attack: 0.02, decay: 1.2 });
    const thuds = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < thuds; i++) {
      const delay = rand(0.2, 1.3);
      v.tone({ f: vary(75, 0.2), f1: 38, glide: 0.1, peak: 0.3 * s, attack: 0.002, decay: 0.2, delay });
      v.noise({ color: 'pink', f: 350, peak: 0.3 * s, attack: 0.002, decay: 0.12, delay });
    }
    v.echo(0.2 * s);
  },
  // The prow striking something solid, and the whole frame taking it.
  ram: (v, s) => {
    v.noise({ color: 'pink', f: 700, peak: 0.9, attack: 0.001, decay: 0.18 + 0.2 * s, dest: v.driven });
    v.tone({ f: 75, f1: 35, glide: 0.2, peak: 0.2 + 0.8 * s, attack: 0.001, decay: 0.3 });
    v.modes(vary(140, 0.15), PLATE, 0.25 * s, 0.5 + 0.4 * s);
    hullGong(v, s);
    v.noise({ color: 'crackle', type: 'bandpass', f: 1200, q: 0.7, peak: 0.7 * s, attack: 0.005, decay: 0.4 });
  },
  // Machinery on board: an autoloader slamming home, a hitch letting go (with a hydraulic hiss).
  clank: (v, s) => {
    strike(v, vary(420, 0.1), 0.3, BAR);
    if (s >= 1) {
      v.noise({ type: 'highpass', f: 3500, peak: 0.25, attack: 0.02, decay: 0.6, delay: 0.08 });
      v.modes(vary(300, 0.1), BAR, 0.3, 0.6, 0.3);
    }
  },
  droneLost: (v) => {
    blast(v, 0.2);
    v.noise({ type: 'bandpass', f: 6000, q: 3, peak: 0.3, attack: 0.002, decay: 0.3 });
  },
  // The drive re-engaging: a clank through the hull and the motors spooling up.
  revive: (v) => {
    strike(v, 160, 1, BAR);
    v.tone({ type: 'sawtooth', f: 40, f1: 95, glide: 0.9, peak: 0.35, attack: 0.2, decay: 1.4, filter: { f: 600 } });
  },
  // A component blowing inside the hull: a muffled blast, the hull ringing, arcing wiring.
  componentBlown: (v) => {
    blast(v, 0.55);
    strike(v, vary(150, 0.1), 1);
    hullGong(v, 1);
    v.noise({ color: 'crackle', type: 'bandpass', f: 5000, q: 1, peak: 0.5, attack: 0.01, decay: 0.7, delay: 0.05, am: { f: vary(100, 0.1), depth: 0.7 } });
  },
  // Track links parting and the drivetrain winding down to nothing.
  immobilized: (v) => {
    v.modes(vary(200, 0.1), BAR, 0.35, 1.2);
    v.noise({ color: 'crackle', type: 'bandpass', f: 1500, q: 0.7, peak: 0.9, attack: 0.01, decay: 1 });
    v.tone({ type: 'sawtooth', f: 60, f1: 22, glide: 1.4, peak: 0.45, attack: 0.01, decay: 1.6, filter: { f: 320 } });
  },
  // Component critical: a two-tone cab alarm; the reactor's is higher and faster.
  alarm: (v, s) => {
    const hi = s >= 1 ? 1180 : 880;
    const lo = hi * 0.75;
    beeps(v, s >= 1 ? [hi, lo, hi, lo, hi, lo] : [hi, lo, hi, lo], s >= 1 ? 0.09 : 0.13, s >= 1 ? 0.11 : 0.15);
  },
  // Missile launch detected: rapid high beeps.
  missileWarning: (v) => beeps(v, [1500, 1500, 1500, 1500], 0.045, 0.085, 'sine'),
  // Incoming artillery: falling whistles (two shells, a little apart) that swell as they come down
  // over the zone and cut off as the first one lands (`size` = seconds of flight).
  incoming: (v, s) => {
    const dur = Math.max(0.6, s);
    const start = Math.max(0, dur - 1.6);
    const fall = dur - start;
    v.tone({ type: 'sine', f: vary(1900, 0.05), f1: vary(700, 0.05), glide: fall, peak: 0.5, attack: fall - 0.05, decay: 0.05, delay: start });
    v.tone({ type: 'sine', f: vary(2050, 0.05), f1: vary(780, 0.05), glide: fall, peak: 0.3, attack: fall - 0.05, decay: 0.05, delay: start });
    v.noise({ type: 'bandpass', f: 2600, f1: 900, glide: fall, q: 4, peak: 0.25, attack: fall - 0.05, decay: 0.05, delay: start });
  },
  // An armored train's whistle, and an attack train's (`WHISTLES`), sounding a signal.
  trainWhistle: (v, _s, signal) => whistle(v, WHISTLES.train, signal),
  raidWhistle: (v, _s, signal) => whistle(v, WHISTLES.raid, signal),
  // A vehicle leaving the rails: steel shrieking on steel, the crash of it going over, ballast flying.
  derail: (v, s) => {
    const k = Math.min(s, 1.2);
    v.tone({ type: 'sawtooth', f: vary(1900, 0.15), f1: vary(900, 0.15), glide: 0.5, peak: 0.16 * k, attack: 0.02, decay: 0.6, rough: 0.5, filter: { type: 'bandpass', f: 2200, f1: 1100, glide: 0.5, q: 9 } });
    v.noise({ type: 'bandpass', f: vary(3200, 0.1), f1: 1500, glide: 0.5, q: 7, peak: 0.5 * k, attack: 0.01, decay: 0.55, rough: 0.6 });
    v.noise({ color: 'pink', f: 600, peak: 1.1 * k, attack: 0.002, decay: 0.35, delay: 0.08, dest: v.driven, wide: 0.6 });
    v.tone({ f: vary(68), f1: 30, glide: 0.3, peak: 0.8 * k, attack: 0.002, decay: 0.5, delay: 0.08, dest: v.driven });
    v.modes(vary(150, 0.2), PLATE, 0.25 * k, 0.9, 0.08);
    v.modes(vary(230, 0.2), BAR, 0.12 * k, 0.6, rand(0.2, 0.4));
    v.noise({ color: 'crackle', type: 'bandpass', f: 1300, q: 0.6, peak: 0.9 * k, attack: 0.03, decay: 0.9, delay: 0.1 });
    v.echo(0.25 * k);
  },
  // A train braked to a stand: the long squeal of its shoes, the couplings running in down its
  // length, and the steam let go at the end.
  trainBrakes: (v) => {
    v.noise({ type: 'bandpass', f: vary(2700, 0.08), f1: 1900, glide: 2.2, q: 14, peak: 0.6, attack: 0.3, decay: 2.2, rough: 0.35 });
    v.tone({ type: 'sawtooth', f: vary(1350, 0.08), f1: 950, glide: 2.2, peak: 0.07, attack: 0.3, decay: 2.2, filter: { type: 'bandpass', f: 1400, q: 6 } });
    let at = 0.5;
    for (let i = 0; i < 6; i++) {
      v.modes(vary(190, 0.25), BAR, 0.16, 0.35, at);
      v.tone({ f: vary(80, 0.2), f1: 45, glide: 0.08, peak: 0.25, attack: 0.002, decay: 0.15, delay: at });
      at += rand(0.14, 0.3);
    }
    v.noise({ type: 'highpass', f: 3000, peak: 0.3, attack: 0.15, decay: 1.8, delay: 1.6 });
    v.send.gain.value *= 1.5;
  },
  // The slack running through a train's couplings, car after car: buffers clanging in as it's
  // checked, each a little further down the train (`size`: how much of the train).
  couplings: (v, s) => {
    const cars = Math.round(3 + 8 * Math.min(s, 1));
    let at = 0;
    for (let i = 0; i < cars; i++) {
      const k = 1 - (0.6 * i) / cars;
      v.modes(vary(190, 0.25), BAR, 0.2 * k, 0.35, at);
      v.noise({ color: 'pink', type: 'bandpass', f: vary(950, 0.2), q: 1, peak: 0.4 * k, attack: 0.001, decay: 0.05, delay: at, dest: v.driven });
      v.tone({ f: vary(80, 0.2), f1: 45, glide: 0.08, peak: 0.3 * k, attack: 0.002, decay: 0.15, delay: at });
      at += rand(0.09, 0.2);
    }
  },
  // An engine's boiler letting go: steam roaring out of the wreck and dying away as the pressure
  // falls, and its whistle, the valve torn open, sagging to nothing with it.
  steam: (v, s) => {
    const k = Math.min(s, 1);
    const dur = 1.2 + 2.4 * k;
    v.noise({ type: 'highpass', f: 2200, peak: 0.8 * k, attack: 0.03, decay: dur, rough: 0.3, wide: 0.6 });
    v.noise({ color: 'pink', type: 'bandpass', f: 1500, f1: 600, glide: dur, q: 0.8, peak: 0.9 * k, attack: 0.04, decay: dur * 1.2, rough: 0.5 });
    if (s < 1) return;
    for (const f of [233, 277]) {
      v.tone({ type: 'sawtooth', f, f1: f * 0.55, glide: 2.4, peak: 0.12, attack: 0.06, decay: 2.6, delay: 0.15, rough: 0.3, filter: { f: 1300, f1: 500, glide: 2.4 } });
    }
  },
  // The enemy's attack siren, far across the field: a slow wail up and back down.
  horn: (v) => {
    for (const d of [1, 1.006]) {
      const detune = d * v.pitch;
      const t = v.t;
      const osc = v.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120 * detune, t);
      osc.frequency.exponentialRampToValueAtTime(430 * detune, t + 1.3);
      osc.frequency.setValueAtTime(430 * detune, t + 2.1);
      osc.frequency.exponentialRampToValueAtTime(180 * detune, t + 3.4);
      const lp = v.filter({ f: 1100, q: 1.5 }, t, v.out);
      const g = v.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.6);
      g.gain.setValueAtTime(0.35, t + 2.3);
      g.gain.linearRampToValueAtTime(0, t + 3.4);
      osc.connect(g).connect(lp);
      osc.start(t);
      osc.stop(t + 3.5);
    }
    v.end = Math.max(v.end, v.t + 3.5);
    v.send.gain.value = 0.9;
    v.echo(0.5);
  },
  // A designator on the hull (heavy weapons team): the cab's lock warning, a rising three-note
  // trill, lower and slower than the missile-launch beeps.
  lockOn: (v) => beeps(v, [880, 1040, 1240, 880, 1040, 1240], 0.06, 0.1, 'triangle'),
  // Salvage landing on the hull: a small bright tink.
  pickup: (v, s) => {
    v.tone({ type: 'triangle', f: vary(2300, 0.04), f1: 1900, glide: 0.06, peak: 0.4 + 0.3 * s, attack: 0.002, decay: 0.09 });
    v.tone({ type: 'sine', f: vary(3450, 0.04), peak: 0.18, attack: 0.002, decay: 0.05 });
  },
  // A call over the radio: the squelch opening, a two-note chirp over the carrier's hiss, the squelch closing.
  radio: (v) => {
    v.noise({ type: 'bandpass', f: 2000, q: 2, peak: 0.4, attack: 0.002, decay: 0.08 });
    v.noise({ type: 'bandpass', f: 2600, q: 1, peak: 0.07, attack: 0.02, decay: 0.9 });
    v.tone({ f: 1250, peak: 0.5, attack: 0.005, decay: 0.12, delay: 0.06, filter: { type: 'bandpass', f: 1800, q: 1 } });
    v.tone({ f: 1650, peak: 0.5, attack: 0.005, decay: 0.2, delay: 0.17, filter: { type: 'bandpass', f: 1800, q: 1 } });
    v.noise({ type: 'bandpass', f: 2000, q: 2, peak: 0.3, attack: 0.002, decay: 0.1, delay: 0.38 });
  },
  // The emitter dumping its charge at once: a falling electric whine, a deep thump through the
  // ground, and the air buzzing and crackling as the pulse rolls out.
  emp: (v) => {
    v.tone({ type: 'sawtooth', f: 70, f1: 28, glide: 0.4, peak: 0.8, attack: 0.002, decay: 0.7, dest: v.driven });
    v.noise({ type: 'bandpass', f: 4200, f1: 300, glide: 0.5, q: 2, peak: 0.85, attack: 0.001, decay: 0.6, am: { f: vary(90, 0.1), depth: 0.7 } });
    v.tone({ type: 'square', f: 1800, f1: 120, glide: 0.35, peak: 0.12, attack: 0.001, decay: 0.4 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 3000, q: 0.7, peak: 0.7, attack: 0.02, decay: 0.9, delay: 0.05 });
    v.noise({ color: 'brown', f: 300, f1: 90, glide: 0.6, peak: 0.5, attack: 0.02, decay: 1, delay: 0.03, wide: 1 });
    v.send.gain.value *= 1.5;
    v.echo(0.3);
  },
  // Capacitors dumping into the rails: an electric crack, the slug's supersonic snap, and a
  // falling whine as the rails ring down.
  railgun: (v, s) => {
    v.noise({ type: 'highpass', f: 3000, peak: 1, attack: 0.0003, decay: 0.03 });
    v.tone({ type: 'sawtooth', f: vary(5200, 0.06), f1: 600, glide: 0.25 + 0.2 * s, peak: 0.12 + 0.1 * s, attack: 0.001, decay: 0.3 + 0.3 * s });
    v.noise({ color: 'pink', type: 'bandpass', f: vary(900, 0.08), q: 2, peak: 2.4 + 1.2 * s, attack: 0.001, decay: 0.18 + 0.12 * s });
    v.noise({ color: 'pink', f: 2600, f1: 400, glide: 0.2, peak: 0.6 + 0.4 * s, attack: 0.001, decay: 0.25 + 0.3 * s, dest: v.driven, wide: 0.5 });
    v.tone({ f: 90, f1: 35, glide: 0.25, peak: 0.2 + 0.6 * s, attack: 0.002, decay: 0.35 + 0.3 * s });
    v.send.gain.value *= 1 + s;
    v.echo(0.5 * s);
  },
  // An arc: a ripping crackle, the snap of the strike, the buzz of it holding, and a short roll after.
  arc: (v, s) => {
    v.noise({ color: 'crackle', type: 'bandpass', f: vary(3200, 0.15), q: 0.6, peak: 1, attack: 0.001, decay: 0.12 + 0.15 * s });
    v.noise({ type: 'highpass', f: 2500, peak: 0.8, attack: 0.0005, decay: 0.04 });
    v.noise({ type: 'highpass', f: 1500, peak: 0.45, attack: 0.002, decay: 0.1 + 0.25 * s, am: { f: vary(105, 0.1), depth: 1 } });
    v.tone({ type: 'square', f: vary(900, 0.2), f1: 300, glide: 0.08, peak: 0.08, attack: 0.001, decay: 0.1 });
    v.noise({ color: 'brown', f: 400, f1: 120, glide: 0.6, peak: 0.6 * s, attack: 0.02, decay: 0.4 + 0.8 * s, delay: 0.04 });
  },
  // Thunder after a lightning strike: a sharp tearing crack overhead, then a long low roll that
  // swells and grumbles away.
  thunder: (v, s) => {
    v.noise({ type: 'highpass', f: 1800, peak: 0.7 * s, attack: 0.001, decay: 0.08 });
    v.noise({ color: 'pink', f: 2400, f1: 300, glide: 0.5, peak: 0.8 * s, attack: 0.004, decay: 0.6, dest: v.driven, delay: 0.03 });
    v.noise({ color: 'brown', f: 320, f1: 70, glide: 2.5, peak: 1.1 * s, attack: 0.25, decay: 2.6, delay: 0.12, wide: 1, rough: 0.4 });
    v.noise({ color: 'brown', f: 180, f1: 50, glide: 2, peak: 0.7 * s, attack: 0.4, decay: 2.2, delay: vary(0.9, 0.3), wide: 1, rough: 0.4 });
    v.tone({ f: 48, f1: 28, glide: 2, peak: 0.5 * s, attack: 0.3, decay: 2.4, delay: 0.15 });
    v.send.gain.value *= 1.8;
    v.echo(0.5);
  },
  // The reactor going: the biggest sound in the game. The flash's crack, the fireball, a second
  // shock as the magazines follow, and the land answering for seconds after.
  detonation: (v) => {
    v.noise({ type: 'highpass', f: 600, peak: 1, attack: 0.001, decay: 0.15 });
    v.noise({ color: 'pink', type: 'bandpass', f: 420, q: 1.2, peak: 6, attack: 0.001, decay: 1 });
    v.noise({ color: 'pink', f: 4000, f1: 100, glide: 2.5, peak: 1.4, attack: 0.004, decay: 4, dest: v.driven, wide: 0.8 });
    v.noise({ color: 'brown', f: 260, f1: 60, glide: 4, peak: 1.3, attack: 0.05, decay: 7, delay: 0.05, wide: 1 });
    v.tone({ f: 55, f1: 16, glide: 3, peak: 1.5, attack: 0.005, decay: 4.5, dest: v.driven });
    v.tone({ f: 38, f1: 20, glide: 4, peak: 0.8, attack: 0.2, decay: 6 });
    v.noise({ type: 'highpass', f: 500, peak: 0.5, attack: 0.001, decay: 0.2, delay: 0.38 });
    v.tone({ f: 48, f1: 18, glide: 2, peak: 0.9, attack: 0.01, decay: 3, delay: 0.38, dest: v.driven });
    v.noise({ color: 'crackle', type: 'bandpass', f: 1100, q: 0.5, peak: 1.2, attack: 0.1, decay: 4, delay: 0.3 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 350, q: 0.6, peak: 1, attack: 0.2, decay: 3.5, delay: 0.6 });
    v.noise({ type: 'bandpass', f: 500, f1: 150, glide: 1.5, q: 0.7, peak: 0.6, attack: 0.05, decay: 2, delay: 0.02 });
    v.send.gain.value = 0.8;
    v.echo(0.7);
  },
};

/** Distance muffling: air soaks up the highs, so far-off sounds go dull. */
function distanceCutoff(d: number): number {
  return clamp(16000 * Math.exp(-d / 260), 600, 16000);
}

/** More of a far sound arrives as reverb than direct. */
function reverbSend(d: number, onBoard: boolean): number {
  return onBoard ? 0.06 : 0.12 + 0.45 * clamp(d / 500, 0, 1);
}

/** How much of a sound rings in the cab: everything on board, some of what's right alongside. */
function cabSend(d: number): number {
  return d === 0 ? CAB.aboard : CAB.alongside * clamp(1 - d / CAB.reach, 0, 1);
}

interface Channel {
  input: GainNode;
  lp: BiquadFilterNode;
  pan: StereoPannerNode;
  /** Into the outdoor reverb. */
  send: GainNode;
  /** Into the land's echoes; shut until a recipe opens it. */
  echo: GainNode;
  /** Past the pan, for layers spread across both ears. */
  wide: GainNode;
}

/**
 * A placed channel into the bus: gain → distance low-pass → pan, with sends to the outdoor
 * reverb, the echoes, and the cab, and a second way in that skips the pan (`wide`).
 */
function channel(s: Synth, level: number, at: Placement): Channel {
  const ctx = s.ctx;
  const input = ctx.createGain();
  input.gain.value = level;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = distanceCutoff(at.distance);
  const pan = ctx.createStereoPanner();
  pan.pan.value = at.pan;
  const send = ctx.createGain();
  send.gain.value = reverbSend(at.distance, at.distance === 0);
  const echo = ctx.createGain();
  echo.gain.value = 0;
  const cab = ctx.createGain();
  cab.gain.value = cabSend(at.distance);
  const wide = ctx.createGain();
  wide.gain.value = level;
  input.connect(lp).connect(pan).connect(s.bus);
  pan.connect(send).connect(s.reverbIn);
  pan.connect(echo).connect(s.echoIn);
  lp.connect(cab).connect(s.cabIn);
  wide.connect(s.bus);
  return { input, lp, pan, send, echo, wide };
}

/** Lets a finished channel go. */
function release(ch: Channel): void {
  for (const n of [ch.input, ch.lp, ch.pan, ch.send, ch.echo, ch.wide]) n.disconnect();
}

/** A looping source of a bank buffer. */
function loopSource(ctx: AudioContext, buf: AudioBuffer): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start(ctx.currentTime, Math.random() * buf.duration);
  return src;
}

/** Sounds that run while their events keep coming (a beam held on, armor grinding rock). */
class Hold {
  private last = -Infinity;
  private readonly ch: Channel;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private on = false;

  constructor(private readonly s: Synth, id: HoldId) {
    const ctx = s.ctx;
    this.ch = channel(s, 0, { gain: 1, pan: 0, distance: 0 });
    const b = s.bank;
    const add = <T extends AudioScheduledSourceNode>(n: T) => (this.sources.push(n), n);
    const filt = (type: BiquadFilterType, f: number, q: number) => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = f;
      n.Q.value = q;
      return n;
    };
    const gain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const lfo = (rate: number, depth: number, target: AudioParam) => {
      const o = add(ctx.createOscillator());
      o.frequency.value = rate;
      o.connect(gain(depth)).connect(target);
      o.start();
    };
    if (id === 'beam') {
      // A held laser: the air along it ionizing in step with the power train, so the sizzle
      // rasps at the supply's own rate (an arc welder's sound) over the train's buzz.
      const hum = add(ctx.createOscillator());
      hum.type = 'sawtooth';
      hum.frequency.value = 100;
      hum.connect(filt('lowpass', 500, 2)).connect(gain(0.35)).connect(this.ch.input);
      const sizzle = gain(0.55);
      add(loopSource(ctx, b.noise.white)).connect(filt('bandpass', 2600, 1.5)).connect(sizzle).connect(this.ch.input);
      hum.connect(gain(0.45)).connect(sizzle.gain);
      hum.start();
      // The beam wanders a hair: the rasp never quite steady.
      lfo(0.7, 4, hum.frequency);
      lfo(31, 0.1, sizzle.gain);
    } else if (id === 'scrape') {
      // Steel grinding along rock: resonant noise whose pitch wanders, over a low grind.
      const band = filt('bandpass', 1300, 5);
      add(loopSource(ctx, b.noise.white)).connect(band).connect(gain(1.4)).connect(this.ch.input);
      lfo(3.1, 280, band.frequency);
      lfo(7.3, 160, band.frequency);
      add(loopSource(ctx, b.noise.pink)).connect(filt('lowpass', 500, 0.7)).connect(gain(0.8)).connect(this.ch.input);
      add(loopSource(ctx, b.noise.crackle)).connect(filt('bandpass', 2400, 0.8)).connect(gain(0.8)).connect(this.ch.input);
    } else if (id === 'flame') {
      // A flamethrower: the roar of burning fuel (low noise that flutters), the jet's hiss, a crackle.
      const roar = filt('lowpass', 700, 0.8);
      add(loopSource(ctx, b.noise.pink)).connect(roar).connect(gain(1.6)).connect(this.ch.input);
      lfo(9, 180, roar.frequency);
      lfo(13.7, 110, roar.frequency);
      add(loopSource(ctx, b.noise.white)).connect(filt('bandpass', 1800, 1.2)).connect(gain(0.3)).connect(this.ch.input);
      add(loopSource(ctx, b.noise.crackle)).connect(filt('bandpass', 2200, 0.8)).connect(gain(0.6)).connect(this.ch.input);
    } else {
      // Plasma eating into the treads: a hiss and a fierce crackle.
      add(loopSource(ctx, b.noise.white)).connect(filt('highpass', 3200, 0.7)).connect(gain(0.35)).connect(this.ch.input);
      add(loopSource(ctx, b.noise.crackle)).connect(filt('bandpass', 2500, 0.7)).connect(gain(1.2)).connect(this.ch.input);
    }
  }

  trigger(level: number, at: Placement): void {
    const t = this.s.ctx.currentTime;
    this.last = t;
    this.ch.input.gain.setTargetAtTime(level * at.gain, t, 0.015);
    this.ch.pan.pan.setTargetAtTime(at.pan, t, 0.03);
    this.ch.lp.frequency.setTargetAtTime(distanceCutoff(at.distance), t, 0.03);
    this.on = true;
  }

  /** Fades out once its events stop coming. */
  update(hold: number): void {
    const t = this.s.ctx.currentTime;
    if (this.on && t - this.last > hold) {
      this.ch.input.gain.setTargetAtTime(0, t, 0.04);
      this.on = false;
    }
  }

  stop(): void {
    for (const n of this.sources) n.stop();
    release(this.ch);
  }
}

const HOLD_LEVEL: Record<HoldId, { level: number; hold: number }> = {
  beam: { level: 0.2, hold: 0.16 },
  scrape: { level: 0.35, hold: 0.12 },
  burn: { level: 0.25, hold: 0.2 },
  flame: { level: 0.3, hold: 0.16 },
};

/**
 * The Behemoth's drive: a huge, slow engine (detuned saws, soft clipped, then darkened by a
 * load-following low-pass so it growls rather than buzzes, drifting a little), ground rumble, a dull clank of
 * track links at ground speed, and churned water when fording.
 */
class EngineLoop {
  private readonly out: GainNode;
  private readonly oscs: OscillatorNode[] = [];
  private readonly lp: BiquadFilterNode;
  private readonly lp2: BiquadFilterNode;
  private readonly body: GainNode;
  private readonly rumble: GainNode;
  private readonly treads: AudioBufferSourceNode;
  private readonly treadGain: GainNode;
  private readonly wade: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];

  constructor(private readonly s: Synth) {
    const ctx = s.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = ENGINE.level;
    const send = ctx.createGain();
    send.gain.value = 0.08;
    this.out.connect(s.bus);
    this.out.connect(send).connect(s.reverbIn);

    // Saturate first, then filter: the clipping's harmonics are rounded off by two gentle,
    // unresonant low-pass stages, leaving a dark growl with no buzz or whine on top.
    const shaper = ctx.createWaveShaper();
    shaper.curve = s.bank.drive;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.5;
    this.lp.frequency.value = 200;
    this.lp2 = ctx.createBiquadFilter();
    this.lp2.type = 'lowpass';
    this.lp2.Q.value = 0.5;
    this.lp2.frequency.value = 200;
    this.body = ctx.createGain();
    this.body.gain.value = 0.5;
    shaper.connect(this.lp).connect(this.lp2).connect(this.body).connect(this.out);
    for (const [type, ratio, level] of [['sawtooth', 1, 0.5], ['sawtooth', 1.013, 0.4], ['square', 0.5, 0.35]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 30 * ratio;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(shaper);
      o.start();
      this.oscs.push(o);
      this.sources.push(o);
    }
    // No engine holds a note: two slow, unrelated drifts of a few cents keep it from droning.
    for (const [rate, cents] of [
      [0.23, 14],
      [0.37, 9],
    ] as const) {
      const drift = ctx.createOscillator();
      drift.frequency.value = rate;
      const depth = ctx.createGain();
      depth.gain.value = cents;
      drift.connect(depth);
      for (const o of this.oscs) depth.connect(o.detune);
      drift.start();
      this.sources.push(drift);
    }

    this.rumble = ctx.createGain();
    const rlp = ctx.createBiquadFilter();
    rlp.frequency.value = 170;
    const rumble = loopSource(ctx, s.bank.noise.brown);
    rumble.connect(rlp).connect(this.rumble).connect(this.out);
    this.sources.push(rumble);

    this.treadGain = ctx.createGain();
    this.treadGain.gain.value = 0;
    this.treads = loopSource(ctx, s.bank.treads);
    const tlp = ctx.createBiquadFilter();
    tlp.frequency.value = 1300;
    this.treads.connect(tlp).connect(this.treadGain).connect(this.out);
    this.sources.push(this.treads);

    this.wade = ctx.createGain();
    this.wade.gain.value = 0;
    const wbp = ctx.createBiquadFilter();
    wbp.type = 'bandpass';
    wbp.frequency.value = 650;
    wbp.Q.value = 0.6;
    const water = loopSource(ctx, s.bank.noise.pink);
    water.connect(wbp).connect(this.wade).connect(this.out);
    this.sources.push(water);
  }

  update(e: EngineState, wet: boolean, cruiseFrac: number): void {
    const t = this.s.ctx.currentTime;
    const speed = Math.min(1, e.speed);
    const load = e.running ? e.load : 0.15;
    // Firing frequency: the pitch climbs with ground speed and jumps with throttle.
    const f = 18 + 14 * speed + 8 * load;
    this.oscs.forEach((o, i) => o.frequency.setTargetAtTime(f * [1, 1.013, 0.5][i]!, t, 0.25));
    const cutoff = 110 + 200 * load + 110 * speed;
    this.lp.frequency.setTargetAtTime(cutoff, t, 0.2);
    this.lp2.frequency.setTargetAtTime(cutoff * 1.4, t, 0.2);
    this.body.gain.setTargetAtTime(0.35 + 0.35 * load, t, 0.2);
    this.rumble.gain.setTargetAtTime(ENGINE.rumble * (0.3 + speed), t, 0.3);
    // The clatter buffer is cut for cruise speed. Worn treads judder: the rate stumbles.
    const judder = e.treadWear > 0.3 && Math.random() < e.treadWear * 0.15 ? rand(-0.25, 0.1) * e.treadWear : 0;
    const rate = Math.max(0.02, speed / cruiseFrac + judder);
    this.treads.playbackRate.setTargetAtTime(rate, t, judder ? 0.02 : 0.15);
    this.treadGain.gain.setTargetAtTime(ENGINE.treads * Math.min(1, speed * 3), t, 0.15);
    this.wade.gain.setTargetAtTime(wet ? ENGINE.wade * Math.min(1, speed * 2.5) : 0, t, 0.2);
  }

  stop(): void {
    const t = this.s.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.05);
    for (const n of this.sources) n.stop(t + 0.4);
  }
}

/**
 * An armored train (SPEC §7.3), in two placed channels. Its wheels: the clatter over the rail
 * joints at the train's speed, the rumble of its weight, the rails singing. Its engine: the beat
 * of its exhaust, quicker and harder the faster it pulls, over a low throb.
 */
class TrainLoop {
  private readonly wheels: Channel;
  private readonly engine: Channel;
  private readonly clatter: AudioBufferSourceNode;
  private readonly clatterGain: GainNode;
  private readonly rumble: GainNode;
  private readonly sing: GainNode;
  private readonly beat: OscillatorNode;
  private readonly sources: AudioScheduledSourceNode[] = [];

  constructor(private readonly s: Synth) {
    const ctx = s.ctx;
    // Out on the field, never in the cab.
    const far: Placement = { gain: 1, pan: 0, distance: 200 };
    this.wheels = channel(s, 0, far);
    this.engine = channel(s, 0, far);
    const add = <T extends AudioScheduledSourceNode>(n: T) => (this.sources.push(n), n);
    const filt = (type: BiquadFilterType, f: number, q: number) => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = f;
      n.Q.value = q;
      return n;
    };
    const gain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };

    this.clatter = add(loopSource(ctx, s.bank.rails));
    this.clatterGain = gain(0);
    this.clatter.connect(filt('lowpass', 2600, 0.5)).connect(this.clatterGain).connect(this.wheels.input);
    this.rumble = gain(0);
    add(loopSource(ctx, s.bank.noise.brown)).connect(filt('lowpass', 150, 0.6)).connect(this.rumble).connect(this.wheels.input);
    this.sing = gain(0);
    add(loopSource(ctx, s.bank.noise.pink)).connect(filt('bandpass', 2100, 5)).connect(this.sing).connect(this.wheels.input);

    // Each beat of the exhaust starts hard and dies away: a falling ramp on the level.
    this.beat = add(ctx.createOscillator());
    this.beat.type = 'sawtooth';
    this.beat.frequency.value = 3;
    this.beat.start();
    const chuff = gain(RAILS.chuff / 2);
    this.beat.connect(gain(-RAILS.chuff / 2)).connect(chuff.gain);
    add(loopSource(ctx, s.bank.noise.pink)).connect(filt('bandpass', 620, 0.8)).connect(chuff).connect(this.engine.input);
    const throb = gain(RAILS.throb * 0.6);
    this.beat.connect(gain(-RAILS.throb * 0.4)).connect(throb.gain);
    const low = filt('lowpass', 170, 0.7);
    low.connect(throb).connect(this.engine.input);
    for (const f of [46, 46.6, 23]) {
      const o = add(ctx.createOscillator());
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(low);
      o.start();
    }
  }

  update(t: TrainSound): void {
    const now = this.s.ctx.currentTime;
    const sit = (ch: Channel, level: number, at: Placement) => {
      ch.input.gain.setTargetAtTime(level * at.gain, now, 0.15);
      ch.pan.pan.setTargetAtTime(at.pan, now, 0.1);
      ch.lp.frequency.setTargetAtTime(distanceCutoff(at.distance), now, 0.1);
    };
    const roll = Math.min(1.2, t.roll);
    sit(this.wheels, t.roll > 0 ? RAILS.wheels : 0, t.rolling);
    // The clatter buffer is cut for the train's full pace.
    this.clatter.playbackRate.setTargetAtTime(Math.max(0.05, roll), now, 0.2);
    this.clatterGain.gain.setTargetAtTime(RAILS.clatter * Math.min(1, roll * 3), now, 0.2);
    this.rumble.gain.setTargetAtTime(RAILS.rumble * roll, now, 0.3);
    this.sing.gain.setTargetAtTime(RAILS.sing * roll * roll, now, 0.3);
    sit(this.engine, t.work > 0 ? RAILS.engine * (0.5 + 0.5 * t.work) : 0, t.engine);
    this.beat.frequency.setTargetAtTime(1.5 + 6.5 * t.work, now, 0.3);
  }

  stop(): void {
    const t = this.s.ctx.currentTime;
    for (const ch of [this.wheels, this.engine]) ch.input.gain.setTargetAtTime(0, t, 0.05);
    for (const n of this.sources) n.stop(t + 0.4);
    setTimeout(() => {
      release(this.wheels);
      release(this.engine);
    }, 500);
  }
}

/**
 * Weather: wind (low pink noise through a wandering band-pass) and a brighter hiss of rain, sand,
 * or snow on the hull. A squall swells both and lifts the wind's pitch; gusts wobble it.
 */
class WeatherLoop {
  private readonly out: GainNode;
  private readonly wind: GainNode;
  private readonly band: BiquadFilterNode;
  private readonly hiss: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private gust = 0;

  constructor(private readonly s: Synth) {
    const ctx = s.ctx;
    this.out = ctx.createGain();
    this.out.connect(s.bus);
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    this.band = ctx.createBiquadFilter();
    this.band.type = 'bandpass';
    this.band.frequency.value = 320;
    this.band.Q.value = 0.8;
    const air = loopSource(ctx, s.bank.noise.pink);
    air.connect(this.band).connect(this.wind).connect(this.out);
    this.sources.push(air);
    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const grit = loopSource(ctx, s.bank.noise.white);
    grit.connect(hp).connect(this.hiss).connect(this.out);
    this.sources.push(grit);
  }

  /** `kind` null: silent. `squall` 0–1 for a storm. */
  update(kind: 'night' | 'storm' | null, squall: number): void {
    const t = this.s.ctx.currentTime;
    // Gusts: a slow random walk on top of the squall.
    this.gust = Math.max(-1, Math.min(1, this.gust + (Math.random() - 0.5) * 0.12));
    const wobble = 1 + 0.35 * this.gust;
    const wind = kind === 'night' ? WEATHER.night : kind === 'storm' ? (WEATHER.base + WEATHER.squall * squall) * wobble : 0;
    this.wind.gain.setTargetAtTime(Math.max(0, wind), t, 0.4);
    this.band.frequency.setTargetAtTime((kind === 'storm' ? 280 + 420 * squall : 220) * wobble, t, 0.6);
    this.hiss.gain.setTargetAtTime(kind === 'storm' ? WEATHER.hiss * (0.25 + 0.75 * squall) : 0, t, 0.5);
  }

  stop(): void {
    const t = this.s.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.05);
    for (const n of this.sources) n.stop(t + 0.4);
  }
}

/**
 * Reactor: a low hum (saw through a low-pass) under the engine, flutter as it takes damage, and
 * in a meltdown the hum climbs and shakes, the capacitor bank screams, and a siren wails.
 */
class ReactorLoop {
  private readonly out: GainNode;
  private readonly hum: OscillatorNode;
  private readonly hum2: OscillatorNode;
  private readonly whine: OscillatorNode;
  private readonly whineGain: GainNode;
  private readonly flutter: OscillatorNode;
  private readonly flutterDepth: GainNode;
  private readonly siren: OscillatorNode;
  private readonly sirenLfo: OscillatorNode;
  private readonly sirenGain: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];

  constructor(private readonly s: Synth) {
    const ctx = s.ctx;
    const osc = (type: OscillatorType, f: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.start();
      this.sources.push(o);
      return o;
    };
    this.out = ctx.createGain();
    this.out.gain.value = REACTOR.level;
    this.out.connect(s.bus);

    // The hum's level is 1 plus the flutter LFO; damage deepens it.
    const humGain = ctx.createGain();
    humGain.gain.value = 1;
    humGain.connect(this.out);
    const lp = ctx.createBiquadFilter();
    lp.frequency.value = 220;
    lp.connect(humGain);
    this.hum = osc('sawtooth', 50);
    this.hum.connect(lp);
    this.hum2 = osc('sine', 100);
    const h2 = ctx.createGain();
    h2.gain.value = 0.6;
    this.hum2.connect(h2).connect(humGain);
    this.flutter = osc('sine', 6);
    this.flutterDepth = ctx.createGain();
    this.flutterDepth.gain.value = 0;
    this.flutter.connect(this.flutterDepth).connect(humGain.gain);

    this.whine = osc('sine', 3000);
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain).connect(s.bus);

    // Siren: a square swept up and down by a triangle LFO, through a cab speaker band.
    this.siren = osc('square', 950);
    this.sirenLfo = osc('triangle', 1);
    const sweep = ctx.createGain();
    sweep.gain.value = 320;
    this.sirenLfo.connect(sweep).connect(this.siren.frequency);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1500;
    band.Q.value = 0.7;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.siren.connect(band).connect(this.sirenGain).connect(s.bus);
  }

  update(r: ReactorState): void {
    const t = this.s.ctx.currentTime;
    const m = r.meltdown;
    const f = 50 * (1 + 1.5 * m);
    this.hum.frequency.setTargetAtTime(f, t, 0.1);
    this.hum2.frequency.setTargetAtTime(f * 2, t, 0.1);
    this.flutter.frequency.setTargetAtTime(6 + 20 * m + rand(-1, 1) * r.damage, t, 0.1);
    this.flutterDepth.gain.setTargetAtTime(Math.min(0.9, r.damage * 0.5 + m * 0.8), t, 0.1);
    this.out.gain.setTargetAtTime(REACTOR.level * (1 + 1.5 * m), t, 0.1);
    // Silent in normal running; in a meltdown the overloaded bank screams higher as the fuse burns.
    this.whine.frequency.setTargetAtTime(1200 + 300 * r.charge + 2500 * m, t, 0.2);
    this.whineGain.gain.setTargetAtTime(REACTOR.whine * 4 * m, t, 0.2);
    this.sirenLfo.frequency.setTargetAtTime(0.9 + 2.2 * m, t, 0.1);
    this.sirenGain.gain.setTargetAtTime(m > 0 ? REACTOR.siren : 0, t, 0.05);
  }

  stop(): void {
    const t = this.s.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.02);
    this.whineGain.gain.setTargetAtTime(0, t, 0.02);
    this.sirenGain.gain.setTargetAtTime(0, t, 0.02);
    for (const n of this.sources) n.stop(t + 0.3);
  }
}

/** The battle's sound: one-shots, holds, and the machine's loops, into a compressed bus. */
export class Synth {
  readonly bank: Bank;
  /** Everything in battle goes through here (pause fades it). */
  readonly bus: GainNode;
  readonly reverbIn: GainNode;
  readonly echoIn: GainNode;
  readonly cabIn: GainNode;
  private readonly holds = new Map<HoldId, Hold>();
  private engine: EngineLoop | null = null;
  private reactor: ReactorLoop | null = null;
  private weather: WeatherLoop | null = null;
  private train: TrainLoop | null = null;
  private voices = 0;

  constructor(
    readonly ctx: AudioContext,
    destination: AudioNode,
  ) {
    this.bank = bank(ctx);
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.gain.setTargetAtTime(1, ctx.currentTime, 0.2);
    // Glue and protection: a compressor rides the big blasts so nothing clips.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    this.bus.connect(comp).connect(master).connect(destination);
    this.reverbIn = ctx.createGain();
    const verb = ctx.createConvolver();
    verb.buffer = this.bank.impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverbIn.connect(verb).connect(wet).connect(this.bus);
    // The land's echoes: each a delayed, duller copy from its own side, with a little of the reverb's tail.
    this.echoIn = ctx.createGain();
    for (const [seconds, side, cutoff, level] of ECHOES) {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = seconds;
      const dull = ctx.createBiquadFilter();
      dull.frequency.value = cutoff;
      const back = ctx.createGain();
      back.gain.value = level;
      const pan = ctx.createStereoPanner();
      pan.pan.value = side * STEREO.pan;
      this.echoIn.connect(delay).connect(dull).connect(back).connect(pan).connect(this.bus);
      pan.connect(this.reverbIn);
    }
    this.cabIn = ctx.createGain();
    const cab = ctx.createConvolver();
    cab.buffer = this.bank.cab;
    const box = ctx.createGain();
    box.gain.value = CAB.wet;
    this.cabIn.connect(cab).connect(box).connect(this.bus);
  }

  /** Audio only plays once the browser lets it (after the first click or key). */
  get running(): boolean {
    return this.ctx.state === 'running';
  }

  /** `signal`: what a whistle says (`WHISTLE_SIGNALS`). */
  play(sound: SoundId, size: number, at: Placement, signal?: WhistleSignal): void {
    if (!this.running || this.voices >= MAX_VOICES) return;
    const ctx = this.ctx;
    const ch = channel(this, LEVEL[sound] * levelFactor(sound, Math.random()) * at.gain, at);
    const near = clamp(1 - (at.distance - HEARING.near) / (NEAR - HEARING.near), 0, 1);
    const v = new Voice(ctx, this.bank, ctx.currentTime + 0.005, ch, pitchFactor(sound, Math.random()), near);
    RECIPES[sound](v, size, signal);
    this.voices++;
    // Disconnect once it (and its reverb send) has died away.
    const life = v.end - ctx.currentTime + 0.1;
    setTimeout(() => {
      release(ch);
      this.voices--;
    }, life * 1000);
  }

  hold(id: HoldId, at: Placement): void {
    if (!this.running) return;
    let h = this.holds.get(id);
    if (!h) {
      h = new Hold(this, id);
      this.holds.set(id, h);
    }
    h.trigger(HOLD_LEVEL[id].level, at);
  }

  /** Starts the engine and reactor loops. */
  startMachine(): void {
    this.engine ??= new EngineLoop(this);
    this.reactor ??= new ReactorLoop(this);
  }

  /** The reactor's gone: the engine and hum cut out. */
  stopMachine(): void {
    this.engine?.stop();
    this.reactor?.stop();
    this.engine = null;
    this.reactor = null;
  }

  update(engine: EngineState, wet: boolean, cruiseFrac: number, reactor: ReactorState): void {
    this.engine?.update(engine, wet, cruiseFrac);
    this.reactor?.update(reactor);
    for (const [id, h] of this.holds) h.update(HOLD_LEVEL[id].hold);
  }

  /** The weather bed (it outlasts the reactor: the storm doesn't care). */
  setWeather(kind: 'night' | 'storm' | null, squall: number): void {
    if (!this.running) return;
    if (kind) this.weather ??= new WeatherLoop(this);
    this.weather?.update(kind, squall);
  }

  /** An armored train's wheels and engines (null: this battle has no train). */
  setTrain(t: TrainSound | null): void {
    if (!t || !this.running) return;
    this.train ??= new TrainLoop(this);
    this.train.update(t);
  }

  setPaused(paused: boolean): void {
    this.bus.gain.setTargetAtTime(paused ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  /** Fades out and tears down (the scene is ending). The context itself belongs to Phaser. */
  destroy(): void {
    const t = this.ctx.currentTime;
    this.bus.gain.setTargetAtTime(0, t, 0.05);
    this.stopMachine();
    this.weather?.stop();
    this.weather = null;
    this.train?.stop();
    this.train = null;
    for (const h of this.holds.values()) h.stop();
    this.holds.clear();
    setTimeout(() => this.bus.disconnect(), 400);
  }
}
