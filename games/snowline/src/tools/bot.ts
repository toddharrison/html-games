// The bot player (SPEC 11.4): a simple scripted survivor that plays headless, for balance. It learns each
// valley's rules the way a player must, by striking stones, tasting, watching, and trying. In its second
// mode it is handed the deal, and the gap between the two is what learning the valley costs.
//
// It plays through the same commands as a player and sees only what a player could (the map, its
// knowledge), except that it knows where the overhang and the wreckage are, as a player would from
// exploring and from a viewpoint.

import { itemDef } from '../content/items.ts';
import { F, T, TERRAIN } from '../content/terrain.ts';
import { availableActions, frontTile, itemActions } from '../sim/actions.ts';
import { canSee } from '../sim/actionKit.ts';
import { warning } from '../sim/animals.ts';
import { craftOptions } from '../sim/craft.ts';
import { count, has } from '../sim/inventory.ts';
import { ROWS, fact } from '../sim/knowledge.ts';
import { describeTemper } from '../sim/newGame.ts';
import type { Protagonist } from '../sim/protagonist.ts';
import type { Command, Dir, GameState } from '../sim/state.ts';
import { canEnter, step } from '../sim/step.ts';
import { burning } from '../sim/surroundings.ts';
import { clock } from '../sim/time.ts';
import { WEATHER } from '../content/weather.ts';
import { weatherAt } from '../sim/weather.ts';
import { idx, type World } from '../sim/world.ts';
import { L } from '../content/loose.ts';
import { looseAt } from '../sim/loose.ts';
import { woodLeft } from '../sim/materials.ts';
import { startScenario } from './runner.ts';

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;

export interface BotResult {
  seed: string;
  background: string;
  knowsDeal: boolean;
  outcome: 'death' | 'rescue' | 'alive';
  cause: string;
  days: number;
  firstFireDay: number;
  facts: number;
  techniques: number;
}

type Body = Command extends infer C ? (C extends Command ? Omit<C, 't'> : never) : never;

/** Fill in every valley fact from the deal (the bot's second mode). */
export function handDeal(s: GameState): void {
  for (const r of ROWS) {
    r.things.forEach((_, i) => {
      const rules = s.rules;
      const value =
        r.row === 'plant' ? rules.plants[i]! : r.row === 'remedy' ? rules.remedies[i]! : r.row === 'stone' ? rules.stones[i]! : r.row === 'wood' ? rules.woods[i]! : r.row === 'tinder' ? rules.tinders[i]! : r.row === 'water' ? rules.water[i]! : r.row === 'sign' ? rules.signs[i]! : describeTemper(s, i);
      s.known.facts = s.known.facts.filter((f) => f.key !== `${r.row}:${i}`);
      s.known.facts.push({ key: `${r.row}:${i}`, level: 'known', value, how: 'told', tick: 0 });
    });
  }
  s.known.facts.sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** Breadth-first search from the survivor to the nearest tile meeting `goal`; returns the first steps. */
function route(s: GameState, w: World, goal: (i: number) => boolean, limit = 20000): Dir[] | null {
  const start = idx(s.player.x, s.player.y);
  if (goal(start)) return [];
  const prev = new Map<number, number>();
  const dirOf = new Map<number, Dir>();
  prev.set(start, -1);
  const q = [start];
  for (let h = 0; h < q.length && q.length < limit; h++) {
    const i = q[h]!;
    const x = i % 256;
    const y = (i - x) / 256;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d]!;
      const ny = y + DY[d]!;
      const n = ny * 256 + nx;
      if (prev.has(n) || !canEnter(s, w, nx, ny)) continue;
      prev.set(n, i);
      dirOf.set(n, d as Dir);
      if (goal(n)) {
        const path: Dir[] = [];
        for (let t = n; prev.get(t)! !== -1; t = prev.get(t)!) path.push(dirOf.get(t)!);
        return path.reverse();
      }
      q.push(n);
    }
  }
  return null;
}

