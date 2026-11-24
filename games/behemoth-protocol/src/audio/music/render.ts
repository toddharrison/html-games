import { place, TUNNEL_SOUND, WHISTLE_SIGNALS, type EngineState, type HoldId, type ReactorState, type SoundId, type WhistleSignal } from '../cues';
import { Synth } from '../synth';
import { barEvents, timeline, type BarPlan, type MusicInput } from './director';
import { duckFor } from './duck';
import { MusicEngine } from './engine';
import { writeMidi } from './midi';
import { barSeconds, layer, type Piece, type VoiceId } from './score';
import { PIECES } from './scores';

/**
 * Offline renders for listening outside the game (dev only; nothing in the game imports this).
 * `npm run render:music` loads it in headless Chrome and writes each piece's WAV and MIDI.
 */

const SAMPLE_RATE = 44100;
const TAIL_SECONDS = 4;

const bars = (n: number, heat: number, bosses: string[] = [], downed: string[] = []): MusicInput[] =>
  Array.from({ length: n }, (_, i) => ({ heat, bosses, downed: i === 0 ? downed : [] }));

/**
 * The demo run, for listening: half the piece at each of the lower levels (the theme at level 0,
 * the climb at level 1), then right through at each of the upper two, then a siege tank arrives
 * and is killed, and the fight cools.
 */
export const DEMO: MusicInput[] = [
  ...bars(8, 0.05),
  ...bars(8, 0.2),
  ...bars(16, 0.4),
  ...bars(16, 0.8),
  ...bars(12, 0.8, ['siegeTank']),
  ...bars(4, 0.35, [], ['siegeTank']),
  ...bars(4, 0.05),
];

/** The battle render's run (`battle` follows it bar for bar): a short fight that builds level by level to a siege tank. */
export const SKIRMISH: MusicInput[] = [
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
  byBar(ctx, plans, bar, (plan, start) => engine.playBar(barEvents(piece, plan), start, beat));
  const audio = await ctx.startRendering();
  const log = plans.map(
    (p) => `${String(p.bar + 1).padStart(2)} L${p.level} ${p.layers.join(' ')}${p.stingers.map((s) => ` [${s.id}]`).join('')}`,
  );
  const data = [audio.getChannelData(0), audio.getChannelData(1)];
  return { name, wav: base64(wav(data, audio.sampleRate)), mid: base64(writeMidi(notes, piece.tempo, piece.beatsPerBar, piece.beatUnit)), log };
}

/**
 * Schedules each bar just before its downbeat, as the live player does, by pausing the render
 * there: the graph only ever holds a bar or two of notes, so a render is fast and its time is a
 * fair measure of what the music costs in a battle.
 */
function byBar(ctx: OfflineAudioContext, plans: readonly BarPlan[], bar: number, play: (plan: BarPlan, start: number) => void): void {
  const QUANTUM = 128;
  plans.forEach((plan, i) => {
    const start = i * bar;
    const frame = Math.floor(((start - 0.1) * ctx.sampleRate) / QUANTUM) * QUANTUM;
    if (frame <= 0) return play(plan, start);
    void ctx.suspend(frame / ctx.sampleRate).then(() => {
      play(plan, start);
      void ctx.resume();
    });
  });
}

/** Each voice alone, in its register: two bars (4/4 at `AUDITION_TEMPO`), then a bar to ring out. */
const AUDITION: Record<VoiceId, string> = {
  legno: "C3:1/3! C3' C3' C3:1 C3:1/2 C3' C3:1! | G2:1/2! G2' G3 G2' G2! G2' G3 G2'",
  strings: 'C3+G3+C4:4 | C3+Ab3+Db4+F4:2 G4:1 C5:1',
  tremolo: 'C4+G4:4 | C4+Gb4:4',
  basses: 'C3:1! G2:1 Ab2:1 Bb2:1 | C3:2! G2:2',
  brass: 'G3:3! C4:1 | D4:1 Eb4:1 F4:2!',
  lowBrass: 'C3+C4:3! Gb2+Gb3:1 | G2+G3:4',
  horn: '.:3 G3:1/3 G3 G3 | C4:2! Bb3:1 G3:1',
  timpani: 'C3:1! G2:1 C3:1/3! C3 C3 C3:1! | G2:1/6*12 C3:2!',
  snare: "D2:1/3! D2' D2' D2:1 D2:1/2' D2' D2:1! | D2:1/6*18 D2:1!",
  tamtam: 'E3:4! | .:4',
  cymbal: "E4:2! E4:2' | .:4",
  swell: '.:2 E4:2 | .:4',
  bells: 'B5:1/2! E5 C6 F5 .:2 | Bb3:4!',
  choir: 'B4:3! G4:1 | A4:2 B4:2',
  anvil: "D5:1! D5:1 D5:1/2' D5' D5:1! | .:4",
  reed: 'A4:1.5! Bb4:1/2 A4 G4 F#4 G4 | F#4:2 G4:1/2 A4 Bb4 C5',
};
const AUDITION_TEMPO = 96;
/** Bars each voice gets: two to play, one to ring. */
const SLOT = 3;

