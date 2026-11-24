import type { NoteEvent } from './director';
import type { Duck } from './duck';
import type { VoiceId } from './score';

/**
 * The music's instruments and bus (SPEC §11.4 "Music"), on Web Audio. Synth-orchestral, after
 * Tomita's Moog *Planets*: no samples, every voice an analog-style patch (sawtooths through
 * resonant filters, slow vibrato, pitch scoops), all in a generated concert-hall reverb.
 *
 * A voice has two halves. What changes with every note (pitch, envelope, the filter's sweep) is
 * built per note; what never changes (an instrument's body resonances, a vowel's formants, the
 * string machine's ensemble chorus) is built once, as its channel's insert. A note's *tone*
 * follows its dynamic (`dyn`: ghost, plain, accent), its *level* follows `vel` (the dynamic times
 * its part's gain), so turning a part down in the mix doesn't also dull it.
 *
 * Mixing levels: `MUSIC_LEVEL` for the whole bus, `CHANNEL` per voice, the layer gains in the score.
 */

/** The music bus's level, under the sound effects. */
export const MUSIC_LEVEL = 0.34;

/** A channel's fixed processing, built once: takes the channel's input, returns what feeds its pan. */
type Insert = (ctx: BaseAudioContext, input: AudioNode, running: OscillatorNode[]) => AudioNode;

interface Channel {
  level: number;
  /** Where it sits on the stage (-1 left to 1 right). */
  pan: number;
  /** Reverb send: how far back it sits. */
  wet: number;
  /** How ragged its entries are (s): a section never lands together, a drummer nearly does. */
  loose: number;
  insert?: Insert;
}

type Band = readonly [type: BiquadFilterType, f: number, gainDb?: number, q?: number];

/** Fixed filters in series: an instrument's body, a vowel, a mute. */
function eq(...bands: Band[]): Insert {
  return (ctx, input) =>
    bands.reduce<AudioNode>((node, [type, f, gainDb = 0, q = 0.7]) => {
      const b = filter(ctx, type, f, q);
      b.gain.value = gainDb;
      return node.connect(b);
    }, input);
}

/**
 * The string machine's ensemble (what makes three sawtooths a section): three short delay lines,
 * each swept by a slow and a fast LFO a third of a cycle apart, spread left, centre, and right.
 */
function ensemble(mix: number): Insert {
  return (ctx, input, running) => {
    const out = ctx.createGain();
    input.connect(out);
    [-1, 0, 1].forEach((side, i) => {
      const line = ctx.createDelay(0.05);
      line.delayTime.value = 0.011 + i * 0.0023;
      for (const [rate, depth] of [
        [0.61, 0.0018],
        [5.9, 0.00012],
      ] as const) {
        const lfo = ctx.createOscillator();
        lfo.setPeriodicWave(phased(ctx, i / 3));
        lfo.frequency.value = rate;
        const amount = ctx.createGain();
        amount.gain.value = depth;
        lfo.connect(amount).connect(line.delayTime);
        lfo.start();
        running.push(lfo);
      }
      const level = ctx.createGain();
      level.gain.value = mix / Math.sqrt(3);
      const pan = ctx.createStereoPanner();
      pan.pan.value = side * 0.6;
      input.connect(line).connect(level).connect(pan).connect(out);
    });
    return out;
  };
}

/** Leans a part's two sides in toward each other (0: left as they are; 1: mono), so it's wide but still sums. */
function lean(k: number): Insert {
  return (ctx, input) => {
    const split = ctx.createChannelSplitter(2);
    const out = ctx.createChannelMerger(2);
    input.connect(split);
    for (const side of [0, 1]) {
      split.connect(out, side, side);
      const across = ctx.createGain();
      across.gain.value = k;
      split.connect(across, side);
      across.connect(out, 0, 1 - side);
    }
    return out;
  };
}

const chain =
  (...inserts: Insert[]): Insert =>
  (ctx, input, running) =>
    inserts.reduce((node, insert) => insert(ctx, node, running), input);

