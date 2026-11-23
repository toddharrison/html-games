import Phaser from 'phaser';
import { PAD } from '../content/tuning';
import { simPoint } from '../render/viewTransform';
import type { PlayerCommand } from '../sim/behemoth';
import { AUTO_DIRS, moveByStick, padDrive, PadReader, usingPad, type Box } from './gamepad';

/**
 * Turns raw keyboard/mouse and gamepad state into sim commands (SPEC §4.3). The Behemoth drives up
 * the screen, so W/up is forward and A/D steer to its left/right. Keys are hard-coded for M0;
 * rebinding comes in M5.
 *
 * The pad plays twin-stick: the left stick drives, the right stick moves the reticle (it stays put
 * when let go), RT/LT/RB are the LMB/RMB/Space triggers, the D-pad toggles the auto groups
 * (clockwise from up: 1–4), X holds the final protocol, LB holds jettison, Start pauses, Back
 * mutes, A goes on to the summary, R3 brings the reticle back ahead of the hull. Moving the mouse
 * hands aiming back to it.
 */
export class Controls {
  private readonly keys: Record<'surge' | 'brake' | 'left' | 'right' | 'surge2' | 'brake2' | 'left2' | 'right2' | 'pause' | 'pause2' | 'restart' | 'summary' | 'debug' | 'selfDestruct' | 'missile' | 'jettison' | 'mute', Phaser.Input.Keyboard.Key>;

  /** Auto-weapon group toggles, keys 1–4. */
  private readonly autoKeys: Phaser.Input.Keyboard.Key[];

  /**
   * Mouse buttons are ignored until they've all been released once, so the click that started
   * the battle (the depot's leave button, the title menu) doesn't fire the guns.
   */
  private mouseLatched = true;

  /** Pad triggers wait for a release the same way. */
  private padLatched = true;
  private readonly pad = new PadReader();
  /** The pad's reticle, in internal (unzoomed) screen pixels; null while the mouse aims. */
  private padAim: { x: number; y: number } | null = null;
  /** The mouse position the pad took over from: moving the mouse off it hands aiming back. */
  private mouseAt = { x: 0, y: 0 };
  /** Where the pointer was as the battle started, and whether the mouse has moved since. */
  private readonly mouseStart: { x: number; y: number };
  private mouseMoved = false;

