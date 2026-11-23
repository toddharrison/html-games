import type Phaser from 'phaser';
import { PAD } from '../content/tuning';
import { RESOLUTION } from '../config';
import { DirRepeat, moveByStick, nearestInDirection, PadReader, usingPad } from './gamepad';

/**
 * A mouse cursor driven by the pad, for screens built for the mouse (the depot). The left stick
 * moves it, the D-pad jumps it to the next clickable thing that way, and A clicks. It sends real
 * mouse events to the canvas, so hover and click work exactly as they do with a mouse. It shows
 * only while the pad is in use; touching the mouse hides it.
 */
export class PadCursor {
  private readonly pad = new PadReader();
  private readonly repeat: DirRepeat;
  private readonly img: Phaser.GameObjects.Image;
  private x: number;
  private y: number;
  private down = false;
  /** The camera zoom, kept for a release sent while the scene shuts down. */
  private zoom: number;

  /** `targets` lists the centers of what can be clicked, in internal pixels. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly targets: () => { x: number; y: number }[],
  ) {
    const p = scene.input.activePointer;
    const zoom = scene.cameras.main.zoom;
    this.zoom = zoom;
    this.x = Math.min(RESOLUTION.width - 1, p.x / zoom || RESOLUTION.width / 2);
    this.y = Math.min(RESOLUTION.height - 1, p.y / zoom || RESOLUTION.height / 2);
    this.repeat = new DirRepeat(this.dpadDir());
    this.img = scene.add.image(this.x, this.y, 'padCursor').setOrigin(0, 0).setDepth(1000).setVisible(false);
    const tick = (_time: number, deltaMs: number) => this.update(deltaMs / 1000);
    scene.events.on('update', tick);
    scene.events.once('shutdown', () => {
      scene.events.off('update', tick);
      // An A press that left the screen still lets go of the mouse button, or the next screen
      // would see it held.
      if (this.down) {
        this.down = false;
        this.send('mouseup');
      }
    });
  }

  private dpadDir() {
    for (const d of ['up', 'down', 'left', 'right'] as const) if (this.pad.held(d)) return d;
    return null;
  }

  private update(dt: number): void {
    this.pad.poll();
    this.zoom = this.scene.cameras.main.zoom;
    let moved = false;
    const s = this.pad.stick('left');
    if (s.x !== 0 || s.y !== 0) {
      const next = moveByStick({ x: this.x, y: this.y }, s, dt, PAD.cursorSpeed, { x: 0, y: 0, w: RESOLUTION.width, h: RESOLUTION.height });
      moved = next.x !== this.x || next.y !== this.y;
      this.x = next.x;
      this.y = next.y;
    }
    const d = this.repeat.step(this.dpadDir(), dt);
    if (d) {
      const t = nearestInDirection({ x: this.x, y: this.y }, d, this.targets());
      if (t) {
        this.x = t.x;
        this.y = t.y;
        moved = true;
      }
    }
    if (moved) this.send('mousemove');
    if (this.pad.pressed('a')) {
      this.down = true;
      this.send('mousedown');
    } else if (this.down && !this.pad.held('a')) {
      this.down = false;
      this.send('mouseup');
    }
    this.img.setPosition(Math.round(this.x), Math.round(this.y)).setVisible(usingPad());
  }

  /** A mouse event at the cursor, in the page coordinates Phaser maps back to the canvas. */
  private send(type: 'mousemove' | 'mousedown' | 'mouseup'): void {
    const canvas = this.scene.game.canvas;
    const r = canvas.getBoundingClientRect();
    const zoom = this.zoom;
    const cssX = r.width / this.scene.scale.width;
    const cssY = r.height / this.scene.scale.height;
    canvas.dispatchEvent(
      new MouseEvent(type, {
        clientX: r.left + this.x * zoom * cssX,
        clientY: r.top + this.y * zoom * cssY,
        button: 0,
        buttons: this.down ? 1 : 0,
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
  }
}
