import { levelFactor, pitchFactor, type EngineState, type HoldId, type Placement, type ReactorState, type SoundId } from './cues';

/**
 * Procedural battle sound (SPEC §11.4) on Web Audio. No sample files: every sound is built from
 * noise, oscillators, and filters the way a foley artist layers a real one — a sharp transient,
 * a filtered body, a sub-bass drop, a tail — and placed in an outdoor reverb with distance
 * muffling and stereo pan. Recipes take a `size` (caliber, blast radius, hit weight).
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
  autocannon: 0.7,
  rotary: 0.7,
  mortar: 0.5,
  missile: 0.6,
  rocket: 1,
  pulseLaser: 0.6,
  heavyLaser: 0.85,
  plasmaShot: 0.55,
  airburst: 0.35,
  explosion: 0.85,
  plasmaSplash: 0.6,
  splash: 0.6,
  impact: 0.6,
  pierce: 0.6,
  ricochet: 0.5,
  hullHit: 0.7,
  vehicleKill: 0.8,
  crush: 0.7,
  wood: 0.8,
  collapse: 0.7,
  ram: 0.65,
  clank: 0.45,
  droneLost: 0.4,
  revive: 0.6,
  componentBlown: 0.75,
  immobilized: 0.7,
  alarm: 0.22,
  missileWarning: 0.25,
  incoming: 0.3,
  horn: 0.3,
  radio: 0.25,
  detonation: 1,
};

/** Engine and tread loop levels. */
const ENGINE = { level: 0.065, rumble: 0.35, treads: 0.4, wade: 0.35 };
/**
 * The weather bed (SPEC §4.6): a storm's wind and rain or sand hiss, swelling with each squall; a
 * faint wind under the night. `base` is the level between squalls, `squall` what a full one adds.
 */
const WEATHER = { night: 0.018, base: 0.02, squall: 0.11, hiss: 0.05 };
/** Reactor hum bed, meltdown whine, and siren. */
const REACTOR = { level: 0.025, whine: 0.008, siren: 0.08 };

type Color = 'white' | 'pink' | 'brown' | 'crackle';

interface Bank {
  noise: Record<Color, AudioBuffer>;
  treads: AudioBuffer;
  impulse: AudioBuffer;
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
  const made: Bank = { noise: { white, pink, brown, crackle }, treads: treadBuffer(ctx), impulse: outdoorImpulse(ctx), drive: driveCurve(2.4) };
  banks.set(ctx, made);
  return made;
}

/**
 * One second of track links slapping over the drive sprockets at cruise speed, both pods: a
 * clack (noise burst) and a short metallic ring per link. Written with wrap-around so it loops
 * seamlessly; its playback rate follows ground speed.
 */
function treadBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(2, sr, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const links = 11;
    for (let k = 0; k < links; k++) {
      const at = Math.floor(((k + rand(-0.12, 0.12) + ch * 0.5) / links) * sr);
      const amp = rand(0.55, 1);
      const ring = rand(110, 240);
      const thunk = rand(80, 110);
      const len = Math.floor(sr * 0.09);
      let lp = 0;
      for (let j = 0; j < len; j++) {
        const t = j / sr;
        lp += 0.15 * (Math.random() * 2 - 1 - lp);
        const v = lp * Math.exp(-t * 160) * 1.4 + Math.sin(2 * Math.PI * ring * t) * Math.exp(-t * 70) * 0.25 + Math.sin(2 * Math.PI * thunk * t) * Math.exp(-t * 40) * 0.6;
        const idx = (at + j + sr) % sr;
        d[idx]! += v * amp;
      }
    }
  }
  return buf;
}

/**
 * An open battlefield: a slap off the ground and tree lines in the first ~80 ms, then a long,
 * darkening diffuse tail (T60 ≈ 2.2 s). Decorrelated per channel for width.
 */
function outdoorImpulse(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 2.6);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const pre = Math.floor(sr * 0.012);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      // The tail gets darker as it goes: the highs die in the air first.
      const a = 0.55 - 0.45 * Math.min(1, t / 1.5);
      lp += a * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.exp((-6.9 * t) / 2.2) * 0.5;
    }
    for (let r = 0; r < 6; r++) {
      const at = pre + Math.floor(sr * rand(0.008, 0.085));
      d[at]! += rand(0.25, 0.6) * (Math.random() < 0.5 ? -1 : 1);
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
}

