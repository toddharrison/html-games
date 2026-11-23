import type Phaser from 'phaser';
import { DirRepeat, PadReader, usingPad, type Dir } from './gamepad';

/** What a menu does on each pad button or direction (the directions come from the D-pad or left stick). */
export type PadHandlers = Partial<Record<(typeof BUTTONS)[number] | Dir, () => void>>;

const BUTTONS = ['a', 'b', 'x', 'y', 'start', 'back'] as const;

/**
 * Wires a pad into a menu scene: polled on the scene's update, one handler per frame (a handler
 * may leave the scene). `onDevice` runs when the player switches between the pad and the keyboard
 * or mouse, so the scene can redraw its key hints.
 */
export function padMenu(scene: Phaser.Scene, handlers: PadHandlers, onDevice?: () => void): PadReader {
  const pad = new PadReader();
  const repeat = new DirRepeat(pad.menuDir());
  let pad0 = usingPad();
  const tick = (_time: number, deltaMs: number) => {
    pad.poll();
    if (usingPad() !== pad0) {
      pad0 = usingPad();
      onDevice?.();
    }
    for (const b of BUTTONS) {
      const h = handlers[b];
      if (h && pad.pressed(b)) {
        h();
        return;
      }
    }
    const d = repeat.step(pad.menuDir(), deltaMs / 1000);
    if (d) handlers[d]?.();
  };
  scene.events.on('update', tick);
  scene.events.once('shutdown', () => scene.events.off('update', tick));
  return pad;
}