/** Every instrument in turn, alone in the hall, for judging (and comparing) the sounds themselves. */
async function renderVoices(): Promise<Render> {
  const ids = Object.keys(AUDITION) as VoiceId[];
  const rest = (n: number) => Array.from({ length: n }, () => '.:4');
  // A piece with a part per voice, each silent but for its own slot.
  const piece: Piece = {
    id: 'voices',
    tempo: AUDITION_TEMPO,
    beatsPerBar: 4,
    layers: Object.fromEntries(
      ids.map((voice, i) => [voice, layer(voice, 1, [...rest(i * SLOT), AUDITION[voice], ...rest((ids.length - i) * SLOT - 2)].join(' | '), 4)]),
    ),
    levels: [ids],
    thresholds: [],
    stingers: {},
    themes: {},
  };
  const { plans } = timeline(piece, bars(ids.length * SLOT, 0));
  const bar = barSeconds(piece);
  const ctx = new OfflineAudioContext(2, Math.ceil((plans.length * bar + TAIL_SECONDS) * SAMPLE_RATE), SAMPLE_RATE);
  const engine = new MusicEngine(ctx, ctx.destination);
  byBar(ctx, plans, bar, (plan, start) => engine.playBar(barEvents(piece, plan), start, bar / 4));
  const audio = await ctx.startRendering();
  const log = ids.map((voice, i) => `${(i * SLOT * bar).toFixed(1).padStart(6)} s  ${voice}`);
  return { name: 'voices', wav: base64(wav([audio.getChannelData(0), audio.getChannelData(1)], audio.sampleRate)), log };
}

/**
 * The sound effects alone (`sounds`), the instruments alone (`voices`), then every piece: its demo
 * and the scripted battle. `only` stops short: the battles are slow, and a change to one sound or
 * one voice only needs its audition.
 */
