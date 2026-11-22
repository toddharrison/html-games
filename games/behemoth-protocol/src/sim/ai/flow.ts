import type { MobilityId, UnitMobility } from '../../content/terrain';
import type { Rect } from '../math';
import type { Terrain } from '../terrain';

/**
 * A breadth-first distance field over terrain tiles toward one goal, for one mobility type.
 * Used in the last stand, where every unit converges on a stationary Behemoth: a unit whose
 * straight path is blocked (rock, buildings) walks downhill on the field to get around.
 */
export interface FlowField {
  /** First column covered. */
  c0: number;
  cols: number;
  rows: number;
  /** Steps to the goal per tile (col-major from c0); -1 = impassable or unreachable. */
  dist: Int32Array;
}

const UNREACHED = -1;

/**
 * Builds the field over columns overlapping world x in [x0, x1], toward the open tiles bordering
 * `goal` (the Behemoth's footprint). Tiles overlapping the goal itself are blocked, so routes end
 * beside the hull, not in it.
 */
export function buildFlow(t: Terrain, mobility: MobilityId, goal: Rect, x0: number, x1: number): FlowField {
  const ts = t.tileSize;
  const c0 = Math.floor(x0 / ts);
  const cols = Math.floor(x1 / ts) - c0 + 1;
  const rows = t.rows;
  const dist = new Int32Array(cols * rows).fill(UNREACHED);
  const passable = (c: number, r: number) => t.speedAt((c0 + c + 0.5) * ts, (r + 0.5) * ts, mobility) > 0;

  const queue = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;
  const hc0 = Math.floor(goal.x0 / ts) - c0;
  const hc1 = Math.floor(goal.x1 / ts) - c0;
  const hr0 = Math.floor(goal.y0 / ts);
  const hr1 = Math.floor(goal.y1 / ts);
  const inHull = (c: number, r: number) => c >= hc0 && c <= hc1 && r >= hr0 && r <= hr1;
  for (let c = hc0 - 1; c <= hc1 + 1; c++) {
    for (let r = hr0 - 1; r <= hr1 + 1; r++) {
      if (c < 0 || c >= cols || r < 0 || r >= rows || inHull(c, r) || !passable(c, r)) continue;
      dist[c * rows + r] = 0;
      queue[tail++] = c * rows + r;
    }
  }
  while (head < tail) {
    const i = queue[head++]!;
    const c = Math.floor(i / rows);
    const r = i - c * rows;
    const d = dist[i]! + 1;
    for (const [nc, nr] of [
      [c + 1, r],
      [c - 1, r],
      [c, r + 1],
      [c, r - 1],
    ] as const) {
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const n = nc * rows + nr;
      if (dist[n] !== UNREACHED || inHull(nc, nr) || !passable(nc, nr)) continue;
      dist[n] = d;
      queue[tail++] = n;
    }
  }
  return { c0, cols, rows, dist };
}

function distAt(f: FlowField, c: number, r: number): number {
  const lc = c - f.c0;
  if (lc < 0 || lc >= f.cols || r < 0 || r >= f.rows) return UNREACHED;
  return f.dist[lc * f.rows + r]!;
}

/**
 * Center of the neighboring tile one step closer to the goal, or null if the unit is off the
 * field or nowhere downhill. Diagonal steps only when both tiles beside them are open, so units
 * don't cut corners into rock.
 */
export function flowStep(f: FlowField, ts: number, x: number, y: number): { x: number; y: number } | null {
  const c = Math.floor(x / ts);
  const r = Math.floor(y / ts);
  const here = distAt(f, c, r);
  let best: [number, number] | null = null;
  let bestD = here === UNREACHED ? Infinity : here;
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (dc === 0 && dr === 0) continue;
      const d = distAt(f, c + dc, r + dr);
      if (d === UNREACHED) continue;
      if (dc !== 0 && dr !== 0 && (distAt(f, c + dc, r) === UNREACHED || distAt(f, c, r + dr) === UNREACHED)) continue;
      // Diagonals cost a little more, so straight steps win ties.
      const score = d + (dc !== 0 && dr !== 0 ? 0.4 : 0);
      if (score < bestD) {
        bestD = score;
        best = [c + dc, r + dr];
      }
    }
  }
  return best ? { x: (best[0] + 0.5) * ts, y: (best[1] + 0.5) * ts } : null;
}

/** Whether a unit of this radius would run into impassable ground going straight from (x0,y0) to (x1,y1). */
export function pathBlocked(t: Terrain, mobility: UnitMobility, radius: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1) return false;
  // The center line plus one along each side of the unit.
  const px = (-dy / len) * radius;
  const py = (dx / len) * radius;
  const steps = Math.ceil(len / (t.tileSize / 4));
  for (let i = 1; i <= steps; i++) {
    const s = i / steps;
    const x = x0 + dx * s;
    const y = y0 + dy * s;
    for (const k of [0, 1, -1]) {
      if (t.speedAt(x + px * k, y + py * k, mobility) === 0) return true;
    }
  }
  return false;
}
