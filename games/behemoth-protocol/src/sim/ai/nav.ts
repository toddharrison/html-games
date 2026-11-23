import { MATERIALS, type UnitMobility } from '../../content/terrain';
import { NAV } from '../../content/tuning';
import { footprint } from '../behemoth';
import type { Enemy } from '../entities';
import { circleIntersectsRect, type Rect } from '../math';
import type { Terrain } from '../terrain';
import type { World } from '../world';
import { capped, goTo, keepPace } from './steer';

/**
 * Navigation shared by every moving unit (SPEC §7): a behavior says where it wants to be (a
 * `Goal`), and `navigate` gets it there. Straight there when the way is clear; otherwise along a
 * route planned over the terrain tiles (A*), costed by how much the ground slows this unit, with
 * extra cost for hazards: a marked barrage zone, explosive terrain, and the Behemoth's path. Rivers
 * need nothing special: deep water is impassable to tracks, so routes find the fords and bridges.
 * Routes are replanned every `NAV.replan` s (staggered across units), since the hull and every
 * target point move. `separation` keeps units from driving into each other.
 */

/**
 * Where a behavior wants the unit, and how it means to get there. 'pace': a point that moves with
 * the Behemoth, or at `vel` if given (match its velocity and close in); 'arrive': walk there and
 * stop; 'speed': drive at it at `speed` (a convoy's pace, a charge).
 */
export interface Goal {
  x: number;
  y: number;
  mode: 'pace' | 'arrive' | 'speed';
  speed?: number;
  vel?: Velocity;
  /** It means to touch the hull (a bomb truck's charge): the hull and its danger zones are no obstacle to it. */
  contact?: boolean;
}

/** A unit's route: waypoints (world points, the last the goal or the nearest it can get), and the next one. */
export interface NavState {
  replanIn: number;
  path: { x: number; y: number }[] | null;
  next: number;
  /** The tiles the route runs over (column × rows + row), which the next plan favors (`NAV.stick`). */
  tiles: number[];
  /** The route ends at the goal (false: the goal can't be reached, so it ends as near as it gets). */
  reaches: boolean;
}

/** A desired velocity: what the unit wants this tick. Movement over terrain is enemies.ts's job. */
export type Velocity = { vx: number; vy: number };

/** The desired velocity that takes the unit toward its goal: straight, or along a planned route. */
export function navigate(e: Enemy, w: World, goal: Goal, dt: number): Velocity {
  const g = onOpenGround(e, w, goal.contact ? goal : clearOfZones(e, w, goal));
  const nav = (e.ai.nav ??= { replanIn: ((e.id % NAV.stagger) / NAV.stagger) * NAV.replan, path: null, next: 0, tiles: [], reaches: true });
  nav.replanIn -= dt;
  if (nav.replanIn <= 0) {
    nav.replanIn = NAV.replan;
    const route = lineClear(e, w, g) ? null : plan(e, w, g);
    nav.path = route?.path ?? null;
    nav.tiles = route?.tiles ?? [];
    nav.reaches = route?.reaches ?? true;
    nav.next = 0;
  }
  const path = nav.path;
  if (path) {
    while (nav.next < path.length - 1 && Math.hypot(path[nav.next]!.x - e.x, path[nav.next]!.y - e.y) < NAV.reached) nav.next++;
    const p = path[nav.next]!;
    if (nav.next < path.length - 1) {
      if (g.mode === 'speed') return toward(e, p.x, p.y, g.speed ?? e.def.maxSpeed);
      const v = toward(e, p.x, p.y, e.def.maxSpeed);
      // A goal moving with the hull: keep its pace while working round, or the hull runs it down.
      const ref = g.vel ?? w.behemoth;
      return g.mode === 'arrive' ? v : capped(e, ref.vx + v.vx, ref.vy + v.vy);
    }
    // The last leg: the goal itself, as the behavior asked; or, if it's out of reach, the nearest
    // point (kept pace with, if the goal moves with the hull: stopping in its path gets a unit run down).
    if (!nav.reaches) return g.mode === 'pace' ? keepPace(e, w, p.x, p.y, g.vel) : goTo(e, p.x, p.y);
  }
  return direct(e, w, g);
}

/**
 * A goal on ground the unit can't enter (a spot on a circle round the hull that falls on a building
 * or rock) moves to the middle of the nearest tile it can, within `NAV.snap` tiles, favoring the
 * unit's own side (`NAV.snapBias`) so the goal doesn't jump across an outcrop as it slides, and
 * away from the hull (`NAV.snapAway`). Done
 * every tick, so a goal that moves with the hull keeps moving.
 */