/** Per voice: level, stage position, reverb send, raggedness, and its fixed processing. */
const CHANNEL: Record<VoiceId, Channel> = {
  // Wood on string: a cello's body under the click.
  legno: { level: 0.45, pan: -0.1, wet: 0.25, loose: 0.003, insert: eq(['peaking', 260, 4, 2], ['peaking', 1150, 3, 3]) },
  strings: { level: 0.18, pan: 0, wet: 0.6, loose: 0.012, insert: chain(lean(0.5), eq(['peaking', 300, 2.5, 1.5], ['peaking', 2600, 2, 2]), ensemble(0.6)) },
  tremolo: { level: 0.3, pan: -0.1, wet: 0.7, loose: 0.02, insert: chain(lean(0.5), ensemble(0.4)) },
  basses: { level: 0.32, pan: 0.35, wet: 0.35, loose: 0.008, insert: chain(lean(0.7), eq(['peaking', 190, 3, 1.5])) },
  brass: { level: 0.26, pan: 0.2, wet: 0.4, loose: 0.006, insert: eq(['peaking', 1250, 4, 1.4]) },
  lowBrass: { level: 0.21, pan: 0.3, wet: 0.35, loose: 0.006, insert: eq(['peaking', 520, 4, 1.4]) },
  // Bells to the back wall: mellow and far.
  horn: { level: 0.22, pan: -0.35, wet: 0.65, loose: 0.008, insert: eq(['peaking', 450, 5, 1.5], ['highshelf', 2200, -6]) },
  timpani: { level: 0.41, pan: -0.1, wet: 0.45, loose: 0.002 },
  snare: { level: 0.175, pan: 0.1, wet: 0.3, loose: 0.002 },
  tamtam: { level: 0.4, pan: -0.25, wet: 0.7, loose: 0.002 },
  cymbal: { level: 0.3, pan: 0.3, wet: 0.5, loose: 0.002 },
  swell: { level: 0.3, pan: 0.3, wet: 0.5, loose: 0.002 },
  bells: { level: 0.22, pan: 0.25, wet: 0.7, loose: 0.003 },
  // "Ah": the formants a throat puts on any note it sings, then the choir's many throats.
  choir: {
    level: 0.1,
    pan: 0,
    wet: 0.7,
    loose: 0.015,
    insert: chain(lean(0.5), eq(['peaking', 700, 10, 4], ['peaking', 1150, 7, 6], ['peaking', 2700, 4, 8], ['peaking', 3400, 2, 8], ['highpass', 160]), ensemble(0.5)),
  },
  anvil: { level: 0.1, pan: 0.4, wet: 0.35, loose: 0.002 },
  // A double reed's nasal honk and its upper buzz.
  reed: {
    level: 0.19,
    pan: -0.2,
    wet: 0.45,
    loose: 0.004,
    insert: eq(['highpass', 350], ['peaking', 1400, 8, 2.5], ['peaking', 2900, 5, 4], ['lowpass', 4500]),
  },
};
/** The hall's reverb time (s, to -60 dB) in its low, middle, and high bands: the highs die first. */
const HALL = { low: 2.6, mid: 2.2, high: 1, lowBelow: 350, highAbove: 3200 };
const HALL_SECONDS = 2.8;
/** Ducking: how fast the music dips under a big sound, and how slowly it comes back (time constants, s). */
const DUCK_ATTACK = 0.015;
const DUCK_RELEASE = 0.4;
/** The bus's high-pass: the octaves below it belong to the engine's rumble (§11.4). */
const LOW_CUT = 90;
const WET = 0.5;

/** One note, as a voice plays it. */
interface Shot {
  /** Hz. */
  f: number;
  /** Start (context time) and length (s). */
  t: number;
  dur: number;
  /** Level: the dynamic times the part's gain. */
  vel: number;
  /** The dynamic alone (0.4 ghost, 0.7 plain, 1 accent): shapes the tone. */
  dyn: number;
  /** Slurred from the note before, this many semitones away: no new attack. */
  slur?: number;
}

type Voice = (ctx: BaseAudioContext, out: AudioNode, note: Shot) => void;

const noises = new WeakMap<BaseAudioContext, AudioBuffer>();
const waves = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
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

/** A waveform made once per audio context. */
function wave(ctx: BaseAudioContext, key: string, harmonics: number, amp: (n: number) => readonly [cos: number, sin: number]): PeriodicWave {
  let made = waves.get(ctx);
  if (!made) waves.set(ctx, (made = new Map()));
  let w = made.get(key);
  if (!w) {
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    for (let n = 1; n <= harmonics; n++) [real[n], imag[n]] = amp(n);
    made.set(key, (w = ctx.createPeriodicWave(real, imag)));
  }
  return w;
}

/** A sine starting `turn` of a cycle in (for LFOs that must stay apart). */
const phased = (ctx: BaseAudioContext, turn: number) =>
  wave(ctx, `phase${turn}`, 1, () => [Math.sin(2 * Math.PI * turn), Math.cos(2 * Math.PI * turn)]);

