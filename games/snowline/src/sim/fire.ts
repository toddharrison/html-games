// Fire (SPEC 8.3): three routes to a first fire (sparks from the dealt spark-stone, embers captured from
// a lightning-struck snag, a bow drill of the dealt drill wood), then a fire's own rules: fuel burning
// down, coals, banking for the night, carrying embers, cooking, boiling, smoking food. Lighting one
// teaches what the dealt tinder does; burning wood teaches what the dealt wood does.

import { STICK_BURN, TINDER_CATCH, TOOL_WORK, WOOD_BURN } from '../content/recipes.ts';
import { FIRE_MSG } from '../content/fireText.ts';
import { itemDef } from '../content/items.ts';
import { who } from '../content/messages.ts';
import { F, T, TERRAIN } from '../content/terrain.ts';
import { type ActionDef, type ItemActionDef, frontTile } from './actionKit.ts';
import { itemName, waterRisk } from './food.ts';
import { count, give, has, slotOf, take, takeFromSlot } from './inventory.ts';
import { fact, knowsTechnique, learn, learnTechnique, lookName } from './knowledge.ts';
import { say } from './log.ts';
import { remember } from './memory.ts';
import { chance } from './rng.ts';
import { level, practise } from './skills.ts';
import { burning, fireNear } from './surroundings.ts';
import type { Fire, GameState, SimEvent } from './state.ts';
import { technique } from '../content/insights.ts';
import { clock } from './time.ts';
import { idx, type World } from './world.ts';

/** Minutes embers keep alive wrapped in bark. */
const EMBER_LIFE = 240;
/** Minutes glowing coals last once the fuel is gone; banked coals last the night. */
const COALS = 45;
const BANKED = 540;

const xy = (t: number) => ({ x: t % 256, y: Math.floor(t / 256) });

export function fireAt(s: GameState, tile: number): Fire | null {
  const { x, y } = xy(tile);
  return s.fires.find((f) => f.x === x && f.y === y) ?? null;
}

/** The steel tool carried, or null. */
export function steelTool(s: GameState): string | null {
  for (const k of ['hatchet', 'knife', 'multitool']) if (has(s, k)) return k;
  return null;
}

/** Open ground a fire can be laid on. */
function fireGround(s: GameState, w: World, tile: number): boolean {
  const t = w.terrain[tile]!;
  if (!TERRAIN[t]!.passable || TERRAIN[t]!.water || t === T.scree || t === T.snow) return false;
  if (w.feature[tile] !== F.none) return false;
  const { x, y } = xy(tile);
  if (s.player.x === x && s.player.y === y) return false;
  return !fireAt(s, tile) && !s.builds.some((b) => b.x === x && b.y === y && b.kind !== 'signal');
}

/** The tinder slot to use: the one most likely to catch, as far as the survivor knows. */
function bestTinder(s: GameState): number {
  let best = -1;
  let score = -1;
  s.inventory.forEach((it, i) => {
    if (it.k !== 'tinder' || it.d === undefined) return;
    const f = fact(s, 'tinder', it.d);
    const sc = !f ? 1 : f.value === 'catches' ? 3 : f.value === 'slow' ? 2 : f.value === 'fails' ? 0 : 1;
    if (sc > score) {
      score = sc;
      best = i;
    }
  });
  return best;
}

/** Fuel to start with: two sticks, or one piece of firewood. */
function hasKindling(s: GameState): boolean {
  return count(s, 'stick') >= 2 || count(s, 'firewood') >= 1;
}

/** A known spark-stone that the survivor carries, or -1. */
function sparkStone(s: GameState): number {
  for (const it of s.inventory) if (it.k === 'stone' && it.d !== undefined && fact(s, 'stone', it.d)?.value === 'sparks') return it.d;
  return -1;
}

type Method = 'sparks' | 'embers' | 'drill' | 'match';

