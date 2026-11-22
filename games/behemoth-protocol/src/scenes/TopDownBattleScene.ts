import { DETONATION, TRAILER_MINE } from '../content/tuning';
import Phaser from 'phaser';
import { BattleAudio } from '../audio/battleAudio';
import { toggleMute } from '../audio/mute';
import { battleLayout, battleLengthFromUrl, conditionFromUrl, doctrineFromUrl, cookOffAtFromUrl, immobilizeAtFromUrl, modeFromUrl, recipeFromUrl, RESOLUTION, type BattleLayout } from '../config';
import { Controls } from '../input/controls';
import { BehemothView, TrackMarks } from '../render/compositor';
import { Effects } from '../render/effects';
import { Hud, type HudRun } from '../render/hud';
import { capturePose, Interp, pose } from '../render/interp';
import { ENEMY_ART, TILE } from '../render/placeholder';
import { TerrainView } from '../render/terrainView';
import { ThreatIndicators } from '../render/threatIndicators';
import { TrailerView } from '../render/trailerView';
import { DroneViews } from '../render/droneView';
import { PoolViews } from '../render/poolView';
import { BarrageViews } from '../render/barrageView';
import { WeatherView } from '../render/weatherView';
import { CONDITIONS, conditionName } from '../content/conditions';
import { sightRadius } from '../sim/conditions';
import { UnitViews } from '../render/unitViews';
import { ComponentFx, componentAnchors, hullToSim, trailerPartAt, UnitFx, type UnitStatus } from '../render/statusFx';
import { canSelfDestruct, damageComponent, damageTreads, firingBinding, hitched } from '../sim/behemoth';
import { FixedStepper, SIM_DT } from '../sim/loop';
import { createWorld, START_X, stepWorld, type World } from '../sim/world';
import { OBSTACLE_CLASSES } from '../content/obstacles';
import { isWet, MATERIALS } from '../content/terrain';
import { WEAPONS } from '../content/weapons';
import { IDLE_COMMAND, type PlayerCommand } from '../sim/behemoth';
import { missileLockTarget } from '../sim/weapons';
import { roundSpec } from '../sim/projectiles';
import { viewX, viewY } from '../render/viewTransform';
import {
  battleAlertPace,
  battleCondition,
  battleEnemy,
  battleLength,
  battleObjective,
  battlePar,
  battleRecipe,
  battleSeed,
  completeBattle,
  directiveAsk,
  isObjectiveBattle,
  recipeName,
  requiredTargets,
  summarizeRun,
} from '../sim/run';
import { DIRECTIVES } from '../content/directives';
import type { EnemyId } from '../content/enemies';
import { isFinalNode } from '../sim/sectorMap';
import { MODES } from '../content/modes';
import { objectiveComplete } from '../sim/objective';
import { FONT_KEY, fontText } from '../render/pixelFont';
import { hex, PAL } from '../render/palette';
import { checkpoint, endRun, enterNode, randomSeed, showSummary, type RunContext } from './flow';
import { DEMO, demoClip, type DemoClip } from './demo';
import { demoCommand } from '../input/demoBot';
import { newRun } from '../sim/run';
import { APPROACHES } from '../content/approaches';
import { BIOMES } from '../content/biomes';
import { fitCamera } from './screen';

/** Seconds the battle keeps running after extraction before the depot opens. */
const OUTRO_TIME = 2.5;

/**
 * Top-down battle (SPEC §4.1), scrolling vertically: the Behemoth drives up a centered column
 * with HUD panels on both sides. Owns no game rules: it turns input into commands, steps the sim
 * at a fixed 60 Hz, renders the sim state, and turns sim events into effects.
 */
export class TopDownBattleScene extends Phaser.Scene {
  private world!: World;
  private stepper!: FixedStepper;
  private controls!: Controls;
  private terrainView!: TerrainView;
  private behemothView!: BehemothView;
  private trailerView: TrailerView | null = null;
  private tracks!: TrackMarks;
  private units!: UnitViews;
  private drones!: DroneViews;
  private pools!: PoolViews;
  private barrages!: BarrageViews;
  /** The condition's veil and weather (SPEC §4.6); null for a clear battle. */
  private weather: WeatherView | null = null;
  private fx!: Effects;
  private status!: ComponentFx;
  private unitFx!: UnitFx;
  /** Null in the title's attract mode. */
  private hud: Hud | null = null;
  private audio: BattleAudio | null = null;
  private threats: ThreatIndicators | null = null;
  private reticle!: Phaser.GameObjects.Image;
  private lockMark!: Phaser.GameObjects.Image;
  private lastCmd: PlayerCommand = IDLE_COMMAND;
  private layout!: BattleLayout;
  private paused = false;
  private showDebug = false;
  private readonly interp = new Interp();
  private smokeTimer = 0;
  /** Sim time the latest last-stand wave was announced. */
  private waveShownAt: number | null = null;
  /** Sim time the alert clock's latest reinforcement wave was announced. */
  private alertShownAt: number | null = null;
  /** The latest objective call (a target destroyed or lost, the objective done) and when (sim time). */
  private objectiveShown: { at: number; text: string } | null = null;
  /** When the latest squall began building (sim time), for its banner. */
  private squallShownAt: number | null = null;
  /** When the drones' revive worked or failed (sim time), for the message over the field. */
  private reviveShown: { at: number; ok: boolean } | null = null;
  private dustTimer = 0;
  private ctx!: RunContext;
  /** Set once the Behemoth extracts: the run with this battle won, and seconds until the depot. */
  private won: RunContext | null = null;
  private outro = 0;
  /** Texture key of the still frame taken as the reactor went, for the run summary; null until then. */
  private shot: string | null = null;
  /** Scene time (ms) the reactor went; the death message waits until the still is taken. */
  private detonatedAt: number | null = null;
  /** The title's attract mode (`DemoBattleScene`): the clip being shown, and seconds left of it. */
  protected demo: DemoClip | null = null;
  private demoLeft = 0;