function onOpenGround(e: Enemy, w: World, g: Goal): Goal {
  const t = w.terrain;
  const mob = e.def.mobility;
  if (t.speedAt(g.x, g.y, mob) > 0) return g;
  const ts = t.tileSize;
  const gc = Math.floor(g.x / ts);
  const gr = Math.floor(g.y / ts);
  const b = w.behemoth;
  const toHull = Math.hypot(g.x - b.x, g.y - b.y);
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let k = 1; k <= NAV.snap; k++) {
    for (let dc = -k; dc <= k; dc++) {
      for (let dr = -k; dr <= k; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== k) continue;
        const row = gr + dr;
        if (row < 0 || row >= t.rows) continue;
        const x = (gc + dc + 0.5) * ts;
        const y = (row + 0.5) * ts;
        if (t.speedAt(x, y, mob) <= 0) continue;
        // Nearer the hull than the goal was is worse: a goal pushed toward the treads is never wanted.
        const closer = Math.max(0, toHull - Math.hypot(x - b.x, y - b.y));
        const d = Math.hypot(x - g.x, y - g.y) + NAV.snapBias * Math.hypot(x - e.x, y - e.y) + NAV.snapAway * closer;
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
  }
  return best ? { ...g, ...best } : g;
}

/** Straight at the goal, the way the behavior asked. */
function direct(e: Enemy, w: World, g: Goal): Velocity {
  if (g.mode === 'pace') return keepPace(e, w, g.x, g.y, g.vel);
  if (g.mode === 'arrive') return goTo(e, g.x, g.y);
  return toward(e, g.x, g.y, g.speed ?? e.def.maxSpeed);
}

function toward(e: Enemy, x: number, y: number, speed: number): Velocity {
  const dx = x - e.x;
  const dy = y - e.y;
  const d = Math.hypot(dx, dy);
  return d < 1e-6 ? { vx: 0, vy: 0 } : { vx: (dx / d) * speed, vy: (dy / d) * speed };
}

/**
 * Units keep clear of each other: each pair closer than their radii plus `NAV.sep.gap` pushes apart,
 * harder the deeper the overlap, up to `NAV.sep.max` × the unit's top speed. A shut trapdoor hole
 * doesn't count (it's under the sand).
 */
export function separation(e: Enemy, w: World): Velocity {
  const s = NAV.sep;
  let vx = 0;
  let vy = 0;
  for (const o of w.enemies) {
    if (o === e || !o.alive || o.def.trapdoor) continue;
    const min = e.def.radius + o.def.radius + s.gap;
    const dx = e.x - o.x;
    const dy = e.y - o.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2);
    const push = (min - d) * s.gain;
    // Exactly on top of each other: split across the field, the older unit one way.
    if (d < 1e-3) vy += (e.id < o.id ? -1 : 1) * push;
    else {
      vx += (dx / d) * push;
      vy += (dy / d) * push;
    }
  }
  const m = Math.hypot(vx, vy);
  const cap = e.def.maxSpeed * s.max;
  return m > cap ? { vx: (vx * cap) / m, vy: (vy * cap) / m } : { vx, vy };
}

// ── Hazards ─────────────────────────────────────────────────────────────────────────────────────

/** A barrage zone the unit has had time to see coming (`NAV.zone.react` after it was marked), until its last round lands. */
function activeZones(w: World): World['barrages'] {
  return w.barrages.filter((z) => w.time - z.from >= NAV.zone.react && w.time < z.until);
}

/** A goal inside a marked zone moves out to its edge, straight away from the zone's middle. */
function clearOfZones(e: Enemy, w: World, g: Goal): Goal {
  let { x, y } = g;
  for (const z of activeZones(w)) {
    const reach = z.radius + e.def.radius + NAV.zone.pad;
    const dx = x - z.x;
    const dy = y - z.y;
    const d = Math.hypot(dx, dy);
    if (d >= reach) continue;
    // Dead center: out on the side the unit is on.
    const ux = d > 1e-3 ? dx / d : Math.sign(e.x - z.x) || 1;
    const uy = d > 1e-3 ? dy / d : 0;
    x = z.x + ux * reach;
    y = z.y + uy * reach;
  }
  return x === g.x && y === g.y ? g : { ...g, x, y };
}