function canLight(s: GameState, m: Method): boolean {
  if (bestTinder(s) < 0 && m !== 'match') return false;
  if (!hasKindling(s)) return false;
  if (m === 'sparks') return sparkStone(s) >= 0 && steelTool(s) !== null;
  if (m === 'embers') return has(s, 'ember-pouch');
  if (m === 'drill') return has(s, 'bow-drill');
  return has(s, 'matches') && bestTinder(s) >= 0;
}

/** Try to light a fire on `tile` (SPEC 8.3). A skill check that gets easier with practice. */
function light(s: GameState, _w: World, tile: number, m: Method, ev: SimEvent[]): void {
  const wh = who(s.protagonist);
  const slot = bestTinder(s);
  const tinder = s.inventory[slot]!.d!;
  const outcome = s.rules.tinders[tinder]!;
  let p = TINDER_CATCH[outcome]!;
  if (m === 'sparks') p *= TOOL_WORK[steelTool(s) ?? 'multitool']!.sparks;
  if (m === 'embers') p = Math.min(0.95, p * 1.4 + 0.2);
  if (m === 'match') p = Math.min(0.97, p * 1.5 + 0.3);
  if (m === 'drill') {
    const it = s.inventory.find((i) => i.k === 'bow-drill')!;
    const right = s.rules.woods[it.d ?? 0] === 'drill';
    s.vitals.rest = Math.max(0, s.vitals.rest - 10);
    if (!right) {
      say(s, FIRE_MSG.drillSmoked(wh, lookName('wood', it.d ?? 0)), ev);
      const n = remember(s, `drill-fail:${it.d}`);
      learn(s, 'wood', it.d ?? 0, n >= 2 ? 'known' : 'suspected', 'not for the drill', 'the bow drill only smoked', ev);
      practise(s, 'firecraft', 1);
      return;
    }
  }
  if (outcome !== 'fails') p += 0.07 * level(s, 'firecraft') + (knowsTechnique(s, 'tinder-nest') ? 0.15 : 0);
  if (m === 'embers') take(s, 'ember-pouch', 1);
  if (m === 'match') take(s, 'matches', 1);
  practise(s, 'firecraft', 1.5);
  if (!chance(s.rng['skill-checks'], Math.min(0.95, p))) {
    takeFromSlot(s, slot, 1);
    remember(s, 'fire-fails');
    const n = remember(s, `tinder-fail:${tinder}`);
    say(s, FIRE_MSG.wouldNotCatch(wh, lookName('tinder', tinder)), ev);
    if (outcome === 'fails' && n >= 2) learn(s, 'tinder', tinder, 'known', 'fails', 'it would never catch', ev);
    else if (n >= 2 && !fact(s, 'tinder', tinder)) learn(s, 'tinder', tinder, 'suspected', 'fails', 'it would not catch', ev);
    return;
  }
  takeFromSlot(s, slot, 1);
  let fuel = 0;
  let wood = -1;
  if (count(s, 'firewood') >= 1) {
    const fw = s.inventory.find((i) => i.k === 'firewood')!;
    wood = fw.d ?? 0;
    take(s, 'firewood', 1, fw.d);
    fuel = WOOD_BURN[s.rules.woods[wood]!]!;
  } else {
    take(s, 'stick', 2);
    fuel = STICK_BURN * 2;
  }
  const { x, y } = xy(tile);
  s.fires.push({ x, y, fuel, coals: 0, banked: false, smoke: 0, signal: false });
  s.fires.sort((a, b) => a.y - b.y || a.x - b.x);
  const first = !s.memory['fires-lit'];
  remember(s, 'fires-lit');
  learn(s, 'tinder', tinder, 'known', outcome, 'it caught', ev);
  if (m === 'drill') learn(s, 'wood', s.inventory.find((i) => i.k === 'bow-drill')?.d ?? 0, 'known', 'drill', 'the bow drill made a coal', ev);
  say(s, first ? FIRE_MSG.firstFire(wh) : FIRE_MSG.lit(wh, outcome === 'slow'), ev);
  s.vitals.morale = Math.min(100, s.vitals.morale + (first ? 20 : 4));
  ev.push({ type: 'fire-lit', x, y });
  if (wood >= 0) burnWood(s, wood);
}

