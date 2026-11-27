// Landmarks and the bear's den drawn bigger than a tile (SPEC 6.3, 12.1): each stands on its own tile and
// rises over (or spreads across) the tiles round it, the way a tall tree does, but blocks only its own.
// Drawn in code, built once.

import { canvas, type Lump, paintRock, px, type Tall } from './flora.ts';
import { rh } from './tiles.ts';

const BONE = '#e3dcc6';
const BONE_SHADE = '#b5ac93';
const BONE_DARK = '#8a8270';
const HIDE = '#6b4f36';
const HIDE_DARK = '#46331f';
const HIDE_LIGHT = '#8a6a48';
const RIB = '#c9bfa5';
const FLESH = '#7a3a30';
const EARTH = '#665847';
const EARTH_DARK = '#4a3d2f';

/**
 * A rock arch: two legs of weathered rock and a span across the top, the sky-lit ground showing through
 * the gap beneath; about three tiles wide and two high.
 */
export function rockArch(v: number): Tall {
  const W = 58;
  const H = 46;
  const base = H - 1;
  const lumps: Lump[] = [
    // The legs: broad at the foot, narrowing up.
    { cx: 12, cy: base - 9, rx: 12, ry: 9, p: 2.6 },
    { cx: W - 12, cy: base - 8, rx: 11.5, ry: 8, p: 2.6 },
    { cx: 12, cy: base - 22, rx: 9, ry: 11, p: 3 },
    { cx: W - 12, cy: base - 21, rx: 8.5, ry: 11, p: 3 },
  ];
  // The span: blocks along a curve from one leg's top to the other's, thinner at the crown.
  for (let k = 0; k <= 6; k++) {
    const t = k / 6;
    const lift = Math.sin(Math.PI * t);
    lumps.push({ cx: 11 + t * (W - 22), cy: 18 - lift * 9 + (k % 2) * 0.5, rx: 8 - lift * 1.5, ry: 7 - lift * 1.8, p: 2.4 + rh(k, v, 280) * 0.8 });
  }
  // Fallen blocks at the feet.
  lumps.push({ cx: 3, cy: base - 1.5, rx: 3, ry: 2, p: 2.2 }, { cx: W - 2.5, cy: base - 1.5, rx: 2.5, ry: 1.8, p: 2.2 });
  const rock = paintRock(W, H, lumps, '#6f7472', '#4a4f52', v, 1);
  const [c, g] = canvas(W, H);
  g.drawImage(rock, 0, 0);
  // The opening: a round-topped arch under the span, between the legs.
  const hx = W / 2 + ((v % 2) - 0.5);
  const hw = 11.5;
  const top = 22;
  const isHole = (x: number, y: number) => {
    if (y < top || y > base) return false;
    const u = (x + 0.5 - hx) / (hw - (y > base - 6 ? (y - base + 6) * 0.9 : 0));
    const w = Math.max(0, (top + hw * 0.9 - y - 0.5) / (hw * 0.9));
    return u * u + w * w < 1;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (isHole(x, y)) g.clearRect(x, y, 1, 1);
      // The span's underside in shadow; the legs' inner faces darker.
      else if (isHole(x, y + 1)) px(g, x, y, '#2b2c2a');
      else if (isHole(x, y + 2)) px(g, x, y, '#41433f');
      else if (isHole(x + 1, y) || isHole(x - 1, y)) px(g, x, y, '#41433f');
    }
  }
  return { c, crown: 0 };
}

/**
 * The lightning-split snag: a big dead tree standing well over the forest, grey and bare, split down
 * from the top into two leaning halves, a black scorch down one side, bark hanging in strips, and the
 * stubs of its limbs.
 */
