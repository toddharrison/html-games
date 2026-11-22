import { describe, expect, it } from 'vitest';
import { capturePose, Interp, pose } from '../../src/render/interp';

describe('render interpolation', () => {
  it('blends from the captured state toward the current one by alpha', () => {
    const ip = new Interp();
    const o = { x: 10, y: 0, heading: 0 };
    capturePose(ip, o);
    o.x = 20;
    ip.alpha = 0.25;
    expect(pose(ip, o).x).toBeCloseTo(12.5);
    ip.alpha = 1;
    expect(pose(ip, o).x).toBe(20);
  });

  it('draws objects it has never captured where they are', () => {
    const ip = new Interp();
    ip.alpha = 0.5;
    expect(pose(ip, { x: 3, y: 4 }).x).toBe(3);
  });

  it('takes the short way around for angles', () => {
    const ip = new Interp();
    const o = { x: 0, y: 0, heading: Math.PI - 0.1 };
    capturePose(ip, o);
    o.heading = -Math.PI + 0.1;
    ip.alpha = 0.5;
    expect(Math.abs(pose(ip, o).heading)).toBeCloseTo(Math.PI, 5);
  });
});