/** Wood put on a fire teaches what it does, once it has burned a while (a pending lesson). */
function burnWood(s: GameState, wood: number): void {
  s.pending.push({ t: s.tick + 400, kind: 'wood', d: wood });
}

/** What burning a wood taught (called from food.ts's pending queue). */
export function woodLesson(s: GameState, wood: number, ev: SimEvent[]): void {
  const o = s.rules.woods[wood]!;
  const name = lookName('wood', wood);
  const wh = who(s.protagonist);
  if (o === 'long-burning') learn(s, 'wood', wood, 'known', 'long-burning', 'it burned long and slow', ev);
  else if (o === 'smoky') learn(s, 'wood', wood, 'known', 'smoky', 'it smoked thick and white', ev);
  else if (o === 'quick') learn(s, 'wood', wood, 'known', 'quick', 'it flared up and was gone', ev);
  else if (!fact(s, 'wood', wood)) learn(s, 'wood', wood, 'suspected', 'plain', 'it burned steadily, nothing special', ev);
  say(s, FIRE_MSG.woodBurned(wh, name, o), ev);
}

function addFuel(s: GameState, f: Fire, k: 'stick' | 'firewood' | 'boughs', d: number | undefined, ev: SimEvent[]): void {
  const wh = who(s.protagonist);
  if (!take(s, k, 1, d)) return;
  const wasOut = !burning(f);
  if (k === 'stick') f.fuel += STICK_BURN;
  else if (k === 'boughs') {
    f.fuel += 8;
    f.smoke = Math.max(f.smoke, 45);
  } else {
    const o = s.rules.woods[d ?? 0]!;
    f.fuel += WOOD_BURN[o]!;
    if (o === 'smoky') f.smoke = Math.max(f.smoke, 30);
    burnWood(s, d ?? 0);
  }
  f.banked = false;
  if (wasOut) {
    say(s, FIRE_MSG.revived(wh), ev);
    ev.push({ type: 'fire-lit', x: f.x, y: f.y });
  }
}

/** A fire's minute: fuel burns (faster in wind), then the coals cool; banked coals keep. */
export function fireMinute(s: GameState, w: World, ev: SimEvent[], wind: number, rainOnFire: (f: Fire) => boolean): void {
  void w;
  const wh = who(s.protagonist);
  for (const f of s.fires) {
    f.smoke = Math.max(0, f.smoke - 1);
    if (f.banked) {
      f.coals -= 1;
      continue;
    }
    if (f.fuel > 0) {
      f.fuel -= 1 + wind * 0.8;
      if (rainOnFire(f)) f.fuel -= 6;
      if (f.fuel <= 0) {
        f.fuel = 0;
        f.coals = rainOnFire(f) ? 0 : COALS;
        if (near(s, f, 8)) say(s, FIRE_MSG.burnedDown(wh), ev);
      }
    } else {
      f.coals -= rainOnFire(f) ? 10 : 1;
    }
  }
  const out = s.fires.filter((f) => f.fuel <= 0 && f.coals <= 0);
  if (out.some((f) => near(s, f, 8))) say(s, FIRE_MSG.out(wh), ev);
  s.fires = s.fires.filter((f) => f.fuel > 0 || f.coals > 0);
  // What burned wood taught.
  const lessons = s.pending.filter((p) => p.kind === 'wood' && p.t <= s.tick);
  if (lessons.length) {
    s.pending = s.pending.filter((p) => !lessons.includes(p));
    for (const p of lessons) woodLesson(s, p.d, ev);
  }
  // Embers in bark die after a few hours.
  for (let i = s.inventory.length - 1; i >= 0; i--) {
    const it = s.inventory[i]!;
    if (it.k === 'ember-pouch' && it.t !== undefined && s.tick - it.t > EMBER_LIFE * 10) {
      s.inventory.splice(i, 1);
      say(s, FIRE_MSG.embersDied(wh), ev);
    }
  }
  if (s.smoulder && s.tick > s.smoulder.until) s.smoulder = null;
  const h = clock(s.tick).hour;
  if ((h >= 21 || h < 5) && s.fires.some((f) => burning(f) && near(s, f, 3))) remember(s, 'fire-at-night', 1 / 60);
}