/** A narrow pulse: a double reed's buzz (every harmonic, the upper ones strong). */
const REED_DUTY = 0.25;
const pulse = (ctx: BaseAudioContext) => wave(ctx, 'pulse', 40, (n) => [0, Math.sin(Math.PI * n * REED_DUTY) / n]);

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

/** A burst of noise through a filter: a click, a thump, a breath. */
function burst(ctx: BaseAudioContext, out: AudioNode, t: number, band: BiquadFilterNode, peak: number, attack: number, decay: number): void {
  const n = noise(ctx);
  n.connect(band).connect(hit(ctx, t, peak, attack, decay)).connect(out);
  n.start(t, rand(0, 1.5));
  n.stop(t + decay + 0.02);
}

/**
 * Vibrato that blooms once a note has settled, as a player's does: an LFO whose depth (cents)
 * opens between `from` and `full` seconds in. Connect the result to each oscillator's `detune`.
 */
function vibrato(ctx: BaseAudioContext, t: number, stop: number, rate: number, cents: number, from: number, full: number): GainNode {
  const lfo = osc(ctx, 'sine', rate);
  const depth = ctx.createGain();
  depth.gain.value = 0;
  depth.gain.setValueAtTime(0, t + from);
  depth.gain.linearRampToValueAtTime(cents, t + full);
  lfo.connect(depth);
  lfo.start(t);
  lfo.stop(stop);
  return depth;
}

/** Sets an oscillator's detune (cents), gliding in from the last note when slurred, or scooping up into pitch. */
function tune(o: OscillatorNode, t: number, cents: number, from: number, glide: number): void {
  o.detune.setValueAtTime(cents + from, t);
  o.detune.linearRampToValueAtTime(cents, t + glide);
}

/**
 * Col legno ostinato, a desk of players: each strike a sawtooth through a resonant low-pass
 * snapping shut plus a wooden click, a second player landing a moment late on the other side.
 */
const legno: Voice = (ctx, out, { f, t, vel, dyn }) => {
  const players = dyn < 0.6 ? 1 : 2;
  for (let i = 0; i < players; i++) {
    const at = i === 0 ? t : t + rand(0.006, 0.016);
    const level = vel * (i === 0 ? 1 : 0.6);
    const side = ctx.createStereoPanner();
    side.pan.value = i === 0 ? -0.45 : 0.45;
    side.connect(out);
    const o = osc(ctx, 'sawtooth', f, rand(-6, 6));
    const lp = filter(ctx, 'lowpass', f, 9);
    lp.frequency.setValueAtTime(Math.min(f * (5 + 12 * dyn), 9000), at);
    lp.frequency.exponentialRampToValueAtTime(f * 1.1, at + 0.11);
    o.connect(lp).connect(hit(ctx, at, level, 0.002, 0.16)).connect(side);
    o.start(at);
    o.stop(at + 0.18);
    burst(ctx, side, at, filter(ctx, 'bandpass', rand(2400, 4200), 1.2), level * (0.3 + 0.5 * dyn), 0.001, 0.025);
  }
};

/** A string section's desks: detune (cents) and side (0 left, 1 right). */
const DESKS = [
  [-11, 0],
  [-4, 1],
  [5, 0],
  [12, 1],
] as const;
const LOW_DESKS = [
  [-6, 0],
  [6, 1],
] as const;

/**
 * Strings: detuned sawtooths on either side, each side with its own vibrato, the filter opening
 * with the bow's swell. `tremolo`: the bows shiver, each side at its own speed (held tension).
 * `low`: cellos and basses, a quicker bow, the cellos an octave over the basses.
 */
