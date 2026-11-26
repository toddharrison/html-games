// Sound effects (SPEC 12.3): about twenty small sounds for sim events, synthesized from noise and
// oscillators. Quiet, short, and never on top of each other for long: silence matters as much.

import { T } from '../content/terrain.ts';
import type { SimEvent } from '../sim/state.ts';

/** A burst of filtered noise. */
function noise(ctx: AudioContext, out: AudioNode, buf: AudioBuffer, o: { type: BiquadFilterType; freq: number; q?: number; gain: number; dur: number; at?: number; sweep?: number }): void {
  const t = ctx.currentTime + (o.at ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + o.dur);
  f.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(o.gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 1.5, o.dur + 0.05);
}

/** A soft tone. */
export function tone(ctx: AudioContext, out: AudioNode, o: { freq: number; gain: number; dur: number; at?: number; type?: OscillatorType; to?: number }): void {
  const t = ctx.currentTime + (o.at ?? 0);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'triangle';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

let lastStep = 0;

export function effect(ctx: AudioContext, out: AudioNode, buf: AudioBuffer, e: SimEvent): void {
  switch (e.type) {
    case 'step': {
      // Footsteps, by what's underfoot; not every step, so they don't patter.
      if (ctx.currentTime - lastStep < 0.28) return;
      lastStep = ctx.currentTime;
      const t = e.terrain;
      if (t === T.shallows || t === T.stream || t === T.gravel) noise(ctx, out, buf, { type: 'bandpass', freq: 900, q: 0.8, gain: 0.05, dur: 0.22, sweep: 400 });
      else if (t === T.talus || t === T.scree || t === T.boulders || t === T.rock) noise(ctx, out, buf, { type: 'bandpass', freq: 2600, q: 2, gain: 0.03, dur: 0.07 });
      else if (t === T.snow) noise(ctx, out, buf, { type: 'lowpass', freq: 1200, gain: 0.03, dur: 0.12 });
      else if (t === T.sand || t === T.reeds || t === T.marsh) noise(ctx, out, buf, { type: 'highpass', freq: 2000, gain: 0.015, dur: 0.1 });
      else noise(ctx, out, buf, { type: 'lowpass', freq: 500, gain: 0.035, dur: 0.08 });
      return;
    }
    case 'bump':
      noise(ctx, out, buf, { type: 'lowpass', freq: 220, gain: 0.08, dur: 0.12 });
      return;
    case 'pickup':
      noise(ctx, out, buf, { type: 'bandpass', freq: 3000, q: 1.5, gain: 0.025, dur: 0.12 });
      return;
    case 'eat':
      for (let k = 0; k < 3; k++) noise(ctx, out, buf, { type: 'bandpass', freq: 1500, q: 3, gain: 0.03, dur: 0.06, at: k * 0.16 });
      return;
    case 'drink':
      for (let k = 0; k < 3; k++) tone(ctx, out, { freq: 420 + k * 40, to: 260, gain: 0.03, dur: 0.12, at: k * 0.22, type: 'sine' });
      return;
    case 'task-start':
      if (/wood|cut|boughs|bark|deadfall/.test(e.action)) for (let k = 0; k < 3; k++) noise(ctx, out, buf, { type: 'bandpass', freq: 700, q: 4, gain: 0.06, dur: 0.09, at: k * 0.5 });
      else if (/strike/.test(e.action)) noise(ctx, out, buf, { type: 'highpass', freq: 4000, gain: 0.05, dur: 0.05 });
      return;
    case 'fire-lit':
      noise(ctx, out, buf, { type: 'bandpass', freq: 300, q: 0.7, gain: 0.09, dur: 1.2, sweep: 1400 });
      return;
    case 'sick':
      tone(ctx, out, { freq: 160, to: 110, gain: 0.04, dur: 0.8, type: 'sine' });
      return;
    case 'discovery':
      tone(ctx, out, { freq: 660, gain: 0.025, dur: 0.6, type: 'sine' });
      tone(ctx, out, { freq: 990, gain: 0.02, dur: 0.9, at: 0.18, type: 'sine' });
      return;
    case 'animal':
      if (e.what === 'warn') noise(ctx, out, buf, { type: 'lowpass', freq: 180, q: 4, gain: 0.25, dur: 0.9 });
      else if (e.what === 'attack') noise(ctx, out, buf, { type: 'lowpass', freq: 400, gain: 0.3, dur: 0.6 });
      return;
    case 'sleep':
    case 'wake':
      tone(ctx, out, { freq: e.type === 'sleep' ? 330 : 440, to: e.type === 'sleep' ? 220 : 520, gain: 0.015, dur: 0.7, type: 'sine' });
      return;
    case 'storm':
    case 'slide':
      noise(ctx, out, buf, { type: 'lowpass', freq: 90, gain: 0.5, dur: 6 });
      return;
    default:
      return;
  }
}