function near(s: GameState, f: Fire, r: number): boolean {
  return Math.abs(f.x - s.player.x) <= r && Math.abs(f.y - s.player.y) <= r;
}

/** Lightning has struck the snag: it smoulders for a few hours (called by the weather, M4). */
export function strikeSnag(s: GameState, w: World, ev: SimEvent[]): void {
  const snag = w.landmarks.find((l) => l.kind === 'snag');
  if (!snag) return;
  s.smoulder = { x: snag.x, y: snag.y, until: s.tick + 6 * 600 };
  say(s, FIRE_MSG.lightning(), ev);
}

const isOutcrop = (w: World, t: number) => w.feature[t] === F.outcrop;

/** Strike a stone with steel: sparks, an edge, crumbling, or nothing (SPEC 6.6: learned by trying). */
function strike(s: GameState, stone: number, ev: SimEvent[]): void {
  const wh = who(s.protagonist);
  const o = s.rules.stones[stone]!;
  const name = lookName('stone', stone);
  const tool = steelTool(s) ?? 'multitool';
  practise(s, 'firecraft', 0.5);
  if (o === 'sparks') {
    say(s, FIRE_MSG.sparks(wh, name, TOOL_WORK[tool]!.sparks < 0.7), ev);
    learn(s, 'stone', stone, 'known', 'sparks', 'it threw sparks off the steel', ev);
    learnTechnique(s, 'sparks', technique('sparks').learned, ev);
  } else if (o === 'edge') {
    say(s, FIRE_MSG.edge(wh, name), ev);
    learn(s, 'stone', stone, 'known', 'edge', 'it flaked to a sharp edge', ev);
  } else if (o === 'crumbles') {
    say(s, FIRE_MSG.crumbles(wh, name), ev);
    learn(s, 'stone', stone, 'known', 'crumbles', 'it crumbled', ev);
  } else {
    say(s, FIRE_MSG.nothing(wh, name), ev);
    learn(s, 'stone', stone, 'known', 'inert', 'nothing came of striking it', ev);
  }
}

const METHOD_LABEL: Record<Method, string> = {
  sparks: 'Light a fire with sparks',
  embers: 'Light a fire from the embers',
  drill: 'Light a fire with the bow drill',
  match: 'Light a fire with a match',
};

function lightAction(m: Method, minutes: number): ActionDef {
  return {
    id: `fire-${m}`,
    offer: (s, w, t, front) => (front && fireGround(s, w, t) && canLight(s, m) ? METHOD_LABEL[m] : null),
    minutes,
    skill: 'firecraft',
    done: (s, w, t, ev) => light(s, w, t, m, ev),
  };
}

