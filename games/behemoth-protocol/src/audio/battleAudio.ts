import Phaser from 'phaser';
import type { PlayerCommand } from '../sim/behemoth';
import type { SimEvent } from '../sim/events';
import type { World } from '../sim/world';
import { AlarmWatch, CueLimiter, cuesFor, engineState, HOLDS, place, reactorState, type Cue, type CueContext, type HoldId, type Placement, type SoundId } from './cues';
import { Synth } from './synth';

/**
 * The battle's sound (SPEC §11.4): turns each frame's sim events into placed one-shots and keeps
 * the engine, treads, and reactor loops following the Behemoth's state. Heard from the Behemoth.
 * Render-side, like the effects; null when the browser has no Web Audio.
 */
export class BattleAudio {
  private readonly alarms = new AlarmWatch();
  private readonly limiter = new CueLimiter();
  private listener = { x: 0, y: 0 };
  private fuseStart: number | null = null;
  private dead = false;
  private paused = false;

  private constructor(private readonly synth: Synth) {
    synth.startMachine();
  }

  static create(scene: Phaser.Scene): BattleAudio | null {
    const sm = scene.sound;
    if (!(sm instanceof Phaser.Sound.WebAudioSoundManager)) return null;
    const audio = new BattleAudio(new Synth(sm.context, sm.destination));
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => audio.synth.destroy());
    return audio;
  }

  handle(events: readonly SimEvent[], w: World, wet: (x: number, y: number) => boolean): void {
    const b = w.behemoth;
    if (!b.destroyed) this.listener = { x: b.x, y: b.y };
    const ctx: CueContext = { tileSize: w.terrain.tileSize, wet };
    const items: { cue: Cue; at: Placement }[] = [];
    const add = (cue: Cue | null) => cue && items.push({ cue, at: place(this.listener, cue) });
    for (const ev of events) {
      for (const cue of cuesFor(ev, ctx)) add(cue);
      if (ev.type === 'componentDamaged') add(this.alarms.check(b, ev.component));
      else if (ev.type === 'reactorCritical') this.fuseStart = ev.fuse;
      else if (ev.type === 'detonation') {
        this.dead = true;
        this.synth.stopMachine();
      }
    }
    for (const { cue, at } of this.limiter.filter(items, this.synth.ctx.currentTime)) {
      if (HOLDS.has(cue.sound)) this.synth.hold(cue.sound as HoldId, at);
      else this.synth.play(cue.sound as SoundId, cue.size, at);
    }
  }

  update(w: World, cmd: PlayerCommand, wet: (x: number, y: number) => boolean): void {
    const b = w.behemoth;
    this.synth.setWeather(w.condition?.id ?? null, w.condition?.squall ?? 0);
    if (this.dead) return;
    const cruiseFrac = b.chassis.speed.cruise / b.chassis.speed.top;
    this.synth.update(engineState(b, cmd), wet(b.x, b.y), cruiseFrac, reactorState(b, this.fuseStart));
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.synth.setPaused(paused);
  }
}
