// Finding a way to somewhere (SPEC 5.2): the path a `goto` command follows. A* on the four-way grid,
// costed by each step's ticks and what the kid would rather avoid (step.ts routeCost), bounded so a click
// far away can't stall a tick. Ties break by
// tile index, so the same state always finds the same path (SPEC 11.3).

import { BASE_STEP_TICKS, ROUTE_TRAIL } from '../content/balance.ts';
import type { Dir } from './state.ts';

const SIZE = 256;
const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;

/** How many tiles the search may open before it gives up (more since routes go round water, 2026-11-27). */
export const ROUTE_LIMIT = 16000;

/**
 * The directions to walk from (sx, sy) to the nearest tile where `goal` holds, or null if none is found
 * within ROUTE_LIMIT. `open(x, y)` says whether a tile can be stepped onto; `cost(from, to)` is a step's
 * cost, never less than CHEAPEST. (tx, ty) is where the goal is, for the estimate.
 */
export function findRoute(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  goal: (x: number, y: number) => boolean,
  open: (x: number, y: number) => boolean,
  cost: (from: number, to: number) => number,
): Dir[] | null {
  const start = sy * SIZE + sx;
  if (goal(sx, sy)) return [];
  const g = new Map<number, number>();
  const prev = new Map<number, number>();
  const heap = new Heap();
  g.set(start, 0);
  heap.push(est(sx, sy, tx, ty), 0, start);
  let opened = 0;
  while (heap.size > 0) {
    const { tile, g: gc } = heap.pop();
    if (gc > (g.get(tile) ?? Infinity)) continue;
    const x = tile % SIZE;
    const y = (tile - x) / SIZE;
    if (tile !== start && goal(x, y)) return unwind(prev, start, tile);
    if (++opened > ROUTE_LIMIT) return null;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d]!;
      const ny = y + DY[d]!;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || !open(nx, ny)) continue;
      const n = ny * SIZE + nx;
      const nc = gc + cost(tile, n);
      if (nc < (g.get(n) ?? Infinity)) {
        g.set(n, nc);
        prev.set(n, tile);
        heap.push(nc + est(nx, ny, tx, ty), nc, n);
      }
    }
  }
  return null;
}

/** The cheapest a step can cost (a step along a game trail), so the estimate never overshoots. */
const CHEAPEST = BASE_STEP_TICKS - ROUTE_TRAIL;

function est(x: number, y: number, tx: number, ty: number): number {
  return (Math.abs(x - tx) + Math.abs(y - ty)) * CHEAPEST;
}

function unwind(prev: Map<number, number>, start: number, end: number): Dir[] {
  const out: Dir[] = [];
  for (let t = end; t !== start; ) {
    const p = prev.get(t)!;
    const d = t - p;
    out.push(d === 1 ? 1 : d === -1 ? 3 : d === SIZE ? 2 : 0);
    t = p;
  }
  return out.reverse();
}

/** A binary heap ordered by estimate, then cost so far (higher first, so deeper paths win ties), then tile. */
class Heap {
  private f: number[] = [];
  private gs: number[] = [];
  private t: number[] = [];
  get size(): number {
    return this.t.length;
  }
  private less(a: number, b: number): boolean {
    if (this.f[a] !== this.f[b]) return this.f[a]! < this.f[b]!;
    if (this.gs[a] !== this.gs[b]) return this.gs[a]! > this.gs[b]!;
    return this.t[a]! < this.t[b]!;
  }
  private swap(a: number, b: number): void {
    [this.f[a], this.f[b]] = [this.f[b]!, this.f[a]!];
    [this.gs[a], this.gs[b]] = [this.gs[b]!, this.gs[a]!];
    [this.t[a], this.t[b]] = [this.t[b]!, this.t[a]!];
  }
  push(f: number, g: number, tile: number): void {
    this.f.push(f);
    this.gs.push(g);
    this.t.push(tile);
    let i = this.t.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): { tile: number; g: number } {
    const top = { tile: this.t[0]!, g: this.gs[0]! };
    const last = this.t.length - 1;
    this.swap(0, last);
    this.f.pop();
    this.gs.pop();
    this.t.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < this.t.length && this.less(l, m)) m = l;
      if (r < this.t.length && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}
