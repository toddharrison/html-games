import { MATERIALS } from '../../content/terrain';
import type { Enemy } from '../entities';
import { clamp } from '../math';
import { riverCenter, type River } from '../terrain';
import type { World } from '../world';

/**
 * Rivers (SPEC §4.5): units that can't enter deep water (tracked vehicles) cross at a ford or a
 * standing bridge. When a unit's target lies across a river, this gives it a waypoint: first the
 * near end of the crossing that makes the shortest detour, then straight across it. Null when no
 * crossing is needed (or the river is frozen over).
 */
export function viaFord(e: Enemy, w: World, tx: number, ty: number): { x: number; y: number } | null {
  // Hovercraft go straight over.
  const mobility = e.def.mobility;
  if (mobility === 'hover') return null;
  const t = w.terrain;
  const ts = t.tileSize;
  const rows = t.rows;
  for (const rv of t.riversNear(Math.min(e.x, tx), Math.max(e.x, tx))) {
    // A frozen channel (thin ice) can be driven straight across.
    if (MATERIALS[rv.channel].speed[mobility].intact > 0) continue;
    const from = side(rv, e.x, e.y, ts, rows);
    const to = side(rv, tx, ty, ts, rows);
    // Fords, and the bridge while it stands.
    const crossings = t.crossings(rv);
    if (from === to || crossings.length === 0) continue;

    // The crossing it's already on, if the whole unit fits between its edges.
    const r = e.def.radius;
    const inside = crossings.find(([a, b]) => e.y - r >= a * ts && e.y + r <= b * ts);
    // A point on the bank just past the shallows, on side s.
    const bank = (row: number, s: number) => (riverCenter(rv, row, rows) + s * (rv.half + 1.25)) * ts;
    if (inside) {
      const [a, b] = inside;
      const y = clamp(e.y, a * ts + r, b * ts - r);
      return { x: bank(y / ts, to), y };
    }
    // The crossing whose middle makes the shortest trip from here to the target.
    let best = crossings[0]!;
    let bestCost = Infinity;
    for (const f of crossings) {
      const fy = ((f[0] + f[1]) / 2) * ts;
      const cost = Math.abs(e.y - fy) + Math.abs(ty - fy);
      if (cost < bestCost) {
        bestCost = cost;
        best = f;
      }
    }
    const fy = ((best[0] + best[1]) / 2) * ts;
    return { x: bank(fy / ts, from), y: fy };
  }
  return null;
}

/** Which side of a river's center line a point is on: -1 behind it (smaller x), +1 beyond. */
function side(rv: River, x: number, y: number, ts: number, rows: number): -1 | 1 {
  return x / ts < riverCenter(rv, clamp(y / ts, 0, rows), rows) ? -1 : 1;
}
