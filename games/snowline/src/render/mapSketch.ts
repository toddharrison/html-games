// The map screen (SPEC 6.4): only what has been explored, drawn as a rough pencil sketch on paper.

import { F, FLAG, T } from '../content/terrain.ts';
import type { GameState } from '../sim/state.ts';
import { isExplored } from '../sim/step.ts';
import { idx, type World } from '../sim/world.ts';
import { rgb } from './palette.ts';
import { rh } from './tiles.ts';

const PAPER = rgb('#d9cfb3');
const INK = rgb('#4a4032');

/** Muted sketch colours by terrain id (content/terrain.ts order). */
const SKETCH = [
  '#6b5f4c', // headwall
  '#5a4f3f', // cliff
  '#7f98a0', // deep
  '#9db0ad', // shallows
  '#7f98a0', // stream
  '#e8e4d8', // waterfall
  '#d6c79c', // sand
  '#a6a57a', // reeds
  '#8f9576', // marsh
  '#b8b688', // meadow
  '#8c9372', // forest
  '#c2bd92', // high meadow
  '#aaa585', // scrub
  '#a89f8a', // boulders
  '#b3ab98', // talus
  '#a59d8b', // rock
  '#ece7da', // snow
  '#9a9080', // scree
  '#9db0ad', // gravel
  '#8a7a62', // shelter
].map(rgb);

/** Paint the map into `img` (one pixel per tile). `all` draws unexplored ground too (debug reveal). */
export function sketchMap(img: ImageData, state: GameState, world: World, all: boolean): void {
  const d = img.data;
  for (let y = 0; y < world.size; y++) {
    for (let x = 0; x < world.size; x++) {
      const i = idx(x, y);
      const k = i * 4;
      const grain = (rh(x, y, 91) - 0.5) * 14;
      if (!all && !isExplored(state, i)) {
        d[k] = PAPER[0] + grain;
        d[k + 1] = PAPER[1] + grain;
        d[k + 2] = PAPER[2] + grain;
        d[k + 3] = 255;
        continue;
      }
      let c = SKETCH[world.terrain[i]!]!;
      const f = world.feature[i]!;
      const shade = (world.elev[i]! - 128) * 0.12;
      let dark = 0;
      if (f === F.conifer || f === F.aspen || f === F.stunted) dark = 22;
      if (f === F.boulder || f === F.outcrop) dark = 14;
      if (world.terrain[i] === T.cliff || world.terrain[i] === T.headwall) c = INK;
      if (world.flags[i]! & FLAG.trail) dark -= 10;
      // Pencil hatching on steep ground: darker every few pixels along a diagonal.
      if ((x + y) % 4 === 0 && rh(x, y, 92) < 0.35) dark += 10;
      d[k] = c[0] - dark + shade + grain;
      d[k + 1] = c[1] - dark + shade + grain;
      d[k + 2] = c[2] - dark + shade + grain;
      d[k + 3] = 255;
    }
  }
}