function stringsVoice({ tremolo = false, low = false } = {}): Voice {
  return (ctx, out, { f, t, dur, vel, dyn, slur }) => {
    const slurred = slur !== undefined;
    const attack = Math.min(slurred ? 0.09 : tremolo ? 0.9 : low ? 0.1 : 0.35, dur * 0.4) * (dyn >= 1 ? 0.6 : 1);
    const release = low ? 0.12 : 0.22;
    const end = t + dur;
    const stop = end + release * 6;
    const open = low ? Math.min(700 + 1300 * dyn, f * 10 + 300) : Math.min(900 + 1500 * dyn, f * 10 + 500);
    const lp = filter(ctx, 'lowpass', open, 0.6);
    lp.frequency.setValueAtTime(open * (slurred ? 0.85 : 0.55), t);
    lp.frequency.linearRampToValueAtTime(open, t + attack);
    lp.frequency.setTargetAtTime(open * 0.6, end, release);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.3, t + attack);
    g.gain.setTargetAtTime(0, end, release);
    const sides = ctx.createChannelMerger(2);
    const inputs = [0, 1].map((side) => {
      const input = ctx.createGain();
      input.connect(sides, 0, side);
      if (tremolo) {
        input.gain.value = 0.55;
        const shiver = osc(ctx, 'triangle', rand(9.5, 12.5));
        const depth = ctx.createGain();
        depth.gain.value = 0.45;
        shiver.connect(depth).connect(input.gain);
        shiver.start(t);
        shiver.stop(stop);
      }
      return { input, wobble: vibrato(ctx, t, stop, rand(4.8, 5.8), low ? 4 : 7, 0.15, 0.55) };
    });
    const play = (cents: number, side: number, octave = 0) => {
      const o = osc(ctx, 'sawtooth', f * 2 ** octave);
      tune(o, t, cents + rand(-3, 3), slurred ? slur * 100 : 0, 0.07);
      const { input, wobble } = inputs[side]!;
      wobble.connect(o.detune);
      o.connect(input);
      o.start(t);
      o.stop(stop);
    };
    for (const [cents, side] of low ? LOW_DESKS : DESKS) play(cents, side);
    if (low) {
      // Cellos an octave up, quieter: they carry the line where the basses' own pitch is cut.
      inputs.forEach((_, side) => play(side ? 4 : -4, side, 1));
    }
    sides.connect(lp).connect(g).connect(out);
    // An accent bites: the bow's hair catching the string.
    if (dyn >= 1 && !slurred && !tremolo) {
      burst(ctx, out, t, filter(ctx, 'bandpass', Math.min(Math.max(f * 4, 800), 3000), 1.5), vel * 0.12, 0.005, 0.09);
    }
  };
}

interface Bell {
  /** How far the filter opens, against the trumpets'. */
  bright: number;
  /** Seconds to full level. */
  attack: number;
  /** Cents below pitch a tongued note starts. */
  scoop: number;
  /** The tongue's spit of air, against the note's level. */
  chiff: number;
  /** Cents of vibrato on a long note. */
  vibrato: number;
}

/**
 * Brass: two sawtooths that scoop up into pitch while the filter blares open and settles, behind
 * a spit of air. A slurred note is only soft-tongued: no scoop, no blare. A louder note opens
 * further (a brass instrument gets brighter as it gets louder).
 */
function brassVoice(k: Bell): Voice {
  return (ctx, out, { f, t, dur, vel, dyn, slur }) => {
    const soft = slur !== undefined;
    const blown = t + k.attack * 2;
    // At least 10 ms after the blare, so a short note's release doesn't land inside it.
    const end = Math.max(t + dur, blown + 0.01);
    const settle = Math.min(f * (1.9 + 1.4 * dyn) * k.bright, 5000);
    const lp = filter(ctx, 'lowpass', f * 1.3, 1.2);
    if (soft) {
      lp.frequency.setValueAtTime(settle * 0.8, t);
      lp.frequency.setTargetAtTime(settle, t, 0.05);
    } else {
      lp.frequency.setValueAtTime(f * 1.3, t);
      lp.frequency.exponentialRampToValueAtTime(Math.min(f * (3.5 + 4.5 * dyn) * k.bright, 7000), blown);
      lp.frequency.setTargetAtTime(settle, blown, 0.18);
    }
    lp.frequency.setTargetAtTime(f * 1.2, end, 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + k.attack);
    g.gain.setTargetAtTime(vel * 0.75, t + k.attack, 0.15);
    g.gain.setTargetAtTime(0, end, 0.09);
    const wobble = k.vibrato > 0 && dur > 0.45 ? vibrato(ctx, t, end + 0.6, rand(5, 5.8), k.vibrato, 0.25, 0.6) : null;
    for (const cents of [-6, 6]) {
      const o = osc(ctx, 'sawtooth', f);
      tune(o, t, cents + rand(-2, 2), soft ? 0 : -k.scoop, 0.06);
      wobble?.connect(o.detune);
      o.connect(lp);
      o.start(t);
      o.stop(end + 0.6);
    }
    lp.connect(g).connect(out);
    if (!soft) {
      burst(ctx, out, t, filter(ctx, 'bandpass', Math.min(Math.max(f * 5, 900), 3500), 1.5), vel * k.chiff * (0.5 + 0.5 * dyn), 0.004, 0.05);
    }
  };
}