export const FIRE_ACTIONS: ActionDef[] = [
  lightAction('match', 3),
  lightAction('embers', 8),
  lightAction('sparks', 15),
  lightAction('drill', 45),
  {
    id: 'strike-outcrop',
    offer: (s, w, t) => (isOutcrop(w, t) && steelTool(s) ? `Strike the ${lookName('stone', w.data[t]!)} with the ${itemDef(steelTool(s)!).name}` : null),
    minutes: 3,
    done: (s, w, t, ev) => strike(s, w.data[t]!, ev),
  },
  {
    id: 'take-stone',
    offer: (_s, w, t) => (isOutcrop(w, t) ? `Pry loose some ${lookName('stone', w.data[t]!)}` : null),
    minutes: 10,
    done: (s, w, t, ev) => {
      const got = give(s, 'stone', 1, w.data[t]!);
      if (got) say(s, FIRE_MSG.tookStone(who(s.protagonist), lookName('stone', w.data[t]!)), ev);
      else say(s, FIRE_MSG.full(who(s.protagonist)), ev);
    },
  },
  ...(['stick', 'firewood', 'boughs'] as const).map(
    (k): ActionDef => ({
      id: `feed-${k}`,
      offer: (s, _w, t) => {
        const f = fireAt(s, t);
        if (!f || (!burning(f) && f.coals <= 0) || !has(s, k)) return null;
        if (k === 'firewood') return `Put ${itemName(s, s.inventory[slotOf(s, 'firewood')]!)} on the fire`;
        return k === 'stick' ? 'Put a stick on the fire' : 'Throw green boughs on the fire';
      },
      minutes: 1,
      done: (s, _w, t, ev) => {
        const f = fireAt(s, t);
        if (f) addFuel(s, f, k, k === 'firewood' ? s.inventory[slotOf(s, 'firewood')]?.d : undefined, ev);
      },
    }),
  ),
  {
    id: 'bank',
    offer: (s, _w, t) => {
      const f = fireAt(s, t);
      return f && burning(f) && knowsTechnique(s, 'bank-fire') ? 'Bank the fire for the night' : null;
    },
    minutes: 10,
    done: (s, _w, t, ev) => {
      const f = fireAt(s, t);
      if (!f) return;
      f.banked = true;
      f.fuel = 0;
      f.coals = BANKED;
      say(s, FIRE_MSG.banked(who(s.protagonist)), ev);
    },
  },
  {
    id: 'take-embers',
    offer: (s, _w, t) => {
      const f = fireAt(s, t);
      return f && (burning(f) || f.coals > 0) && knowsTechnique(s, 'carry-embers') && has(s, 'bark') ? 'Wrap embers in bark to carry' : null;
    },
    minutes: 5,
    done: (s, _w, _t, ev) => {
      if (!take(s, 'bark', 1)) return;
      give(s, 'ember-pouch', 1, undefined, s.tick);
      say(s, FIRE_MSG.wrapped(who(s.protagonist)), ev);
    },
  },
  {
    id: 'snag-embers',
    offer: (s, _w, t) => {
      const sm = s.smoulder;
      return sm && idx(sm.x, sm.y) === t && has(s, 'bark') ? 'Take embers from the smouldering snag' : null;
    },
    minutes: 5,
    done: (s, _w, _t, ev) => {
      if (!take(s, 'bark', 1)) return;
      give(s, 'ember-pouch', 1, undefined, s.tick);
      say(s, FIRE_MSG.snagEmbers(who(s.protagonist)), ev);
      learnTechnique(s, 'carry-embers', technique('carry-embers').learned, ev);
    },
  },
  {
    id: 'fill',
    offer: (s, w, t) => {
      const tt = w.terrain[t]!;
      if (tt !== T.shallows && tt !== T.stream && tt !== T.gravel) return null;
      return has(s, 'pot') ? 'Fill the pot' : has(s, 'bark-vessel') ? 'Fill the bark vessel' : null;
    },
    minutes: 2,
    done: (s, w, t, ev) => {
      const pot = has(s, 'pot');
      take(s, pot ? 'pot' : 'bark-vessel', 1);
      give(s, pot ? 'pot-water' : 'water-vessel', 1, w.water[t]!);
      say(s, FIRE_MSG.filled(who(s.protagonist)), ev);
    },
  },
];

const fireByMe = (s: GameState) => fireNear(s, s.player.x, s.player.y, 1) ?? fireNearFront(s);
function fireNearFront(s: GameState): Fire | null {
  const t = frontTile(s);
  const f = t >= 0 ? fireAt(s, t) : null;
  return f && burning(f) ? f : null;
}

