// Crafting and building (SPEC 8.2, 7.6): recipes locked behind techniques, made from what is carried,
// taking time that depends on the steel tool, and sometimes failing at low skill (consuming the
// materials). Camp improvements are built the same way, on the camp tile, a fire, a tree, or open ground.

import { BUILDS, NEEDS, RECIPES, type BuildDef, type Ingredient, type Need, type RecipeDef } from '../content/recipes.ts';
import { CRAFT_MSG } from '../content/fireText.ts';
import { itemDef } from '../content/items.ts';
import { who } from '../content/messages.ts';
import { F, T, TERRAIN } from '../content/terrain.ts';
import { frontTile, receive } from './actionKit.ts';
import { clumsyFactor } from './body.ts';
import { fireAt, LAY_STICKS, steelTool } from './fire.ts';
import { count, take } from './inventory.ts';
import { knownWith, knowsTechnique, lookName } from './knowledge.ts';
import { say } from './log.ts';
import { toolTime } from './materials.ts';
import { chance } from './rng.ts';
import { level, practise, speedAt } from './skills.ts';
import { burning, fireNear } from './surroundings.ts';
import type { GameState, SimEvent } from './state.ts';
import { idx, type World } from './world.ts';

export interface CraftOption {
  recipe: string;
  label: string;
  minutes: number;
  /** What's lacking, or '' if it can be made now. */
  missing: string;
}

function missingInputs(s: GameState, inputs: Ingredient[]): string {
  const lack: string[] = [];
  for (const i of inputs) {
    const have = count(s, i.k, i.d);
    if (have < i.n) lack.push(`${i.n - have} ${i.d !== undefined ? lookName(i.k === 'tinder' ? 'tinder' : 'wood', i.d) : itemDef(i.k).name}`);
  }
  return lack.join(', ');
}

function recipeMinutes(s: GameState, r: RecipeDef): number {
  return Math.max(1, Math.round(r.minutes * (r.steel ? toolTime(s, r.work) : 1) * speedAt(s, 'crafting') * clumsyFactor(s)));
}

/** Where a build would go now, or -1 if there's no fitting place. */
function buildTile(s: GameState, w: World, b: BuildDef): number {
  const here = idx(s.player.x, s.player.y);
  const front = frontTile(s);
  if (b.at === 'here') {
    if (s.builds.some((x) => x.kind === b.id && x.x === s.player.x && x.y === s.player.y)) return -1;
    if (b.id === 'lean-to' && w.terrain[here] === T.shelter) return -1;
    return here;
  }
  if (front < 0) return -1;
  const fx = front % 256;
  const fy = Math.floor(front / 256);
  if (b.at === 'fire') return fireAt(s, front) && !s.builds.some((x) => x.kind === 'reflector' && x.x === fx && x.y === fy) ? front : -1;
  if (b.at === 'tree') return (w.feature[front] === F.conifer || w.feature[front] === F.aspen) && !s.builds.some((x) => x.x === fx && x.y === fy) ? front : -1;
  const t = w.terrain[front]!;
  if (b.at === 'water') return (t === T.shallows || t === T.stream || t === T.gravel) && !s.builds.some((x) => x.x === fx && x.y === fy) ? front : -1;
  const open = TERRAIN[t]!.passable && !TERRAIN[t]!.water && w.feature[front] === F.none && !fireAt(s, front) && !s.builds.some((x) => x.x === fx && x.y === fy);
  return open ? front : -1;
}