/** A kettledrum's modes (ratio to its note, level, seconds of ring); the first is a pair that beats. */
const DRUMHEAD = [
  [1, 1, 1.5],
  [1.008, 0.4, 1.3],
  [1.5, 0.5, 0.85],
  [1.99, 0.28, 0.6],
  [2.44, 0.14, 0.42],
  [2.89, 0.07, 0.3],
] as const;

/**
 * Timpani: the head's modes settling in pitch as they ring, over the mallet's thump. A harder
 * stroke rings longer, starts sharper, and brings out the upper modes and the mallet's knock.
 */
const timpani: Voice = (ctx, out, { f, t, vel, dyn }) => {
  const ring = 0.45 + 0.5 * dyn;
  const sharp = 1.01 + 0.02 * dyn;
  for (const [ratio, amp, decay] of DRUMHEAD) {
    const o = osc(ctx, 'sine', f * ratio);
    o.frequency.setValueAtTime(f * ratio * sharp, t);
    o.frequency.exponentialRampToValueAtTime(f * ratio, t + 0.12);
    const len = decay * ring;
    o.connect(hit(ctx, t, amp * vel * (ratio > 1.4 ? 0.5 + 0.7 * dyn : 1), 0.004, len)).connect(out);
    o.start(t);
    o.stop(t + len + 0.05);
  }
  burst(ctx, out, t, filter(ctx, 'bandpass', 140, 0.9), vel * 0.5, 0.002, 0.06);
  burst(ctx, out, t, filter(ctx, 'bandpass', 1100, 1), vel * 0.3 * dyn * dyn, 0.001, 0.02);
};

/**
 * A field drum: the wires' rattle (a band of noise, and a brighter sizzle on a harder stroke) over
 * the shell's two falling tones. No two strokes quite alike, so a roll doesn't stutter.
 */
const snare: Voice = (ctx, out, { t, vel, dyn }) => {
  const len = 0.1 + 0.1 * dyn;
  burst(ctx, out, t, filter(ctx, 'bandpass', rand(2000, 2600) * (0.8 + 0.3 * dyn), 0.7), vel * 0.75, 0.001, len);
  burst(ctx, out, t, filter(ctx, 'highpass', 5000), vel * 0.35 * dyn, 0.001, len * 0.7);
  for (const [from, to, amp, decay] of [
    [195, 160, 0.5, 0.08],
    [340, 300, 0.25, 0.05],
  ] as const) {
    const o = osc(ctx, 'triangle', from);
    o.frequency.setValueAtTime(from * rand(0.97, 1.03), t);
    o.frequency.exponentialRampToValueAtTime(to, t + decay);
    o.connect(hit(ctx, t, vel * amp, 0.001, decay)).connect(out);
    o.start(t);
    o.stop(t + decay + 0.02);
  }
};

/** Tam-tam: inharmonic partials on either side whose upper ones bloom late, over a swelling band of noise. */
const tamtam: Voice = (ctx, out, { t, vel }) => {
  const ratios = [1, 1.42, 1.93, 2.31, 2.61, 3.17, 3.88, 4.52, 5.31, 6.07, 6.7, 8.1];
  const sides = ctx.createChannelMerger(2);
  sides.connect(out);
  ratios.forEach((ratio, i) => {
    const o = osc(ctx, 'sine', 72 * ratio * rand(0.99, 1.01));
    const len = 4.6 - i * 0.22;
    const partial = hit(ctx, t, (vel * 0.13) / Math.sqrt(i + 1), 0.02 + i * 0.04, len);
    o.connect(partial);
    // The low partials in the middle, the upper ones alternating sides.
    if (i < 3 || i % 2 === 0) partial.connect(sides, 0, 0);
    if (i < 3 || i % 2 === 1) partial.connect(sides, 0, 1);
    o.start(t);
    o.stop(t + len + 0.05);
  });
  const bp = filter(ctx, 'bandpass', 500, 1.5);
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.exponentialRampToValueAtTime(2500, t + 1.2);
  burst(ctx, out, t, bp, vel * 0.2, 0.4, 3.5);
};

/** A cymbal's clangour, the way drum machines voice one: square waves at ratios that share no harmonics. */
const CLANG = [1, 1.483, 1.932, 2.546, 2.63, 3.897];