export class Bot {
  private path: Dir[] = [];
  private goalName = '';
  private stuck = 0;
  private firstFire = -1;
  private readonly s: GameState;
  private readonly w: World;

  constructor(s: GameState, w: World) {
    this.s = s;
    this.w = w;
  }

  get firstFireDay(): number {
    return this.firstFire;
  }

  /** What to do this tick (only when the survivor is free to act). */
  decide(): Body[] {
    const s = this.s;
    const w = this.w;
    if (s.over || s.sleep || s.task || s.player.stepLeft > 0) return [];
    if (this.firstFire < 0 && s.memory['fires-lit']) this.firstFire = clock(s.tick).day;
    const v = s.vitals;
    const c = clock(s.tick);
    const here = idx(s.player.x, s.player.y);
    const camp = idx(w.overhang.shelter.x, w.overhang.shelter.y);

    // Danger: use what's known to turn it, else back away.
    const a = warning(s);
    if (a) {
      this.path = [];
      const t = fact(s, 'temper', ['bear', 'elk', 'cougar'].indexOf(a.kind));
      if (t?.value.includes('noise')) return this.act('shout', here) ?? [];
      const away = ([0, 1, 2, 3] as Dir[]).sort((d1, d2) => dist(a.x, a.y, s.player.x + DX[d2]!, s.player.y + DY[d2]!) - dist(a.x, a.y, s.player.x + DX[d1]!, s.player.y + DY[d1]!));
      return [{ c: 'move', dir: away[0]! }, { c: 'halt' }];
    }

    if (v.rest < 10) return [{ c: 'sleep', minutes: 240, awake: false }];

    // Put down what's known to be useless, to keep room.
    const junk = s.inventory.findIndex((it) => {
      if (['bandana', 'paperclip', 'pencil', 'gum'].includes(it.k)) return true;
      if (it.k === 'plant' && it.d !== undefined) return ['sickening', 'deadly', 'unsafe'].includes(fact(s, 'plant', it.d)?.value ?? '');
      if (it.k === 'tinder' && it.d !== undefined) return fact(s, 'tinder', it.d)?.value === 'fails';
      if (it.k === 'stone' && it.d !== undefined) return !!fact(s, 'stone', it.d) && fact(s, 'stone', it.d)!.value !== 'sparks';
      return false;
    });
    if (junk >= 0) return [{ c: 'use', action: 'drop', slot: junk }];

    // The wreckage, once the slide has opened it.
    if (s.arc.slide && !s.arc.searched) {
      const tail = idx(w.wreck.x, w.wreck.y);
      const go = this.goAdjacent('wreck', tail, 65536);
      if (go) return go;
      return this.act('search-tail', tail) ?? this.face(tail) ?? [];
    }
    const beacon = s.inventory.findIndex((it) => it.k === 'beacon');
    if (beacon >= 0 && s.arc.rescueAt < 0) return [{ c: 'use', action: 'beacon-on', slot: beacon }];

    // Water.
    if (v.hydration < 45) {
      const drink = (i: number) => {
        const t = w.terrain[i]!;
        if (t !== T.shallows && t !== T.stream && t !== T.gravel) return false;
        const src = w.water[i] === 1 ? 0 : w.water[i] === 2 ? 1 : w.water[i] === 3 ? 2 : -1;
        return src < 0 || fact(s, 'water', src)?.value !== 'foul';
      };
      if (drink(here)) {
        const d = this.act('drink', here);
        if (d) return d;
      }
      const go = this.go('water', drink, 65536);
      if (go) return go;
    }

    // Night, or a downpour: camp, a fire, sleep.
    const night = c.hour >= 21 || c.hour < 5;
    const pouring = WEATHER[weatherAt(s)].wet && v.warmth < 50;
    if (night || pouring || (c.hour >= 19 && dist2t(here, camp) > 20)) {
      if (here !== camp) {
        const back = this.go('camp', (i) => i === camp, 65536);
        if (back) return back;
      }
      const fire = this.tendFire();
      if (fire) return fire;
      if (!night) return [{ c: 'sleep', minutes: 60, awake: true }];
      return [{ c: 'sleep', minutes: (((5 * 60 + 45 - c.minute + 1440) % 1440) || 60), awake: false }];
    }

    // Food.
    if (v.nutrition < 60) {
      const eat = this.eat();
      if (eat) return eat;
    }
    // A taste waiting for its answer: try another kind meanwhile.
    const tasteSlot = s.inventory.findIndex((it) => it.k === 'plant' && it.d !== undefined && !fact(s, 'plant', it.d) && !s.pending.some((p) => p.kind === 'taste' && p.d === it.d));
    if (tasteSlot >= 0) return [{ c: 'use', action: 'taste', slot: tasteSlot }];

    // Fire: find the spark-stone, carry a piece, keep tinder and wood.
    const fireStuff = this.fireSupplies();
    if (fireStuff) return fireStuff;
    const early = this.improveCamp(camp);
    if (early) return early;

    // Nothing more to do outdoors in the dark.
    if (!canSee(s)) {
      if (here !== camp) {
        const back = this.go('camp', (i) => i === camp, 65536);
        if (back) return back;
      }
      return this.tendFire() ?? [{ c: 'sleep', minutes: 60, awake: true }];
    }

    // Food stock.
    const foodCount = s.inventory.filter((it) => itemDef(it.k).food && this.edible(it.k, it.d)).reduce((n, it) => n + it.n, 0);
    if (foodCount < 5 || v.nutrition < 75) {
      const f = this.forage();
      if (f) return f;
    }

    // Camp: a bough bed and a wall.
    const build = this.improveCamp(camp);
    if (build) return build;

    if (here !== camp) return this.go('camp', (i) => i === camp, 65536) ?? [];
    return [{ c: 'sleep', minutes: 60, awake: true }];
  }

