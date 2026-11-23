import { describe, expect, it } from 'vitest';
import { clampScroll, WheelRows } from '../../src/input/listScroll';

describe('clampScroll', () => {
  it('keeps the window inside the list', () => {
    expect(clampScroll(-1, 11, 9)).toBe(0);
    expect(clampScroll(1, 11, 9)).toBe(1);
    expect(clampScroll(5, 11, 9)).toBe(2);
  });

  it('pins a list that fits to the top', () => {
    expect(clampScroll(3, 6, 9)).toBe(0);
  });
});

describe('WheelRows', () => {
  it('moves a row per notch-sized step, and carries the rest', () => {
    const w = new WheelRows();
    expect(w.step(100)).toBe(2);
    expect(w.step(20)).toBe(1);
  });

  it('adds up small trackpad deltas', () => {
    const w = new WheelRows();
    expect(w.step(15)).toBe(0);
    expect(w.step(15)).toBe(0);
    expect(w.step(15)).toBe(1);
  });

  it('scrolls up with negative deltas, dropping travel saved the other way', () => {
    const w = new WheelRows();
    w.step(30);
    expect(w.step(-45)).toBe(-1);
  });

  it('counts line-mode deltas (Firefox) as lines of text', () => {
    const w = new WheelRows();
    expect(w.step(3, 1)).toBe(1);
  });
});
