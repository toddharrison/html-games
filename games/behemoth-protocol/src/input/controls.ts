import Phaser from 'phaser';
import { simPoint } from '../render/viewTransform';
import type { PlayerCommand } from '../sim/behemoth';

/**
 * Turns raw keyboard/mouse state into sim commands (SPEC §4.3). The Behemoth drives up the
 * screen, so W/up is forward and A/D steer to its left/right. Keys are hard-coded for M0;
 * rebinding comes in M5.
 */
export class Controls {
  private readonly keys: Record<'surge' | 'brake' | 'left' | 'right' | 'surge2' | 'brake2' | 'left2' | 'right2' | 'pause' | 'pause2' | 'restart' | 'debug' | 'selfDestruct' | 'missile' | 'jettison' | 'mute', Phaser.Input.Keyboard.Key>;

  /** Auto-weapon group toggles, keys 1–4. */
  private readonly autoKeys: Phaser.Input.Keyboard.Key[];

  /**
   * Mouse buttons are ignored until they've all been released once, so the click that started
   * the battle (the depot's leave button, the title menu) doesn't fire the guns.
   */
  private mouseLatched = true;

  constructor(private readonly scene: Phaser.Scene) {
    scene.input.mouse?.disableContextMenu();
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

  command(camera: Phaser.Cameras.Scene2D.Camera): PlayerCommand {
    const k = this.keys;
    const surge = k.surge.isDown || k.surge2.isDown;
    const brake = k.brake.isDown || k.brake2.isDown;
    const left = k.left.isDown || k.left2.isDown;
    const right = k.right.isDown || k.right2.isDown;
    const pointer = this.scene.input.activePointer;
    const v = camera.getWorldPoint(pointer.x, pointer.y);
    const aim = simPoint(v.x, v.y);
    // On a Mac, Ctrl+click is a right-click: it fires the secondary, not the main gun. Shift+click
    // is the alternative for trackpads without an easy right-click (SPEC §4.3).
    const ev = pointer.event as MouseEvent | undefined;
    const alt = (ev?.ctrlKey ?? false) || (ev?.shiftKey ?? false);
    if (this.mouseLatched && pointer.buttons === 0) this.mouseLatched = false;
    const mouse = !this.mouseLatched;
    const toggle = this.autoKeys.findIndex((key) => Phaser.Input.Keyboard.JustDown(key));
    return {
      throttle: surge === brake ? 0 : surge ? 1 : -1,
      // Sim -y is the Behemoth's left.
      steer: left === right ? 0 : left ? -1 : 1,
      aimX: aim.x,
      aimY: aim.y,
      fireMain: mouse && pointer.leftButtonDown() && !alt,
      fireSecondary: mouse && (pointer.rightButtonDown() || (pointer.leftButtonDown() && alt)),
      fireMissile: k.missile.isDown,
      toggleAuto: toggle >= 0 ? toggle + 1 : null,
      selfDestruct: k.selfDestruct.isDown,
      jettison: k.jettison.isDown,
    };
  }

  pausePressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.pause) || Phaser.Input.Keyboard.JustDown(this.keys.pause2);
  }

  restartPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.restart);
  }

  debugPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.debug);
  }

  mutePressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.mute);
  }
}
