// Grid searches for world generation: breadth-first distance and cheapest paths. Ties always break by
// tile index, so results never depend on anything but the inputs.

import { SIZE } from '../world.ts';

export const N = SIZE * SIZE;
/** Four-way neighbours, in the order north, east, south, west. */
export const DX4 = [0, 1, 0, -1] as const;
export const DY4 = [-1, 0, 1, 0] as const;
export const DX8 = [0, 1, 1, 1, 0, -1, -1, -1] as const;
export const DY8 = [-1, -1, 0, 1, 1, 1, 0, -1] as const;

/** Calls `f` with each in-bounds four-way neighbour of tile `i`. */
export function forNeighbours4(i: number, f: (n: number, x: number, y: number) => void): void {
  const x = i % SIZE;
  const y = (i - x) / SIZE;
  for (let d = 0; d < 4; d++) {
    const nx = x + DX4[d]!;
    const ny = y + DY4[d]!;
    if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE) f(ny * SIZE + nx, nx, ny);
  }
}

/**
 * Steps from the nearest source to every tile that `open` allows, or -1. Eight-way when `diagonal`
 * (Chebyshev distance), four-way otherwise. Sources are always distance 0, open or not.
 */
export function bfs(sources: readonly number[], open: (i: number) => boolean, diagonal = false, maxDist = Infinity): Int32Array {
  const dist = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  let head = 0;
  let tail = 0;
  for (const s of sources) {
    if (dist[s] === -1) {
      dist[s] = 0;
      queue[tail++] = s;
    }
  }
  const dxs = diagonal ? DX8 : DX4;
  const dys = diagonal ? DY8 : DY4;
  while (head < tail) {
    const i = queue[head++]!;
    const d = dist[i]!;
    if (d >= maxDist) continue;
    const x = i % SIZE;
    const y = (i - x) / SIZE;
    for (let k = 0; k < dxs.length; k++) {
      const nx = x + dxs[k]!;
      const ny = y + dys[k]!;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const n = ny * SIZE + nx;
      if (dist[n] !== -1 || !open(n)) continue;
      dist[n] = d + 1;
      queue[tail++] = n;
    }
  }
  return dist;
}

/** A binary min-heap of tiles keyed by cost, ties broken by tile index. */
class TileHeap {
  private costs: number[] = [];
  private tiles: number[] = [];
  get size(): number {
    return this.tiles.length;
  }
  private less(a: number, b: number): boolean {
    const ca = this.costs[a]!;
    const cb = this.costs[b]!;
    return ca < cb || (ca === cb && this.tiles[a]! < this.tiles[b]!);
  }
  private swap(a: number, b: number): void {
    const c = this.costs[a]!;
    this.costs[a] = this.costs[b]!;
    this.costs[b] = c;
    const t = this.tiles[a]!;
    this.tiles[a] = this.tiles[b]!;
    this.tiles[b] = t;
  }
  push(cost: number, tile: number): void {
    this.costs.push(cost);
    this.tiles.push(tile);
    let i = this.tiles.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): { cost: number; tile: number } {
    const top = { cost: this.costs[0]!, tile: this.tiles[0]! };
    const lastC = this.costs.pop()!;
    const lastT = this.tiles.pop()!;
    if (this.tiles.length > 0) {
      this.costs[0] = lastC;
      this.tiles[0] = lastT;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.tiles.length && this.less(l, m)) m = l;
        if (r < this.tiles.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}

/**
 * The cheapest four-way path from `start` to the nearest tile where `goal` holds, start and goal
 * included, or null. `cost(from, to)` is the price of a step; Infinity forbids it.
 */
export function cheapestPath(start: number, cost: (from: number, to: number) => number, goal: (i: number) => boolean): number[] | null {
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = new TileHeap();
  dist[start] = 0;
  heap.push(0, start);
  while (heap.size > 0) {
    const { cost: c, tile: i } = heap.pop();
    if (c > dist[i]!) continue;
    if (goal(i)) {
      const path: number[] = [];
      for (let t = i; t !== -1; t = prev[t]!) path.push(t);
      return path.reverse();
    }
    forNeighbours4(i, (n) => {
      const step = cost(i, n);
      if (step === Infinity) return;
      const nc = c + step;
      if (nc < dist[n]!) {
        dist[n] = nc;
        prev[n] = i;
        heap.push(nc, n);
      }
    });
  }
  return null;
}

/** The four-way connected tiles from `start` where `open` holds, marking each in `seen`. */
export function floodFill(start: number, open: (i: number) => boolean, seen: Uint8Array): number[] {
  const out = [start];
  seen[start] = 1;
  for (let head = 0; head < out.length; head++) {
    forNeighbours4(out[head]!, (n) => {
      if (!seen[n] && open(n)) {
        seen[n] = 1;
        out.push(n);
      }
    });
  }
  return out;
}