export async function renderAll(only?: 'sounds' | 'voices' | 'demos'): Promise<Render[]> {
  if (only === 'sounds') return [await renderSounds()];
  const out: Render[] = [await renderSounds(), await renderVoices()];
  if (only === 'voices') return out.slice(1);
  for (const piece of new Set(Object.values(PIECES))) {
    out.push(await render(`${piece.id}-demo`, piece, DEMO));
    if (!only) out.push(await renderBattle(piece));
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
 * A battle's worth of real sound effects that follows `SKIRMISH`'s story bar for bar: a quiet
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
      if (rng() < 0.5) for (let i = 0; i < 6; i++) at(t + i * 0.08, 'machineGun', 0.3);
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
    at(t, 'howitzer', 0.95, 220, 30);
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
 * The scripted battle through the game's own sound effects (`Synth`) with the music (`SKIRMISH`)
 * ducking under it, rendered as stems in one pass: the sound effects on channels 1–2, the music on
 * 3–4. The render pauses every step to fire that step's sounds and update the engine loop, as
 * the battle scene would each frame. Writes their sum, and reports how far each kind of sound
 * stands above the music in the moment it lands.
 */
async function renderBattle(piece: Piece): Promise<Render> {
  const { plans } = timeline(piece, SKIRMISH);
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
  // Bars are scheduled a little ahead as the render steps, as the live player does.
  let planned = 0;
  const plan = (until: number) => {
    for (; planned < plans.length && planned * bar < until; planned++) {
      music.playBar(barEvents(piece, plans[planned]!), planned * bar, bar / piece.beatsPerBar);
    }
  };
  plan(0.3);
  const sfx = battle(bar);
  let next = 0;
  for (let frame = STEP; frame < ctx.length - STEP; frame += STEP) {
    const t = frame / SAMPLE_RATE;
    void ctx.suspend(t).then(() => {
      voices.voices = 0;
      plan(t + 0.3);
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

/** One entry of the sound effects' audition: a sound (or a burst of it), its size, how far off, and how long it gets. */
interface Take {
  name: string;
  sound: SoundId;
  size: number;
  /** Sim units ahead of the Behemoth; missing = on board. */
  far?: number;
  /** Shots in the burst and seconds between them. */
  burst?: [count: number, every: number];
  seconds: number;
  /** What a whistle says. */
  signal?: WhistleSignal;
}

const take = (name: string, sound: SoundId, size: number, seconds: number, far?: number, burst?: [number, number]): Take => ({ name, sound, size, seconds, far, burst });
const whistle = (sound: 'trainWhistle' | 'raidWhistle', signal: WhistleSignal, far: number): Take => ({
  name: `${sound}: ${signal}`,
  sound,
  size: 1,
  seconds: WHISTLE_SIGNALS[signal].reduce((a, blast) => a + blast + 0.45, 2),
  far,
  signal,
});

/** Every one-shot at the sizes and distances the game plays it, each alone. */
const TAKES: Take[] = [
  take('cannon: own main gun', 'cannon', 0.8, 3.5, 20),
  take('cannon: light tank, mid', 'cannon', 0.3, 2.5, 200),
  take('cannon: heavy tank, far', 'cannon', 0.55, 3, 350),
  take('howitzer: own', 'howitzer', 1, 4.5, 20),
  take('howitzer: battery, far', 'howitzer', 1, 4.5, 400),
  take('autocannon: own', 'autocannon', 0.6, 2, 20, [3, 0.25]),
  take('autocannon: flak', 'autocannon', 0.9, 2, 20),
  take('autocannon: tower, mid', 'autocannon', 0.4, 2, 220, [3, 0.25]),
  take('rotary: own burst', 'rotary', 0.5, 2, 20, [10, 0.05]),
  take('machineGun: AP burst', 'machineGun', 0.3, 2, 20, [8, 0.08]),
  take('machineGun: point defense', 'machineGun', 0.25, 2, 20, [8, 0.06]),
  take('mortar', 'mortar', 0.7, 2, 20),
  take('missile: rack', 'missile', 0.6, 3, 20),
  take('missile: ballistic', 'missile', 1.4, 3.5, 20),
  take('missile: enemy launcher, far', 'missile', 0.5, 3, 300),
  take('rocket: infantry, mid', 'rocket', 0.4, 2, 180),
  take('pulseLaser', 'pulseLaser', 0.45, 1.5, 20, [3, 0.2]),
  take('heavyLaser', 'heavyLaser', 1, 4, 20),
  take('plasmaShot', 'plasmaShot', 0.7, 2, 20),
  take('airburst', 'airburst', 0.4, 1.5, 100),
  take('explosion: small, mid', 'explosion', 0.5, 4, 180),
  take('explosion: big, close', 'explosion', 1.2, 6, 60),
  take('plasmaSplash', 'plasmaSplash', 0.6, 4, 150),
  take('splash', 'splash', 0.8, 3, 150),
  take('impact', 'impact', 0.4, 1.5, 60, [3, 0.3]),
  take('pierce: rear', 'pierce', 1, 1.5, 150),
  take('ricochet', 'ricochet', 0.5, 2.5, 150, [4, 0.5]),
  take('hullHit: light', 'hullHit', 0.4, 2.5, 10),
  take('hullHit: heavy', 'hullHit', 1.2, 3.5, 10),
  take('vehicleKill', 'vehicleKill', 0.85, 5, 150),
  take('crush', 'crush', 1, 2, 20),
  take('wood', 'wood', 1, 2, 40),
  take('collapse', 'collapse', 1, 4, 100),
  take('ram', 'ram', 1, 2.5, 25),
  take('clank: reload', 'clank', 0.4, 2),
  take('clank: jettison', 'clank', 1, 2.5),
  take('droneLost', 'droneLost', 0.3, 2.5, 80),
  take('revive', 'revive', 1, 3),
  take('componentBlown', 'componentBlown', 1, 4),
  take('immobilized', 'immobilized', 1, 3.5),
  take('alarm: reactor', 'alarm', 1, 1.5),
  take('alarm: component', 'alarm', 0.6, 1.5),
  take('missileWarning', 'missileWarning', 1, 1.2),
  take('lockOn', 'lockOn', 1, 1.5, 200),
  take('incoming', 'incoming', 1.6, 2.5, 200),
  take('horn', 'horn', 1, 5),
  take('radio', 'radio', 1, 1.5),
  take('pickup', 'pickup', 0.6, 1, undefined, [3, 0.15]),
  take('emp', 'emp', 1, 3, 20),
  take('railgun', 'railgun', 1, 3, 20),
  take('coilgun', 'railgun', 0.45, 2, 20),
  take('arc: projector', 'arc', 1, 2.5, 20),
  take('arc: tesla', 'arc', 0.35, 1.5, 20, [3, 0.25]),
  take('thunder', 'thunder', 1, 6, 300),
  whistle('trainWhistle', 'depart', 600),
  whistle('trainWhistle', 'run', 400),
  whistle('trainWhistle', 'crossing', 400),
  whistle('trainWhistle', 'long', 250),
  whistle('trainWhistle', 'toot', 400),
  whistle('trainWhistle', 'danger', 60),
  whistle('raidWhistle', 'raid', 300),
  whistle('raidWhistle', 'toot', 150),
  whistle('raidWhistle', 'run', 150),
  whistle('raidWhistle', 'danger', 60),
  take('derail', 'derail', 1, 3, 150),
  take('trainBrakes', 'trainBrakes', 1, 5, 200),
  take('couplings: struck', 'couplings', 0.7, 2.5, 60),
  take('couplings: a long train left standing', 'couplings', 1, 3, 200),
  take('steam: an engine destroyed', 'steam', 1, 5, 150),
  take('detonation', 'detonation', 2, 10),
];

const HOLD_TAKES: HoldId[] = ['beam', 'scrape', 'burn', 'flame'];
const HOLD_SECONDS = 2;
/** The drive: idling, pulling away, cruising, flat out, on wrecked treads, then fording. Three seconds each. */
const DRIVES: [name: string, state: EngineState, wet: boolean][] = [
  ['engine: crawling', { speed: 0.15, load: 0.2, treadWear: 0, running: true }, false],
  ['engine: pulling away', { speed: 0.35, load: 1, treadWear: 0, running: true }, false],
  ['engine: cruise', { speed: 0.6, load: 0.5, treadWear: 0.1, running: true }, false],
  ['engine: flat out', { speed: 1, load: 0.9, treadWear: 0.1, running: true }, false],
  ['engine: wrecked treads', { speed: 0.4, load: 0.7, treadWear: 0.9, running: true }, false],
  ['engine: fording', { speed: 0.5, load: 0.7, treadWear: 0.1, running: true }, true],
];
const DRIVE_SECONDS = 3;
const MELTDOWN_SECONDS = 5;
/** A train (its wheels and its nearest engine): how fast it rolls, how hard the engine works, how far off, and whether it's in a tunnel. Four seconds each. */
const TRAINS: [name: string, roll: number, work: number, far: number, under: boolean][] = [
  ['train: alongside, full pace', 1, 1, 110, false],
  ['train: alongside, slowed', 0.5, 0.5, 110, false],
  ['train: across the field', 1, 1, 260, false],
  ['train: in a tunnel', 1, 1, 110, true],
  ['train: coasting cars, no engine', 0.6, 0, 110, false],
];
const TRAIN_SECONDS = 4;

/**
 * Every sound effect in turn, alone, through the game's `Synth`: the one-shots (`TAKES`), the held
 * sounds, the drive at each of its states, and the reactor running up to a meltdown. For judging
 * (and comparing) the sounds themselves; start times in the `.txt`.
 */
async function renderSounds(): Promise<Render> {
  const total = TAKES.reduce((a, t) => a + t.seconds, 0) + HOLD_TAKES.length * (HOLD_SECONDS + 1) + DRIVES.length * DRIVE_SECONDS + MELTDOWN_SECONDS + TRAINS.length * TRAIN_SECONDS + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE);
  const synth = new Synth(ctx as unknown as AudioContext, ctx.destination);
  Object.defineProperty(synth, 'running', { get: () => true });
  const voices = synth as unknown as { voices: number };
  // What happens when: one-shots as (time, play), and what to keep doing over a span.
  const shots: { t: number; go: () => void }[] = [];
  const spans: { from: number; to: number; each: () => void }[] = [];
  const log: string[] = [];
  let at = 0.1;
  const mark = (name: string) => log.push(`${at.toFixed(1).padStart(6)} s  ${name}`);
  for (const k of TAKES) {
    mark(`${k.name} (${k.sound} ${k.size}${k.far === undefined ? ', on board' : `, ${k.far} off`})`);
    const [count, every] = k.burst ?? [1, 0];
    const placed = place({ x: 0, y: 0 }, k.far === undefined ? {} : { x: k.far, y: k.far * 0.3 });
    for (let i = 0; i < count; i++) shots.push({ t: at + i * every, go: () => synth.play(k.sound, k.size, placed, k.signal) });
    at += k.seconds;
  }
  for (const id of HOLD_TAKES) {
    mark(`${id} (held)`);
    const placed = place({ x: 0, y: 0 }, { x: 30, y: 10 });
    spans.push({ from: at, to: at + HOLD_SECONDS, each: () => synth.hold(id, placed) });
    at += HOLD_SECONDS + 1;
  }
  const quiet: ReactorState = { charge: 0.8, damage: 0, meltdown: 0 };
  shots.push({ t: at, go: () => synth.startMachine() });
  for (const [name, state, wet] of DRIVES) {
    mark(name);
    spans.push({ from: at, to: at + DRIVE_SECONDS, each: () => synth.update(state, wet, CRUISE_FRAC, quiet) });
    at += DRIVE_SECONDS;
  }
  mark('reactor: meltdown');
  const from = at;
  spans.push({
    from,
    to: at + MELTDOWN_SECONDS,
    each: () => synth.update(DRIVES[0]![1], false, CRUISE_FRAC, { charge: 0.8, damage: 0.6, meltdown: Math.min(1, (ctx.currentTime - from) / (MELTDOWN_SECONDS - 1)) }),
  });
  at += MELTDOWN_SECONDS;
  shots.push({ t: at, go: () => synth.stopMachine() });
  at += 1;
  for (const [name, roll, work, far, under] of TRAINS) {
    mark(name);
    const heard = place({ x: 0, y: 0 }, { x: far * 0.3, y: far });
    if (under) {
      heard.gain *= TUNNEL_SOUND.gain;
      heard.distance += TUNNEL_SOUND.muffle;
    }
    spans.push({ from: at, to: at + TRAIN_SECONDS, each: () => synth.setTrain({ roll, rolling: heard, work, engine: heard, lead: null, raider: null, danger: null }) });
    at += TRAIN_SECONDS;
  }
  const stood = { gain: 0, pan: 0, distance: 0 };
  shots.push({ t: at, go: () => synth.setTrain({ roll: 0, rolling: stood, work: 0, engine: stood, lead: null, raider: null, danger: null }) });
  shots.sort((a, b) => a.t - b.t);

  const QUANTUM = 128 * 4;
  let next = 0;
  for (let frame = QUANTUM; frame < ctx.length - QUANTUM; frame += QUANTUM) {
    const t = frame / SAMPLE_RATE;
    void ctx.suspend(t).then(() => {
      voices.voices = 0;
      // The held sounds fade when nothing triggers them (the game calls this every frame).
      synth.update({ speed: 0, load: 0, treadWear: 0, running: false }, false, CRUISE_FRAC, quiet);
      for (; next < shots.length && shots[next]!.t < t + QUANTUM / SAMPLE_RATE; next++) shots[next]!.go();
      for (const s of spans) if (t >= s.from && t < s.to) s.each();
      void ctx.resume();
    });
  }
  const audio = await ctx.startRendering();
  return { name: 'sounds', wav: base64(wav([audio.getChannelData(0), audio.getChannelData(1)], audio.sampleRate)), log };
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
