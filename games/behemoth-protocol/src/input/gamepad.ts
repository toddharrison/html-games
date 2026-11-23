import { PAD } from '../content/tuning';

/**
 * Gamepad support (SPEC §4.3): polls the browser Gamepad API for a controller in the standard
 * mapping (Xbox layout names; a PlayStation pad's Cross is A, Circle B, Square X, Triangle Y).
 * No Phaser here, so the mapping logic is unit-tested; `padMenu.ts` and `padCursor.ts` hook it
 * into scenes, and `controls.ts` into the battle.
 *
 * Browsers only expose a pad after a button is pressed on the page, so nothing shows up until then.
 */

/** Button indices in the standard mapping. */
export const BTN = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  back: 8,
  start: 9,
  ls: 10,
  rs: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;
export type Button = keyof typeof BTN;
export type Dir = 'up' | 'down' | 'left' | 'right';

/** One poll of a pad: buttons as pressed or not (triggers past `PAD.triggerThreshold`), raw axes. */
export interface PadState {
  buttons: readonly boolean[];
  axes: readonly number[];
}

export const NO_PAD: PadState = { buttons: [], axes: [] };

/** The first connected pad, preferring one in the standard mapping; null when there's none. */
export function readPad(): PadState | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  let pick: Gamepad | null = null;
  for (const p of navigator.getGamepads()) {
    if (!p?.connected) continue;
    if (p.mapping === 'standard') {
      pick = p;
      break;
    }
    pick ??= p;
  }
  if (!pick) return null;
  return { buttons: pick.buttons.map((b) => b.pressed || b.value > PAD.triggerThreshold), axes: [...pick.axes] };
}

/** A stick with a radial deadzone, rescaled so the edge of the deadzone reads 0 and full tilt 1. */
export function stickOf(axes: readonly number[], side: 'left' | 'right'): { x: number; y: number } {
  const i = side === 'left' ? 0 : 2;
  const x = axes[i] ?? 0;
  const y = axes[i + 1] ?? 0;
  const m = Math.hypot(x, y);
  if (m <= PAD.deadzone) return { x: 0, y: 0 };
  const k = Math.min(1, (m - PAD.deadzone) / (1 - PAD.deadzone)) / m;
  return { x: x * k, y: y * k };
}

// ── Which device the player is using ────────────────────────────────────────────────────────────

let device: 'pad' | 'keys' = 'keys';
let listening = false;

/** Real key presses and mouse use (not the pad cursor's synthetic events) switch the hints back. */
function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const toKeys = (e: Event) => {
    if (e.isTrusted) device = 'keys';
  };
  for (const type of ['keydown', 'mousedown', 'mousemove', 'wheel']) window.addEventListener(type, toKeys, { capture: true, passive: true });
}

/** True when the pad was used more recently than the keyboard or mouse: hints show pad buttons. */
export function usingPad(): boolean {
  return device === 'pad';
}

/** The keyboard name or the pad name of a control, for whichever the player last used. */
export function keyLabel(keys: string, pad: string): string {
  return usingPad() ? pad : keys;
}

/** For tests. */
export function setDevice(d: 'pad' | 'keys'): void {
  device = d;
}

// ── Reading a pad frame by frame ────────────────────────────────────────────────────────────────

/** Pad activity strong enough to count as the player picking it up (not stick drift). */
function active(prev: PadState, cur: PadState): boolean {
  if (cur.buttons.some((b, i) => b && !prev.buttons[i])) return true;
  return cur.axes.some((a) => Math.abs(a) > 0.5);
}

/**
 * Polls a pad once a frame and answers held/just-pressed. Whatever is held when the reader starts
 * (the press that opened this screen) has to be released before it counts as a press.
 */
export class PadReader {
  private prev: PadState;
  private cur: PadState;

  constructor(private readonly source: () => PadState | null = readPad) {
    listen();
    this.cur = source() ?? NO_PAD;
    this.prev = this.cur;
  }

  poll(): void {
    this.prev = this.cur;
    this.cur = this.source() ?? NO_PAD;
    if (active(this.prev, this.cur)) device = 'pad';
  }