  constructor(key = 'battle') {
    super(key);
  }

  init(data: RunContext & { demo?: DemoClip }): void {
    this.ctx = data;
    this.demo = data.demo ?? null;
    this.won = null;
    this.outro = 0;
    this.shot = null;
    this.detonatedAt = null;
  }

  create(): void {
    // Layout is in game pixels; the camera zooms them up to whole screen pixels.
    const { height } = RESOLUTION;
    const demo = this.demo;
    // The attract mode fills the screen with battlefield: no HUD panels.
    this.layout = demo ? fullWidthLayout() : battleLayout(RESOLUTION, TILE);
    fitCamera(this);
    const run = this.ctx.run;

    // The sim's frame runs along the direction of travel (screen height); its lateral rows span
    // the battlefield column.
    const recipe = demo ? { biome: demo.biome, approach: demo.approach } : battleRecipe(run, recipeFromUrl());
    this.world = createWorld({
      seed: battleSeed(run),
      recipe,
      frameWidth: height,
      fieldRows: this.layout.fieldTiles,
      behemoth: run.behemoth,
      ...battleEnemy(run, recipe, demo ? undefined : doctrineFromUrl()),
      ...(demo ? { threat: demo.threat, battleLength: demo.battleLength } : { battleLength: battleLengthFromUrl() ?? battleLength(run), alertPace: battleAlertPace(run) }),
      objective: demo ? { mode: demo.mode, strength: 'normal' } : battleObjective(run, modeFromUrl()),
      condition: demo ? demo.condition : battleCondition(run, conditionFromUrl()),
    });
    if (demo) this.prerollDemo(demo);
    this.stepper = new FixedStepper();
    if (!demo) this.controls = new Controls(this);
    this.terrainView = new TerrainView(this, this.world.terrain);
    this.behemothView = new BehemothView(this, this.world.behemoth);
    this.behemothView.root.setDepth(5);
    const trailer = this.world.behemoth.trailer;
    this.trailerView = trailer ? new TrailerView(this, trailer) : null;
    this.trailerView?.root.setDepth(4.5);
    this.tracks = new TrackMarks(this, Math.ceil((height + 120) / 3) * 2);
    this.units = new UnitViews(this);
    this.drones = new DroneViews(this);
    this.pools = new PoolViews(this);
    this.barrages = new BarrageViews(this);
    this.weather = WeatherView.create(this, this.layout, this.world);
    this.fx = new Effects(this);
    // The attract mode is silent: the title shouldn't blare before anyone has asked to play.
    this.audio = demo ? null : BattleAudio.create(this);
    this.status = new ComponentFx();
    this.unitFx = new UnitFx();
    this.hud = demo
      ? null
      : new Hud(this, this.layout, this.world.behemoth, {
          battle: run.battle + 1,
          salvage: run.salvage,
          where: recipeName(this.world.terrain.recipe),
          callsign: run.callsign,
          ...(this.world.condition ? { condition: conditionName(this.world.condition.id, this.world.terrain.recipe.biome) } : {}),
          ...(this.objectiveBattle() ? { directive: this.directiveInfo() } : {}),
        });
    this.drawExtractionLine();
    this.threats = demo ? null : new ThreatIndicators(this, this.layout);
    this.reticle = this.add.image(0, 0, 'reticle').setScrollFactor(0).setDepth(200).setVisible(!demo);
    if (!demo) {
      // The reticle stands in for the system cursor in battle; the menus get it back.
      this.input.setDefaultCursor('none');
      this.events.once('shutdown', () => this.input.setDefaultCursor('default'));
    } else {
      this.startDemo(demo);
    }
    this.lockMark = this.add.image(0, 0, 'lock').setDepth(9).setVisible(false);
    this.paused = false;
    this.waveShownAt = null;
    this.alertShownAt = null;
    this.squallShownAt = null;
    this.reviveShown = null;
    // The mode's goal, called at the start (SPEC §4.4); a sector's objective, the Directive's ask (SPEC §3).
    const mode = MODES[this.world.objective.mode];
    this.objectiveShown = this.world.objective.total > 0 ? { at: 0, text: `${mode.name}\n${mode.goal}` } : null;
    if (this.objectiveBattle()) {
      const head = run.at && isFinalNode(run.map, run.at) ? 'Final objective' : `Sector ${(run.at?.sector ?? 0) + 1} objective`;
      this.objectiveShown = { at: 0, text: `${head}\n${directiveAsk(run.directive, run.behemoth.chassis, this.par())}` };
    }

    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this));

    this.syncCamera();
    this.render(0);
  }

  private onBlur(): void {
    this.paused = true;
  }

  /** A sector's objective battle in a real run (not the attract mode). */
  private objectiveBattle(): boolean {
    return !this.demo && isObjectiveBattle(this.ctx.run);
  }

  /** The battle's par (Breakthrough), from its actual length (a practice `?exit` changes it). */
  private par(): number | null {
    return battlePar(this.ctx.run, this.world.exitX - START_X);
  }

  /** The Directive's ask for the HUD. */
  private directiveInfo(): NonNullable<HudRun['directive']> {
    const goal = DIRECTIVES[this.ctx.run.directive].goal;
    const total = this.world.objective.total;
    return { goal, par: this.par(), need: goal.kind === 'share' && total > 0 ? requiredTargets(goal.share, total) : null };
  }

  /** The run summary for a destroyed run: the run so far plus this battle, and the blast's still. */
  private toSummary(): void {
    const w = this.world;
    const stand = w.lastStand ? { time: w.lastStand.time, wave: w.lastStand.wave } : null;
    showSummary(this, { summary: summarizeRun(this.ctx.run, { stats: w.stats, time: w.time, stand }), shot: this.shot });
  }

  /** A still of the battlefield column as the blast fills it (SPEC §5.1: the summary's replay frame). */
  private takeShot(): void {
    const scale = this.cameras.main.zoom;
    const { fieldX, fieldW, height } = this.layout;
    try {
      this.game.renderer.snapshotArea(Math.round(fieldX * scale), 0, Math.round(fieldW * scale), Math.round(height * scale), (img) => {
        if (!(img instanceof HTMLImageElement) || !this.sys.isActive()) return;
        const add = () => {
          if (this.textures.exists(SHOT_KEY)) this.textures.remove(SHOT_KEY);
          this.textures.addImage(SHOT_KEY, img);
          this.shot = SHOT_KEY;
        };
        // The image decodes asynchronously; the summary just goes without a still if it never does.
        if (img.complete) add();
        else img.onload = add;
      });
    } catch {
      // No still on a renderer that can't take one.
    }
  }

  /** Hazard stripes across the field at the extraction line, with a label. */
  private drawExtractionLine(): void {
    const w = this.world;
    const y = viewY(w.exitX);
    const fieldW = w.terrain.height;
    const g = this.add.graphics().setDepth(1.5);
    g.fillStyle(hex(PAL.outline), 0.6).fillRect(0, y - 3, fieldW, 6);
    for (let x = 0; x < fieldW; x += 8) {
      g.fillStyle(hex(PAL.amber)).fillRect(x, y - 2, 4, 4);
      g.fillStyle(hex(PAL.steelDark)).fillRect(x + 4, y - 2, 4, 4);
    }
    this.add.bitmapText(fieldW / 2, y - 6, FONT_KEY, fontText('Extraction')).setOrigin(0.5, 1).setTint(hex(PAL.amber)).setDepth(1.5);
  }

  override update(_time: number, deltaMs: number): void {
    if (this.demo) {
      this.updateDemo(deltaMs / 1000);
      return;
    }
    if (this.world.behemoth.destroyed && this.controls.summaryPressed()) {
      this.toSummary();
      return;
    }
    if (this.controls.restartPressed()) {
      // After the reactor goes, a real run is over: on to its summary. Otherwise R retries this
      // battle from its start (playtest convenience, like resuming a save mid-battle).
      if (this.world.behemoth.destroyed && this.ctx.persist) this.toSummary();
      else if (!this.won) this.scene.restart(this.ctx);
      return;
    }
    if (this.won && !this.paused) {
      this.outro -= deltaMs / 1000;
      if (this.outro <= 0) {
        enterNode(this, this.won);
        return;
      }
    }
    if (this.controls.pausePressed()) this.paused = !this.paused;
    if (this.controls.debugPressed()) this.showDebug = !this.showDebug;
    if (this.controls.mutePressed()) toggleMute(this.sound);
    this.audio?.setPaused(this.paused);

    const p = this.input.activePointer;
    const zoom = this.cameras.main.zoom;
    this.reticle.setPosition(Math.round(p.x / zoom), Math.round(p.y / zoom));

    const dt = deltaMs / 1000;
    if (!this.paused) {
      const steps = this.stepper.advance(dt * this.simTimeScale());
      const cmd = this.controls.command(this.cameras.main);
      this.lastCmd = cmd;
      const wreckAt = immobilizeAtFromUrl();
      const cookAt = cookOffAtFromUrl();
      for (let i = 0; i < steps; i++) {
        this.capture();
        // Once: a revive by the drones must not be undone straight away.
        if (wreckAt !== null && this.world.time >= wreckAt && !this.world.behemoth.immobilized && !this.world.revived) {
          damageTreads(this.world.behemoth, Infinity, this.world.events);
        }
        if (cookAt !== null && this.world.time >= cookAt && this.world.behemoth.magazine.hp > 0) {
          damageComponent(this.world.behemoth, 'magazine', Infinity, this.world.events);
        }
        stepWorld(this.world, cmd);
        // One-shot inputs apply once, however many sim steps this frame runs.
        cmd.toggleAuto = null;
      }
      this.interp.alpha = this.stepper.alpha;
      this.syncCamera();
      this.audio?.handle(this.world.events, this.world, this.wetAt);
      this.audio?.update(this.world, cmd, this.wetAt);
      this.handleEvents();
      this.render(dt);
    } else {
      this.stepper.reset();
    }

    const hud = this.hud!;
    hud.update(this.world, this.paused ? 0 : dt);
    // The last stand's messages, and the alert banner, sit at the top of the field, out of the fight's way.
    const top =
      (this.world.lastStand !== null || this.alertBanner() !== null || this.objectiveBanner() !== null || this.conditionBanner() !== null) &&
      !this.world.behemoth.destroyed &&
      !this.paused;
    hud.message(this.statusMessage(), top);
    hud.setDebug(this.showDebug ? this.debugLines() : null);
  }

  // ── Attract mode (the title's background) ─────────────────────────────────────────────────────

  /** Runs the clip's battle ahead unseen, so it opens mid-fight. */
  private prerollDemo(clip: DemoClip): void {
    const w = this.world;
    // The first reinforcements come early: there's only time for a glimpse.
    w.encounter.alert.next = Math.min(w.encounter.alert.next, clip.preroll + 3);
    for (let t = 0; t < clip.preroll && !w.behemoth.destroyed && w.extractedAt === null; t += SIM_DT) {
      stepWorld(w, demoCommand(w));
      w.events.length = 0;
    }
  }

  /** The clip's caption and fade-in; the scene sits below the title. */
  private startDemo(clip: DemoClip): void {
    this.demoLeft = clip.length;
    this.scene.sendToBack();
    const { height } = this.layout;
    const where = clip.approach ? `${BIOMES[clip.biome].name} - ${APPROACHES[clip.approach].name}` : BIOMES[clip.biome].name;
    const mode = MODES[clip.mode].name;
    const weather = clip.condition ? ` - ${conditionName(clip.condition, clip.biome)}` : '';
    this.add.bitmapText(6, height - 6, FONT_KEY, fontText(`${where}\n${mode}${weather}`)).setOrigin(0, 1).setTint(hex(PAL.hudText)).setScrollFactor(0).setDepth(150);
    this.cameras.main.fadeIn(DEMO.fade * 1000);
  }

  /** The autopilot plays the clip; when it's done (or the battle ends), fade to the next one. */
  private updateDemo(dt: number): void {
    const w = this.world;
    const steps = this.stepper.advance(dt);
    for (let i = 0; i < steps; i++) {
      this.capture();
      const cmd = demoCommand(w);
      this.lastCmd = cmd;
      stepWorld(w, cmd);
    }
    this.interp.alpha = this.stepper.alpha;
    this.syncCamera();
    this.handleEvents();
    this.render(dt);
    const before = this.demoLeft;
    this.demoLeft -= dt;
    // An extraction ends the clip early (the line would scroll by into empty ground); a detonation
    // plays out first.
    if (w.extractedAt !== null && this.demoLeft > DEMO.fade + 1) this.demoLeft = DEMO.fade + 1;
    if (before > DEMO.fade && this.demoLeft <= DEMO.fade) {
      this.cameras.main.fadeOut(DEMO.fade * 1000);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart());
    }
  }

  /** Slow-motion beat in the last moments before the reactor goes (SPEC §5.1). */
  private simTimeScale(): number {
    const fuse = this.world.behemoth.reactorFuse;
    return fuse !== null && fuse < 0.5 ? 0.3 : 1;
  }

  private statusMessage(): string | null {
    const w = this.world;
    const b = w.behemoth;
    if (this.paused) return 'Paused - Esc to resume';
    const ls = w.lastStand;
    if (b.destroyed) {
      // Kept off the field until the summary's still has been taken.
      if (this.detonatedAt !== null && this.time.now - this.detonatedAt < SHOT_DELAY_MS + 200) return null;
      const n = w.stats.blastKills;
      const stand = ls ? `\nHeld out ${Math.floor(ls.time)}s against ${ls.wave} ${ls.wave === 1 ? 'wave' : 'waves'}` : '';
      const battles = this.ctx.run.battle;
      const run = `\nRun over after ${battles} ${battles === 1 ? 'battle' : 'battles'} won`;
      return `Reactor detonated\n${this.ctx.run.callsign} is lost\n${n} destroyed in the blast${stand}${run}\n${this.ctx.persist ? 'Enter - run summary' : 'Enter - run summary   R - restart'}`;
    }
    if (this.won) {
      const r = this.won.run;
      const taken = r.lastBattle?.taken;
      const head =
        r.next === 'won'
          ? 'Extracted\nDirective complete'
          : r.next === 'failed'
            ? 'Extracted\nDirective failed'
            : taken !== undefined
              ? `Extracted\nSector objective ${taken ? 'taken' : 'missed'}`
              : `Extracted\nBattle ${r.battle} won`;
      const o = r.lastBattle?.objective;
      const names = MODES[w.objective.mode].target;
      return o && names ? `${head}\n${o.destroyed} of ${o.total} ${names[1]} destroyed` : head;
    }
    const blink = Math.floor(w.time * 6) % 2 === 0;
    if (b.reactorFuse !== null) return blink ? 'Reactor critical!' : ' ';
    const sinceRevive = this.reviveShown ? w.time - this.reviveShown.at : Infinity;
    if (this.reviveShown?.ok && sinceRevive < 2.5) return 'Drones revived the treads\nGet moving!';
    const t = hitched(b);
    if (t && t.jettisonHeld > 0) {
      const n = 12;
      const filled = Math.round((t.jettisonHeld / TRAILER_MINE.jettisonHold) * n);
      return `Jettison trailer\n${'#'.repeat(filled)}${'-'.repeat(n - filled)}`;
    }
    if (canSelfDestruct(b)) {
      let head = 'Reactor critical';
      if (ls) {
        // Announce each wave for a few seconds as it comes in.
        const sinceWave = this.waveShownAt === null ? Infinity : w.time - this.waveShownAt;
        if (w.revive) {
          // The drones are on it: the work bar instead of the wave call.
          const reviver = hitched(b)?.bays.find((bay) => bay?.def.kind === 'drones');
          const need = reviver?.def.kind === 'drones' ? reviver.def.revive.work : 1;
          const n = 12;
          const filled = Math.min(n, Math.round((w.revive.work / need) * n));
          head = `Immobilized - drones reviving\n${'#'.repeat(filled)}${'-'.repeat(n - filled)}`;
        } else if (this.reviveShown && !this.reviveShown.ok && sinceRevive < 2.5) head = 'Drones lost - revive failed';
        else if (ls.time < 3) head = 'Immobilized - last stand';
        else if (sinceWave < 2.5) head = blink ? `Wave ${ls.wave} incoming` : ' ';
        else head = `Last stand - wave ${ls.wave}`;
      }
      const n = 12;
      const filled = Math.round((b.selfDestructHeld / DETONATION.selfDestructHold) * n);
      const progress = b.selfDestructHeld > 0 ? `\n${'#'.repeat(filled)}${'-'.repeat(n - filled)}` : '';
      return `${head}\nHold X - final protocol${progress}`;
    }
    return this.objectiveBanner() ?? this.alertBanner() ?? this.conditionBanner();
  }

  /**
   * The condition (SPEC §4.6), called at the start (after the objective's call, if there is one),
   * and each squall as it builds.
   */
  private conditionBanner(): string | null {
    const w = this.world;
    const c = w.condition;
    if (!c || w.lastStand || w.extractedAt !== null) return null;
    const start = this.objectiveShown?.at === 0 ? 3 : 0;
    const name = conditionName(c.id, w.terrain.recipe.biome);
    if (w.time >= start && w.time < start + 3) return c.id === 'night' ? CONDITIONS.night.banner : `${name}\n${CONDITIONS.storm.banner}`;
    if (this.squallShownAt !== null && w.time - this.squallShownAt < 2.5) return `${name}: squall\nSight closing in`;
    return null;
  }

  /** For a few seconds after an objective call: the goal at the start, each target, the outcome. */
  private objectiveBanner(): string | null {
    const w = this.world;
    const o = this.objectiveShown;
    if (!o || w.time - o.at > 3 || w.lastStand || w.extractedAt !== null) return null;
    return o.text;
  }

  /** The banner for an objective event (SPEC §4.4). */
  private objectiveCall(what: 'destroyed' | 'lost', done: boolean, enemy: EnemyId): string {
    const o = this.world.objective;
    const names = MODES[o.mode].target ?? ['target', 'targets'];
    if (enemy === 'commandPost') return what === 'destroyed' ? 'Command post destroyed\nReinforcements cut off' : 'Command post bypassed\nObjective missed';
    // A sector objective's share of the convoy (Interdiction): the moment it's taken.
    const goal = this.objectiveBattle() ? DIRECTIVES[this.ctx.run.directive].goal : null;
    if (what === 'destroyed' && goal?.kind === 'share' && o.destroyed === requiredTargets(goal.share, o.total) && !done) {
      const left = o.total - o.destroyed - o.lost;
      return `Convoy stopped\nObjective taken - ${left} ${left === 1 ? names[0] : names[1]} left`;
    }
    if (done) {
      if (objectiveComplete(o)) return o.mode === 'breach' ? 'Fortress breached\nEvery gun silenced' : 'Convoy destroyed\nNothing got away';
      return o.destroyed === 0 ? `Objective failed\nNo ${names[1]} destroyed` : `Objective over\n${o.destroyed} of ${o.total} ${names[1]} destroyed`;
    }
    const left = o.total - o.destroyed - o.lost;
    const tail = `${left} ${left === 1 ? names[0] : names[1]} left`;
    if (what === 'destroyed') return `${names[0][0]!.toUpperCase()}${names[0].slice(1)} destroyed\n${tail}`;
    return o.mode === 'chase' ? `A ${names[0]} got away\n${tail}` : `A ${names[0]} left behind\n${tail}`;
  }

  /** For a few seconds after the alert clock sends a wave (SPEC §4.2): it's on its way. */
  private alertBanner(): string | null {
    const w = this.world;
    if (this.alertShownAt === null || w.time - this.alertShownAt > 2.5 || w.lastStand || w.extractedAt !== null) return null;
    return `Enemy reinforcements\nWave ${w.encounter.alert.wave}`;
  }

  /**
   * Screen shake with its amplitude in game pixels. Phaser's intensity is a fraction of the
   * camera size, applied with zoom twice over, so it's converted here to stay the same on every
   * render scale.
   */
  /** Whether a sim point is in a river (shallows or deep water). */
  private wet(x: number, y: number): boolean {
    const t = this.world.terrain.tileAt(x, y);
    return t !== undefined && isWet(t.mat);
  }

  private readonly wetAt = (x: number, y: number): boolean => this.wet(x, y);

  private shake(ms: number, gamePx: number): void {
    const cam = this.cameras.main;
    cam.shake(ms, gamePx / (cam.width * cam.zoom));
  }

  /** Remember what's drawn before a sim step, for render interpolation. */
  private capture(): void {
    const w = this.world;
    this.interp.capture(w.frame, [w.frame.left]);
    capturePose(this.interp, w.behemoth);
    for (const t of w.behemoth.turrets) this.interp.capture(t, [t.angle]);
    if (w.behemoth.trailer) capturePose(this.interp, w.behemoth.trailer);
    for (const m of w.mines) capturePose(this.interp, m);
    for (const d of w.drones) capturePose(this.interp, d);
    for (const e of w.enemies) capturePose(this.interp, e, e.turret);
    for (const p of w.projectiles) capturePose(this.interp, p);
  }

  private syncCamera(): void {
    // View y = -sim x, so the frame's trailing edge (sim x = left) lands on the bottom of the screen.
    // Scroll moves in whole *screen* pixels, so everything placed on whole game pixels (tiles,
    // trees, decals) stays locked together while the view glides.
    const cam = this.cameras.main;
    const { fieldX, height } = this.layout;
    const left = this.interp.lerp(this.world.frame, 0, this.world.frame.left);
    cam.setScroll(-fieldX, Math.round((-left - height) * cam.zoom) / cam.zoom);
  }

  private render(dt: number): void {
    const w = this.world;
    const b = w.behemoth;
    this.terrainView.update(w.frame.left, this.layout.height, w.time);
    const bp = pose(this.interp, b);
    const rings = b.turrets.map((t) => this.interp.lerpAngle(t, 0, t.angle));
    this.behemothView.update(b, bp, rings, dt, w.time);
    this.trailerView?.update(b, w.mines, this.interp, dt, w.time);
    this.tracks.update(this.behemothView, b, (x, y) => this.wet(x, y));
    this.units.update(w.enemies, w.projectiles, this.interp, dt, w.frame.left - 64);
    // Damaged vehicles spark, smoke, and burn. Hidden units give nothing away.
    const damaged: UnitStatus[] = [];
    for (const e of w.enemies) {
      if (!e.alive || e.hidden || e.def.mobility === 'foot') continue;
      const at = pose(this.interp, e, e.turret);
      damaged.push({ id: e.id, x: at.x, y: at.y, frac: e.hp / e.def.hp, radius: e.def.radius });
    }
    this.unitFx.update(damaged, dt, this.fx);
    this.drones.update(w.drones, this.interp, dt, w.time, this.fx);
    this.pools.update(w.pools, dt, w.time, this.fx);
    this.barrages.update(w.barrages, w.time);
    this.weather?.update(w, this.interp, this.cameras.main, dt);
    this.threats?.update(w.enemies, w.frame, w.time);
    this.updateLockMark();
    for (const p of w.projectiles) {
      if (p.alive && p.kind === 'missile' && Math.random() < 0.7) {
        const at = pose(this.interp, p);
        this.fx.missileTrail(at.x, at.y);
      }
    }

    if (b.destroyed) return;
    // Damage shows on the machine itself (SPEC §11.3): each damaged component sparks, smokes, or
    // burns where it sits; the whole hull pours smoke once the reactor is going. Dust from the treads.
    const towed = hitched(b);
    this.status.update(b, bp, dt, this.fx, towed ? pose(this.interp, towed) : undefined);
    this.smokeTimer -= dt;
    if (b.reactorFuse !== null && this.smokeTimer <= 0) {
      this.smokeTimer = 0.03;
      this.fx.smokePuff(b.x - 8 + Math.random() * 16, b.y - 6 + Math.random() * 12);
    }
    this.dustTimer -= dt * (b.vx / b.chassis.speed.cruise);
    if (b.vx > 1 && this.dustTimer <= 0) {
      this.dustTimer = 0.18;
      // In a river the treads throw up spray instead of dust.
      for (const r of this.behemothView.treadRears(b)) (this.wet(r.x, r.y) ? this.fx.wake(r.x, r.y) : this.fx.treadDust(r.x, r.y));
    }
  }

  /**
   * Missile lock bracket: on the unit a salvo would lock on to (while a rack on a trigger is
   * ready), or on the one a salvo in flight is locked on to. Racks on Auto pick their own.
   */
  private updateLockMark(): void {
    const w = this.world;
    const b = w.behemoth;
    const racks = b.hardpoints.filter((h) => h.weapon?.projectile.kind === 'missile' && h.integrity.hp > 0 && firingBinding(b, h) !== 'auto');
    const rack = racks.find((h) => h.salvo) ?? racks.find((h) => h.cooldown <= 0 && (h.ammo ?? 1) > 0) ?? racks[0];
    let id: number | null = null;
    if (rack?.salvo) id = rack.salvo.targetId;
    else if (rack?.weapon && rack.cooldown <= 0 && (rack.ammo ?? 1) > 0 && !w.behemoth.destroyed) {
      const spec = roundSpec(rack.weapon);
      if (spec.kind === 'missile') id = missileLockTarget(w, this.lastCmd.aimX, this.lastCmd.aimY, spec.lockRadius)?.id ?? null;
    }
    // A salvo keeps homing on a unit that slips back into the trees, but the bracket mustn't show where.
    const e = id === null ? undefined : w.enemies.find((en) => en.id === id && en.alive && !en.hidden);
    if (!e) {
      this.lockMark.setVisible(false);
      return;
    }
    const at = pose(this.interp, e);
    const pulse = rack?.salvo ? 1 : 0.6 + 0.4 * Math.sin(w.time * 10);
    this.lockMark.setPosition(viewX(at.x, at.y), viewY(at.x)).setAlpha(pulse).setVisible(true);
  }

  private handleEvents(): void {
    const w = this.world;
    const cam = this.cameras.main;
    const ts = w.terrain.tileSize;
    this.weather?.handle(w.events);
    for (const ev of w.events) {
      switch (ev.type) {
        case 'fire': {
          const role = WEAPONS[ev.weapon].role;
          if (ev.owner === 'player') this.behemothView.onFire(ev.slot ?? '', ev.weapon);
          // Lasers make no muzzle flash: the beam event draws them.
          if (WEAPONS[ev.weapon].projectile.kind === 'beam') {
            if (role === 'main') this.shake(50, 0.5);
          } else if (ev.owner === 'player' && role === 'main') {
            const m = (ev.slot && this.behemothView.muzzle(w.behemoth, ev.slot)) || ev;
            this.fx.muzzle(m.x, m.y, m.angle, true);
            this.shake(80, 1);
          } else if (role === 'missile') {
            this.fx.smokePuff(ev.x, ev.y);
          } else {
            this.fx.muzzle(ev.x, ev.y, ev.angle, false);
          }
          break;
        }
        case 'intercept':
          this.fx.beam(ev.x0, ev.y0, ev.x, ev.y, ev.hit);
          break;
        case 'beam':
          this.fx.laser(ev.x0, ev.y0, ev.x1, ev.y1, WEAPONS[ev.weapon].size ?? 'M', ev.hit);
          break;
        case 'plasmaBurn':
          this.fx.plasmaBurn(ev.x, ev.y);
          break;
        case 'explosion':
          // A shell landing in a river splashes; nothing to scorch.
          if (this.wet(ev.x, ev.y)) {
            this.fx.splash(ev.x, ev.y, ev.radius);
            break;
          }
          if (ev.plasma) this.fx.plasmaBurst(ev.x, ev.y, ev.radius);
          else this.fx.explosion(ev.x, ev.y, ev.radius);
          this.units.addDecal('scorch', ev.x, ev.y, Math.random() * Math.PI * 2, 1.5);
          break;
        case 'impact':
          this.fx.impact(ev.x, ev.y);
          break;
        case 'facingHit':
          this.fx.weakSpot(ev.x, ev.y, ev.facing === 'rear');
          break;
        case 'behemothHit':
          this.behemothView.onHit(ev.arc);
          this.fx.hullHit(ev.x, ev.y, ev.damage);
          this.hud?.flash(ev.arc);
          break;
        case 'componentDamaged':
          this.hud?.flash(ev.component);
          break;
        case 'componentDestroyed': {
          // Blows up where the part sits (one of the pods, for the treads; on the trailer, for its parts).
          const b = w.behemoth;
          const anchors = componentAnchors(b, ev.component);
          const at =
            trailerPartAt(b, ev.component) ??
            hullToSim({ x: b.x, y: b.y, heading: b.heading, turret: 0 }, anchors[Math.floor(Math.random() * anchors.length)]!);
          this.fx.bigExplosion(at.x, at.y);
          this.shake(200, 4);
          break;
        }
        case 'cookOff': {
          // At the magazine: vented, a jet out of the deck; otherwise the hull is torn open from inside.
          const b = w.behemoth;
          const at = hullToSim({ x: b.x, y: b.y, heading: b.heading, turret: 0 }, componentAnchors(b, 'magazine')[0]!);
          if (ev.vented) {
            this.fx.vent(at.x, at.y);
            this.shake(300, 5);
          } else {
            this.fx.bigExplosion(at.x, at.y);
            this.time.delayedCall(150, () => this.fx.bigExplosion(at.x + 6, at.y - 4));
            this.shake(500, 8);
          }
          this.hud?.flash('magazine');
          break;
        }
        case 'trailerHit':
          this.trailerView?.onHit();
          this.fx.hullHit(ev.x, ev.y, ev.damage);
          this.hud?.flash('trailerArmor');
          break;
        case 'trailerLost':
          if (ev.how === 'jettisoned') this.trailerView?.onJettison(ev.mine);
          break;
        case 'trailerBlast': {
          const view = this.trailerView;
          // The burnt-out bed stays where it went up, in a ring of scorch.
          this.units.addDecal('tr_body_stub', ev.x, ev.y, view?.heading ?? 0, 2);
          view?.onGone();
          this.fx.bigExplosion(ev.x, ev.y);
          for (let i = 0; i < 24; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = ev.radius * 0.8 * Math.sqrt(Math.random());
            this.units.addDecal('scorch', ev.x + Math.cos(a) * d, ev.y + Math.sin(a) * d, Math.random() * Math.PI * 2, 1.5);
          }
          this.shake(500, 6 + ev.radius / 20);
          break;
        }
        case 'reloaded':
          this.hud?.flash(ev.slot);
          break;
        case 'droneLost':
          this.fx.explosion(ev.x, ev.y, 6);
          this.fx.smokePuff(ev.x, ev.y);
          break;
        case 'revived':
          this.reviveShown = { at: w.time, ok: true };
          for (let i = 0; i < 12; i++) this.fx.sparks(ev.x + (Math.random() - 0.5) * 50, ev.y + (Math.random() - 0.5) * 40);
          cam.flash(200, 120, 255, 230);
          this.shake(300, 4);
          break;
        case 'reviveFailed':
          this.reviveShown = { at: w.time, ok: false };
          break;
        case 'reactorCritical':
          this.shake(ev.fuse * 1000, 2);
          break;
        case 'extracted':
          if (this.demo) break;
          this.won = { ...this.ctx, run: completeBattle(this.ctx.run, w) };
          // Saved the moment the line is crossed, so closing the tab during the outro keeps the win.
          checkpoint(this.won);
          this.outro = OUTRO_TIME;
          break;
        case 'detonation':
          if (!this.demo) {
            endRun(this.ctx);
            this.detonatedAt = this.time.now;
            // Nothing left to aim: the reticle goes, and stays out of the summary's still.
            this.reticle.setVisible(false);
            // Once the flash has faded and the fireball fills the field.
            this.time.delayedCall(SHOT_DELAY_MS, () => this.takeShot());
          }
          this.fx.detonation(ev.x, ev.y, ev.radius);
          // A scorched crater: dense at the center, thinning out toward the blast's edge.
          for (let i = 0; i < 70; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = ev.radius * 0.85 * Math.sqrt(Math.random()) * (i < 20 ? 0.35 : 1);
            this.units.addDecal('scorch', ev.x + Math.cos(a) * d, ev.y + Math.sin(a) * d, Math.random() * Math.PI * 2, 1.5, i < 20 ? 2 : 1);
          }
          cam.flash(250, 255, 255, 255);
          this.shake(900, 14);
          break;
        case 'enemyDestroyed': {
          const wreck = ENEMY_ART[ev.enemy].wreck;
          if (!wreck) {
            // Infantry: no wreck, no fireball.
            this.fx.impact(ev.x, ev.y);
            this.fx.smokePuff(ev.x, ev.y);
            break;
          }
          if (this.wet(ev.x, ev.y)) this.fx.splash(ev.x, ev.y, 24);
          else this.units.addDecal('scorch', ev.x, ev.y, Math.random() * Math.PI * 2, 1.5);
          this.units.addDecal(wreck, ev.x, ev.y, this.units.enemyHeading(ev.id), 2);
          this.fx.bigExplosion(ev.x, ev.y);
          this.shake(120, ev.cause === 'crushed' ? 1.5 : 2.5);
          break;
        }
        case 'tileChanged': {
          const x = (ev.col + 0.5) * ts;
          const y = (ev.row + 0.5) * ts;
          const down = ev.state === 'destroyed' || ev.state === 'flattened';
          // Bridges have their own effect, once for the whole span (bridgeCollapse).
          if (ev.mat === 'bridge' || ev.mat === 'lightBridge') break;
          const debris = MATERIALS[ev.mat].debris;
          if (debris === 'wood') ev.state === 'destroyed' ? this.fx.forestBurnt(x, y) : this.fx.forestFlattened(x, y);
          else if (debris === 'ice' && ev.state === 'destroyed') this.fx.splash(x, y, 10);
          else if (debris && debris !== 'ice' && down) this.fx.buildingCollapse(x, y);
          break;
        }
        case 'bridgeCollapse':
          this.fx.buildingCollapse(ev.x, ev.y);
          this.fx.splash(ev.x, ev.y, 18 + ev.tiles * 1.5);
          this.shake(220, 3);
          break;
        case 'collision': {
          const shake = OBSTACLE_CLASSES[ev.obstacle].shake;
          this.fx.plow(ev.x, ev.y, ev.obstacle === 'heavy' || ev.obstacle === 'medium');
          this.behemothView.onRam();
          if (shake > 0) this.shake(140, 3.5 * shake);
          break;
        }
        case 'scrape':
          this.fx.scrape(ev.x, ev.y);
          break;
        case 'immobilized':
          this.shake(400, 5);
          break;
        case 'wave':
          this.waveShownAt = w.time;
          break;
        case 'alert':
          this.alertShownAt = w.time;
          break;
        case 'squall':
          if (ev.rising) this.squallShownAt = w.time;
          break;
        case 'objective':
          this.objectiveShown = { at: w.time, text: this.objectiveCall(ev.what, ev.done, ev.enemy) };
          break;
        case 'mineLaid':
          this.fx.smokePuff(ev.x, ev.y);
          break;
      }
    }
    w.events.length = 0;
  }

  private debugLines(): string[] {
    const w = this.world;
    const b = w.behemoth;
    const rel = (b.x - w.frame.left) / this.layout.height;
    return [
      `FPS ${Math.round(this.game.loop.actualFps)}`,
      `SEED ${w.seed} ${w.terrain.recipe.biome.toUpperCase()} ${(w.terrain.recipe.approach ?? 'mix').toUpperCase()}`,
      `VX ${b.vx.toFixed(1)} VY ${b.vy.toFixed(1)}`,
      `FRAME ${rel.toFixed(2)}`,
      `ENEMIES ${w.enemies.length} HIDDEN ${w.enemies.filter((e) => e.hidden).length}`,
      `SHOTS ${w.projectiles.length}`,
      `ALERT ${w.encounter.alert.wave} NEXT ${w.encounter.alert.next.toFixed(1)} Q ${w.encounter.alert.queue.toFixed(1)}`,
      `POSTS ${w.encounter.posts.length} THREAT ${w.threat}`,
      ...(w.condition ? [`${w.condition.id.toUpperCase()} SIGHT ${sightRadius(w)?.toFixed(0) ?? '-'} SQUALL ${w.condition.squall.toFixed(2)}`] : []),
      `MODE ${w.objective.mode.toUpperCase()} ${w.objective.destroyed}/${w.objective.total} LOST ${w.objective.lost}`,
      ...(w.lastStand ? [`WAVE ${w.lastStand.wave} NEXT ${w.lastStand.nextWave.toFixed(1)}`] : []),
    ];
  }
}

/** The attract mode's layout: the battlefield across the whole screen, in whole tiles. */
function fullWidthLayout(): BattleLayout {
  const { width, height } = RESOLUTION;
  const fieldTiles = Math.ceil(width / TILE);
  const fieldW = fieldTiles * TILE;
  return { width, height, fieldTiles, fieldW, fieldX: Math.floor((width - fieldW) / 2) };
}

/** Plays behind the title screen (SPEC §10): short clips of the autopilot fighting in each biome. */
export class DemoBattleScene extends TopDownBattleScene {
  /** The next clip to show; carries on where the last visit to the title left off. */
  private static next = 0;

  constructor() {
    super('demo');
  }

  override init(): void {
    const clip = demoClip(DemoBattleScene.next++, randomSeed());
    super.init({ run: newRun(clip.seed), persist: false, demo: clip });
  }
}

/** The run summary's still of the blast: its texture key, and how long after the detonation it's taken. */
const SHOT_KEY = 'summary_shot';
const SHOT_DELAY_MS = 450;
