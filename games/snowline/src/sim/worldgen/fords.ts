// Gravel shallows (SPEC 6.3, 2026-11-27): where a stream runs slow enough to drop its gravel, a bar
// across it that a kid can wade with only wet feet and no fear of going under; and where a stream runs
// into the lake, the fan of gravel it has carried down. Game trails cross at them (animals ford where it's
// shallow), so a trail crossing is favoured. Spaced out along the water, and apart from the log bridges.
// From the terrain, its elevation, and the trails alone; never branches on the deal.

import { FEATURES, FLAG, T, TERRAIN, WATER } from '../../content/terrain.ts';
import { hash2f } from '../rng.ts';
import { type Gen, dist2, xOf, yOf } from './gen.ts';
import { N } from './grid.ts';
import { SIZE } from '../world.ts';

/** The most fords across the streams, the widest one spans, and how far apart they lie (tiles). */
const MAX_FORDS = 14;
const MAX_SPAN = 4;
const SPACING = 14;
/** No closer than this to a log bridge: one way over is enough in a place. */
const FROM_BRIDGE = 6;
/** How far a stream's gravel fans out into the lake from its mouth (tiles). */
const FAN = 2;

export function layFords(g: Gen): void {
  const running = (i: number) => g.terrain[i] === T.stream || g.terrain[i] === T.gravel;
  const bank = (i: number) => {
    const t = g.terrain[i]!;
    return TERRAIN[t]!.passable && !TERRAIN[t]!.water && g.water[i] === WATER.none && !FEATURES[g.feature[i]!]!.blocks;
  };
  /** How steeply the stream falls at a tile: the biggest drop to the stream tiles up or down it (along `ax`, `ay`). */
  const fall = (i: number, ax: number, ay: number) => {
    let d = 0;
    for (const s of [1, -1]) {
      const nx = xOf(i) + ax * s;
      const ny = yOf(i) + ay * s;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const j = ny * SIZE + nx;
      if (running(j)) d = Math.max(d, Math.abs(g.elev[j]! - g.elev[i]!));
    }
    return d;
  };

  // Across the streams: bank, one to MAX_SPAN tiles of slow water, bank.
  const candidates: { at: number; dx: number; dy: number; len: number; score: number }[] = [];
  for (let i = 0; i < N; i++) {
    if (!bank(i)) continue;
    const x = xOf(i);
    const y = yOf(i);
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      let len = 0;
      let steep = 0;
      let nx = x + dx;
      let ny = y + dy;
      while (len <= MAX_SPAN && nx < SIZE && ny < SIZE && running(ny * SIZE + nx)) {
        const j = ny * SIZE + nx;
        if (g.flags[j]! & FLAG.bridge) steep = 99;
        // The stream runs across the crossing: up and down it is the other axis.
        steep = Math.max(steep, fall(j, dy, dx));
        len++;
        nx += dx;
        ny += dy;
      }
      if (len < 1 || len > MAX_SPAN || nx >= SIZE || ny >= SIZE || steep > 1) continue;
      const end = ny * SIZE + nx;
      if (!bank(end)) continue;
      // Slow, wide water drops the most gravel; animals wear a trail to where it's easy to cross.
      let score = (steep === 0 ? 0.8 : 0.3) + Math.min(len, 3) * 0.15 + hash2f(g.word, x, y, 880 + dx);
      if ((g.flags[i]! | g.flags[end]!) & FLAG.trail) score += 2;
      candidates.push({ at: i, dx, dy, len, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.at - b.at);
  const bridges = g.bridges.map((b) => b.y * SIZE + b.x);
  const chosen: typeof candidates = [];
  for (const c of candidates) {
    if (chosen.length >= MAX_FORDS) break;
    if (chosen.some((o) => dist2(o.at, c.at) < SPACING * SPACING)) continue;
    if (bridges.some((b) => dist2(b, c.at) < FROM_BRIDGE * FROM_BRIDGE)) continue;
    chosen.push(c);
  }
  for (const c of chosen) {
    for (let k = 1; k <= c.len; k++) {
      const t = c.at + (c.dy * SIZE + c.dx) * k;
      g.flags[t] = g.flags[t]! | FLAG.ford;
    }
  }

  // Where a stream meets the lake, the gravel it carried down: the lake's shallows round the mouth.
  for (let i = 0; i < N; i++) {
    if (!running(i)) continue;
    const x = xOf(i);
    const y = yOf(i);
    let mouth = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && g.water[ny * SIZE + nx] === WATER.lake) mouth = true;
    }
    if (!mouth) continue;
    for (let dy = -FAN; dy <= FAN; dy++) {
      for (let dx = -FAN; dx <= FAN; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || dx * dx + dy * dy > FAN * FAN + 1) continue;
        const j = ny * SIZE + nx;
        if (g.terrain[j] === T.shallows && g.water[j] === WATER.lake) g.flags[j] = g.flags[j]! | FLAG.ford;
      }
    }
  }
}