  private edible(k: string, d: number | undefined): boolean {
    if (k !== 'plant') return k !== 'crayfish' && k !== 'mussels' && k !== 'meat' && k !== 'fish';
    const f = d === undefined ? null : fact(this.s, 'plant', d);
    return !!f && (f.value === 'nourishing' || f.value === 'poor' || f.value === 'safe');
  }

  private eat(): Body[] | null {
    const s = this.s;
    // Cook raw food at a fire first.
    for (let i = 0; i < s.inventory.length; i++) {
      const opts = itemActions(s, this.w, i).map((o) => o.action);
      if (opts.includes('cook')) return [{ c: 'use', action: 'cook', slot: i }];
    }
    let best = -1;
    let score = -1;
    s.inventory.forEach((it, i) => {
      const food = itemDef(it.k).food;
      if (!food || !this.edible(it.k, it.d)) return;
      const sc = food.nutrition + (it.k === 'plant' ? 5 : 0);
      if (sc > score) {
        score = sc;
        best = i;
      }
    });
    if (best >= 0) return [{ c: 'use', action: 'eat', slot: best }];
    // Raw shellfish when nothing else: a risk worth taking when hungry enough.
    if (this.s.vitals.nutrition < 30) {
      const raw = s.inventory.findIndex((it) => it.k === 'crayfish' || it.k === 'mussels' || it.k === 'fish' || it.k === 'meat');
      if (raw >= 0) return [{ c: 'use', action: 'eat', slot: raw }];
    }
    return this.forage();
  }