/** The cymbal's metal and its hiss, summed, until `stop`. */
function metal(ctx: BaseAudioContext, t: number, stop: number): GainNode {
  const sum = ctx.createGain();
  for (const ratio of CLANG) {
    const o = osc(ctx, 'square', 410 * ratio * rand(0.985, 1.015));
    const part = ctx.createGain();
    part.gain.value = 0.12;
    o.connect(part).connect(sum);
    o.start(t);
    o.stop(stop);
  }
  const n = noise(ctx);
  const hiss = ctx.createGain();
  hiss.gain.value = 0.7;
  n.connect(hiss).connect(sum);
  n.start(t, rand(0, 1.5));
  n.stop(stop);
  return sum;
}

/** A crash: the whole plate at once, its body dying first and the shimmer after. */
const cymbal: Voice = (ctx, out, { t, vel, dyn }) => {
  const len = 1.4 + 1.4 * dyn;
  const hp = filter(ctx, 'highpass', 1800, 0.7);
  hp.frequency.setValueAtTime(1800, t);
  hp.frequency.exponentialRampToValueAtTime(5000, t + len * 0.5);
  metal(ctx, t, t + len + 0.05)
    .connect(hp)
    .connect(hit(ctx, t, vel, 0.002, len))
    .connect(out);
};

/** A suspended cymbal rolled with soft sticks: it swells for the note's length, breaks at its end, and rings. */
const swell: Voice = (ctx, out, { t, dur, vel }) => {
  const top = t + dur;
  const ring = 1.2;
  const lp = filter(ctx, 'lowpass', 3500, 0.7);
  lp.frequency.setValueAtTime(3500, t);
  lp.frequency.exponentialRampToValueAtTime(13000, top);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel * 0.02, t);
  g.gain.exponentialRampToValueAtTime(vel, top);
  g.gain.exponentialRampToValueAtTime(0.0003, top + ring);
  metal(ctx, t, top + ring + 0.05)
    .connect(filter(ctx, 'highpass', 2500, 0.7))
    .connect(lp)
    .connect(g)
    .connect(out);
};

/** Glass bells: a sine frequency-modulated at an inharmonic ratio, its brightness dying first, a second a few cents off so it shimmers, over a hum an octave down. */
const glass: Voice = (ctx, out, { f, t, vel, dyn }) => {
  const len = Math.min(4.5, 1 + 900 / f);
  const stop = t + len * 1.2 + 0.05;
  const mod = osc(ctx, 'sine', f * 3.5);
  const index = ctx.createGain();
  index.gain.setValueAtTime(f * (0.5 + 1.0 * dyn), t);
  index.gain.exponentialRampToValueAtTime(f * 0.05, t + len * 0.5);
  mod.connect(index);
  const ringing = hit(ctx, t, vel * 0.36, 0.002, len);
  ringing.connect(out);
  const cars = [0, rand(4, 8)].map((cents) => {
    const car = osc(ctx, 'sine', f, cents);
    index.connect(car.frequency);
    car.connect(ringing);
    return car;
  });
  // The bar's own first overtone: the ping of the strike.
  const ping = osc(ctx, 'sine', f * 2.76);
  ping.connect(hit(ctx, t, vel * 0.1 * dyn, 0.001, len * 0.2)).connect(out);
  const hum = osc(ctx, 'sine', f / 2);
  hum.connect(hit(ctx, t, vel * 0.15, 0.01, len * 1.2)).connect(out);
  for (const o of [mod, ping, hum, ...cars]) {
    o.start(t);
    o.stop(stop);
  }
};

/**
 * A church bell's partials against its strike note (ratio, level, seconds of ring): the hum an
 * octave under, the minor third that makes a bell sound like a bell, the nominal on top.
 */
const BELL = [
  [0.5, 0.5, 6],
  [1, 0.7, 4.5],
  [1.2, 0.6, 3.6],
  [1.5, 0.25, 2.6],
  [2, 1, 2.6],
  [3, 0.4, 1.5],
  [4.07, 0.25, 1],
] as const;

/** A tolling bell: each partial a pair a hair apart, so it warbles as it rings, under the clapper's knock. */
const toll: Voice = (ctx, out, { f, t, vel, dyn }) => {
  for (const [ratio, amp, ring] of BELL) {
    const partial = hit(ctx, t, vel * 0.3 * amp * (ratio > 1.6 ? 0.5 + 0.7 * dyn : 1), 0.003, ring);
    partial.connect(out);
    for (const [bend, level] of [
      [1, 1],
      [1 + rand(0.0012, 0.003), 0.5],
    ] as const) {
      const o = osc(ctx, 'sine', f * ratio * bend);
      const part = ctx.createGain();
      part.gain.value = level;
      o.connect(part).connect(partial);
      o.start(t);
      o.stop(t + ring + 0.05);
    }
  }
  burst(ctx, out, t, filter(ctx, 'bandpass', 1800, 0.8), vel * 0.2 * dyn, 0.001, 0.03);
};

