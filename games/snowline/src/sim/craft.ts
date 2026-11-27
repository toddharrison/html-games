// Crafting and building (SPEC 8.2, 7.6): recipes locked behind techniques, made in the hands from what is
// carried, taking time that depends on the steel tool, and sometimes failing at low skill (consuming the
// materials). Builds go into the world the way a fire is laid: chosen in Make, placed with a preview, set
// out as a site beside the survivor, and built once everything it needs has been put in.

import { BUILDS, NEEDS, RECIPES, type BuildDef, type Ingredient, type Need, type RecipeDef } from '../content/recipes.ts';
import { CRAFT_MSG } from '../content/fireText.ts';
import { itemDef } from '../content/items.ts';
import { who } from '../content/messages.ts';
import { F, T, TERRAIN } from '../content/terrain.ts';
import { type ActionDef, frontTile, receive } from './actionKit.ts';
import { clumsyFactor } from './body.ts';
import { fireAt, fireParts, layAt, steelTool } from './fire.ts';
import { count, giveOrDrop, take, takeFromSlot } from './inventory.ts';
import { knowsTechnique, lookName } from './knowledge.ts';
import { say } from './log.ts';
import { toolTime } from './materials.ts';
import { chance } from './rng.ts';
import { level, practise, speedAt } from './skills.ts';
import { burning, fireNear } from './surroundings.ts';
import type { Build, GameState, Item, SimEvent } from './state.ts';
import type { World } from './world.ts';

export interface CraftOption {
  recipe: string;
  label: string;
  minutes: number;
  /** What's lacking, or '' if it can be made now. */
  missing: string;
}

const inputName = (i: Ingredient) => (i.d !== undefined ? lookName(i.k === 'tinder' ? 'tinder' : 'wood', i.d) : itemDef(i.k).name);
/** "3 sticks", "1 cord", "2 green boughs": a bare one-word name counts up. */
const counted = (n: number, name: string) => `${n} ${n > 1 && /^[a-z]+$/.test(name) && !name.endsWith('s') ? `${name}s` : name}`;

/** What's lacking of `inputs`, counting what's carried and (for a site) what's already in it. */
function missingInputs(s: GameState, inputs: Ingredient[], put: Item[] = []): string {
  const lack: string[] = [];
  for (const i of inputs) {
    const have = count(s, i.k, i.d) + inSite(put, i);
    if (have < i.n) lack.push(counted(i.n - have, inputName(i)));
  }
  return lack.join(', ');
}

function recipeMinutes(s: GameState, r: RecipeDef): number {
  return Math.max(1, Math.round(r.minutes * (r.steel ? toolTime(s, r.work) : 1) * speedAt(s, 'crafting') * clumsyFactor(s)));
}

