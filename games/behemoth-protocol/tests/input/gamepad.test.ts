import { afterEach, describe, expect, it } from 'vitest';
import { PAD } from '../../src/content/tuning';
import { BTN, DirRepeat, moveByStick, nearestInDirection, padDrive, PadReader, setDevice, stickOf, usingPad, type PadState } from '../../src/input/gamepad';

/** A pad state with the named buttons down and the given axes. */
function state(down: (keyof typeof BTN)[] = [], axes: number[] = [0, 0, 0, 0]): PadState {
  const buttons = Array<boolean>(17).fill(false);
  for (const b of down) buttons[BTN[b]] = true;
  return { buttons, axes };
}

/** A reader fed from a list of states, one per poll (the first is read on construction). */
function scripted(states: (PadState | null)[]): PadReader {
  let i = 0;
  return new PadReader(() => states[Math.min(i++, states.length - 1)]!);
}

afterEach(() => setDevice('keys'));

describe('stickOf', () => {
  it('ignores tilt inside the deadzone', () => {
    expect(stickOf([PAD.deadzone * 0.9, 0, 0, 0], 'left')).toEqual({ x: 0, y: 0 });
  });

  it('rescales so full tilt reads 1, keeping the direction', () => {
    const s = stickOf([0, 0, 0, -1], 'right');
    expect(s.x).toBeCloseTo(0);
    expect(s.y).toBeCloseTo(-1);
    const half = stickOf([(1 + PAD.deadzone) / 2, 0], 'left');
    expect(half.x).toBeCloseTo(0.5);
  });
});

describe('PadReader', () => {
  it('reports a press once, on the poll it goes down', () => {
    const pad = scripted([state(), state(['a']), state(['a']), state()]);
    pad.poll();
    expect(pad.pressed('a')).toBe(true);
    pad.poll();
    expect(pad.pressed('a')).toBe(false);
    expect(pad.held('a')).toBe(true);
    pad.poll();
    expect(pad.held('a')).toBe(false);
  });

  it('makes a button held when it starts wait for a release', () => {
    const pad = scripted([state(['a']), state(['a']), state(), state(['a'])]);
    pad.poll();
    expect(pad.pressed('a')).toBe(false);
    pad.poll();
    pad.poll();
    expect(pad.pressed('a')).toBe(true);
  });

  it('reads nothing with no pad connected', () => {
    const pad = scripted([null]);
    pad.poll();
    expect(pad.connected).toBe(false);
    expect(pad.held('rt')).toBe(false);
    expect(pad.menuDir()).toBeNull();
  });

  it('switches the hints to the pad on a press or a firm tilt, not on drift', () => {
    const pad = scripted([state(), state([], [0.3, 0, 0, 0]), state([], [0, 0.8, 0, 0])]);
    pad.poll();
    expect(usingPad()).toBe(false);
    pad.poll();
    expect(usingPad()).toBe(true);
  });

  it('takes menu directions from the D-pad first, then the left stick', () => {
    const pad = scripted([state(), state(['left'], [0, 1, 0, 0]), state([], [0.2, -0.9, 0, 0]), state([], [0.3, 0.3, 0, 0])]);
    pad.poll();
    expect(pad.menuDir()).toBe('left');
    pad.poll();
    expect(pad.menuDir()).toBe('up');
    pad.poll();
    expect(pad.menuDir()).toBeNull();
  });
});

describe('DirRepeat', () => {
  it('fires on the press, then after the delay, then at the repeat rate', () => {
    const r = new DirRepeat();
    expect(r.step('down', 0.016)).toBe('down');
    expect(r.step('down', PAD.repeatDelay - 0.05)).toBeNull();
    expect(r.step('down', 0.1)).toBe('down');
    expect(r.step('down', PAD.repeatRate / 2)).toBeNull();
    expect(r.step('down', PAD.repeatRate)).toBe('down');
    expect(r.step(null, 0.016)).toBeNull();
    expect(r.step('up', 0.016)).toBe('up');
  });

  it('never fires a direction already held when the menu opens', () => {
    const r = new DirRepeat('right');
    expect(r.step('right', 0.016)).toBeNull();
    expect(r.step('right', 5)).toBeNull();
    expect(r.step(null, 0.016)).toBeNull();
    expect(r.step('right', 0.016)).toBe('right');
  });
});

describe('padDrive', () => {
  it('maps the left stick to surge/brake and steer, up being forward', () => {
    expect(padDrive({ x: 0, y: -1 })).toEqual({ throttle: 1, steer: 0 });
    expect(padDrive({ x: 0, y: 1 })).toEqual({ throttle: -1, steer: 0 });
    expect(padDrive({ x: -0.9, y: 0 })).toEqual({ throttle: 0, steer: -1 });
    expect(padDrive({ x: 0.7, y: -0.7 })).toEqual({ throttle: 1, steer: 1 });
    expect(padDrive({ x: PAD.driveThreshold / 2, y: 0 })).toEqual({ throttle: 0, steer: 0 });
  });
});

describe('moveByStick', () => {
  const SCREEN = { x: 0, y: 0, w: 576, h: 324 };

  it('moves at full speed at full tilt, slower (curved) at half', () => {
    const full = moveByStick({ x: 100, y: 100 }, { x: 1, y: 0 }, 0.1, 200, SCREEN);
    expect(full.x).toBeCloseTo(120);
    const half = moveByStick({ x: 100, y: 100 }, { x: 0.5, y: 0 }, 0.1, 200, SCREEN);
    expect(half.x - 100).toBeCloseTo(20 * Math.pow(0.5, PAD.aimCurve));
  });

  it('stays inside its box', () => {
    const p = moveByStick({ x: 5, y: 320 }, { x: -1, y: 1 }, 1, 400, { x: 4, y: 0, w: 300, h: 324 });
    expect(p).toEqual({ x: 4, y: 323 });
  });
});

describe('nearestInDirection', () => {
  const targets = [
    { id: 'below', x: 100, y: 130 },
    { id: 'belowFar', x: 100, y: 200 },
    { id: 'belowRight', x: 140, y: 125 },
    { id: 'right', x: 200, y: 100 },
    { id: 'self', x: 100, y: 100 },
  ];

  it('picks the closest target straight that way', () => {
    expect(nearestInDirection({ x: 100, y: 100 }, 'down', targets)?.id).toBe('below');
    expect(nearestInDirection({ x: 100, y: 100 }, 'right', targets)?.id).toBe('right');
  });

  it('skips what is behind, beside, or under the cursor', () => {
    expect(nearestInDirection({ x: 100, y: 100 }, 'up', targets)).toBeNull();
    expect(nearestInDirection({ x: 100, y: 130 }, 'down', targets)?.id).toBe('belowFar');
  });
});