/** Everything the survivor knows how to make or build, with what each still needs. */
export function craftOptions(s: GameState, w: World): CraftOption[] {
  if (s.over || s.sleep) return [];
  const out: CraftOption[] = [];
  for (const r of RECIPES) {
    if (r.technique && !knowsTechnique(s, r.technique)) continue;
    let missing = missingInputs(s, r.inputs);
    if (r.steel && !steelTool(s)) missing = [missing, 'a steel tool'].filter(Boolean).join(', ');
    if (r.fire && !fireNear(s, s.player.x, s.player.y, 1) && !frontFire(s)) missing = [missing, 'a fire close by'].filter(Boolean).join(', ');
    out.push({ recipe: r.id, label: r.label, minutes: recipeMinutes(s, r), missing });
  }
  for (const b of BUILDS) {
    if (b.technique && !knowsTechnique(s, b.technique)) continue;
    let missing = missingInputs(s, b.inputs);
    if (buildTile(s, w, b) < 0) missing = [missing, b.at === 'here' ? 'a spot without one' : b.at === 'fire' ? 'to face a fire' : b.at === 'tree' ? 'to face a tree' : b.at === 'water' ? 'to face shallow water' : 'to face open ground'].filter(Boolean).join(', ');
    out.push({ recipe: `build:${b.id}`, label: b.label, minutes: Math.round(b.minutes * clumsyFactor(s)), missing });
  }
  return out;
}

function frontFire(s: GameState): boolean {
  const t = frontTile(s);
  const f = t >= 0 ? fireAt(s, t) : null;
  return !!f && burning(f);
}

/** Start making something, if it really can be made. */
export function startCraft(s: GameState, w: World, recipe: string, events: SimEvent[]): void {
  if (s.task || s.sleep || s.over) return;
  const o = craftOptions(s, w).find((x) => x.recipe === recipe);
  if (!o || o.missing) return;
  const ticks = o.minutes * 10;
  const tile = recipe.startsWith('build:') ? buildTile(s, w, BUILDS.find((b) => `build:${b.id}` === recipe)!) : -1;
  s.task = { action: `craft:${recipe}`, tile, slot: -1, left: ticks, total: ticks };
  events.push({ type: 'task-start', action: recipe });
}

/** Finish making something (called when the task's time is up). */
export function finishCraft(s: GameState, w: World, recipe: string, tile: number, events: SimEvent[]): void {
  const wh = who(s.protagonist);
  if (recipe.startsWith('build:')) {
    const b = BUILDS.find((x) => `build:${x.id}` === recipe);
    if (!b || missingInputs(s, b.inputs) || buildTile(s, w, b) !== tile) return;
    for (const i of b.inputs) take(s, i.k, i.n, i.d);
    s.builds.push({ kind: b.id, x: tile % 256, y: Math.floor(tile / 256), ...(b.id === 'cache' || b.id === 'weir' ? { items: [] } : {}) });
    s.builds.sort((a, c) => a.y - c.y || a.x - c.x || (a.kind < c.kind ? -1 : 1));
    practise(s, 'crafting', 2);
    say(s, CRAFT_MSG.built(wh, b.label.replace(/^\w+ an? /i, '').toLowerCase()), events);
    s.vitals.morale = Math.min(100, s.vitals.morale + 4);
    return;
  }
  const r = RECIPES.find((x) => x.id === recipe);
  if (!r || missingInputs(s, r.inputs)) return;
  const wood = r.keepsWood ? s.inventory.find((i) => i.k === 'firewood')?.d : undefined;
  for (const i of r.inputs) take(s, i.k, i.n, i.d);
  practise(s, 'crafting', 1.5);
  const failChance = (r.fail ?? 0) * (1 - level(s, 'crafting') / 5);
  if (failChance > 0 && chance(s.rng['skill-checks'], failChance)) {
    say(s, CRAFT_MSG.failed(wh, `a ${itemDef(r.out.k).name}`), events);
    return;
  }
  say(s, CRAFT_MSG.made(wh, r.out.n > 1 ? `${r.out.n} ${itemDef(r.out.k).name}` : `a ${itemDef(r.out.k).name}`), events);
  receive(s, r.out.k, r.out.n, events, wood);
}

/** One thing a Make entry needs: an item (with how many are carried), or a way to light a fire. */
export interface MakePart {
  /** The item kind, for its picture. */
  k: string;
  n: number;
  have: number;
  /** As the kid knows it: a dealt thing's look once learned, else what it should be, with `unknown` set. */
  name: string;
  /** The kid doesn't yet know which thing in this valley it is ("wood that burns well?"). */
  unknown?: boolean;
  /** Better with it, but not needed. */
  optional?: boolean;
}