/** The ground the Behemoth will drive over in the next `NAV.hull.lead` s, widened by a unit's radius and `NAV.hull.pad`. */
function hullZone(e: Enemy, w: World): Rect {
  const b = w.behemoth;
  const f = footprint(b);
  const pad = e.def.radius + NAV.hull.pad;
  const ahead = Math.max(0, b.vx) * NAV.hull.lead;
  return { x0: f.x0 - pad, y0: f.y0 - pad, x1: f.x1 + ahead + pad, y1: f.y1 + pad };
}

/** Explosive terrain still standing (fuel tanks, derricks; not mines, which enemies know and never set off). */
function explosiveAt(t: Terrain, col: number, row: number): { radius: number } | null {
  const tile = t.tile(col, row);
  if (!tile || tile.state === 'destroyed' || tile.state === 'flattened') return null;
  const m = MATERIALS[tile.mat];
  return m.explodes && !m.hidden ? m.explodes : null;
}

// ── The straight line ───────────────────────────────────────────────────────────────────────────

/**
 * Whether the unit can head straight for its goal: nothing impassable in the way (allowing for its
 * width), no slow ground (below `NAV.slow`) between its own tile and the goal's (a squad's goal is
 * often a wood), no hazard, and it doesn't cut across the hull's path.
 */
