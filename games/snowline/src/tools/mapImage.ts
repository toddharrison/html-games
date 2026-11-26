// The seed inspector's picture of a valley: one pixel per tile, as RGBA. Used by `npm run inspect`
// (scripts/inspect.ts) to look at seeds without a browser.

import { F, FLAG } from '../content/terrain.ts';
import { PALETTE, TERRAIN_COLOR, rgb } from '../render/palette.ts';
import type { World } from '../sim/world.ts';

const FEATURE_COLOR: Partial<Record<number, string>> = {
  [F.conifer]: PALETTE.pine,
  [F.aspen]: PALETTE.aspen,
  [F.stunted]: PALETTE.pineLight,
  [F.boulder]: PALETTE.stone,
  [F.bush]: PALETTE.meadowLight,
  [F.log]: PALETTE.wood,
  [F.plant]: PALETTE.red,
  [F.herb]: PALETTE.cream,
  [F.outcrop]: PALETTE.ink,
  [F.overhang]: PALETTE.ink,
  [F.crash]: '#ffffff',
  [F.tail]: '#ffffff',
  [F.snag]: PALETTE.ember,
  [F.midden]: PALETTE.ember,
  [F.bones]: PALETTE.cream,
  [F.arch]: PALETTE.ink,
  [F.beaverDam]: PALETTE.bark,
  [F.carcass]: PALETTE.red,
};

/** One RGBA pixel per tile, with markers for the set pieces when `marks` is set. */
export function mapImage(w: World, marks = true): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w.size * w.size * 4);
  for (let i = 0; i < w.size * w.size; i++) {
    const f = w.feature[i]!;
    const shade = 0.82 + (w.elev[i]! / 255) * 0.3;
    let c = rgb(FEATURE_COLOR[f] ?? PALETTE[TERRAIN_COLOR[w.terrain[i]!]!]);
    if (w.flags[i]! & FLAG.trail && !f) c = rgb(PALETTE.sandDark);
    if (w.flags[i]! & FLAG.slideGap) c = [255, 0, 255];
    out[i * 4] = c[0] * shade;
    out[i * 4 + 1] = c[1] * shade;
    out[i * 4 + 2] = c[2] * shade;
    out[i * 4 + 3] = 255;
  }
  if (marks) {
    const dot = (x: number, y: number, c: [number, number, number], r = 1) => {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= w.size || py >= w.size) continue;
          const k = (py * w.size + px) * 4;
          out[k] = c[0];
          out[k + 1] = c[1];
          out[k + 2] = c[2];
        }
    };
    dot(w.start.x, w.start.y, [255, 40, 40], 2);
    dot(w.overhang.shelter.x, w.overhang.shelter.y, [255, 160, 0], 1);
    dot(w.wreck.x, w.wreck.y, [255, 255, 255], 1);
    for (const v of w.viewpoints) dot(v.x, v.y, [255, 255, 0], 1);
    dot(w.knoll.x, w.knoll.y, [255, 120, 255], 1);
    for (const t of w.territories) dot(t.x, t.y, [40, 200, 255], 1);
  }
  return out;
}