/** An entry in the Make panel (SPEC 8.2, 12.4): something the kid knows how to make or build. */
export interface MakeEntry {
  /** A recipe id, `build:<id>`, or `fire`. */
  id: string;
  label: string;
  need: Need;
  /** Made in the hands; built where the survivor stands or faces; or placed with a preview (the fire). */
  where: 'hands' | 'here' | 'front' | 'placed';
  parts: MakePart[];
  /** What's lacking to start now, or ''. A placed thing can always be started: its parts go in later. */
  missing: string;
  minutes: number;
}

/** The fire: what every kid knows a fire needs, named as far as this valley is known (SPEC 8.3). */
function fireEntry(s: GameState): MakeEntry {
  const tinder = knownWith(s, 'tinder', 'catches');
  const wood = knownWith(s, 'wood', 'long-burning');
  const stone = knownWith(s, 'stone', 'sparks');
  const parts: MakePart[] = [
    tinder >= 0
      ? { k: 'tinder', n: 1, have: count(s, 'tinder', tinder), name: lookName('tinder', tinder) }
      : { k: 'tinder', n: 1, have: count(s, 'tinder'), name: 'something dry that catches a spark', unknown: true },
    { k: 'stick', n: LAY_STICKS, have: count(s, 'stick'), name: 'sticks for kindling' },
    wood >= 0
      ? { k: 'firewood', n: 1, have: count(s, 'firewood', wood), name: lookName('wood', wood), optional: true }
      : { k: 'firewood', n: 1, have: count(s, 'firewood'), name: 'wood that burns well', unknown: true, optional: true },
  ];
  // A way to light it: whatever the kid has, or the sparks every kid has heard of.
  if (count(s, 'matches')) parts.push({ k: 'matches', n: 1, have: count(s, 'matches'), name: 'a match' });
  else if (count(s, 'ember-pouch')) parts.push({ k: 'ember-pouch', n: 1, have: 1, name: 'embers' });
  else if (stone >= 0) parts.push({ k: 'stone', n: 1, have: count(s, 'stone', stone), name: `a piece of the ${lookName('stone', stone)}` });
  else parts.push({ k: 'stone', n: 1, have: 0, name: 'a rock that sparks on steel', unknown: true });
  return { id: 'fire', label: 'A fire', need: 'warm', where: 'placed', parts, missing: '', minutes: 4 };
}

function partsOf(s: GameState, inputs: Ingredient[]): MakePart[] {
  return inputs.map((i) => ({ k: i.k, n: i.n, have: count(s, i.k, i.d), name: i.d !== undefined ? lookName(i.k === 'tinder' ? 'tinder' : 'wood', i.d) : itemDef(i.k).name }));
}

/** Everything in the Make panel, grouped by need in the panel's order: the fire first, then what's known. */
export function makeBook(s: GameState, w: World): MakeEntry[] {
  const opts = new Map(craftOptions(s, w).map((o) => [o.recipe, o]));
  const out: MakeEntry[] = [fireEntry(s)];
  for (const r of RECIPES) {
    const o = opts.get(r.id);
    if (o) out.push({ id: r.id, label: r.label, need: r.need, where: 'hands', parts: partsOf(s, r.inputs), missing: o.missing, minutes: o.minutes });
  }
  for (const b of BUILDS) {
    const o = opts.get(`build:${b.id}`);
    if (o) out.push({ id: o.recipe, label: b.label, need: b.need, where: b.at === 'here' ? 'here' : 'front', parts: partsOf(s, b.inputs), missing: o.missing, minutes: o.minutes });
  }
  const order = Object.keys(NEEDS);
  return out.map((e, i) => ({ e, i })).sort((a, b) => order.indexOf(a.e.need) - order.indexOf(b.e.need) || a.i - b.i).map((x) => x.e);
}
