// Animals (SPEC 9): simple state machines with a home range, a daily schedule, and senses. They step on
// the grid, one decision each time their step timer runs out, in ID order. Nothing hunts the survivor
// because it is a game: the dangerous ones warn first, and every one can be backed away from. What each
// dangerous animal is like in this valley (how bold, how it warns, what turns it) is dealt (6.6).

import { ANIMALS, CROWD, ATTACK, KINDS, RUT, type AnimalKind } from '../content/animals.ts';
import { ANIMAL_TEXT } from '../content/animalText.ts';
import { DANGER_ANIMALS } from '../content/decks.ts';
import { itemDef } from '../content/items.ts';
import { who } from '../content/messages.ts';
import { BAND, F, FLAG, T, TERRAIN } from '../content/terrain.ts';
import { addCondition } from './body.ts';
import { itemName } from './food.ts';
import { drop } from './inventory.ts';
import { fact, learn, see } from './knowledge.ts';
import { say } from './log.ts';
import { recall, remember } from './memory.ts';
import { chance, nextFloat, nextInt, pick } from './rng.ts';
import type { Animal, GameState, SimEvent, Stash } from './state.ts';
import { burning } from './surroundings.ts';
import { clock, daylight } from './time.ts';
import { idx, inBounds, passableAt, type World } from './world.ts';

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;
const DAY = 14400;

export function cheb(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function isActive(kind: AnimalKind, hour: number): boolean {
  return ANIMALS[kind].active.some(([a, b]) => hour >= a && hour < b);
}

/** Can this animal stand on the tile? Jays fly, goats climb cliffs; nothing enters deep water or a fire. */
export function animalCanEnter(s: GameState, w: World, a: Animal, x: number, y: number): boolean {
  if (!inBounds(x, y)) return false;
  const i = idx(x, y);
  const t = w.terrain[i]!;
  if (t === T.headwall) return false;
  if (s.fires.some((f) => f.x === x && f.y === y)) return false;
  if (s.player.x === x && s.player.y === y) return false;
  const def = ANIMALS[a.kind];
  if (def.flies) return true;
  if (def.climbs && (t === T.cliff || t === T.scree)) return true;
  return passableAt(w, i) && t !== T.deep && t !== T.shallows;
}

/** Place the valley's animals at the start of a run, each near its kind of ground (SPEC 9). */
export function spawnAnimals(s: GameState, w: World): void {
  const r = s.rng.animals;
  const terr = (k: string) => w.territories.find((t) => t.animal === k);
  const near = (cx: number, cy: number, rad: number) => (i: number) => cheb(i % 256, Math.floor(i / 256), cx, cy) <= rad;
  const land = (i: number) => passableAt(w, i) && !TERRAIN[w.terrain[i]!]!.water;
  const tiles = (test: (i: number) => boolean) => {
    const out: number[] = [];
    for (let i = 0; i < 65536; i++) if (land(i) && test(i)) out.push(i);
    return out;
  };
  const patches = w.patches.filter((p) => p.role !== 'herb');
  const places: Record<AnimalKind, () => number[]> = {
    grouse: () => tiles((i) => w.terrain[i] === T.forest),
    hare: () => tiles((i) => (w.terrain[i] === T.meadow || w.terrain[i] === T.highMeadow) && (w.flags[i]! & FLAG.trail) === 0),
    marmot: () => {
      const t = terr('marmot');
      if (!t) return [];
      return tiles(near(t.x, t.y, 6));
    },
    jay: () => tiles((i) => patches.some((p) => cheb(i % 256, Math.floor(i / 256), p.center.x, p.center.y) <= 3)),
    packrat: () => tiles(near(w.midden.x, w.midden.y, 4)),
    porcupine: () => tiles((i) => w.terrain[i] === T.forest && w.band[i] === BAND.montane),
    bear: () => {
      const t = terr('bear');
      if (!t) return [];
      return tiles(near(t.x, t.y, 4));
    },
    elk: () => {
      const t = terr('elk');
      if (!t) return [];
      return tiles(near(t.x, t.y, 5));
    },
    cougar: () => {
      const t = terr('cougar');
      if (!t) return [];
      return tiles(near(t.x, t.y, 5));
    },
    goat: () => tiles((i) => w.band[i]! >= BAND.subalpine && neighbourOf(i, (n) => w.terrain[n] === T.scree)),
  };
  let id = 1;
  const out: Animal[] = [];
  for (const kind of KINDS) {
    const options = places[kind]();
    if (!options.length) continue;
    for (let k = 0; k < ANIMALS[kind].count; k++) {
      const at = pick(r, options);
      const x = at % 256;
      const y = Math.floor(at / 256);
      out.push({ id: id++, kind, x, y, hx: x, hy: y, mode: 'wander', t: 1 + nextInt(r, 40), timer: 0, tx: -1, ty: -1, mark: 0, bull: kind === 'elk' && k === 0, gone: 0 });
    }
  }
  s.animals = out;
}

function neighbourOf(i: number, test: (n: number) => boolean): boolean {
  const x = i % 256;
  const y = Math.floor(i / 256);
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d]!;
    const ny = y + DY[d]!;
    if (inBounds(nx, ny) && test(idx(nx, ny))) return true;
  }
  return false;
}