interface Filter {
  type?: BiquadFilterType;
  f?: number;
  /** Frequency to glide to (exponentially) over `glide` seconds. */
  f1?: number;
  glide?: number;
  q?: number;
}

type NoiseOpts = Shape & Filter & { color?: Color; rate?: number };
type ToneOpts = Shape & { type?: OscillatorType; f: number; f1?: number; glide?: number; filter?: Filter };

/** Builds one sound's node graph, starting at `t`, into `out`. */
class Voice {
  end: number;
  private drive: WaveShaperNode | null = null;

  constructor(
    readonly ctx: AudioContext,
    private readonly bank: Bank,
    readonly t: number,
    readonly out: AudioNode,
    /** Reverb send for this voice; recipes may push it up. */
    readonly send: GainNode,
    /** This play's random pitch shift: scales every frequency and noise rate in the voice. */
    readonly pitch = 1,
  ) {
    this.end = t;
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

  private envelope(s: Shape): { gain: GainNode; t0: number; stop: number } {
    const t0 = this.t + (s.delay ?? 0);
    const attack = Math.max(0.0005, s.attack ?? 0.001);
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(s.peak, t0 + attack);
    g.gain.setTargetAtTime(0, t0 + attack, s.decay / 6.9);
    g.connect(s.dest ?? this.out);
    const stop = t0 + attack + s.decay * 1.05;
    this.end = Math.max(this.end, stop);
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
    const { gain, t0, stop } = this.envelope(o);
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

type Recipe = (v: Voice, size: number) => void;

/** A blast: shock-front crack, fireball roar, concussion drop, rolling rumble, falling debris. */
function blast(v: Voice, size: number): void {
  const k = Math.min(size, 1.5);
  v.noise({ type: 'highpass', f: 1000, peak: 0.8, attack: 0.0008, decay: 0.05 + 0.05 * k });
  v.noise({ color: 'pink', f: vary(3200 - 900 * Math.min(k, 1)), f1: 170, glide: 0.3 + 0.4 * k, peak: 1.1, attack: 0.002, decay: 0.6 + 1.1 * k, dest: v.driven });
  v.noise({ color: 'brown', f: 420, f1: 90, glide: 1, peak: 0.25 + 0.8 * k, attack: 0.01, decay: 1.2 + 2 * k, delay: 0.02 });
  v.tone({ f: vary(72 - 25 * Math.min(k, 1)), f1: 22, glide: 0.4 + 0.4 * k, peak: 0.7 + 0.6 * k, attack: 0.003, decay: 0.6 + 1.2 * k, dest: v.driven });
  v.noise({ color: 'crackle', type: 'bandpass', f: vary(1400, 0.15), q: 0.7, peak: 0.6 + 0.6 * k, attack: 0.03, decay: 0.5 + 1.2 * k, delay: 0.06 });
  v.send.gain.value *= 1 + 0.6 * k;
}

/** Steel being struck: a contact tick, the ringing plate, and the thud of the mass behind it. */
function strike(v: Voice, base: number, size: number, ring: readonly number[] = PLATE): void {
  v.noise({ type: 'highpass', f: 3000, peak: 0.5, attack: 0.0004, decay: 0.015 });
  v.modes(base, ring, 0.3 + 0.2 * Math.min(size, 1), 0.9 + 0.6 * size);
  v.noise({ color: 'pink', f: 650, peak: 0.3 + 0.7 * Math.min(size, 1), attack: 0.001, decay: 0.12 + 0.12 * size, dest: v.driven });
  v.tone({ f: 95, f1: 40, glide: 0.12, peak: 0.2 + 0.5 * Math.min(size, 1), attack: 0.001, decay: 0.2 + 0.15 * size });
}

/** Cab warning tones through a small speaker. */
function beeps(v: Voice, freqs: readonly number[], on: number, every: number, type: OscillatorType = 'square'): void {
  freqs.forEach((f, i) => {
    v.tone({ type, f, peak: 0.5, attack: 0.004, decay: on * 1.6, delay: i * every, filter: { type: 'bandpass', f: 1800, q: 0.6 } });
  });
}

const RECIPES: Record<SoundId, Recipe> = {
  // A big gun: the supersonic muzzle crack, the blast's roar sweeping down, a concussive sub
  // drop, and the report rolling back off the land.
  cannon: (v, s) => {
    v.noise({ type: 'highpass', f: 1800, peak: 0.9, attack: 0.0008, decay: 0.05 + 0.05 * s });
    v.noise({ color: 'pink', f: vary(4200 - 1800 * s), f1: 220, glide: 0.25, peak: 1.1, attack: 0.002, decay: 0.45 + 0.9 * s, dest: v.driven });
    v.tone({ f: vary(100 - 50 * s, 0.08), f1: 32, glide: 0.25 + 0.2 * s, peak: 0.3 + 1.1 * s, attack: 0.003, decay: 0.45 + 0.8 * s, dest: v.driven });
    v.noise({ color: 'brown', f: 280, peak: 0.6 * s, attack: 0.02, decay: 1.2 + 1.6 * s, delay: 0.03 });
    v.send.gain.value *= 1 + s;
  },
  autocannon: (v, s) => {
    v.noise({ type: 'highpass', f: 2200, peak: 0.7, attack: 0.0006, decay: 0.025 });
    v.noise({ color: 'pink', f: 3200, f1: 500, glide: 0.08, peak: 0.85, attack: 0.001, decay: 0.16 + 0.16 * s, dest: v.driven });
    v.tone({ f: vary(150 - 40 * s), f1: 55, glide: 0.08, peak: 0.7, attack: 0.002, decay: 0.15 + 0.12 * s });
    v.noise({ color: 'brown', f: 300, peak: 0.25, decay: 0.5, delay: 0.01 });
  },
  // Rapid fire: each round is a short bark, so a stream of them makes the brrrt.
  rotary: (v, s) => {
    v.noise({ type: 'bandpass', f: vary(2500, 0.12), q: 0.7, peak: 0.45, attack: 0.0005, decay: 0.018 });
    v.noise({ color: 'pink', f: 1800, peak: 0.5, attack: 0.001, decay: 0.06 + 0.04 * s });
    v.tone({ f: vary(170), f1: 80, glide: 0.04, peak: 0.35, attack: 0.001, decay: 0.05 });
  },
  // Tube artillery: the hollow "thoonk" of a round leaving a resonant pipe.
  mortar: (v) => {
    v.tone({ f: vary(240), f1: 150, glide: 0.12, peak: 0.6, attack: 0.002, decay: 0.25 });
    v.noise({ color: 'pink', type: 'bandpass', f: 380, q: 3, peak: 1.4, attack: 0.001, decay: 0.2, dest: v.driven });
    v.tone({ f: 80, f1: 40, glide: 0.2, peak: 0.9, attack: 0.002, decay: 0.35 });
    v.noise({ type: 'highpass', f: 3000, peak: 0.2, attack: 0.001, decay: 0.03 });
  },
  // Ignition pop, then the motor's roar and hiss sweeping up as it leaves.
  missile: (v, s) => {
    const dur = 0.7 + 0.5 * s;
    v.noise({ color: 'pink', f: 2500, peak: 0.7, attack: 0.001, decay: 0.07 });
    v.noise({ type: 'bandpass', f: vary(350), f1: vary(2600), glide: dur * 0.7, q: 1.2, peak: 0.55, attack: 0.04, decay: dur });
    v.noise({ color: 'brown', f: 700, peak: 0.7, attack: 0.02, decay: dur * 1.2 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 1800, q: 0.8, peak: 0.6, attack: 0.02, decay: dur });
  },
  rocket: (v) => {
    v.noise({ color: 'pink', f: 2200, peak: 0.6, attack: 0.001, decay: 0.06 });
    v.noise({ type: 'bandpass', f: vary(600), f1: vary(2400), glide: 0.25, q: 1.4, peak: 0.5, attack: 0.02, decay: 0.4 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 2000, q: 0.8, peak: 0.4, attack: 0.01, decay: 0.35 });
  },
  // A capacitor bank dumping into the emitter: an electrical snap, the sizzle of air ionizing
  // along the path, and the transformer's thump.
  pulseLaser: (v, s) => {
    v.noise({ type: 'highpass', f: 2500, peak: 0.7, attack: 0.0004, decay: 0.02 });
    v.noise({ type: 'bandpass', f: vary(5200, 0.1), q: 2.5, peak: 0.4, attack: 0.001, decay: 0.09 + 0.1 * s });
    v.tone({ type: 'triangle', f: vary(2400, 0.1), f1: 900, glide: 0.1, peak: 0.1 + 0.1 * s, attack: 0.001, decay: 0.12 });
    v.tone({ f: 120, f1: 60, glide: 0.06, peak: 0.1 + 0.35 * s, attack: 0.002, decay: 0.1 });
  },
  // A beam that hot flashes the air along its path into plasma: thunder, close up.
  heavyLaser: (v) => {
    v.noise({ type: 'highpass', f: 1500, peak: 1, attack: 0.0005, decay: 0.05 });
    v.noise({ type: 'bandpass', f: 3200, f1: 700, glide: 0.2, q: 0.9, peak: 0.7, attack: 0.001, decay: 0.35 });
    v.noise({ color: 'brown', f: 500, f1: 120, glide: 0.8, peak: 0.9, attack: 0.01, decay: 1.8, delay: 0.04 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 900, q: 0.6, peak: 0.8, attack: 0.02, decay: 1.2, delay: 0.05 });
    v.tone({ f: 70, f1: 28, glide: 0.5, peak: 0.9, attack: 0.003, decay: 0.8, dest: v.driven });
    v.tone({ f: 3600, f1: 700, glide: 0.35, peak: 0.08, attack: 0.001, decay: 0.35 });
    v.send.gain.value *= 2;
  },
  // A gas charge igniting: a soft "whumpf" that opens up, with a hiss.
  plasmaShot: (v) => {
    v.noise({ color: 'pink', f: 300, f1: 1600, glide: 0.08, peak: 1, attack: 0.03, decay: 0.45, dest: v.driven });
    v.noise({ type: 'highpass', f: 4500, peak: 0.25, attack: 0.01, decay: 0.35 });
    v.tone({ f: 75, f1: 45, glide: 0.3, peak: 0.6, attack: 0.02, decay: 0.35 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 2500, q: 0.8, peak: 0.4, attack: 0.02, decay: 0.4 });
  },
  airburst: (v) => {
    v.noise({ type: 'highpass', f: 1200, peak: 0.6, attack: 0.0005, decay: 0.04 });
    v.noise({ color: 'pink', f: 1500, peak: 0.5, attack: 0.001, decay: 0.2 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 3000, q: 0.8, peak: 0.3, attack: 0.005, decay: 0.25, delay: 0.02 });
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
    v.noise({ type: 'bandpass', f: 1500, f1: 600, glide: 0.4, q: 0.8, peak: 0.5, attack: 0.02, decay: 0.6 + 0.4 * s, delay: 0.02 });
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
  // Heavy armor taking a round: lower and longer the harder the hit; big ones throw spall.
  hullHit: (v, s) => {
    strike(v, vary(270 - 100 * Math.min(s, 1), 0.15), s);
    if (s > 0.5) v.noise({ color: 'crackle', type: 'bandpass', f: 2500, q: 0.8, peak: 0.5, attack: 0.002, decay: 0.4, delay: 0.01 });
  },
  // A vehicle brewing up: the blast, its hull ringing, then ammunition cooking off.
  vehicleKill: (v, s) => {
    blast(v, s * 0.9);
    v.modes(vary(180, 0.15), BAR, 0.15, 0.6, 0.05);
    const pops = Math.round(1 + 3 * Math.min(s, 1) * Math.random());
    for (let i = 0; i < pops; i++) {
      const delay = rand(0.25, 1.4);
      v.noise({ color: 'pink', f: 2000, peak: 0.35, attack: 0.001, decay: 0.12, delay });
      v.noise({ type: 'highpass', f: 2000, peak: 0.25, attack: 0.0005, decay: 0.02, delay });
    }
  },
  // Steel buckling under the treads: a groan of folding plate and a crunch.
  crush: (v, s) => {
    v.tone({ type: 'sawtooth', f: vary(70), f1: 36, glide: 0.45, peak: 0.4, attack: 0.01, decay: 0.55, filter: { f: 420, f1: 170, glide: 0.45, q: 8 } });
    v.noise({ color: 'crackle', type: 'bandpass', f: 1100, q: 0.6, peak: 1, attack: 0.005, decay: 0.45 });
    v.noise({ color: 'pink', f: 500, peak: 0.6 + 0.3 * s, attack: 0.002, decay: 0.2, dest: v.driven });
    v.modes(vary(320, 0.15), BAR, 0.15, 0.4);
  },
  // A tree going down: trunk snaps, splintering, the canopy thrashing, the thud.
  wood: (v, s) => {
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
  // A building coming down: a crack, a long rumble of masonry, rubble, a tinkle of glass.
  collapse: (v, s) => {
    v.noise({ type: 'highpass', f: 1500, peak: 0.5, attack: 0.001, decay: 0.04 });
    v.noise({ color: 'brown', f: 350, peak: 1, attack: 0.03, decay: 1.6 + 0.6 * s, dest: v.driven });
    v.noise({ color: 'crackle', type: 'bandpass', f: 900, q: 0.6, peak: 1.2, attack: 0.05, decay: 1.6, delay: 0.05 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 4500, q: 1, peak: 0.25 * s, attack: 0.02, decay: 0.8, delay: 0.03 });
    v.tone({ f: 55, f1: 30, glide: 0.8, peak: 0.6, attack: 0.02, decay: 1.2 });
  },
  // The prow striking something solid.
  ram: (v, s) => {
    v.noise({ color: 'pink', f: 700, peak: 0.9, attack: 0.001, decay: 0.18 + 0.2 * s, dest: v.driven });
    v.tone({ f: 75, f1: 35, glide: 0.2, peak: 0.2 + 0.8 * s, attack: 0.001, decay: 0.3 });
    v.modes(vary(140, 0.15), PLATE, 0.25 * s, 0.5 + 0.4 * s);
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
    v.noise({ color: 'crackle', type: 'bandpass', f: 5000, q: 1, peak: 0.5, attack: 0.01, decay: 0.7, delay: 0.05 });
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
  // Incoming artillery: a falling whistle that swells as the shells come down over the zone and
  // cuts off as the first one lands (`size` = seconds of flight).
  incoming: (v, s) => {
    const dur = Math.max(0.6, s);
    const start = Math.max(0, dur - 1.6);
    v.tone({ type: 'sine', f: vary(1900, 0.05), f1: vary(700, 0.05), glide: dur - start, peak: 0.5, attack: dur - start - 0.05, decay: 0.05, delay: start });
    v.noise({ type: 'bandpass', f: 2600, f1: 900, glide: dur - start, q: 4, peak: 0.25, attack: dur - start - 0.05, decay: 0.05, delay: start });
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
  },
  // Extraction confirmed over the radio: a squelch and a two-note chirp.
  radio: (v) => {
    v.noise({ type: 'bandpass', f: 2000, q: 2, peak: 0.4, attack: 0.002, decay: 0.08 });
    v.tone({ f: 1250, peak: 0.5, attack: 0.005, decay: 0.12, delay: 0.06, filter: { type: 'bandpass', f: 1800, q: 1 } });
    v.tone({ f: 1650, peak: 0.5, attack: 0.005, decay: 0.2, delay: 0.17, filter: { type: 'bandpass', f: 1800, q: 1 } });
    v.noise({ type: 'bandpass', f: 2000, q: 2, peak: 0.3, attack: 0.002, decay: 0.1, delay: 0.38 });
  },
  // The reactor going: the biggest sound in the game.
  detonation: (v) => {
    v.noise({ type: 'highpass', f: 600, peak: 1, attack: 0.001, decay: 0.15 });
    v.noise({ color: 'pink', f: 4000, f1: 100, glide: 2.5, peak: 1.4, attack: 0.004, decay: 4, dest: v.driven });
    v.noise({ color: 'brown', f: 260, f1: 60, glide: 4, peak: 1.3, attack: 0.05, decay: 7, delay: 0.05 });
    v.tone({ f: 55, f1: 16, glide: 3, peak: 1.5, attack: 0.005, decay: 4.5, dest: v.driven });
    v.tone({ f: 38, f1: 20, glide: 4, peak: 0.8, attack: 0.2, decay: 6 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 1100, q: 0.5, peak: 1.2, attack: 0.1, decay: 4, delay: 0.3 });
    v.noise({ type: 'bandpass', f: 500, f1: 150, glide: 1.5, q: 0.7, peak: 0.6, attack: 0.05, decay: 2, delay: 0.02 });
    v.send.gain.value = 0.8;
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

/** A placed channel into the bus: gain → distance low-pass → pan, plus a reverb send. */
function channel(s: Synth, level: number, at: Placement): { input: GainNode; lp: BiquadFilterNode; pan: StereoPannerNode; send: GainNode } {
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
  input.connect(lp).connect(pan).connect(s.bus);
  pan.connect(send).connect(s.reverbIn);
  return { input, lp, pan, send };
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
  private readonly ch: ReturnType<typeof channel>;
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
      // A held laser: ionized air sizzling, the power train's buzz, and an unsteady high warble.
      add(loopSource(ctx, b.noise.white)).connect(filt('bandpass', 2600, 3)).connect(gain(0.9)).connect(this.ch.input);
      const hum = add(ctx.createOscillator());
      hum.type = 'sawtooth';
      hum.frequency.value = 100;
      hum.connect(filt('lowpass', 500, 2)).connect(gain(0.35)).connect(this.ch.input);
      hum.start();
      const tone = add(ctx.createOscillator());
      tone.frequency.value = 4200;
      const trem = gain(0.04);
      tone.connect(trem).connect(this.ch.input);
      lfo(31, 0.03, trem.gain);
      tone.start();
    } else if (id === 'scrape') {
      // Steel grinding along rock: resonant noise whose pitch wanders, over a low grind.
      const band = filt('bandpass', 1300, 5);
      add(loopSource(ctx, b.noise.white)).connect(band).connect(gain(1.4)).connect(this.ch.input);
      lfo(3.1, 280, band.frequency);
      lfo(7.3, 160, band.frequency);
      add(loopSource(ctx, b.noise.pink)).connect(filt('lowpass', 500, 0.7)).connect(gain(0.8)).connect(this.ch.input);
      add(loopSource(ctx, b.noise.crackle)).connect(filt('bandpass', 2400, 0.8)).connect(gain(0.8)).connect(this.ch.input);
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
    this.ch.input.disconnect();
  }
}

const HOLD_LEVEL: Record<HoldId, { level: number; hold: number }> = {
  beam: { level: 0.2, hold: 0.16 },
  scrape: { level: 0.35, hold: 0.12 },
  burn: { level: 0.25, hold: 0.2 },
};

/**
 * The Behemoth's drive: a huge, slow engine (detuned saws, soft clipped, then darkened by a
 * load-following low-pass so it growls rather than buzzes), ground rumble, a dull clank of
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
  private readonly holds = new Map<HoldId, Hold>();
  private engine: EngineLoop | null = null;
  private reactor: ReactorLoop | null = null;
  private weather: WeatherLoop | null = null;
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
  }

  /** Audio only plays once the browser lets it (after the first click or key). */
  get running(): boolean {
    return this.ctx.state === 'running';
  }

  play(sound: SoundId, size: number, at: Placement): void {
    if (!this.running || this.voices >= MAX_VOICES) return;
    const ctx = this.ctx;
    const ch = channel(this, LEVEL[sound] * levelFactor(sound, Math.random()) * at.gain, at);
    const v = new Voice(ctx, this.bank, ctx.currentTime + 0.005, ch.input, ch.send, pitchFactor(sound, Math.random()));
    RECIPES[sound](v, size);
    this.voices++;
    // Disconnect once it (and its reverb send) has died away.
    const life = v.end - ctx.currentTime + 0.1;
    setTimeout(() => {
      ch.input.disconnect();
      ch.pan.disconnect();
      ch.send.disconnect();
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
    for (const h of this.holds.values()) h.stop();
    this.holds.clear();
    setTimeout(() => this.bus.disconnect(), 400);
  }
}