function lineClear(e: Enemy, w: World, g: Goal): boolean {
  const t = w.terrain;
  const mob = e.def.mobility;
  const r = e.def.radius;
  if (pathBlocked(t, mob, r, e.x, e.y, g.x, g.y)) return false;
  const ts = t.tileSize;
  const dx = g.x - e.x;
  const dy = g.y - e.y;
  const len = Math.hypot(dx, dy);
  const steps = Math.ceil(len / (ts / 2));
  const sc = Math.floor(e.x / ts);
  const sr = Math.floor(e.y / ts);
  const gc = Math.floor(g.x / ts);
  const gr = Math.floor(g.y / ts);
  const zones = g.contact ? [] : activeZones(w);
  const hull = g.contact ? null : hullZone(e, w);
  const startInHull = hull !== null && circleIntersectsRect(e.x, e.y, 0, hull);
  for (let i = 1; i <= steps; i++) {
    const s = i / steps;
    const x = e.x + dx * s;
    const y = e.y + dy * s;
    const c = Math.floor(x / ts);
    const row = Math.floor(y / ts);
    const ends = (c === sc && row === sr) || (c === gc && row === gr);
    if (!ends && t.speedAt(x, y, mob) < NAV.slow) return false;
    if (hull && !startInHull && circleIntersectsRect(x, y, 0, hull)) return false;
    for (const z of zones) if (Math.hypot(x - z.x, y - z.y) < z.radius + r + NAV.zone.pad) return false;
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (!ends && explosiveAt(t, c + dc, row + dr)) return false;
  }
  return true;
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

// ── Route planning ──────────────────────────────────────────────────────────────────────────────

/** The tiles a plan covers and what each costs to cross (Infinity = impassable). */
interface CostGrid {
  c0: number;
  cols: number;
  rows: number;
  cost: Float32Array;
}

/**
 * The cost of crossing each tile in a window round the unit and its goal: 1 / the ground's speed for
 * this unit, plus hazards. Wide units also pay `NAV.edgeCost` beside anything impassable, so they
 * keep to the middle of a gap.
 */
function costGrid(e: Enemy, w: World, g: Goal): CostGrid {
  const t = w.terrain;
  const ts = t.tileSize;
  const rows = t.rows;
  const lo = Math.floor(Math.min(e.x, g.x) / ts) - NAV.pad;
  const hi = Math.floor(Math.max(e.x, g.x) / ts) + NAV.pad;
  // A far goal: the window stops short of it, on its side of the unit.
  let c0 = lo;
  let c1 = hi;
  if (c1 - c0 + 1 > NAV.maxCols) {
    if (g.x >= e.x) c1 = c0 + NAV.maxCols - 1;
    else c0 = c1 - NAV.maxCols + 1;
  }
  const cols = c1 - c0 + 1;
  const cost = new Float32Array(cols * rows);
  const mob = e.def.mobility;
  const r = e.def.radius;
  for (let c = 0; c < cols; c++) {
    for (let row = 0; row < rows; row++) {
      const v = t.speedAt((c0 + c + 0.5) * ts, (row + 0.5) * ts, mob);
      cost[c * rows + row] = v > 0 ? 1 / v : Infinity;
    }
  }
  const blocked = (c: number, row: number) => c >= 0 && c < cols && row >= 0 && row < rows && cost[c * rows + row] === Infinity;
  if (r >= NAV.wideAt) {
    for (let c = 0; c < cols; c++) {
      for (let row = 0; row < rows; row++) {
        const i = c * rows + row;
        if (cost[i] === Infinity) continue;
        if (blocked(c + 1, row) || blocked(c - 1, row) || blocked(c, row + 1) || blocked(c, row - 1)) cost[i] = cost[i]! + NAV.edgeCost;
      }
    }
  }
  // Add `extra` to every tile whose middle is within `reach` of (x, y).
  const stamp = (x: number, y: number, reach: number, extra: number) => {
    const ca = Math.max(0, Math.floor((x - reach) / ts) - c0);
    const cb = Math.min(cols - 1, Math.floor((x + reach) / ts) - c0);
    const ra = Math.max(0, Math.floor((y - reach) / ts));
    const rb = Math.min(rows - 1, Math.floor((y + reach) / ts));
    for (let c = ca; c <= cb; c++) {
      for (let row = ra; row <= rb; row++) {
        if (Math.hypot((c0 + c + 0.5) * ts - x, (row + 0.5) * ts - y) <= reach) cost[c * rows + row] = cost[c * rows + row]! + extra;
      }
    }
  };
  if (!g.contact) {
    for (const z of activeZones(w)) stamp(z.x, z.y, z.radius + r + NAV.zone.pad, NAV.zone.cost);
    const h = hullZone(e, w);
    const ca = Math.max(0, Math.floor(h.x0 / ts) - c0);
    const cb = Math.min(cols - 1, Math.floor(h.x1 / ts) - c0);
    const ra = Math.max(0, Math.floor(h.y0 / ts));
    const rb = Math.min(rows - 1, Math.floor(h.y1 / ts));
    // Dearest on the hull's line, falling off toward the zone's sides, so a route from inside it
    // gets out sideways rather than along it.
    const mid = (h.y0 + h.y1) / 2;
    const half = (h.y1 - h.y0) / 2;
    for (let c = ca; c <= cb; c++) {
      for (let row = ra; row <= rb; row++) {
        const off = Math.abs((row + 0.5) * ts - mid) / half;
        const share = Math.max(NAV.hull.edge, 1 - off * (1 - NAV.hull.edge));
        cost[c * rows + row] = cost[c * rows + row]! + NAV.hull.cost * share;
      }
    }
  }
  for (let c = 0; c < cols; c++) {
    for (let row = 0; row < rows; row++) {
      const x = explosiveAt(t, c0 + c, row);
      if (x) stamp((c0 + c + 0.5) * ts, (row + 0.5) * ts, x.radius * NAV.blast.share + r, NAV.blast.cost);
    }
  }
  // The route it's on is a little cheaper, so it doesn't flip between two near-equal ways round.
  for (const k of e.ai.nav?.tiles ?? []) {
    const c = Math.floor(k / rows) - c0;
    if (c >= 0 && c < cols) cost[c * rows + (k % rows)] = cost[c * rows + (k % rows)]! * NAV.stick;
  }
  return { c0, cols, rows, cost };
}

/**
 * A route to the goal over the tiles (A*, eight ways, no cutting corners past impassable tiles),
 * smoothed into as few straight legs as the ground allows. If the goal can't be reached the route
 * ends at the reachable tile nearest it. Null if the unit is boxed in.
 */
export function plan(e: Enemy, w: World, g: Goal): { path: { x: number; y: number }[]; tiles: number[]; reaches: boolean } | null {
  const ts = w.terrain.tileSize;
  const grid = costGrid(e, w, g);
  const { c0, cols, rows, cost } = grid;
  const clampC = (x: number) => Math.max(0, Math.min(cols - 1, Math.floor(x / ts) - c0));
  const clampR = (y: number) => Math.max(0, Math.min(rows - 1, Math.floor(y / ts)));
  const start = clampC(e.x) * rows + clampR(e.y);
  const goalC = clampC(g.x);
  const goalR = clampR(g.y);
  const goal = goalC * rows + goalR;
  const n = cols * rows;
  const gScore = new Float32Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const h = (i: number) => {
    const dc = Math.abs(Math.floor(i / rows) - goalC);
    const dr = Math.abs((i % rows) - goalR);
    return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
  };
  const heap = new Heap();
  gScore[start] = 0;
  heap.push(start, h(start));
  let best = start;
  let bestH = h(start);
  let expanded = 0;
  while (heap.size > 0 && expanded < NAV.maxExpand) {
    const i = heap.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    expanded++;
    const hi = h(i);
    if (hi < bestH) {
      bestH = hi;
      best = i;
    }
    if (i === goal) break;
    const c = Math.floor(i / rows);
    const row = i % rows;
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        const nc = c + dc;
        const nr = row + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        const j = nc * rows + nr;
        if (closed[j] || cost[j] === Infinity) continue;
        const diag = dc !== 0 && dr !== 0;
        if (diag && (cost[c * rows + nr] === Infinity || cost[nc * rows + row] === Infinity)) continue;
        const tentative = gScore[i]! + (diag ? Math.SQRT2 : 1) * cost[j]!;
        if (tentative >= gScore[j]!) continue;
        gScore[j] = tentative;
        parent[j] = i;
        heap.push(j, tentative + h(j));
      }
    }
  }
  const reaches = best === goal;
  if (best === start && !reaches) return null;
  const tiles: number[] = [];
  for (let i = best; i !== -1; i = parent[i]!) tiles.push(i);
  tiles.reverse();
  const pts = tiles.map((i) => ({ x: (c0 + Math.floor(i / rows) + 0.5) * ts, y: ((i % rows) + 0.5) * ts }));
  pts[0] = { x: e.x, y: e.y };
  if (reaches) pts[pts.length - 1] = { x: g.x, y: g.y };
  return { path: smooth(e, w, grid, tiles, pts), tiles: tiles.map((i) => (c0 + Math.floor(i / rows)) * rows + (i % rows)), reaches };
}