/** One step: toward a target (or away from it), choosing the open neighbour that best closes (or opens) the distance. */
function stepToward(s: GameState, w: World, a: Animal, tx: number, ty: number, away = false): boolean {
  let best = -1;
  let bestD = away ? -1 : Infinity;
  const start = nextInt(s.rng.animals, 4);
  for (let k = 0; k < 4; k++) {
    const d = (start + k) % 4;
    const nx = a.x + DX[d]!;
    const ny = a.y + DY[d]!;
    if (!animalCanEnter(s, w, a, nx, ny)) continue;
    const dd = Math.abs(nx - tx) + Math.abs(ny - ty);
    if (away ? dd > bestD : dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  if (best < 0) return false;
  a.x += DX[best]!;
  a.y += DY[best]!;
  return true;
}

function wander(s: GameState, w: World, a: Animal): void {
  const def = ANIMALS[a.kind];
  const r = s.rng.animals;
  if (cheb(a.x, a.y, a.hx, a.hy) > def.range) {
    stepToward(s, w, a, a.hx, a.hy);
    return;
  }
  if (nextFloat(r) < 0.35) return;
  const d = nextInt(r, 4);
  const nx = a.x + DX[d]!;
  const ny = a.y + DY[d]!;
  if (animalCanEnter(s, w, a, nx, ny)) {
    a.x = nx;
    a.y = ny;
  }
}

/** The survivor can see the animal now: awake, and within their sight or a firelit circle. */
function seen(s: GameState, a: Animal, sight: number): boolean {
  if (s.sleep && !s.sleep.awake) return false;
  return cheb(a.x, a.y, s.player.x, s.player.y) <= sight;
}

/** Shared context for a tick of animals. */
interface Ctx {
  s: GameState;
  w: World;
  ev: SimEvent[];
  hour: number;
  sight: number;
  /** The survivor has stood still this long (ticks). */
  still: number;
}

/** Every animal's tick (SPEC 11.7: all animals simulate every tick, in ID order). */
export function animalsTick(s: GameState, w: World, ev: SimEvent[], sight: number): void {
  const ctx: Ctx = { s, w, ev, hour: clock(s.tick).hour, sight, still: s.tick - (s.memory['last-step'] ?? 0) };
  for (const a of s.animals) {
    if (a.mode === 'gone') {
      if (--a.gone <= 0) {
        a.mode = 'wander';
        a.x = a.hx;
        a.y = a.hy;
      }
      continue;
    }
    if (--a.t > 0) continue;
    decide(ctx, a);
  }
}

function decide(c: Ctx, a: Animal): void {
  const { s, w } = c;
  const def = ANIMALS[a.kind];
  const p = s.player;
  const d = cheb(a.x, a.y, p.x, p.y);
  a.t = def.walk + nextInt(s.rng.animals, def.walk);
  if (def.danger !== undefined && (a.kind !== 'elk' || inRut(s, a))) return danger(c, a, d);
  if (a.mode === 'leave' || a.mode === 'flee') {
    if (a.timer-- > 0) {
      stepToward(s, w, a, p.x, p.y, true);
      if (a.kind === 'grouse' && a.mode === 'flee') stepToward(s, w, a, p.x, p.y, true);
      a.t = def.run;
      return;
    }
    a.mode = 'wander';
  }
  const awake = !s.sleep || s.sleep.awake;
  const notice = def.sense - (s.protagonist.background === 'hunter' ? 1 : 0);
  if (awake && d <= notice && (c.still < 30 || d <= 1)) return flee(c, a);
  if (!isActive(a.kind, c.hour)) {
    a.t = 300;
    return;
  }
  switch (a.kind) {
    case 'jay':
      return jay(c, a, d);
    case 'packrat':
      return thief(c, a, (it) => !!itemDef(it.k).small, 'packrat');
    case 'porcupine':
      return thief(c, a, (it) => ['spear', 'hard-spear', 'bow-drill', 'bow', 'sharp-stick', 'basket'].includes(it.k), 'porcupine');
    case 'goat':
      if (d <= 9 && c.still >= 50 && daylight(s.tick) > 40 && !s.memory[`goat:${a.id}`]) {
        remember(s, `goat:${a.id}`);
        showRoute(s, w, a, c.ev);
      }
      return wander(s, w, a);
    default:
      return wander(s, w, a);
  }
}

function flee(c: Ctx, a: Animal): void {
  const { s, w } = c;
  a.mode = 'flee';
  a.timer = 5 + nextInt(s.rng.animals, 4);
  a.t = ANIMALS[a.kind].run;
  stepToward(s, w, a, s.player.x, s.player.y, true);
  if (a.kind === 'grouse' && seen(s, a, c.sight)) say(s, ANIMAL_TEXT.flush(), c.ev);
  if (a.kind === 'hare') remember(s, 'seen-hare');
  if (a.kind === 'marmot') {
    if (seen(s, a, c.sight + 4)) say(s, ANIMAL_TEXT.whistle(), c.ev);
    for (const o of s.animals) {
      if (o === a || o.mode === 'gone' || ANIMALS[o.kind].danger !== undefined) continue;
      if (cheb(o.x, o.y, a.x, a.y) <= 10 && o.mode !== 'flee') {
        o.mode = 'flee';
        o.timer = 4;
        o.t = 1;
      }
    }
  }
}

/** Jays: they eat the safe plants (watching them teaches which), and steal food left lying out. */
function jay(c: Ctx, a: Animal, d: number): void {
  const { s, w } = c;
  if (daylight(s.tick) < 30) return wander(s, w, a);
  const stash = targetStash(s, a, 14, (it) => !!itemDef(it.k).food);
  if (stash && d > 5) {
    if (stash.x === a.x && stash.y === a.y) return steal(c, a, stash, (it) => !!itemDef(it.k).food, 'jay');
    return void stepToward(s, w, a, stash.x, stash.y);
  }
  const here = idx(a.x, a.y);
  if (w.feature[here] === F.plant) {
    const dd = w.data[here]!;
    const o = s.rules.plants[dd]!;
    if ((o === 'nourishing' || o === 'poor') && d <= 7 && seen(s, a, c.sight) && !fact(s, 'plant', dd)) {
      say(s, ANIMAL_TEXT.jayEats(), c.ev);
      learn(s, 'plant', dd, 'suspected', 'safe', 'I watched jays eat them', c.ev);
    }
    a.t = 60;
    if (nextFloat(s.rng.animals) < 0.6) return;
  }
  // Fly to a safe patch, or wander.
  if (a.tx < 0 || (a.x === a.tx && a.y === a.ty) || nextFloat(s.rng.animals) < 0.05) {
    const options = w.patches.filter((p) => p.role !== 'herb' && (s.rules.plants[p.thing] === 'nourishing' || s.rules.plants[p.thing] === 'poor') && cheb(p.center.x, p.center.y, a.hx, a.hy) <= ANIMALS.jay.range);
    if (options.length) {
      const p = options[nextInt(s.rng.animals, options.length)]!;
      const tile = p.tiles[nextInt(s.rng.animals, p.tiles.length)]!;
      a.tx = tile.x;
      a.ty = tile.y;
    } else return wander(s, w, a);
  }
  stepToward(s, w, a, a.tx, a.ty);
}

function targetStash(s: GameState, a: Animal, range: number, wants: (it: { k: string }) => boolean, allow: (st: Stash) => boolean = () => true): Stash | null {
  let best: Stash | null = null;
  let bd = Infinity;
  for (const st of s.stashes) {
    if (!st.items.some(wants) || !allow(st)) continue;
    if (st.x === s.player.x && st.y === s.player.y) continue;
    const d = cheb(st.x, st.y, a.x, a.y);
    if (d <= range && d < bd) {
      bd = d;
      best = st;
    }
  }
  return best;
}

/** Pack rats and porcupines at night: take small things to the midden, gnaw wooden tools. */
function thief(c: Ctx, a: Animal, wants: (it: { k: string }) => boolean, kind: 'packrat' | 'porcupine'): void {
  const { s, w } = c;
  if (a.carry) {
    if (cheb(a.x, a.y, w.midden.x, w.midden.y) <= 1) {
      drop(s, w.midden.x, w.midden.y + 1, a.carry);
      a.carry = undefined;
      return;
    }
    return void stepToward(s, w, a, w.midden.x, w.midden.y);
  }
  // Not from the hoard itself.
  const st = targetStash(s, a, ANIMALS[a.kind].range, (it) => wants(it), (x) => cheb(x.x, x.y, w.midden.x, w.midden.y) > 1);
  if (!st || cheb(st.x, st.y, s.player.x, s.player.y) <= 1) return wander(s, w, a);
  if (st.x === a.x && st.y === a.y) return steal(c, a, st, wants, kind);
  stepToward(s, w, a, st.x, st.y);
}

function steal(c: Ctx, a: Animal, st: Stash, wants: (it: { k: string }) => boolean, kind: 'jay' | 'packrat' | 'porcupine'): void {
  const { s } = c;
  const it = st.items.find(wants);
  if (!it) return;
  it.n -= 1;
  const name = itemName(s, it);
  st.items = st.items.filter((x) => x.n > 0);
  s.stashes = s.stashes.filter((x) => x.items.length > 0);
  remember(s, 'stolen');
  if (kind === 'packrat') a.carry = { ...it, n: 1 };
  say(s, kind === 'jay' ? ANIMAL_TEXT.jaySteals(name) : kind === 'packrat' ? ANIMAL_TEXT.ratSteals(name) : ANIMAL_TEXT.gnawed(name), c.ev);
  c.ev.push({ type: 'animal', kind: a.kind, what: 'steal' });
}

/** Watching goats on the cliffs shows where a cliff band can be climbed (SPEC 8.1, observation). */
function showRoute(s: GameState, w: World, a: Animal, ev: SimEvent[]): void {
  say(s, ANIMAL_TEXT.goats(), ev);
  for (let dy = -12; dy <= 12; dy++) {
    for (let dx = -12; dx <= 12; dx++) {
      const x = a.x + dx;
      const y = a.y + dy;
      if (!inBounds(x, y) || w.terrain[idx(x, y)] !== T.scree) continue;
      for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) markExplored(s, x + k, y + j);
    }
  }
}

function markExplored(s: GameState, x: number, y: number): void {
  if (!inBounds(x, y)) return;
  const i = idx(x, y);
  s.explored[i >> 5] = (s.explored[i >> 5]! | (1 << (i & 31))) >>> 0;
}

function inRut(s: GameState, a: Animal): boolean {
  const day = clock(s.tick).day;
  return !!a.bull && day >= RUT[0] && day <= RUT[1];
}

/** What the survivor has learned of an animal's temper so far, as words for the notes. */
function temperWords(s: GameState, i: number): string {
  const t = s.rules.tempers[i]!;
  const parts: string[] = [];
  if (recall(s, `temper-seen:${i}`)) parts.push(`${t.boldness}; warns: ${DANGER_ANIMALS[i]!.warnings[t.warning]}`);
  if (recall(s, `temper-turned:${i}`)) parts.push(`backs off from ${t.deterrent}`);
  return parts.join('; ');
}

function noteTemper(s: GameState, i: number, how: string, ev: SimEvent[]): void {
  const known = recall(s, `temper-seen:${i}`) > 0 && recall(s, `temper-turned:${i}`) > 0;
  learn(s, 'temper', i, known ? 'known' : 'suspected', temperWords(s, i), how, ev);
}

/** The bear, a bull elk in the rut, the cougar: they warn, and back off if met the right way (SPEC 9). */
function danger(c: Ctx, a: Animal, d: number): void {
  const { s, w, ev } = c;
  const i = ANIMALS[a.kind].danger!;
  const temper = s.rules.tempers[i]!;
  const name = ANIMALS[a.kind].name;
  const crowd = CROWD[temper.boldness]!;
  const awake = !s.sleep || s.sleep.awake;
  const sees = seen(s, a, c.sight);
  if (sees) see(s, 'temper', i);
  if (sees && a.kind === 'bear') remember(s, 'bear-seen');

  if (a.mode === 'warn') {
    a.t = 10;
    if (--a.timer > 0) return;
    const p = s.player;
    const facing = dirTo(p.x, p.y, a.x, a.y) === p.facing && s.stats.distance === a.mark;
    const shouted = (s.memory.shouted ?? -1e9) >= s.tick - 120;
    const fire = s.fires.some((f) => burning(f) && cheb(f.x, f.y, p.x, p.y) <= 3);
    const turned = temper.deterrent === 'face' ? facing : temper.deterrent === 'noise' ? shouted : fire;
    if (turned || d >= crowd + 3) {
      a.mode = 'leave';
      a.timer = 20;
      if (turned) {
        remember(s, `temper-turned:${i}`);
        say(s, ANIMAL_TEXT.turned(name, temper.deterrent), ev);
        noteTemper(s, i, `it backed off from ${temper.deterrent}`, ev);
      } else say(s, ANIMAL_TEXT.backedAway(name), ev);
      return;
    }
    attack(c, a, name);
    return;
  }
  if (a.mode === 'leave' || a.mode === 'flee') {
    if (a.timer-- > 0) {
      stepToward(s, w, a, s.player.x, s.player.y, true);
      a.t = ANIMALS[a.kind].run;
      return;
    }
    a.mode = 'wander';
  }

  // Watching from a distance, standing still, teaches its temper safely (SPEC 6.6).
  if (sees && d >= 6 && d <= 12 && c.still >= 200 && daylight(s.tick) > 40 && !recall(s, `temper-seen:${i}`)) {
    remember(s, `temper-seen:${i}`);
    say(s, ANIMAL_TEXT.watched(name, DANGER_ANIMALS[i]!.warnings[temper.warning]!), ev);
    noteTemper(s, i, 'I watched it from a distance', ev);
  }

  // Too close: it warns.
  if (awake && d <= crowd && sees) {
    if (temper.boldness === 'shy' && nextFloat(s.rng.animals) < 0.5) {
      a.mode = 'leave';
      a.timer = 15;
      say(s, ANIMAL_TEXT.shyLeaves(name), ev);
      return;
    }
    a.mode = 'warn';
    a.timer = 6;
    a.t = 10;
    a.mark = s.stats.distance;
    remember(s, `temper-seen:${i}`);
    say(s, ANIMAL_TEXT.warns(name, DANGER_ANIMALS[i]!.warnings[temper.warning]!), ev);
    noteTemper(s, i, 'it warned me off', ev);
    ev.push({ type: 'animal', kind: a.kind, what: 'warn' });
    return;
  }

  if (a.kind === 'cougar') return cougar(c, a, d);
  if (!isActive(a.kind, c.hour)) {
    a.t = 300;
    return;
  }
  if (a.kind === 'bear') return bear(c, a);
  wander(s, w, a);
}

/** The bear raids food left out, and goes to the berries and (in the run) the stream. */
function bear(c: Ctx, a: Animal): void {
  const { s, w, ev } = c;
  const st = targetStash(s, a, 25, (it) => !!itemDef(it.k).food);
  if (st && cheb(st.x, st.y, s.player.x, s.player.y) > 6) {
    if (cheb(st.x, st.y, a.x, a.y) <= 1) {
      const eaten = st.items.filter((it) => itemDef(it.k).food);
      st.items = st.items.filter((it) => !itemDef(it.k).food);
      s.stashes = s.stashes.filter((x) => x.items.length > 0);
      remember(s, 'stolen');
      say(s, ANIMAL_TEXT.bearRaid(eaten.map((it) => itemName(s, it)).join(', ')), ev);
      return;
    }
    return void stepToward(s, w, a, st.x, st.y);
  }
  wander(s, w, a);
}

/** The cougar follows at dusk when the survivor is weak, alone, and far from fire (SPEC 9). */
function cougar(c: Ctx, a: Animal, d: number): void {
  const { s, w, ev } = c;
  const v = s.vitals;
  const weak = v.health < 60 || v.nutrition < 25 || v.rest < 20;
  const fireNear = s.fires.some((f) => burning(f) && cheb(f.x, f.y, s.player.x, s.player.y) <= 10);
  const dusk = c.hour >= 18 || c.hour < 6;
  if (!(weak && dusk && !fireNear) || (s.sleep && !s.sleep.awake)) {
    if (a.mode === 'stalk') a.mode = 'wander';
    return wander(s, w, a);
  }
  if (a.mode !== 'stalk') {
    a.mode = 'stalk';
    a.timer = 30;
  }
  if (d > 6) stepToward(s, w, a, s.player.x, s.player.y);
  else if (d < 5) stepToward(s, w, a, s.player.x, s.player.y, true);
  if (d <= 8 && !s.memory[`followed:${clock(s.tick).day}`]) {
    remember(s, `followed:${clock(s.tick).day}`);
    say(s, ANIMAL_TEXT.followed(who(s.protagonist)), ev);
  }
  if (--a.timer <= 0) {
    // Close in to warning distance.
    stepToward(s, w, a, s.player.x, s.player.y);
  }
}

function attack(c: Ctx, a: Animal, name: string): void {
  const { s, ev } = c;
  const wh = who(s.protagonist);
  addCondition(s, 'wound', ATTACK[a.kind] ?? 40);
  s.vitals.health = Math.max(0, s.vitals.health - 12);
  s.vitals.morale = Math.max(0, s.vitals.morale - 20);
  remember(s, 'attacked');
  say(s, ANIMAL_TEXT.attack(wh, name), ev);
  if (s.protagonist.trait === 'glasses' && !s.memory['glasses-broken'] && chance(s.rng.animals, 0.4)) {
    s.memory['glasses-broken'] = 1;
    say(s, ANIMAL_TEXT.glasses(wh), ev);
  }
  if (s.vitals.health <= 0 && !s.over) {
    s.over = { kind: 'death', cause: 'attack', tick: s.tick };
    ev.push({ type: 'over', kind: 'death' });
  }
  ev.push({ type: 'animal', kind: a.kind, what: 'attack' });
  a.mode = 'leave';
  a.timer = 25;
}

function dirTo(fx: number, fy: number, tx: number, ty: number): number {
  const dx = tx - fx;
  const dy = ty - fy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 1 : 3;
  return dy > 0 ? 2 : 0;
}

/** A dangerous animal warning within reach (for the shout action and the HUD). */
export function warning(s: GameState): Animal | null {
  return s.animals.find((a) => a.mode === 'warn' && cheb(a.x, a.y, s.player.x, s.player.y) <= 10) ?? null;
}

/** An animal standing on a tile, or null. */
export function animalAt(s: GameState, x: number, y: number): Animal | null {
  return s.animals.find((a) => a.mode !== 'gone' && a.x === x && a.y === y) ?? null;
}

/** Big animals and porcupines block the survivor's way; small ones scatter. */
export function blocks(a: Animal): boolean {
  return a.kind === 'bear' || a.kind === 'elk' || a.kind === 'cougar' || a.kind === 'goat' || a.kind === 'porcupine';
}

/** A hunted animal is gone, and its kind comes back slowly (SPEC 7.4: populations recover slowly). */
export function kill(s: GameState, a: Animal): void {
  a.mode = 'gone';
  a.gone = (5 + nextInt(s.rng.animals, 5)) * DAY;
}