export function tallSnag(v: number): Tall {
  const H = 62 + (v % 2) * 6;
  const W = 30;
  const [c, g] = canvas(W, H);
  const cx = 14;
  const split = 16;
  for (let y = split; y < H; y++) {
    const t = (y - split) / (H - split);
    const w = Math.round(3 + t * 2.5 + (y > H - 5 ? H - 5 - y + 5 : 0) * 0.6);
    const x0 = cx - Math.floor(w / 2);
    for (let k = 0; k < w; k++) {
      let col = k === 0 ? '#c3c4ba' : k === w - 1 ? '#565a57' : k < w / 2 ? '#a2a69f' : '#80868a';
      // Bark still on in strips: brown-grey patches low down.
      if (t > 0.55 && rh(y >> 2, k, 300 + v) < 0.25) col = k < w / 2 ? '#6e5d4b' : '#4f4236';
      px(g, x0 + k, y, col);
    }
    // The scorch, down the right side, ragged.
    if (y > split + 2 && y < H - 4 && rh(y, v, 301) < 0.75) px(g, x0 + w - 2, y, '#232321');
    if (y > split + 8 && y < H - 10 && rh(y, v, 302) < 0.4) px(g, x0 + w - 3, y, '#2e2d2a');
  }
  // The split: two halves leaning apart, splintered ends.
  for (let k = 0; k < split + 2; k++) {
    const y = split + 1 - k;
    const lx = cx - 1 - Math.floor(k / 3);
    const rx = cx + 1 + Math.floor(k / 4);
    px(g, lx - 1, y, '#c3c4ba');
    px(g, lx, y, '#9aa098');
    if (k < split - 2) {
      px(g, rx, y, '#6e7470');
      px(g, rx + 1, y, '#2e2d2a');
    }
  }
  px(g, cx - 2 - Math.floor((split + 1) / 3), 0, '#c3c4ba');
  // The stubs of dead limbs, angled up, longer lower down.
  for (const [y, d, len] of [
    [22, -1, 4],
    [27, 1, 5],
    [33, -1, 6],
    [38, 1, 4],
    [44, -1, 3],
  ] as const) {
    for (let k = 1; k <= len; k++) px(g, cx + d * (k + 2), y - Math.floor(k / 2), k === len ? '#5f6460' : '#8a8f8a');
  }
  // Roots gripping the ground, and fallen bark.
  px(g, cx - 5, H - 1, '#4a4c48', 12, 1);
  px(g, cx - 4, H - 2, '#6b6f6a', 2, 1);
  px(g, cx + 4, H - 2, '#6b6f6a', 2, 1);
  px(g, cx + 7, H - 1, '#6e5d4b', 2, 1);
  return { c, crown: 0 };
}

/** A long bone at an angle, with knuckled ends. */
function bone(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let k = 0; k <= n; k++) {
    const x = Math.round(x0 + ((x1 - x0) * k) / n);
    const y = Math.round(y0 + ((y1 - y0) * k) / n);
    px(g, x, y, BONE);
    px(g, x, y + 1, BONE_SHADE);
  }
  for (const [x, y] of [
    [x0, y0],
    [x1, y1],
  ] as const) {
    px(g, x - 1, y - 1, BONE, 3, 2);
    px(g, x - 1, y + 1, BONE_DARK, 3, 1);
  }
}

/**
 * A bone pile: an old kill or a winter's dead, picked clean: a long skull with its antlers, a curve
 * of ribs, the long bones scattered, a few vertebrae.
 */
export function bonePile(v: number): Tall {
  const W = 34;
  const H = 20;
  const [c, g] = canvas(W, H);
  // Ribs: a row of curved bones.
  for (let k = 0; k < 5; k++) {
    const x = 14 + k * 3;
    for (let y = 0; y < 6; y++) px(g, x + (y < 2 ? 0 : y < 4 ? 1 : 2), 8 + y, y === 5 ? BONE_DARK : RIB);
  }
  // The spine along their tops.
  for (let x = 12; x < 30; x++) px(g, x, 7 + (x % 3 === 0 ? 1 : 0), x % 2 ? BONE : BONE_SHADE);
  // Long bones, scattered.
  bone(g, 3, 16, 12, 13);
  bone(g, 21, 17, 30, 17);
  if (v % 2) bone(g, 28, 3, 31, 10);
  // The skull: long, pale, dark eye and nose holes, lying at the front left.
  for (let y = 0; y < 5; y++) for (let x = 0; x < 9 - y; x++) px(g, 3 + x + Math.floor(y / 2), 6 + y, y === 4 ? BONE_DARK : x < 3 ? BONE : BONE_SHADE);
  px(g, 5, 7, '#3a3630', 2, 1);
  px(g, 10, 8, '#3a3630');
  // The antlers: two beams, tines up.
  for (const [bx, d] of [
    [4, -1],
    [7, 1],
  ] as const) {
    for (let k = 0; k < 6; k++) {
      const x = bx + d * Math.floor(k / 2);
      px(g, x, 5 - k, BONE_SHADE);
      if (k === 2 || k === 4) px(g, x + d, 5 - k - 1, BONE_SHADE);
    }
  }
  // Vertebrae, in a little run.
  for (let k = 0; k < 4; k++) px(g, 13 + k * 3, 17 - (k % 2), BONE, 2, 1);
  return { c, crown: 0 };
}

/**
 * A carcass at the water: a big animal dead on its side, half in the stream, the hide dark and slack,
 * the ribs opened by scavengers, legs stiff, an antler beam up.
 */