/**
 * Pull the route straight: from each corner, skip ahead to the farthest point the unit can drive to
 * in a straight line over ground no costlier than the route's own between them.
 */
function smooth(e: Enemy, w: World, grid: CostGrid, tiles: number[], pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let a = 0;
  while (a < pts.length - 1) {
    let next = a + 1;
    let worst = 0;
    for (let k = a + 1; k < pts.length && k - a <= NAV.smoothReach; k++) {
      worst = Math.max(worst, grid.cost[tiles[k]!]!);
      if (legOk(e, w, grid, pts[a]!, pts[k]!, worst)) next = k;
    }
    out.push(pts[next]!);
    a = next;
  }
  return out;
}

/** A straight leg, allowing for the unit's width, crosses no tile costlier than `limit` (and nothing impassable). */
function legOk(e: Enemy, w: World, grid: CostGrid, p: { x: number; y: number }, q: { x: number; y: number }, limit: number): boolean {
  const t = w.terrain;
  const ts = t.tileSize;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return true;
  const r = e.def.radius;
  const px = (-dy / len) * r;
  const py = (dx / len) * r;
  const steps = Math.ceil(len / (ts / 4));
  for (let i = 1; i <= steps; i++) {
    const s = i / steps;
    for (const k of [0, 1, -1]) {
      const x = p.x + dx * s + px * k;
      const y = p.y + dy * s + py * k;
      const c = Math.floor(x / ts) - grid.c0;
      const row = Math.floor(y / ts);
      if (c < 0 || c >= grid.cols || row < 0 || row >= grid.rows) {
        if (t.speedAt(x, y, e.def.mobility) === 0) return false;
        continue;
      }
      // The sides only need to be passable; the center line also keeps to the route's costs.
      const v = grid.cost[c * grid.rows + row]!;
      if (v === Infinity || (k === 0 && v > limit + 1e-6)) return false;
    }
  }
  return true;
}

/** A binary min-heap of tile indices by priority. */
class Heap {
  private idx: number[] = [];
  private pri: number[] = [];
  get size(): number {
    return this.idx.length;
  }
  push(i: number, p: number): void {
    const idx = this.idx;
    const pri = this.pri;
    let k = idx.length;
    idx.push(i);
    pri.push(p);
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (pri[up]! <= p) break;
      idx[k] = idx[up]!;
      pri[k] = pri[up]!;
      k = up;
    }
    idx[k] = i;
    pri[k] = p;
  }
  pop(): number {
    const idx = this.idx;
    const pri = this.pri;
    const top = idx[0]!;
    const li = idx.pop()!;
    const lp = pri.pop()!;
    const n = idx.length;
    if (n > 0) {
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && pri[r]! < pri[l]! ? r : l;
        if (pri[m]! >= lp) break;
        idx[k] = idx[m]!;
        pri[k] = pri[m]!;
        k = m;
      }
      idx[k] = li;
      pri[k] = lp;
    }
    return top;
  }
}
