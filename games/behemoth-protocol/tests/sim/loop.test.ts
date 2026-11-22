import { describe, expect, it } from 'vitest';
import { FixedStepper, SIM_DT } from '../../src/sim/loop';

describe('FixedStepper', () => {
  it('runs one step per 1/60 s regardless of frame rate', () => {
    const s = new FixedStepper();
    let steps = 0;
    for (let i = 0; i < 144; i++) steps += s.advance(1 / 144); // one second at 144 fps
    expect(steps).toBe(60);
  });

  it('accumulates partial frames', () => {
    const s = new FixedStepper();
    expect(s.advance(SIM_DT * 0.6)).toBe(0);
    expect(s.advance(SIM_DT * 0.6)).toBe(1);
    expect(s.alpha).toBeCloseTo(0.2, 5);
  });

  it('caps catch-up steps after a stall and drops the backlog', () => {
    const s = new FixedStepper(5);
    expect(s.advance(3)).toBe(5);
    expect(s.advance(SIM_DT)).toBe(1);
  });

  it('ignores negative time', () => {
    expect(new FixedStepper().advance(-1)).toBe(0);
  });
});