  private forage(): Body[] | null {
    const s = this.s;
    const w = this.w;
    const day = clock(s.tick).day;
    const ready = (i: number) => (s.regrow[i] ?? 0) <= s.tick;
    const plantOk = (d: number) => {
      const f = fact(s, 'plant', d);
      if (!f) return count(s, 'plant', d) === 0 && !s.pending.some((p) => p.d === d);
      return f.value === 'nourishing' || f.value === 'poor' || f.value === 'safe';
    };
    const target = (i: number) => {
      if (!ready(i)) return false;
      const f = w.feature[i];
      if (f === F.plant && plantOk(w.data[i]!)) {
        const kind = w.data[i]! <= 4 ? 'berry' : 'other';
        return kind !== 'berry' || day <= 30;
      }
      const t = w.terrain[i];
      const cold = s.vitals.warmth < 55 || s.player.wet > 50;
      return (t === T.reeds && !cold) || (t === T.shallows && !cold) || (f === F.bush && day >= 10) || looseAt(s, w, i) === L.cones;
    };
    const action = (i: number) => {
      const f = w.feature[i];
      if (f === F.plant) return 'pick';
      if (w.terrain[i] === T.reeds) return 'dig-cattail';
      if (w.terrain[i] === T.shallows) return 'feel-shallows';
      if (f === F.bush) return 'rose-hips';
      return 'gather-loose';
    };
    const here = idx(s.player.x, s.player.y);
    if (target(here) && TERRAIN[w.terrain[here]!]!.passable) {
      const r = this.act(action(here), here);
      if (r) return r;
    }
    const front = frontTile(s);
    if (front >= 0 && target(front)) {
      const r = this.act(action(front), front);
      if (r) return r;
    }
    return this.goAdjacentTo('forage', target, 6000);
  }

  private fireSupplies(): Body[] | null {
    const s = this.s;
    const w = this.w;
    const spark = s.known.facts.find((f) => f.key.startsWith('stone:') && f.value === 'sparks');
    const steel = has(s, 'hatchet') || has(s, 'knife') || has(s, 'multitool');
    if (!steel) return null;
    if (!spark) {
      // Strike every outcrop near the overhang, then further afield.
      const unknownStone = (i: number) => w.feature[i] === F.outcrop && !fact(s, 'stone', w.data[i]!);
      const front = frontTile(s);
      if (front >= 0 && unknownStone(front)) return this.act('strike-outcrop', front);
      return this.goAdjacentTo('stone', unknownStone, 12000);
    }
    const sparkStone = Number(spark.key.split(':')[1]);
    if (!has(s, 'stone', sparkStone)) {
      const front = frontTile(s);
      const isIt = (i: number) => w.feature[i] === F.outcrop && w.data[i] === sparkStone;
      if (front >= 0 && isIt(front)) return this.act('take-stone', front);
      return this.goAdjacentTo('spark-stone', isIt, 20000);
    }
    // Tinder: three of something not known to fail.
    const goodTinder = s.inventory.filter((it) => it.k === 'tinder' && fact(s, 'tinder', it.d!)?.value !== 'fails').reduce((n, it) => n + it.n, 0);
    if (goodTinder < 3) {
      const opts = availableActions(s, w).filter((o) => o.action.startsWith('tinder-') && !o.spent);
      for (const o of opts) {
        const tinderIndex = { 'tinder-bark': 1, 'tinder-lichen': 2, 'tinder-punk': 4 }[o.action]!;
        if (fact(s, 'tinder', tinderIndex)?.value !== 'fails') return this.act(o.action, o.tile);
      }
      const okTinder = (i: number) => {
        const l = looseAt(s, w, i);
        const d = l === L.grass ? 0 : l === L.fluff ? 3 : -1;
        return d >= 0 && fact(s, 'tinder', d)?.value !== 'fails';
      };
      const near = this.gatherNear(okTinder);
      if (near) return near;
      return this.goAdjacentTo('tinder', okTinder, 8000);
    }
    if (count(s, 'stick') < 2) {
      const twigs = (i: number) => looseAt(s, w, i) === L.twigs || looseAt(s, w, i) === L.branch;
      const near = this.gatherNear(twigs);
      if (near) return near;
      const go = this.goAdjacentTo('sticks', twigs, 6000);
      if (go) return go;
    }
    if (count(s, 'firewood') < 5) {
      const drift = (i: number) => looseAt(s, w, i) === L.driftwood || looseAt(s, w, i) === L.driftlog || looseAt(s, w, i) === L.branch;
      const near = this.gatherNear(drift);
      if (near) return near;
      const opts = availableActions(s, w).filter((o) => (o.action === 'deadfall-wood' || o.action === 'cut-wood') && !o.spent);
      if (opts.length) return this.act(opts[0]!.action, opts[0]!.tile);
      const wood = this.goAdjacentTo('wood', (i) => ((w.feature[i] === F.log || w.feature[i] === F.conifer || w.feature[i] === F.aspen) && woodLeft(s, w, i)) || drift(i), 8000);
      if (wood) return wood;
    }
    return null;
  }

