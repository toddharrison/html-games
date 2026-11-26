// Pipeline steps 4 and 5 (SPEC 6.3): a moisture map, ground cover from band and moisture, and the
// scatter of trees, rocks, and bushes. Every choice here is position-hashed (SPEC 11.3, rule 2), so a
// tile's result never depends on the order tiles are visited.

import { BAND, F, T, WATER } from '../../content/terrain.ts';
import { hash2f } from '../rng.ts';
import { type Gen, UNSET, tilesWhere, xOf, yOf } from './gen.ts';
import { DX4, DY4, N, bfs } from './grid.ts';
import { fbm, perlin } from './noise.ts';

/** True if tile (x, y) wins the scatter for `salt`: under `density`, and lowest among its four neighbours. */
function scatter(seed: number, x: number, y: number, salt: number, density: number): boolean {
  const v = hash2f(seed, x, y, salt);
  if (v >= density) return false;
  for (let d = 0; d < 4; d++) {
    const n = hash2f(seed, x + DX4[d]!, y + DY4[d]!, salt);
    if (n < density && n < v) return false;
  }
  return true;
}

export function coverGround(g: Gen): void {
  const w = g.word;
  const fromWater = bfs(
    tilesWhere((i) => g.water[i] === WATER.lake || g.water[i] === WATER.streamA || g.water[i] === WATER.streamB),
    () => true,
    false,
    80,
  );
  const dry = tilesWhere((i) => g.band[i] === BAND.alpine && g.terrain[i] === UNSET).map((i) => g.elev[i]!);
  dry.sort((a, b) => a - b);
  const snowLine = dry.length ? dry[Math.floor(dry.length * 0.975)]! : 256;

  const moisture = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const x = xOf(i);
    const y = yOf(i);
    const dw = fromWater[i]! < 0 ? 80 : fromWater[i]!;
    moisture[i] = 0.5 + fbm((w + 101) | 0, x / 38, y / 38, 4) * 0.55 - dw / 40;
  }

  for (let i = 0; i < N; i++) {
    if (g.terrain[i] !== UNSET) continue;
    const x = xOf(i);
    const y = yOf(i);
    const m = moisture[i]!;
    const dw = fromWater[i]! < 0 ? 80 : fromWater[i]!;
    const patchy = perlin((w + 202) | 0, x / 14, y / 14) + perlin((w + 203) | 0, x / 5, y / 5) * 0.3;
    let t: number;
    switch (g.band[i]) {
      case BAND.floor:
        if (dw <= 1) t = m < 0.45 ? T.sand : T.reeds;
        else if (dw <= 3 && m > 0.62) t = T.reeds;
        else if (m > 0.74) t = T.marsh;
        else t = T.meadow;
        break;
      case BAND.montane:
        t = patchy > 0.32 ? T.meadow : T.forest;
        break;
      case BAND.subalpine:
        t = m > 0.4 ? T.highMeadow : patchy > 0.22 ? T.boulders : T.scrub;
        break;
      default:
        if (g.elev[i]! >= snowLine && patchy > 0) t = T.snow;
        else t = patchy > 0.22 ? T.rock : T.talus;
    }
    g.terrain[i] = t;
  }

  // Distance to the forest's edge, for bushes along it.
  const fromOpen = bfs(
    tilesWhere((i) => g.terrain[i] !== T.forest),
    (i) => g.terrain[i] === T.forest,
    false,
    3,
  );

  for (let i = 0; i < N; i++) {
    if (g.feature[i] !== F.none || g.flags[i]) continue;
    const x = xOf(i);
    const y = yOf(i);
    const m = moisture[i]!;
    const h = (salt: number) => hash2f(w, x, y, salt);
    let f: number = F.none;
    switch (g.terrain[i]) {
      case T.forest:
        if (scatter(w, x, y, 1, 0.46)) f = m > 0.6 && h(9) < 0.6 ? F.aspen : F.conifer;
        else if (h(2) < 0.03) f = F.log;
        else if (fromOpen[i]! <= 2 && h(3) < 0.08) f = F.bush;
        break;
      case T.meadow:
        if (scatter(w, x, y, 1, g.band[i] === BAND.floor ? 0.05 : 0.09)) f = F.conifer;
        else if (h(3) < 0.04) f = F.bush;
        break;
      case T.highMeadow:
        if (scatter(w, x, y, 4, 0.06)) f = F.stunted;
        else if (h(3) < 0.035) f = F.bush;
        break;
      case T.scrub:
        if (scatter(w, x, y, 4, 0.2)) f = F.stunted;
        else if (scatter(w, x, y, 5, 0.04)) f = F.boulder;
        else if (h(3) < 0.06) f = F.bush;
        break;
      case T.boulders:
        if (scatter(w, x, y, 5, 0.32)) f = F.boulder;
        break;
      case T.talus:
        if (scatter(w, x, y, 5, 0.07)) f = F.boulder;
        break;
    }
    g.feature[i] = f;
  }
}

