import { describe, expect, it } from 'vitest';
import { FLAME_RAMP, HeatField, HOT_RAMP, rampTable } from '../../src/render/flameField';

const W = 40;
const H = 40;

/** The rows that hold any heat, top and bottom (null: none). */
function rows(f: HeatField): [number, number] | null {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (f.heat[y * W + x]! === 0) continue;
      if (top < 0) top = y;
      bottom = y;
    }
  }
  return top < 0 ? null : [top, bottom];
}

describe('heat field', () => {
  it('is cold until something burns, and heat only goes in on a step', () => {
    const f = new HeatField(W, H);
    expect(f.alight).toBe(false);
    expect(f.step()).toBe(false);
    f.add(20, 30, 3, 255);
    expect(f.alight).toBe(true);
    expect(rows(f)).toBeNull();
    expect(f.step()).toBe(true);
    expect(rows(f)).not.toBeNull();
  });

  it('a fed fire stands as a flame above its source, hottest at the bottom', () => {
    const f = new HeatField(W, H);
    for (let i = 0; i < 30; i++) {
      f.add(20, 30, 3, 255);
      f.step();
    }
    const [top] = rows(f)!;
    // Well above the source's own top edge (row 27), and not off to the top of the field.
    expect(top).toBeLessThan(24);
    expect(top).toBeGreaterThan(4);
    const column = (y: number) => f.heat[y * W + 20]!;
    expect(column(29)).toBeGreaterThan(column(24));
  });

  it('left alone it rises, cools, and goes out', () => {
    const f = new HeatField(W, H);
    f.add(20, 30, 3, 255);
    f.step();
    const before = rows(f)!;
    for (let i = 0; i < 4; i++) f.step();
    expect(rows(f)![0]).toBeLessThan(before[0]);
    let steps = 0;
    while (f.step() && steps < 200) steps++;
    expect(steps).toBeLessThan(60);
    expect(f.alight).toBe(false);
    expect(rows(f)).toBeNull();
  });

  it('never leaves the field: nothing wraps round the sides or the top', () => {
    const f = new HeatField(W, H);
    for (let i = 0; i < 40; i++) {
      f.add(1, 5, 4, 255);
      f.add(W - 2, 5, 4, 255);
      f.step();
    }
    for (let y = 0; y < H; y++) {
      expect(f.heat[y * W]).toBe(0);
      expect(f.heat[y * W + W - 1]).toBe(0);
    }
    // The spare rows below stay cold.
    expect(f.heat.subarray(W * H).every((v) => v === 0)).toBe(true);
  });

  it('scrolls with the ground, heat waiting to go in too', () => {
    const f = new HeatField(W, H);
    f.add(20, 20, 2, 255);
    f.step();
    const [top, bottom] = rows(f)!;
    f.scroll(5);
    expect(rows(f)).toEqual([top + 5, bottom + 5]);
    f.scroll(-8);
    expect(rows(f)).toEqual([top - 3, bottom - 3]);
    f.clear();
    f.add(20, 20, 0.5, 255);
    f.scroll(4);
    f.step();
    expect(f.heat[24 * W + 20]! + f.heat[23 * W + 20]!).toBeGreaterThan(0);
    // Scrolled right off the field: gone.
    f.scroll(H);
    expect(f.alight).toBe(false);
  });

  it('paints through the ramp: nothing where it is cold, a flat color per band', () => {
    const f = new HeatField(W, H);
    for (let i = 0; i < 10; i++) {
      f.add(20, 30, 4, 255);
      f.step();
    }
    const ramp = rampTable();
    const out = new Uint32Array(W * H);
    out.fill(0xdeadbeef);
    f.paint(out, ramp);
    expect(out[0]).toBe(0);
    const colors = new Set(out);
    colors.delete(0);
    expect(colors.size).toBeGreaterThan(2);
    expect(colors.size).toBeLessThanOrEqual(FLAME_RAMP.length);
    for (const c of colors) expect(ramp).toContain(c);
  });

  it('the ramp draws nothing below its first stop and is opaque at the top', () => {
    const ramp = rampTable();
    const bytes = new Uint8Array(ramp.buffer);
    expect(ramp[FLAME_RAMP[0]!.heat - 1]).toBe(0);
    expect(bytes[255 * 4 + 3]).toBe(255);
    expect(bytes[255 * 4]).toBe(0xff);
  });

  it('the hot ramp is the same bands in blue: it can never be taken for ordinary fire', () => {
    expect(HOT_RAMP.map((s) => [s.heat, s.alpha])).toEqual(FLAME_RAMP.map((s) => [s.heat, s.alpha]));
    const channels = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff] as const;
    for (const s of HOT_RAMP) {
      const [r, , b] = channels(s.color);
      expect(b).toBeGreaterThan(r);
    }
    // Ordinary fire is red over blue in every band, up to its near-white core.
    for (const s of FLAME_RAMP) {
      const [r, , b] = channels(s.color);
      expect(r).toBeGreaterThan(b);
    }
  });

  it("the glow is the fire's light at a coarser scale, spread a little past it", () => {
    const f = new HeatField(W, H);
    for (let i = 0; i < 10; i++) {
      f.add(20, 30, 3, 255);
      f.step();
    }
    const glow = new Uint8Array((W / 4) * (H / 4));
    f.glow(glow, 4);
    const at = (gx: number, gy: number) => glow[gy * (W / 4) + gx]!;
    expect(at(5, 7)).toBeGreaterThan(at(7, 7));
    expect(at(7, 7)).toBeGreaterThan(0);
    expect(at(0, 0)).toBe(0);
  });
});
