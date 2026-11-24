import Phaser from 'phaser';
import { stormy } from '../content/conditions';
import type { PlayerCommand } from '../sim/behemoth';
import type { SimEvent } from '../sim/events';
import type { World } from '../sim/world';
import { AlarmWatch, CueLimiter, cuesFor, engineState, HOLDS, place, reactorState, trainSound, WHISTLE_RUN, WhistleClock, type Cue, type CueContext, type HoldId, type Listener, type SoundId } from './cues';
import { duckFor } from './music/duck';
import { HeatGauge } from './music/heat';
import { MusicPlayer } from './music/player';
import { PIECES } from './music/scores';
import { Synth } from './synth';

/**
 * The battle's sound (SPEC §11.4): turns each frame's sim events into placed one-shots and keeps
 * the engine, treads, and reactor loops following the Behemoth's state. Heard from the Behemoth.
 * Trains have their own loops (wheels on the rails, an engine at work), and their engines whistle
 * now and then on the run (`WHISTLE_RUN`): the armored train's lead engine, and the nearest attack train's.
 * Also runs the music: the biome's piece, fed by a heat gauge, ducking under the big sounds.
 * Render-side, like the effects; null when the browser has no Web Audio.
 */
/** Seconds the music takes to fade out after extraction. */
const MUSIC_OUTRO = 3;

export class BattleAudio {
  private readonly alarms = new AlarmWatch();
  private readonly limiter = new CueLimiter();
  private listener: Listener = { x: 0, y: 0 };
  private fuseStart: number | null = null;
  private readonly whistles = { main: new WhistleClock(WHISTLE_RUN.main), raid: new WhistleClock(WHISTLE_RUN.raid) };
  /** An engine was bearing down on the hull last frame (its danger signal sounds once, as that begins). */
  private warned = false;
  private dead = false;
  private paused = false;
  private music: MusicPlayer | null = null;
  private heat: HeatGauge | null = null;

  private constructor(
    private readonly synth: Synth,
    private readonly out: AudioNode,
  ) {
    synth.startMachine();
  }

  static create(scene: Phaser.Scene): BattleAudio | null {
    const sm = scene.sound;
    if (!(sm instanceof Phaser.Sound.WebAudioSoundManager)) return null;
    const audio = new BattleAudio(new Synth(sm.context, sm.destination), sm.destination);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      audio.synth.destroy();
      audio.music?.destroy();
    });
    return audio;
  }

  /** The music starts with the first frame, once the battle's biome is known. */
  private startMusic(w: World): void {
    const piece = PIECES[w.terrain.recipe.biome];
    const heat = new HeatGauge((id) => id in piece.themes);
    this.heat = heat;
    this.music = new MusicPlayer(this.synth.ctx, this.out, piece, () => heat.read(w));
    if (this.paused) this.music.setPaused(true);
  }

  handle(events: readonly SimEvent[], w: World, wet: (x: number, y: number) => boolean): void {
    if (!this.music) this.startMusic(w);
    this.heat!.observe(events, w.time);
    const b = w.behemoth;
    // The battlefield's middle is the screen's: the camera doesn't move sideways.
    if (!b.destroyed) this.listener = { x: b.x, y: b.y, center: w.terrain.height / 2 };
    const ctx: CueContext = { tileSize: w.terrain.tileSize, wet };
    const cues: Cue[] = [];
    for (const ev of events) {
      cues.push(...cuesFor(ev, ctx));
      if (ev.type === 'componentDamaged') {
        const alarm = this.alarms.check(b, ev.component);
        if (alarm) cues.push(alarm);
      } else if (ev.type === 'reactorCritical') this.fuseStart = ev.fuse;
      else if (ev.type === 'extracted') this.music?.fadeOut(MUSIC_OUTRO);
      else if (ev.type === 'detonation') {
        this.dead = true;
        this.synth.stopMachine();
        this.music?.detonate();
      }
    }
    this.sound(cues);
  }

  /** Places the cues for the listener and plays what the limiter lets through, ducking the music under the big ones. */
  private sound(cues: readonly Cue[]): void {
    const items = cues.map((cue) => ({ cue, at: place(this.listener, cue) }));
    for (const { cue, at } of this.limiter.filter(items, this.synth.ctx.currentTime)) {
      if (HOLDS.has(cue.sound)) {
        this.synth.hold(cue.sound as HoldId, at);
        continue;
      }
      this.synth.play(cue.sound as SoundId, cue.size, at, cue.signal);
      const duck = duckFor(cue.sound as SoundId, cue.size, at);
      if (duck) this.music?.duck(duck);
    }
  }

  update(w: World, cmd: PlayerCommand, wet: (x: number, y: number) => boolean): void {
    const b = w.behemoth;
    const c = w.condition;
    this.synth.setWeather(c ? (stormy(c.id) ? 'storm' : 'night') : null, c?.squall ?? 0);
    // The trains roll on whatever has become of the Behemoth.
    const train = trainSound(w, this.listener);
    this.synth.setTrain(train);
    if (train) {
      const due: (Cue | null)[] = [this.whistles.main.tick(w.time, train.lead, Math.random), this.whistles.raid.tick(w.time, train.raider, Math.random)];
      const d = train.danger;
      if (d && !this.warned) due.push({ sound: d.raid ? 'raidWhistle' : 'trainWhistle', size: 1, x: d.x, y: d.y, carry: WHISTLE_RUN.main.carry, signal: 'danger' });
      this.warned = !!d;
      this.sound(due.filter((cue) => cue !== null));
    }
    if (this.dead) return;
    const cruiseFrac = b.chassis.speed.cruise / b.chassis.speed.top;
    this.synth.update(engineState(b, cmd), wet(b.x, b.y), cruiseFrac, reactorState(b, this.fuseStart));
  }

  /** Salvage reaching the hull (render-side: the motes land after the sim banks it). */
  pickup(amount: number): void {
    if (this.dead) return;
    this.sound([{ sound: 'pickup', size: Math.min(1, 0.4 + amount / 30) }]);
  }

  /** The music's state for the debug overlay. */
  musicStatus(): string | null {
    return this.music?.status() ?? null;
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.synth.setPaused(paused);
    this.music?.setPaused(paused);
  }
}