  get connected(): boolean {
    return this.cur !== NO_PAD;
  }

  held(b: Button): boolean {
    return this.cur.buttons[BTN[b]] ?? false;
  }

  pressed(b: Button): boolean {
    return this.held(b) && !(this.prev.buttons[BTN[b]] ?? false);
  }

  stick(side: 'left' | 'right'): { x: number; y: number } {
    return stickOf(this.cur.axes, side);
  }

  /** The direction the D-pad or left stick points for menus, or null. The D-pad wins. */
  menuDir(): Dir | null {
    for (const d of ['up', 'down', 'left', 'right'] as const) if (this.held(d)) return d;
    const s = this.stick('left');
    if (Math.max(Math.abs(s.x), Math.abs(s.y)) < PAD.menuThreshold) return null;
    if (Math.abs(s.x) > Math.abs(s.y)) return s.x < 0 ? 'left' : 'right';
    return s.y < 0 ? 'up' : 'down';
  }
}

/** A held menu direction: fires on the press, then repeats after a delay. */
export class DirRepeat {
  /** Until the first repeat; a direction already held when the menu opens never repeats. */
  private t = Infinity;

  /** `dir` is the direction already held when the menu opens: it waits for a release. */
  constructor(private dir: Dir | null = null) {}

  step(dir: Dir | null, dt: number): Dir | null {
    if (dir !== this.dir) {
      this.dir = dir;
      this.t = PAD.repeatDelay;
      return dir;
    }
    if (!dir) return null;
    this.t -= dt;
    if (this.t > 0) return null;
    this.t += PAD.repeatRate;
    return dir;
  }
}

// ── Battle mapping ──────────────────────────────────────────────────────────────────────────────

/** The left stick as the sim's digital throttle and steer (sim -y is the Behemoth's left). */
export function padDrive(left: { x: number; y: number }): { throttle: -1 | 0 | 1; steer: -1 | 0 | 1 } {
  const t = PAD.driveThreshold;
  return {
    throttle: left.y < -t ? 1 : left.y > t ? -1 : 0,
    steer: left.x < -t ? -1 : left.x > t ? 1 : 0,
  };
}

/** A screen rectangle, in internal pixels. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Moves a screen-space point by a stick for `dt` seconds at `speed` px/s (full tilt), with the
 * tilt curved so small tilts aim finely, and keeps it inside `box`.
 */
export function moveByStick(at: { x: number; y: number }, s: { x: number; y: number }, dt: number, speed: number, box: Box): { x: number; y: number } {
  const m = Math.hypot(s.x, s.y);
  if (m === 0) return at;
  const v = (speed * Math.pow(Math.min(1, m), PAD.aimCurve)) / m;
  return {
    x: Math.min(box.x + box.w - 1, Math.max(box.x, at.x + s.x * v * dt)),
    y: Math.min(box.y + box.h - 1, Math.max(box.y, at.y + s.y * v * dt)),
  };
}

/** D-pad auto-group toggles, clockwise from up: 1–4 like the number keys. */
export const AUTO_DIRS: readonly Button[] = ['up', 'right', 'down', 'left'];

/**
 * The nearest target in direction `dir` from `from`, for snapping a cursor between buttons. Targets
 * straight along the direction beat ones off to the side; null when nothing lies that way.
 */
export function nearestInDirection<T extends { x: number; y: number }>(from: { x: number; y: number }, dir: Dir, targets: readonly T[]): T | null {
  const [dx, dy] = dir === 'up' ? [0, -1] : dir === 'down' ? [0, 1] : dir === 'left' ? [-1, 0] : [1, 0];
  let best: T | null = null;
  let bestCost = Infinity;
  for (const t of targets) {
    const rx = t.x - from.x;
    const ry = t.y - from.y;
    const along = rx * dx + ry * dy;
    if (along < 2) continue;
    const across = Math.abs(rx * dy - ry * dx);
    // Off to the side costs more than distance along, and nothing past 45° off the line counts.
    if (across > along) continue;
    const cost = along + across * 3;
    if (cost < bestCost) {
      bestCost = cost;
      best = t;
    }
  }
  return best;
}
