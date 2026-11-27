// Fallen trees across the streams (SPEC 6.3): a way over without wading, which matters to a kid with a
// notebook in their pocket (sim/notebook.ts). Where a stream is one to three tiles across between open
// banks, with trees close enough on a bank that one could have fallen over it, a trunk spans it. Game
// trails cross on them first (animals use them too), and one lies near the start. Spaced out along the
// water. Placed after the trails; never branches on the deal.

import { F, FEATURES, FLAG, T, TERRAIN, WATER } from '../../content/terrain.ts';
import { hash2f } from '../rng.ts';
import { type Gen, dist2, xOf, yOf } from './gen.ts';
import { N } from './grid.ts';
import { SIZE } from '../world.ts';

/** The most bridges in a valley, the widest stream one spans, and how far apart they lie (tiles). */
const MAX_BRIDGES = 12;
const MAX_SPAN = 3;
const SPACING = 18;
/** Within this of the start, a crossing is favoured, so there's one to find early. */
const NEAR_START = 30;

export function layLogBridges(g: Gen): void {
  const stream = (i: number) => g.terrain[i] === T.stream || g.terrain[i] === T.gravel;
  const bank = (i: number) => {
    const t = g.terrain[i]!;
    const f = FEATURES[g.feature[i]!]!;
    return TERRAIN[t]!.passable && !TERRAIN[t]!.water && g.water[i] === WATER.none && !f.blocks;
  };
  const trees = (i: number) => {
    let n = 0;
    const x = xOf(i);
    const y = yOf(i);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const f = g.feature[ny * SIZE + nx];
        if (f === F.conifer || f === F.aspen) n++;
      }
    }
    return n;
  };
  const candidates: { at: number; dx: number; dy: number; len: number; score: number }[] = [];
  for (let i = 0; i < N; i++) {
    if (!bank(i)) continue;
    const x = xOf(i);
    const y = yOf(i);
    // Across to the east or the south only, so each crossing is found once.
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      let len = 0;
      let nx = x + dx;
      let ny = y + dy;
      while (len <= MAX_SPAN && nx < SIZE && ny < SIZE && stream(ny * SIZE + nx)) {
        len++;
        nx += dx;
        ny += dy;
      }
      if (len < 1 || len > MAX_SPAN || nx >= SIZE || ny >= SIZE) continue;
      const end = ny * SIZE + nx;
      if (!bank(end)) continue;
      const wood = trees(i) + trees(end);
      if (!wood) continue;
      let score = Math.min(4, wood) * 0.3 + hash2f(g.word, x, y, 870 + dx);
      if ((g.flags[i]! | g.flags[end]!) & FLAG.trail) score += 2;
      if (dist2(i, g.start) <= NEAR_START * NEAR_START) score += 1.5;
      candidates.push({ at: i, dx, dy, len, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.at - b.at);
  const chosen: typeof candidates = [];
  for (const c of candidates) {
    if (chosen.length >= MAX_BRIDGES) break;
    if (chosen.some((o) => dist2(o.at, c.at) < SPACING * SPACING)) continue;
    chosen.push(c);
  }
  chosen.sort((a, b) => a.at - b.at);
  for (const c of chosen) {
    const x = xOf(c.at) + c.dx;
    const y = yOf(c.at) + c.dy;
    for (let k = 0; k < c.len; k++) {
      const t = (y + c.dy * k) * SIZE + x + c.dx * k;
      g.flags[t] = g.flags[t]! | FLAG.bridge;
    }
    g.bridges.push({ x, y, dx: c.dx, dy: c.dy, len: c.len });
  }
}
