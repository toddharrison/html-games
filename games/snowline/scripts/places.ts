// Picks the interesting places in a valley (set pieces, landforms, forest history, dens, trails) and
// prints them as JSON: [{ name, x, y }], each moved to the nearest tile the survivor can stand on.
//
//   node scripts/places.ts [seed]

import { F, FLAG, T } from '../src/content/terrain.ts';
import { dealRules } from '../src/sim/rules.ts';
import { generateWorld } from '../src/sim/worldgen/index.ts';
import { passableAt } from '../src/sim/world.ts';

const seed = process.argv[2] ?? 'first-light';
const w = generateWorld(seed, dealRules(seed));
const S = w.size;
const at = (x: number, y: number) => y * S + x;

function standable(x: number, y: number): { x: number; y: number } | null {
  for (let r = 0; r < 12; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const px = x + dx;
        const py = y + dy;
        if (px < 2 || py < 2 || px >= S - 2 || py >= S - 2) continue;
        if (passableAt(w, at(px, py))) return { x: px, y: py };
      }
  return null;
}

/** The tile whose 9×9 neighbourhood scores highest on `score`, among tiles where `ok` holds. */
function best(score: (i: number) => number, ok: (i: number) => boolean = () => true): { x: number; y: number } | null {
  let top = -Infinity;
  let pick: { x: number; y: number } | null = null;
  for (let y = 6; y < S - 6; y += 2)
    for (let x = 6; x < S - 6; x += 2) {
      if (!ok(at(x, y))) continue;
      let s = 0;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) s += score(at(x + dx, y + dy));
      if (s > top) [top, pick] = [s, { x, y }];
    }
  return pick;
}

const places: { name: string; x: number; y: number }[] = [];
const add = (name: string, p: { x: number; y: number } | null) => {
  const s = p && standable(p.x, p.y);
  if (s) places.push({ name, ...s });
};

add('crash', w.crash);
add('overhang', w.overhang.shelter);
const berries = w.patches.find((p) => p.role === 'safe');
if (berries) add('berries', { x: berries.center.x, y: berries.center.y + 2 });
add('spark-outcrop', w.sparkOutcrop);
add('stream-mouth', w.mouth);
add('wreck-tail', { x: w.wreck.x, y: w.wreck.y + 3 });
add('knoll', w.knoll);
// A glacier's toe: snow beside ground, lowest.
add('glacier-toe', best((i) => (w.terrain[i] === T.snow ? 1 : 0) - w.elev[i]! / 200, (i) => w.terrain[i] !== T.snow && w.terrain[i - 2] === T.snow));
// An island: the land tile with the most lake water round it.
add('island', best((i) => (w.water[i] === 1 ? 1 : 0), (i) => w.water[i] === 0 && passableAt(w, i)));
add('glacier', best((i) => (w.flags[i]! & FLAG.glacier ? 1 : 0)));
add('burn', best((i) => (w.age[i]! > 0 && w.age[i]! < 25 ? 1 : 0), (i) => w.age[i]! > 0 && w.age[i]! < 25));
add('thicket-edge', best((i) => (w.feature[i] === F.thicket ? 1 : 0), (i) => passableAt(w, i)));
add('old-growth', best((i) => (w.age[i] === 255 && w.feature[i] === F.conifer ? 1 : 0)));
add('treeline', best((i) => (w.terrain[i] === T.scrub ? 1 : 0) + (w.feature[i] === F.stunted ? 1 : 0) + (w.terrain[i] === T.forest ? 0.6 : 0)));
add('talus', best((i) => (w.terrain[i] === T.talus || w.terrain[i] === T.scree ? 1 : 0) + (w.terrain[i] === T.cliff ? 0.5 : 0)));
add('marsh', best((i) => (w.terrain[i] === T.marsh ? 1 : 0)));
add('avalanche', best((i) => (w.flags[i]! & FLAG.avalanche ? 1 : 0)));
add('game-trail', best((i) => (w.trails[i] ? 1 : 0), (i) => w.trails[i] !== 0));
const dens = new Map<number, { x: number; y: number }>();
for (let i = 0; i < S * S; i++) if (w.feature[i] === F.den && !dens.has(w.data[i]!)) dens.set(w.data[i]!, { x: i % S, y: Math.floor(i / S) });
for (const [kind, p] of [...dens].sort((a, b) => a[0] - b[0])) add(`den-${kind}`, { x: p.x, y: p.y + 1 });
const seen = new Set<string>();
for (const l of w.landmarks) if (!seen.has(l.kind)) (seen.add(l.kind), add(`landmark-${l.kind}`, l));

console.log(JSON.stringify(places));
