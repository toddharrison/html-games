// Crafting and building (SPEC 8.2, 7.6): recipes locked behind techniques, made from what is carried,
// taking time that depends on the steel tool, and sometimes failing at low skill (consuming the
// materials). Camp improvements are built the same way, on the camp tile, a fire, a tree, or open ground.

import { BUILDS, RECIPES, type BuildDef, type Ingredient, type RecipeDef } from '../content/recipes.ts';
import { CRAFT_MSG } from '../content/fireText.ts';
import { itemDef } from '../content/items.ts';
import { who } from '../content/messages.ts';
import { F, T, TERRAIN } from '../content/terrain.ts';
import { frontTile } from './actionKit.ts';
import { clumsyFactor } from './body.ts';
import { fireAt, steelTool } from './fire.ts';
import { count, give, take } from './inventory.ts';
import { knowsTechnique, lookName } from './knowledge.ts';
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
  give(s, r.out.k, r.out.n, wood);
  say(s, CRAFT_MSG.made(wh, r.out.n > 1 ? `${r.out.n} ${itemDef(r.out.k).name}` : `a ${itemDef(r.out.k).name}`), events);
}