/** Below this (Hz) a bell is a tolling bell; above, glass. */
const TOLL_BELOW = 380;
const bells: Voice = (ctx, out, note) => (note.f < TOLL_BELOW ? toll : glass)(ctx, out, note);

/**
 * A wordless choir, as Tomita voiced one: detuned sawtooths on either side, dulled as a throat
 * dulls them (less so the louder it sings), each side with its own vibrato, a little breath. The
 * vowel is its channel's. Slurred notes slide.
 */
const choir: Voice = (ctx, out, { f, t, dur, vel, dyn, slur }) => {
  const slurred = slur !== undefined;
  const attack = Math.min(slurred ? 0.1 : 0.4, dur * 0.4);
  const end = t + dur;
  const stop = end + 1.3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + attack);
  g.gain.setTargetAtTime(0, end, 0.25);
  g.connect(out);
  const throat = filter(ctx, 'lowpass', Math.min(f * (2.5 + 2 * dyn), 3500), 0.5);
  const sides = ctx.createChannelMerger(2);
  sides.connect(throat).connect(g);
  const wobbles = [0, 1].map(() => vibrato(ctx, t, stop, rand(4.6, 5.6), 14, 0.2, 0.7));
  for (const [cents, side] of DESKS) {
    const o = osc(ctx, 'sawtooth', f);
    tune(o, t, cents + rand(-3, 3), slurred ? slur * 100 : 0, 0.09);
    wobbles[side]!.connect(o.detune);
    o.connect(sides, 0, side);
    o.start(t);
    o.stop(stop);
  }
  const breath = noise(ctx);
  const air = ctx.createGain();
  air.gain.value = 0.04;
  breath.connect(filter(ctx, 'bandpass', 2200, 0.7)).connect(air).connect(g);
  breath.start(t, rand(0, 1.5));
  breath.stop(stop);
};

/** An anvil or a drop forge: a struck bar's inharmonic modes, the high ones dying fast, over a clank of noise. */
const anvil: Voice = (ctx, out, { f, t, vel, dyn }) => {
  const modes = [
    [1, 1, 0.9],
    [2.76, 0.55, 0.5],
    [5.4, 0.35, 0.3],
    [8.93, 0.2, 0.18],
    [13.3, 0.1, 0.1],
  ] as const;
  const bar = f * rand(0.99, 1.01);
  for (const [ratio, amp, decay] of modes) {
    const o = osc(ctx, 'sine', bar * ratio * rand(0.997, 1.003));
    const len = decay * (0.5 + 0.6 * dyn);
    o.connect(hit(ctx, t, amp * vel * 0.5 * (ratio > 5 ? 0.4 + 0.8 * dyn : 1), 0.001, len)).connect(out);
    o.start(t);
    o.stop(t + len + 0.05);
  }
  burst(ctx, out, t, filter(ctx, 'bandpass', rand(3200, 3900), 1.2), vel * 0.4, 0.001, 0.04);
};

/**
 * A double reed (a shawm, an oboe): a narrow pulse and a second a few cents off, scooping into
 * pitch, the vibrato blooming late. Slurred notes slide into each other, so a run snakes. The
 * nasal honk is its channel's.
 */
const reed: Voice = (ctx, out, { f, t, dur, vel, dyn, slur }) => {
  const slurred = slur !== undefined;
  const attack = slurred ? 0.015 : 0.03;
  const end = Math.max(t + dur, t + 0.06);
  const stop = end + 0.4;
  const lp = filter(ctx, 'lowpass', Math.min(f * (4 + 5 * dyn), 6000), 0.7);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + attack);
  g.gain.setTargetAtTime(vel * 0.85, t + attack, 0.1);
  g.gain.setTargetAtTime(0, end, 0.05);
  lp.connect(g).connect(out);
  const wobble = vibrato(ctx, t, stop, rand(5.2, 6), 12, 0.12, 0.5);
  for (const [cents, level] of [
    [0, 1],
    [9, 0.4],
  ] as const) {
    const o = ctx.createOscillator();
    o.setPeriodicWave(pulse(ctx));
    o.frequency.value = f;
    tune(o, t, cents, slurred ? slur * 100 : -40, slurred ? 0.035 : 0.05);
    wobble.connect(o.detune);
    const part = ctx.createGain();
    part.gain.value = level;
    o.connect(part).connect(lp);
    o.start(t);
    o.stop(stop);
  }
  if (!slurred) burst(ctx, out, t, filter(ctx, 'bandpass', 2500, 1), vel * 0.1, 0.005, 0.06);
};