  constructor(private readonly scene: Phaser.Scene) {
    scene.input.mouse?.disableContextMenu();
    this.mouseStart = { x: scene.input.activePointer.x, y: scene.input.activePointer.y };
    const kb = scene.input.keyboard;
    if (!kb) throw new Error('keyboard input unavailable');
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      surge: kb.addKey(K.W),
      brake: kb.addKey(K.S),
      left: kb.addKey(K.A),
      right: kb.addKey(K.D),
      surge2: kb.addKey(K.UP),
      brake2: kb.addKey(K.DOWN),
      left2: kb.addKey(K.LEFT),
      right2: kb.addKey(K.RIGHT),
      pause: kb.addKey(K.ESC),
      pause2: kb.addKey(K.P),
      restart: kb.addKey(K.R),
      summary: kb.addKey(K.ENTER),
      debug: kb.addKey(K.BACKTICK),
      selfDestruct: kb.addKey(K.X),
      missile: kb.addKey(K.SPACE),
      jettison: kb.addKey(K.Q),
      mute: kb.addKey(K.M),
    };
    this.autoKeys = [K.ONE, K.TWO, K.THREE, K.FOUR].map((code) => kb.addKey(code));
    // Space must not scroll the page.
    kb.addCapture([K.SPACE]);
  }

  /**
   * Once a frame, before anything else asks: polls the pad and moves its reticle, which stays in
   * `field` (the battlefield between the panels). `hull` is the Behemoth's screen position
   * (internal pixels), where R3 recenters the reticle from.
   */
  update(dt: number, hull: { x: number; y: number }, field: Box): void {
    this.pad.poll();
    const pointer = this.scene.input.activePointer;
    // The pointer only moves for a real mouse here (the depot's pad cursor moves it too, but
    // before this battle started).
    this.mouseMoved ||= pointer.x !== this.mouseStart.x || pointer.y !== this.mouseStart.y;
    const s = this.pad.stick('right');
    const ahead = { x: hull.x, y: Math.max(field.y, hull.y - field.h * 0.3) };
    const recenter = this.pad.pressed('rs');
    const stick = s.x !== 0 || s.y !== 0;
    if (!this.padAim && (recenter || stick || (usingPad() && !this.mouseMoved))) {
      // The pad takes over: from where the mouse was aiming, or ahead of the hull.
      const zoom = this.scene.cameras.main.zoom;
      this.padAim = this.mouseMoved && !recenter ? { x: pointer.x / zoom, y: pointer.y / zoom } : ahead;
      this.mouseAt = { x: pointer.x, y: pointer.y };
    } else if (recenter) this.padAim = ahead;
    if (this.padAim && stick) this.padAim = moveByStick(this.padAim, s, dt, PAD.aimSpeed, field);
    else if (this.padAim && (pointer.x !== this.mouseAt.x || pointer.y !== this.mouseAt.y)) this.padAim = null;
    if (this.padLatched && !this.pad.held('rt') && !this.pad.held('lt') && !this.pad.held('rb')) this.padLatched = false;
  }

  /** Where the reticle is, in internal (unzoomed) screen pixels. */
  reticle(): { x: number; y: number } {
    if (this.padAim) return this.padAim;
    const p = this.scene.input.activePointer;
    const zoom = this.scene.cameras.main.zoom;
    return { x: p.x / zoom, y: p.y / zoom };
  }

  command(camera: Phaser.Cameras.Scene2D.Camera): PlayerCommand {
    const k = this.keys;
    const drive = padDrive(this.pad.stick('left'));
    const surge = k.surge.isDown || k.surge2.isDown || drive.throttle > 0;
    const brake = k.brake.isDown || k.brake2.isDown || drive.throttle < 0;
    const left = k.left.isDown || k.left2.isDown || drive.steer < 0;
    const right = k.right.isDown || k.right2.isDown || drive.steer > 0;
    const pointer = this.scene.input.activePointer;
    const r = this.reticle();
    const v = camera.getWorldPoint(r.x * camera.zoom, r.y * camera.zoom);
    const aim = simPoint(v.x, v.y);
    // On a Mac, Ctrl+click is a right-click: it fires the secondary, not the main gun. Shift+click
    // is the alternative for trackpads without an easy right-click (SPEC §4.3).
    const ev = pointer.event as MouseEvent | undefined;
    const alt = (ev?.ctrlKey ?? false) || (ev?.shiftKey ?? false);
    if (this.mouseLatched && pointer.buttons === 0) this.mouseLatched = false;
    const mouse = !this.mouseLatched;
    let toggle = this.autoKeys.findIndex((key) => Phaser.Input.Keyboard.JustDown(key));
    if (toggle < 0) toggle = AUTO_DIRS.findIndex((d) => this.pad.pressed(d));
    const pad = !this.padLatched;
    return {
      throttle: surge === brake ? 0 : surge ? 1 : -1,
      // Sim -y is the Behemoth's left.
      steer: left === right ? 0 : left ? -1 : 1,
      aimX: aim.x,
      aimY: aim.y,
      fireMain: (mouse && pointer.leftButtonDown() && !alt) || (pad && this.pad.held('rt')),
      fireSecondary: (mouse && (pointer.rightButtonDown() || (pointer.leftButtonDown() && alt))) || (pad && this.pad.held('lt')),
      fireMissile: k.missile.isDown || (pad && this.pad.held('rb')),
      toggleAuto: toggle >= 0 ? toggle + 1 : null,
      selfDestruct: k.selfDestruct.isDown || this.pad.held('x'),
      jettison: k.jettison.isDown || this.pad.held('lb'),
    };
  }

  pausePressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.pause) || Phaser.Input.Keyboard.JustDown(this.keys.pause2) || this.pad.pressed('start');
  }

  restartPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.restart);
  }

  /** Enter: on from a destroyed Behemoth to the run summary. */
  summaryPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.summary) || this.pad.pressed('a');
  }

  debugPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.debug);
  }

  mutePressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.mute) || this.pad.pressed('back');
  }
}
