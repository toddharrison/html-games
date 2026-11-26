// Sound (SPEC 12.3): ambient loops from M4, synthesized with WebAudio so the game ships no audio files.
// Wind, water, rain, fire, night insects, an elk bugling at dusk in the rut, thunder after lightning,
// and real silence between them. Every sim event passes through `event`, so effects (M6) hook in here.
// The browser only allows sound after a key or click, so `start` is called on the first one.

import { RUT } from '../content/animals.ts';
import { WEATHER } from '../content/weather.ts';
import { T } from '../content/terrain.ts';
import type { GameState, SimEvent } from '../sim/state.ts';
import { burning } from '../sim/surroundings.ts';
import { clock } from '../sim/time.ts';
import { weatherAt, weatherNow } from '../sim/weather.ts';
import { idx, inBounds, type World } from '../sim/world.ts';
import { settings } from '../ui/dom.ts';
import { effect } from './effects.ts';
import { playPiece } from './music.ts';
import { flightNow } from '../sim/arc.ts';
import { FLIGHT_MINUTES } from '../content/arc.ts';

interface Loop {
  gain: GainNode;
  filter: BiquadFilterNode;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private loops: Record<'wind' | 'water' | 'rain' | 'fire' | 'drone', Loop> | null = null;
  /** Pieces already played this run (each plays once). */
  private played = new Set<string>();
  private nextChirp = 0;
  private nextCrackle = 0;
  private nextBugle = 0;
  muted = settings.get<boolean>('muted', false);
  volume = settings.get<number>('volume', 0.8);

  /** Create the audio graph (on the first key or click). */
  start(): void {
    if (this.ctx) return;
    try {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(ctx.destination);
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      const loop = (type: BiquadFilterType, freq: number, q = 0.7): Loop => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = freq;
        filter.Q.value = q;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(filter).connect(gain).connect(this.master!);
        src.start(0, Math.random() * 2);
        return { gain, filter };
      };
      this.loops = { wind: loop('bandpass', 420, 0.6), water: loop('lowpass', 320), rain: loop('highpass', 1400), fire: loop('bandpass', 900, 2), drone: loop('bandpass', 110, 6) };
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    settings.set('muted', m);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.1);
  }

  setVolume(v: number): void {
    this.volume = v;
    settings.set('volume', v);
    if (this.master && this.ctx && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  /** Every frame: fade each loop toward what the survivor would hear now. */
  update(s: GameState | null, w: World | null, speed: number): void {
    const ctx = this.ctx;
    const L = this.loops;
    if (!ctx || !L) return;
    const now = ctx.currentTime;
    const set = (l: Loop, v: number) => l.gain.gain.setTargetAtTime(v, now, 0.6);
    if (!s || !w || s.over || speed > 4) {
      for (const l of Object.values(L)) set(l, 0);
      return;
    }
    const p = s.player;
    const wx = weatherNow(s, w);
    const id = weatherAt(s);
    const band = w.band[idx(p.x, p.y)]!;
    set(L.wind, 0.012 + wx.wind * 0.09 + band * 0.008);
    L.wind.filter.frequency.setTargetAtTime(300 + wx.wind * 500 + 80 * Math.sin(now * 0.3), now, 0.5);
    let water = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      if (!inBounds(p.x + dx, p.y + dy)) continue;
      const t = w.terrain[idx(p.x + dx, p.y + dy)]!;
      if (t === T.shallows || t === T.stream || t === T.gravel || t === T.waterfall) water = Math.max(water, (t === T.waterfall ? 1.6 : t === T.stream || t === T.gravel ? 1.1 : 0.8) * (1 - Math.max(Math.abs(dx), Math.abs(dy)) / 5));
    }
    set(L.water, water * (0.05 + 0.02 * Math.sin(now * 0.8)));
    const wet = WEATHER[id].wet && !wx.snow ? (id === 'drizzle' ? 0.03 : id === 'rain' ? 0.07 : 0.1) : 0;
    set(L.rain, s.sleep && !s.sleep.awake ? wet * 0.5 : wet);
    const fire = s.fires.some((f) => burning(f) && Math.abs(f.x - p.x) <= 4 && Math.abs(f.y - p.y) <= 4);
    set(L.fire, fire ? 0.02 : 0);
    const flight = flightNow(s);
    set(L.drone, flight ? 0.06 * (1 - Math.abs((s.tick - flight.t) / (FLIGHT_MINUTES * 10) - 0.5) * 1.6) : 0);
    if (fire && now > this.nextCrackle) {
      this.nextCrackle = now + 0.05 + Math.random() * 0.4;
      this.burst(1800 + Math.random() * 2000, 0.012 + Math.random() * 0.03, 0.04 + Math.random() * 0.05);
    }
    const c = clock(s.tick);
    const night = c.hour >= 21 || c.hour < 5;
    if (night && c.day < 45 && band <= 1 && !WEATHER[id].wet && now > this.nextChirp) {
      this.nextChirp = now + 0.3 + Math.random() * 1.6;
      this.chirp(3800 + Math.random() * 900);
    }
    if (c.day >= RUT[0] && c.day <= RUT[1] && c.hour >= 18 && c.hour < 21 && now > this.nextBugle) {
      this.nextBugle = now + 25 + Math.random() * 60;
      this.bugle();
    }
  }

  setMusic(m: boolean): void {
    this.music = m;
    settings.set('music', m);
  }

  /** A new run: every piece may play again. */
  newRun(): void {
    this.played.clear();
  }

  /** A sim event: thunder after lightning, the effects, and music at the moments that matter. */
  event(e: SimEvent, s?: GameState): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    if (e.type === 'lightning') setTimeout(() => this.thunder(), 400 + Math.random() * 2500);
    effect(ctx, this.master, this.noise, e);
    const piece =
      e.type === 'fire-lit' && s && (s.memory['fires-lit'] ?? 0) <= 1 ? 'fire' : e.type === 'viewpoint' ? 'view' : e.type === 'snow' ? 'snow' : e.type === 'over' && e.kind === 'rescue' ? 'rescue' : '';
    if (piece && !this.played.has(piece) && this.music) {
      this.played.add(piece);
      playPiece(ctx, this.master, piece);
    }
  }

  music = settings.get<boolean>('music', true);

  private burst(freq: number, gain: number, dur: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private chirp(freq: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    for (let k = 0; k < 3; k++) {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      const at = t + k * 0.07;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.012, at + 0.01);
      g.gain.linearRampToValueAtTime(0, at + 0.04);
      o.connect(g).connect(this.master!);
      o.start(at);
      o.stop(at + 0.05);
    }
  }

  private bugle(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(500, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + 1.2);
    o.frequency.exponentialRampToValueAtTime(900, t + 2.4);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.012, t + 0.4);
    g.gain.linearRampToValueAtTime(0, t + 2.6);
    o.connect(f).connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + 2.7);
  }

  private thunder(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 140;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + 3.6);
  }
}

/** Kept for the step's event hook: the app routes events to its Sound. */
export function playEvents(events: readonly SimEvent[], sound?: Sound, s?: GameState): void {
  if (!sound) return;
  for (const e of events) sound.event(e, s);
}