const VOICES: Record<VoiceId, Voice> = {
  legno,
  strings: stringsVoice(),
  tremolo: stringsVoice({ tremolo: true }),
  basses: stringsVoice({ low: true }),
  brass: brassVoice({ bright: 1, attack: 0.035, scoop: 35, chiff: 0.18, vibrato: 4 }),
  lowBrass: brassVoice({ bright: 0.65, attack: 0.035, scoop: 35, chiff: 0.12, vibrato: 0 }),
  horn: brassVoice({ bright: 0.55, attack: 0.05, scoop: 15, chiff: 0.08, vibrato: 0 }),
  timpani,
  snare,
  tamtam,
  cymbal,
  swell,
  bells,
  choir,
  anvil,
  reed,
};

const halls = new WeakMap<BaseAudioContext, AudioBuffer>();

/**
 * A concert hall, made once per audio context (every battle's music shares it). After a short
 * pre-delay, a scatter of early echoes off the stage walls (each ear its own), then the tail
 * building up behind them: noise in three bands, each decaying 60 dB over its own time (`HALL`),
 * so the highs die first.
 */
function hall(ctx: BaseAudioContext): AudioBuffer {
  const have = halls.get(ctx);
  if (have) return have;
  const sr = ctx.sampleRate;
  const len = Math.round(sr * HALL_SECONDS);
  const pre = Math.round(sr * 0.022);
  const buf = ctx.createBuffer(2, len, sr);
  const kLow = 1 - Math.exp((-2 * Math.PI * HALL.lowBelow) / sr);
  const kMid = 1 - Math.exp((-2 * Math.PI * HALL.highAbove) / sr);
  const fall = (seconds: number, rt: number) => Math.exp((-6.9 * seconds) / rt);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let low = 0;
    let mid = 0;
    for (let i = pre; i < len; i++) {
      const s = (i - pre) / sr;
      const x = Math.random() * 2 - 1;
      low += kLow * (x - low);
      mid += kMid * (x - mid);
      const bands = low * fall(s, HALL.low) + (mid - low) * fall(s, HALL.mid) + (x - mid) * fall(s, HALL.high);
      d[i] = 0.07 * Math.min(1, s / 0.06) * bands;
    }
    for (let k = 0; k < 12; k++) {
      const s = 0.003 + Math.random() * 0.07;
      const at = pre + Math.round(s * sr);
      const amp = (Math.random() < 0.5 ? -1 : 1) * (0.75 - 6 * s);
      d[at] = d[at]! + amp;
      d[at + 1] = d[at + 1]! + amp * 0.5;
    }
  }
  halls.set(ctx, buf);
  return buf;
}

/**
 * The music bus: a channel per voice (its insert, its place on the stage) into a dry path and the
 * hall, a low cut, a glue compressor, the master level, then the duck (under the sound effects).
 */
export class MusicEngine {
  private readonly master: GainNode;
  private readonly ducker: GainNode;
  private readonly channels = {} as Record<VoiceId, GainNode>;
  /** The inserts' LFOs, which run for as long as the engine does. */
  private readonly running: OscillatorNode[] = [];
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
      // Always two channels, whether a voice plays to one side, both, or the middle.
      input.channelCount = 2;
      input.channelCountMode = 'explicit';
      input.gain.value = c.level;
      const pan = ctx.createStereoPanner();
      pan.pan.value = c.pan;
      const send = ctx.createGain();
      send.gain.value = c.wet;
      (c.insert?.(ctx, input, this.running) ?? input).connect(pan).connect(dry);
      pan.connect(send).connect(reverb);
      this.channels[id] = input;
    }
  }

  /** Schedules a bar's notes from its downbeat at `start` (context time). */
  playBar(notes: readonly NoteEvent[], start: number, beatSeconds: number): void {
    for (const n of notes) {
      VOICES[n.voice](this.ctx, this.channels[n.voice], {
        f: hz(n.pitch),
        // No two players land together, or strike twice alike.
        t: start + n.beat * beatSeconds + rand(0, CHANNEL[n.voice].loose),
        dur: n.dur * beatSeconds,
        vel: n.vel * rand(0.94, 1.06),
        dyn: n.dyn,
        slur: n.slur,
      });
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
    for (const lfo of this.running) lfo.stop();
  }
}
