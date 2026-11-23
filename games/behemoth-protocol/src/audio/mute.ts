import type Phaser from 'phaser';

/** Mute is a per-browser convenience, kept apart from the run and profile saves. */
const KEY = 'behemoth-protocol/muted';
/** Where builds before Nov 2026 kept it; moved to `KEY` on the first load. */
const OLD_KEY = 'behemoth-protocol.muted';

/**
 * The mute state lives here, not in Phaser: its Web Audio `mute` getter reads a gain node's
 * value, which only catches up with the setter on the next audio render block.
 */
let muted = false;

/** Applies the saved mute setting (at boot). */
export function applySavedMute(sound: Phaser.Sound.BaseSoundManager): void {
  try {
    const old = localStorage.getItem(OLD_KEY);
    if (old !== null) {
      if (localStorage.getItem(KEY) === null) localStorage.setItem(KEY, old);
      localStorage.removeItem(OLD_KEY);
    }
    muted = localStorage.getItem(KEY) === '1';
  } catch {
    muted = false;
  }
  sound.mute = muted;
}

/** Flips mute and remembers it. Returns the new state. */
export function toggleMute(sound: Phaser.Sound.BaseSoundManager): boolean {
  muted = !muted;
  sound.mute = muted;
  try {
    localStorage.setItem(KEY, muted ? '1' : '0');
  } catch {
    // Storage blocked: the setting just won't stick.
  }
  return muted;
}