  /** At camp in the evening: light a fire beside the shelter, keep it fed. */
  private tendFire(): Body[] | null {
    const s = this.s;
    const w = this.w;
    const x = s.player.x;
    const y = s.player.y;
    const lit = s.fires.find((f) => Math.abs(f.x - x) + Math.abs(f.y - y) === 1);
    if (lit && burning(lit)) {
      if (lit.fuel < 420 && (has(s, 'firewood') || has(s, 'stick'))) {
        const d = dirTo(x, y, lit.x, lit.y);
        if (s.player.facing !== d) return [{ c: 'face', dir: d }];
        const feed = this.act('feed-firewood', idx(lit.x, lit.y)) ?? this.act('feed-stick', idx(lit.x, lit.y));
        if (feed) return feed;
      }
      return null;
    }
    // Face an open neighbour and light.
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d]!;
      const ny = y + DY[d]!;
      const t = idx(nx, ny);
      const tt = w.terrain[t]!;
      if (!TERRAIN[tt]!.passable || TERRAIN[tt]!.water || w.feature[t] !== F.none) continue;
      if (s.player.facing !== d) return [{ c: 'face', dir: d as Dir }];
      const light = availableActions(s, w).find((o) => o.action.startsWith('fire-') && o.tile === t);
      return light ? [{ c: 'act', action: light.action, tile: t }] : null;
    }
    return null;
  }

  private improveCamp(camp: number): Body[] | null {
    const s = this.s;
    const w = this.w;
    const hasBed = s.builds.some((b) => b.kind === 'bed' && idx(b.x, b.y) === camp);
    if (hasBed) return null;
    if (count(s, 'boughs') < 4) {
      if (!(has(s, 'hatchet') || has(s, 'knife') || has(s, 'multitool'))) return null;
      const cut = this.act('boughs', frontTile(s));
      if (cut) return cut;
      return this.goAdjacentTo('boughs', (i) => w.feature[i] === F.conifer, 4000);
    }
    if (idx(s.player.x, s.player.y) !== camp) return this.go('camp', (i) => i === camp, 65536);
    const bed = craftOptions(s, w).find((o) => o.recipe === 'build:bed');
    return bed && !bed.missing ? [{ c: 'craft', recipe: 'build:bed' }] : null;
  }

  /** Pick up a loose thing meeting `test` on the faced tile or this one, if there is one. */
  private gatherNear(test: (i: number) => boolean): Body[] | null {
    const s = this.s;
    for (const t of [frontTile(s), idx(s.player.x, s.player.y)]) if (t >= 0 && test(t)) return this.act('gather-loose', t);
    return null;
  }

  // ---- Movement helpers ----

  /** Do an action if it's on offer: on this tile if possible, or wherever the menu offers it. */
  private act(action: string, tile: number): Body[] | null {
    const opts = availableActions(this.s, this.w).filter((o) => o.action === action);
    const o = opts.find((x) => x.tile === tile) ?? opts[0];
    return o ? [{ c: 'act', action, tile: o.tile }] : null;
  }

  private face(tile: number): Body[] | null {
    const s = this.s;
    const d = dirTo(s.player.x, s.player.y, tile % 256, Math.floor(tile / 256));
    return s.player.facing === d ? null : [{ c: 'face', dir: d }];
  }

  /** Walk toward the nearest tile meeting `goal` (standing on it). */
  private go(name: string, goal: (i: number) => boolean, limit = 20000): Body[] | null {
    if (this.goalName !== name || this.path.length === 0) {
      const p = route(this.s, this.w, goal, limit);
      if (!p || p.length === 0) {
        this.path = [];
        return null;
      }
      this.path = p;
      this.goalName = name;
    }
    return this.stepPath();
  }

  /** Walk to stand beside the nearest tile meeting `goal`, then face it. */
  private goAdjacentTo(name: string, goal: (i: number) => boolean, limit: number): Body[] | null {
    const s = this.s;
    const x = s.player.x;
    const y = s.player.y;
    for (let d = 0; d < 4; d++) {
      const t = idx(x + DX[d]!, y + DY[d]!);
      if (goal(t)) {
        this.path = [];
        if (s.player.facing !== d) return [{ c: 'face', dir: d as Dir }];
        return null;
      }
    }
    const near = (i: number) => {
      const ix = i % 256;
      const iy = (i - ix) / 256;
      for (let d = 0; d < 4; d++) if (goal(idx(ix + DX[d]!, iy + DY[d]!))) return true;
      return false;
    };
    return this.go(name, near, limit);
  }

  private goAdjacent(name: string, tile: number, limit: number): Body[] | null {
    return this.goAdjacentTo(name, (i) => i === tile, limit);
  }

  private stepPath(): Body[] | null {
    const d = this.path.shift();
    if (d === undefined) return null;
    const s = this.s;
    if (!canEnter(s, this.w, s.player.x + DX[d]!, s.player.y + DY[d]!)) {
      this.path = [];
      if (++this.stuck > 5) {
        this.stuck = 0;
        return [{ c: 'sleep', minutes: 30, awake: true }];
      }
      return null;
    }
    this.stuck = 0;
    return [{ c: 'move', dir: d }, { c: 'halt' }];
  }
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function dist2t(a: number, b: number): number {
  return dist(a % 256, Math.floor(a / 256), b % 256, Math.floor(b / 256));
}