export const FIRE_ITEM_ACTIONS: ItemActionDef[] = [
  {
    id: 'strike',
    offer: (s, _w, slot) => {
      const it = s.inventory[slot];
      return it?.k === 'stone' && it.d !== undefined && steelTool(s) ? `Strike the ${lookName('stone', it.d)} with steel` : null;
    },
    minutes: 3,
    done: (s, _w, slot, ev) => {
      const it = s.inventory[slot];
      if (it?.d !== undefined) strike(s, it.d, ev);
    },
  },
  {
    id: 'cook',
    offer: (s, _w, slot) => {
      const it = s.inventory[slot];
      return it && itemDef(it.k).food?.cooksTo && fireByMe(s) ? `Cook the ${itemName(s, it)}` : null;
    },
    minutes: 10,
    done: (s, _w, slot, ev) => {
      const it = s.inventory[slot];
      const to = it && itemDef(it.k).food?.cooksTo;
      if (!it || !to) return;
      const n = it.n;
      takeFromSlot(s, slot, n);
      give(s, to, n, undefined, s.tick);
      practise(s, 'firecraft', 0.5);
      say(s, FIRE_MSG.cooked(who(s.protagonist), itemDef(to).name), ev);
    },
  },
  {
    id: 'smoke',
    offer: (s, _w, slot) => {
      const it = s.inventory[slot];
      return it && (it.k === 'meat' || it.k === 'fish' || it.k === 'cooked-meat' || it.k === 'cooked-fish') && knowsTechnique(s, 'smoking') && fireByMe(s)
        ? `Smoke the ${itemName(s, it)} to keep`
        : null;
    },
    minutes: 120,
    done: (s, _w, slot, ev) => {
      const it = s.inventory[slot];
      if (!it) return;
      const to = it.k.includes('fish') ? 'smoked-fish' : 'smoked-meat';
      const n = it.n;
      takeFromSlot(s, slot, n);
      give(s, to, n, undefined, s.tick);
      say(s, FIRE_MSG.smoked(who(s.protagonist)), ev);
    },
  },
  {
    id: 'boil',
    offer: (s, _w, slot) => {
      const it = s.inventory[slot];
      if (!it || !fireByMe(s)) return null;
      if (it.k === 'pot-water') return 'Boil the water';
      if (it.k === 'water-vessel' && knowsTechnique(s, 'hot-stones') && has(s, 'stone')) return 'Boil the water with hot stones';
      return null;
    },
    minutes: 30,
    done: (s, _w, slot, ev) => {
      const it = s.inventory[slot];
      if (!it) return;
      const pot = it.k === 'pot-water';
      takeFromSlot(s, slot, 1);
      give(s, pot ? 'pot-boiled' : 'boiled-water', 1);
      say(s, FIRE_MSG.boiled(who(s.protagonist)), ev);
    },
  },
  {
    id: 'drink-vessel',
    offer: (s, _w, slot) => {
      const k = s.inventory[slot]?.k;
      return k === 'water-vessel' || k === 'boiled-water' || k === 'pot-water' || k === 'pot-boiled' ? 'Drink it' : null;
    },
    minutes: 2,
    done: (s, w, slot, ev) => {
      const it = s.inventory[slot];
      if (!it) return;
      const boiled = it.k === 'boiled-water' || it.k === 'pot-boiled';
      const pot = it.k.startsWith('pot');
      takeFromSlot(s, slot, 1);
      give(s, pot ? 'pot' : 'bark-vessel', 1);
      s.vitals.hydration = Math.min(100, s.vitals.hydration + 30);
      ev.push({ type: 'drink' });
      say(s, boiled ? FIRE_MSG.drankBoiled(who(s.protagonist)) : FIRE_MSG.drankVessel(who(s.protagonist)), ev);
      if (!boiled) waterRisk(s, w, it.d ?? 0, false);
    },
  },
];

