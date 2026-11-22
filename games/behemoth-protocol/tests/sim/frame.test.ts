import { CAMERA } from '../../src/content/tuning';
import { describe, expect, it } from 'vitest';
import { centerFrame, createFrame, stepFrame } from '../../src/sim/frame';
import { SIM_DT } from '../../src/sim/loop';

const W = 270;
const CRUISE = 36;
const cfg = { ...CAMERA, width: W };

/** Simulate a Behemoth moving at a speed profile; returns its frame-relative x per step. */
function drive(speeds: number[]) {
  let x = 70;
  const f = createFrame(cfg, x, CRUISE);
  const lefts: number[] = [];
  const rel: number[] = [];
  for (const v of speeds) {
    x += v * SIM_DT;
    stepFrame(f, x, CRUISE, SIM_DT);
    lefts.push(f.left);
    rel.push((x - f.left) / W);
  }
  return { lefts, rel };
}

const secs = (s: number, v: number) => Array(Math.round(s / SIM_DT)).fill(v) as number[];

describe('camera frame', () => {
  it('settles with the Behemoth at the anchor at cruise', () => {
    const { rel } = drive(secs(30, CRUISE));
    expect(rel.at(-1)).toBeCloseTo(cfg.anchor, 2);
  });

  it('lets a surge pull ahead in the frame, and braking drift back', () => {
    const { rel } = drive([...secs(20, CRUISE), ...secs(20, 64), ...secs(30, 18)]);
    const cruise = rel[Math.round(19 / SIM_DT)]!;
    const surge = rel[Math.round(39 / SIM_DT)]!;
    const brake = rel.at(-1)!;
    expect(surge).toBeGreaterThan(cruise + 0.03);
    expect(brake).toBeLessThan(cruise - 0.03);
  });

  it('never scrolls backward', () => {
    const { lefts } = drive([...secs(5, 64), ...secs(10, 0), ...secs(5, 18)]);
    for (let i = 1; i < lefts.length; i++) expect(lefts[i]!).toBeGreaterThanOrEqual(lefts[i - 1]!);
  });

  it('keeps the Behemoth on screen even at extreme speed', () => {
    const { rel } = drive(secs(10, 400));
    for (const r of rel) expect(r).toBeLessThanOrEqual(cfg.maxAnchor + 1e-9);
  });

  it('stops when the Behemoth stops', () => {
    const { lefts } = drive([...secs(10, CRUISE), ...secs(30, 0)]);
    expect(lefts.at(-1)! - lefts.at(-2)!).toBeLessThan(1e-3);
  });
});

describe('threat-aware framing', () => {
  it('moves the Behemoth up the frame while enemies are behind, without scrolling back', () => {
    let x = 70;
    const f = createFrame(cfg, x, CRUISE);
    const lefts: number[] = [];
    const step = (threat: boolean) => {
      x += CRUISE * SIM_DT;
      stepFrame(f, x, CRUISE, SIM_DT, threat);
      lefts.push(f.left);
    };
    for (let i = 0; i < 600; i++) step(false);
    expect((x - f.left) / W).toBeCloseTo(cfg.anchor, 2);
    for (let i = 0; i < 1800; i++) step(true);
    expect((x - f.left) / W).toBeCloseTo(cfg.rearAnchor, 2);
    for (let i = 0; i < 1800; i++) step(false);
    expect((x - f.left) / W).toBeCloseTo(cfg.anchor, 2);
    for (let i = 1; i < lefts.length; i++) expect(lefts[i]!).toBeGreaterThanOrEqual(lefts[i - 1]!);
  });

  it('centers a stopped Behemoth for the last stand, moving back if it has to', () => {
    for (const rel of [0.3, 0.7]) {
      const f = createFrame(cfg, 500, CRUISE);
      f.left = 500 - W * rel;
      const start = f.left;
      for (let i = 0; i < Math.round(5 / SIM_DT); i++) centerFrame(f, 500, SIM_DT);
      expect((500 - f.left) / W).toBeCloseTo(0.5, 2);
      expect(f.left < start).toBe(rel < 0.5);
    }
  });
});