/** Everything the survivor knows how to make in the hands, with what each still needs. */
export function craftOptions(s: GameState, _w: World): CraftOption[] {
  if (s.over || s.sleep) return [];
  const out: CraftOption[] = [];
  for (const r of RECIPES) {
    if (r.technique && !knowsTechnique(s, r.technique)) continue;
    let missing = missingInputs(s, r.inputs);
    if (r.steel && !steelTool(s)) missing = [missing, 'a steel tool'].filter(Boolean).join(', ');
    if (r.fire && !fireNear(s, s.player.x, s.player.y, 1) && !frontFire(s)) missing = [missing, 'a fire close by'].filter(Boolean).join(', ');
    out.push({ recipe: r.id, label: r.label, minutes: recipeMinutes(s, r), missing });
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
  s.task = { action: `craft:${recipe}`, tile: -1, slot: -1, left: ticks, total: ticks };
  events.push({ type: 'task-start', action: recipe });
}

/** Finish making something (called when the task's time is up). */
export function finishCraft(s: GameState, _w: World, recipe: string, events: SimEvent[]): void {
  const wh = who(s.protagonist);
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
  /** Made in the hands, or placed in the world with a preview and built there (the fire and every build). */
  where: 'hands' | 'placed';
  parts: MakePart[];
  /** What's lacking to start now, or ''. A placed thing can always be started: its parts go in later. */
  missing: string;
  minutes: number;
}

function partsOf(s: GameState, inputs: Ingredient[]): MakePart[] {
  return inputs.map((i) => ({ k: i.k, n: i.n, have: count(s, i.k, i.d), name: inputName(i) }));
}

/** Everything in the Make panel, grouped by need in the panel's order: the fire first, then what's known. */
export function makeBook(s: GameState, w: World): MakeEntry[] {
  const out: MakeEntry[] = [{ id: 'fire', label: 'A fire', need: 'warm', where: 'placed', parts: fireParts(s), missing: '', minutes: 4 }];
  for (const o of craftOptions(s, w)) {
    const r = RECIPES.find((x) => x.id === o.recipe)!;
    out.push({ id: r.id, label: r.label, need: r.need, where: 'hands', parts: partsOf(s, r.inputs), missing: o.missing, minutes: o.minutes });
  }
  for (const b of BUILDS) {
    if (knowsBuild(s, b)) out.push({ id: `build:${b.id}`, label: b.label, need: b.need, where: 'placed', parts: partsOf(s, b.inputs), missing: '', minutes: buildMinutes(s, b) });
  }
  const order = Object.keys(NEEDS);
  return out.map((e, i) => ({ e, i })).sort((a, b) => order.indexOf(a.e.need) - order.indexOf(b.e.need) || a.i - b.i).map((x) => x.e);
}

// Builds (SPEC 7.6, 8.2). A site is a build begun but not finished: kind `site:<id>`, holding what's been put
// in. No system reads a site as the thing it will be.

const SITE = 'site:';

export function buildDef(id: string): BuildDef | undefined {
  return BUILDS.find((b) => b.id === id);
}

export function knowsBuild(s: GameState, b: BuildDef): boolean {
  return !b.technique || knowsTechnique(s, b.technique);
}

function buildMinutes(s: GameState, b: BuildDef): number {
  return Math.round(b.minutes * clumsyFactor(s));
}

const xy = (t: number) => ({ x: t % 256, y: Math.floor(t / 256) });
const at = (s: GameState, t: number) => {
  const { x, y } = xy(t);
  return s.builds.filter((b) => b.x === x && b.y === y);
};

/** The site begun on this tile, and the build it's for, or null. */
export function siteAt(s: GameState, tile: number): { site: Build; def: BuildDef } | null {
  const site = at(s, tile).find((b) => b.kind.startsWith(SITE));
  const def = site && buildDef(site.kind.slice(SITE.length));
  return site && def ? { site, def } : null;
}

/** How much of a site is in, 0–1 (for drawing it). */
export function siteProgress(b: Build): number {
  const def = buildDef(b.kind.slice(SITE.length));
  if (!def) return 0;
  const want = def.inputs.reduce((n, i) => n + i.n, 0);
  return def.inputs.reduce((n, i) => n + Math.min(i.n, inSite(b.items ?? [], i)), 0) / want;
}

function inSite(put: Item[], i: Ingredient): number {
  return put.filter((x) => x.k === i.k && (i.d === undefined || x.d === i.d)).reduce((n, x) => n + x.n, 0);
}

/**
 * Why this build can't go on this tile, in a few words, or null if it can (SPEC 7.6). The Make panel's
 * placing shows the reason. Camp builds stack on the spot slept on; the rest go round a fire, on a tree,
 * in the shallows, or on open ground. The survivor builds from beside the spot.
 */
export function buildSiteProblem(s: GameState, w: World, b: BuildDef, tile: number): string | null {
  const t = w.terrain[tile]!;
  const here = at(s, tile);
  if (here.some((x) => x.kind.startsWith(SITE))) return 'finish what was started there first';
  if (here.some((x) => x.kind === b.id)) return "there's one there already";
  if (b.at === 'fire') return fireAt(s, tile) || layAt(s, tile) ? null : 'it goes round a fire';
  if (b.at === 'tree') {
    if (w.feature[tile] !== F.conifer && w.feature[tile] !== F.aspen) return 'it hangs from a tree';
    return here.length ? "there's something there" : null;
  }
  if (b.at === 'water') {
    if (t !== T.shallows && t !== T.stream && t !== T.gravel) return 'it goes in shallow water';
    return here.length ? "there's something there" : null;
  }
  if (TERRAIN[t]!.water) return 'not on the water';
  if (!TERRAIN[t]!.passable) return "can't get there";
  if (t === T.snow) return 'not on snow';
  if (t === T.scree) return 'too loose and stony';
  if (w.feature[tile] !== F.none) return "something's in the way";
  if (fireAt(s, tile) || layAt(s, tile)) return "there's a fire there";
  if (b.at === 'open') return here.length ? "there's something there" : null;
  // A camp spot: a lean-to, bed, wall, and woodpile can share it, under the overhang or not.
  if (b.id === 'lean-to' && t === T.shelter) return 'the overhang is shelter already';
  if (here.some((x) => x.kind === 'snare' || x.kind === 'signal')) return "there's something there";
  return null;
}

/** Put what's carried into the site, up to what it needs. Returns what went in, as words. */
function putIn(s: GameState, site: Build, def: BuildDef): string[] {
  site.items ??= [];
  const put: string[] = [];
  for (const i of def.inputs) {
    let want = i.n - inSite(site.items, i);
    let moved = 0;
    for (let slot = s.inventory.length - 1; slot >= 0 && want > 0; slot--) {
      const it = s.inventory[slot]!;
      if (it.k !== i.k || (i.d !== undefined && it.d !== i.d)) continue;
      const n = Math.min(want, it.n);
      const got = takeFromSlot(s, slot, n)!;
      const same = site.items.find((x) => x.k === got.k && x.d === got.d);
      if (same) same.n += n;
      else site.items.push({ k: got.k, n, ...(got.d !== undefined ? { d: got.d } : {}) });
      want -= n;
      moved += n;
    }
    if (moved) put.push(counted(moved, inputName(i)));
  }
  return put;
}

/** What the site still lacks after what's carried goes in (none: ''). */
function siteLacks(s: GameState, site: Build, def: BuildDef): string {
  return missingInputs(s, def.inputs, site.items ?? []);
}

/** Something carried is still wanted by the site. */
function canPutIn(s: GameState, site: Build, def: BuildDef): boolean {
  return def.inputs.some((i) => inSite(site.items ?? [], i) < i.n && count(s, i.k, i.d) > 0);
}

/** The thing a build makes, as the log names it ("the lean-to"). */
const thingOf = (b: BuildDef) => b.label.replace(/^\w+ an? /i, '').toLowerCase();

/** Put in what's carried, and if that's everything, build it. */
function work(s: GameState, site: Build, def: BuildDef, ev: SimEvent[]): void {
  const wh = who(s.protagonist);
  const put = putIn(s, site, def);
  if (siteLacks(s, site, def)) {
    if (put.length) say(s, CRAFT_MSG.putIn(wh, put, thingOf(def), siteLacks(s, site, def)), ev);
    return;
  }
  site.kind = def.id;
  // A cache and a weir hold things (food, fish); the rest hold nothing once built.
  if (def.id === 'cache' || def.id === 'weir') site.items = [];
  else delete site.items;
  s.builds.sort((a, c) => a.y - c.y || a.x - c.x || (a.kind < c.kind ? -1 : 1));
  practise(s, 'crafting', 2);
  say(s, CRAFT_MSG.built(wh, thingOf(def)), ev);
  s.vitals.morale = Math.min(100, s.vitals.morale + 4);
}

/** Minutes to work on a site: putting things in, and the building itself if that finishes it. */
function workMinutes(s: GameState, site: Build | null, def: BuildDef): number {
  const put = site?.items ?? [];
  return 2 + (missingInputs(s, def.inputs, put) ? 0 : buildMinutes(s, def));
}

function placeAction(def: BuildDef): ActionDef {
  return {
    // Placed from the Make panel (no menu row of its own): set out the site beside the survivor, put in what's carried.
    id: `place:${def.id}`,
    unlisted: true,
    offer: (s, w, t, front) => (front && knowsBuild(s, def) && !buildSiteProblem(s, w, def, t) ? def.label : null),
    minutes: (s) => workMinutes(s, null, def),
    done: (s, w, t, ev) => {
      if (buildSiteProblem(s, w, def, t)) return;
      const { x, y } = xy(t);
      const site: Build = { kind: `${SITE}${def.id}`, x, y, items: [] };
      s.builds.push(site);
      s.builds.sort((a, c) => a.y - c.y || a.x - c.x || (a.kind < c.kind ? -1 : 1));
      if (!missingInputs(s, def.inputs)) return work(s, site, def, ev);
      say(s, CRAFT_MSG.begun(who(s.protagonist), thingOf(def)), ev);
      work(s, site, def, ev);
    },
  };
}

export const BUILD_ACTIONS: ActionDef[] = [
  ...BUILDS.map(placeAction),
  {
    id: 'site-work',
    offer: (s, _w, t, front) => {
      const here = front && siteAt(s, t);
      if (!here) return null;
      return siteLacks(s, here.site, here.def) ? `Add to the ${thingOf(here.def)}` : here.def.label;
    },
    spent: (s, _w, t) => {
      const { site, def } = siteAt(s, t)!;
      return siteLacks(s, site, def) && !canPutIn(s, site, def) ? `needs ${siteLacks(s, site, def)}` : null;
    },
    minutes: (s, _w, t) => {
      const here = siteAt(s, t);
      return here ? workMinutes(s, here.site, here.def) : 2;
    },
    done: (s, _w, t, ev) => {
      const here = siteAt(s, t);
      if (here) work(s, here.site, here.def, ev);
    },
  },
  {
    id: 'site-undo',
    offer: (s, _w, t, front) => {
      const here = front && siteAt(s, t);
      return here ? `Take the ${thingOf(here.def)} apart` : null;
    },
    minutes: 2,
    done: (s, _w, t, ev) => {
      const here = siteAt(s, t);
      if (!here) return;
      for (const it of here.site.items ?? []) giveOrDrop(s, it.k, it.n, it.d);
      s.builds = s.builds.filter((x) => x !== here.site);
      say(s, CRAFT_MSG.undone(who(s.protagonist), thingOf(here.def)), ev);
    },
  },
];