function dirTo(fx: number, fy: number, tx: number, ty: number): Dir {
  const dx = tx - fx;
  const dy = ty - fy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 1 : 3;
  return dy > 0 ? 2 : 0;
}

/** Play one run to its end (or `maxDays`). */
export function playBot(seed: string, protagonist: Protagonist | number, knowsDeal: boolean, maxDays = 75): BotResult {
  const { state, world } = startScenario({ seed, protagonist, commands: [], ticks: 0 });
  // The bot steps tile by tile (it was written for it), so it plays on the grid even while free walking is tried (SPEC 5.2).
  if (state.walk === 'free') {
    delete state.walk;
    for (const k of ['fx', 'fy', 'lastFx', 'lastFy', 'vx', 'vy', 'nudge'] as const) delete state.player[k];
  }
  if (knowsDeal) handDeal(state);
  const bot = new Bot(state, world);
  const end = maxDays * 14400;
  while (!state.over && state.tick < end) {
    const cmds = state.tick % 2 === 0 ? bot.decide() : [];
    step(state, world, cmds.map((c) => ({ ...c, t: state.tick }) as Command));
  }
  return {
    seed,
    background: state.protagonist.background,
    knowsDeal,
    outcome: state.over ? state.over.kind : 'alive',
    cause: state.over?.cause ?? '',
    days: Math.round((state.over?.tick ?? state.tick) / 1440) / 10,
    firstFireDay: bot.firstFireDay,
    facts: state.known.facts.filter((f) => f.level === 'known').length,
    techniques: state.known.techniques.length,
  };
}