export function carcass(v: number): Tall {
  const W = 34;
  const H = 20;
  const [c, g] = canvas(W, H);
  const cx = 17;
  const cy = 11;
  // The body: a long rounded hump, darker underneath.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5 - cx) / 12;
      const w = (y + 0.5 - cy) / 5;
      if (u * u + w * w >= 1) continue;
      let col = w < -0.4 ? HIDE_LIGHT : w > 0.45 ? HIDE_DARK : HIDE;
      if (rh(x, y, 310 + v) < 0.08) col = HIDE_DARK;
      px(g, x, y, col);
    }
  }
  // Opened by scavengers: ribs showing over dark flesh.
  for (let x = cx - 4; x < cx + 6; x++) {
    const top = cy - 3 + (rh(x, 1, 311 + v) < 0.4 ? 1 : 0);
    const bot = cy + 1 - (x === cx - 4 || x === cx + 5 ? 1 : 0);
    for (let y = top; y <= bot; y++) {
      // Each rib bows back as it goes down; between them, dark flesh.
      const rib = (x - cx + (y > cy - 1 ? 1 : 0) + 8) % 3 === 0;
      px(g, x, y, rib ? (y === top ? BONE : RIB) : y === top ? '#5a2a24' : FLESH);
    }
  }
  // The neck and head, lying out to the left, and an antler beam.
  for (let x = 2; x < 7; x++) px(g, x, cy - 1 + (x < 4 ? 1 : 0), HIDE, 1, 3);
  px(g, 1, cy + 1, HIDE_DARK, 2, 2);
  for (let k = 0; k < 6; k++) px(g, 4 - Math.floor(k / 3), cy - 2 - k, BONE_SHADE);
  px(g, 3, cy - 5, BONE_SHADE, 2, 1);
  // Legs stiff out the far side.
  for (const lx of [cx - 7, cx - 4, cx + 6, cx + 9]) for (let k = 0; k < 4; k++) px(g, lx + Math.floor(k / 2), cy + 4 + k, k === 3 ? '#2c2219' : HIDE_DARK);
  // A dark stain on the ground beneath.
  for (let x = cx - 10; x < cx + 12; x++) if (rh(x, 0, 312 + v) < 0.7) px(g, x, cy + 5, 'rgba(40,30,22,0.45)');
  return { c, crown: 0 };
}

/**
 * The bear's den: a mound of rock with a cave dug in under it, the mouth dark and wide enough to take a
 * bear, the spoil of earth heaped and trodden in front, a scatter of old bones. About three tiles wide
 * and two high; the mouth is on the den's own tile.
 */
export function bearDen(v: number): Tall {
  const W = 54;
  const H = 40;
  const base = H - 7;
  const lumps: Lump[] = [
    { cx: W / 2, cy: base - 13, rx: 17, ry: 13, p: 2.6 },
    { cx: 12, cy: base - 8, rx: 10, ry: 8, p: 3 },
    { cx: W - 11, cy: base - 9, rx: 10, ry: 9, p: 3.2 },
    { cx: W / 2 + 6, cy: base - 22, rx: 9, ry: 6, p: 2.6 },
    { cx: 5, cy: base - 2, rx: 4, ry: 2.6, p: 2.2 },
    { cx: W - 5, cy: base - 2, rx: 3.5, ry: 2.4, p: 2.2 },
  ];
  const rock = paintRock(W, H, lumps, '#6f706a', '#4f514c', v, 2);
  const [c, g] = canvas(W, H);
  // The spoil: a fan of bare earth in front of the mouth, trodden flat.
  for (let y = base - 3; y < H; y++) {
    const half = 9 + (y - base + 3) * 1.4;
    for (let x = Math.floor(W / 2 - half); x < Math.ceil(W / 2 + half); x++) {
      const out = Math.abs(x + 0.5 - W / 2) / half;
      if (out > 0.8 && rh(x, y, 320 + v) < 0.5) continue;
      px(g, x, y, rh(x, y, 321 + v) < 0.15 ? EARTH_DARK : y > H - 3 && out > 0.5 ? EARTH_DARK : EARTH);
    }
  }
  g.drawImage(rock, 0, 0);
  // The mouth: a low wide arch, black inside, a lit rim of rock above it and a dark lip of earth below.
  const mx = W / 2;
  const mw = 9;
  const mh = 11;
  for (let y = base - mh - 1; y <= base; y++) {
    for (let x = Math.floor(mx - mw - 1); x <= Math.ceil(mx + mw + 1); x++) {
      const u = (x + 0.5 - mx) / mw;
      const w = (base + 0.5 - y) / mh;
      const d = u * u + w * w;
      if (d < 1) px(g, x, y, d < 0.55 ? '#0c0d0f' : d < 0.8 ? '#17181b' : '#24252a');
      else if (d < 1.35 && y < base - 2) px(g, x, y, '#3a3b38');
    }
  }
  for (let x = Math.floor(mx - mw + 1); x < mx + mw - 1; x++) px(g, x, base + 1, EARTH_DARK);
  // Old bones in the spoil, and a claw-raked log.
  px(g, mx - 13, base + 4, BONE, 3, 1);
  px(g, mx - 14, base + 5, BONE_SHADE, 1, 1);
  px(g, mx + 11, base + 3, BONE, 2, 1);
  for (let x = mx + 14; x < mx + 22; x++) px(g, x, base + 2, x % 3 ? '#6b553d' : '#4a3a2b', 1, 2);
  return { c, crown: 0 };
}
