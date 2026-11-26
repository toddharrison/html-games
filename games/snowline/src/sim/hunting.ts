// Fishing and hunting (SPEC 7.4, 9): no combat system. Hunting is a careful approach and one throw or
// shot, whose chance depends on distance, skill, and whether the animal is alert. Fish are speared in
// the shallows (better once the survivor learns to aim below them), caught on a line, or trapped in a
// weir; the trout run up the near stream in late summer. Snares catch hares on their runs.

import { ANIMALS, GAME, TROUT_RUN } from '../content/animals.ts';
import { ANIMAL_TEXT } from '../content/animalText.ts';
import { technique } from '../content/insights.ts';
import { who } from '../content/messages.ts';
import { F, T, TERRAIN, WATER } from '../content/terrain.ts';
import { type ActionDef, type ItemActionDef, canSee, frontTile } from './actionKit.ts';
import { cheb, kill, warning } from './animals.ts';
import { treat } from './body.ts';
import { buildAt } from './camp.ts';
import { steelTool } from './fire.ts';
import { give, has, take, takeFromSlot } from './inventory.ts';
import { knowsTechnique, learnTechnique } from './knowledge.ts';
import { say } from './log.ts';
import { remember } from './memory.ts';
import { chance } from './rng.ts';
import { level, practise } from './skills.ts';
import type { Animal, GameState, SimEvent } from './state.ts';
import { clock } from './time.ts';
import { idx, type World } from './world.ts';

/** How many fish a water tile holds, 0–1 (SPEC 7.4): the spawning gravel best, the run doubling the stream. */
export function fishHere(s: GameState, w: World, tile: number): number {
  const t = w.terrain[tile]!;
  const day = clock(s.tick).day;
  const run = day >= TROUT_RUN[0] && day <= TROUT_RUN[1];
  let d = t === T.gravel ? 0.5 : t === T.stream ? 0.32 : t === T.shallows ? (w.water[tile] === WATER.tarn ? 0.1 : 0.22) : 0;
  if (run && (t === T.gravel || (t === T.stream && w.water[tile] === WATER.streamA))) d *= 2;
  return Math.min(0.95, d);
}

const fishable = (w: World, t: number) => {
  const tt = w.terrain[t]!;
  return tt === T.shallows || tt === T.stream || tt === T.gravel;
};

function spear(s: GameState): string | null {
  return has(s, 'hard-spear') ? 'hard-spear' : has(s, 'spear') ? 'spear' : null;
}

/** The huntable animal nearest the survivor within reach, visible and not already gone. */
function quarry(s: GameState, reach: number): Animal | null {
  let best: Animal | null = null;
  let bd = Infinity;
  for (const a of s.animals) {
    if (a.mode === 'gone' || ANIMALS[a.kind].game === undefined) continue;
    const d = cheb(a.x, a.y, s.player.x, s.player.y);
    if (d > reach || d < 1) continue;
    // A grouse that hasn't flushed is all but invisible (SPEC 9), unless the hunter has the eye for it.
    if (a.kind === 'grouse' && a.mode !== 'flee' && d > 1 + Math.floor(level(s, 'hunting') / 2)) continue;
    if (d < bd) {
      bd = d;
      best = a;
    }
  }
  return best;
}

function shoot(s: GameState, how: 'spear' | 'bow', ev: SimEvent[]): void {
  const a = quarry(s, how === 'bow' ? 6 : 3);
  const wh = who(s.protagonist);
  if (!a) return;
  const name = ANIMALS[a.kind].name;
  const d = cheb(a.x, a.y, s.player.x, s.player.y);
  let p = 0.55 - 0.09 * d + 0.08 * level(s, 'hunting') + (a.mode === 'flee' ? -0.25 : 0);
  if (how === 'bow') p += 0.15;
  if (how === 'spear' && has(s, 'hard-spear')) p += 0.05;
  if (a.kind === 'grouse' && a.mode !== 'flee') p += 0.2;
  practise(s, 'hunting', 1.5);
  if (how === 'bow' && chance(s.rng['skill-checks'], 0.3)) take(s, 'arrows', 1);
  if (!chance(s.rng['skill-checks'], Math.max(0.03, Math.min(0.9, p)))) {
    say(s, ANIMAL_TEXT.missed(wh, name), ev);
    a.mode = 'flee';
    a.timer = 8;
    a.t = 1;
    return;
  }
  kill(s, a);
  give(s, 'game', 1, ANIMALS[a.kind].game);
  say(s, ANIMAL_TEXT.hit(wh, name), ev);
  ev.push({ type: 'animal', kind: a.kind, what: 'killed' });
}

export const HUNT_ACTIONS: ActionDef[] = [
  {
    id: 'throw-spear',
    offer: (s, _w, t) => {
      if (t !== idx(s.player.x, s.player.y) || !spear(s)) return null;
      const a = quarry(s, 3);
      return a ? `Throw the spear at the ${ANIMALS[a.kind].name}` : null;
    },
    minutes: 1,
    needsLight: true,
    done: (s, _w, _t, ev) => shoot(s, 'spear', ev),
  },
  {
    id: 'shoot',
    offer: (s, _w, t) => {
      if (t !== idx(s.player.x, s.player.y) || !has(s, 'bow') || !has(s, 'arrows')) return null;
      const a = quarry(s, 6);
      return a ? `Shoot at the ${ANIMALS[a.kind].name}` : null;
    },
    minutes: 1,
    needsLight: true,
    done: (s, _w, _t, ev) => shoot(s, 'bow', ev),
  },
  {
    id: 'spear-fish',
    offer: (s, w, t) => (t === frontTile(s) && fishable(w, t) && spear(s) ? 'Spear fish' : null),
    minutes: 20,
    skill: 'fishing',
    needsLight: true,
    done: (s, w, t, ev) => {
      const wh = who(s.protagonist);
      let p = fishHere(s, w, t) * (knowsTechnique(s, 'aim-low') ? 1.5 : 0.5) + 0.05 * level(s, 'fishing');
      if (has(s, 'hard-spear')) p += 0.05;
      practise(s, 'fishing', 1.5);
      s.player.wet = Math.max(s.player.wet, 50);
      if (chance(s.rng['skill-checks'], Math.min(0.85, p))) {
        give(s, 'fish', 1, undefined, s.tick);
        say(s, ANIMAL_TEXT.fishHit(wh), ev);
        return;
      }
      say(s, ANIMAL_TEXT.fishMiss(wh), ev);
      // Failure teaches (SPEC 8.1): after enough misses, the realisation.
      if (remember(s, 'fish-miss') >= 4) learnTechnique(s, 'aim-low', technique('aim-low').learned, ev);
    },
  },
  {
    id: 'line-fish',
    offer: (s, w, t) => (t === frontTile(s) && fishable(w, t) && has(s, 'fishing-line') ? 'Fish with the line' : null),
    minutes: 40,
    skill: 'fishing',
    done: (s, w, t, ev) => {
      const p = Math.min(0.9, fishHere(s, w, t) + 0.3 + 0.05 * level(s, 'fishing'));
      const n = (chance(s.rng['skill-checks'], p) ? 1 : 0) + (chance(s.rng['skill-checks'], p / 2) ? 1 : 0);
      if (n) give(s, 'fish', n, undefined, s.tick);
      practise(s, 'fishing', 1);
      say(s, ANIMAL_TEXT.fishLine(who(s.protagonist), n), ev);
    },
  },
  {
    id: 'watch-fish',
    offer: (s, w, t) => (t === frontTile(s) && (w.terrain[t] === T.gravel || w.terrain[t] === T.stream) && canSee(s) ? 'Watch the fish' : null),
    minutes: 20,
    done: (s, w, t, ev) => {
      const day = clock(s.tick).day;
      say(s, ANIMAL_TEXT.watchFish(day >= TROUT_RUN[0] && day <= TROUT_RUN[1] && w.water[t] === WATER.streamA), ev);
      remember(s, 'watched-fish');
    },
  },
  {
    id: 'weir-take',
    offer: (s, _w, t) => (buildAt(s, t, 'weir')?.items?.length ? 'Take fish from the weir' : null),
    minutes: 5,
    done: (s, _w, t, ev) => {
      const b = buildAt(s, t, 'weir');
      if (!b?.items) return;
      const n = b.items.reduce((a, i) => a + i.n, 0);
      const got = give(s, 'fish', n, undefined, s.tick);
      b.items = got >= n ? [] : [{ k: 'fish', n: n - got, t: s.tick }];
      say(s, ANIMAL_TEXT.weirTake(who(s.protagonist), got), ev);
    },
  },
  {
    id: 'snare-take',
    offer: (s, _w, t) => (buildAt(s, t, 'snare')?.items?.length ? 'Take the hare from the snare' : null),
    minutes: 3,
    done: (s, _w, t, ev) => {
      const b = buildAt(s, t, 'snare');
      if (!b?.items?.length) return;
      give(s, 'game', 1, 0);
      b.items = [];
      say(s, ANIMAL_TEXT.snareTook(who(s.protagonist)), ev);
    },
  },
  {
    id: 'shout',
    offer: (s, _w, t) => (t === idx(s.player.x, s.player.y) && warning(s) ? 'Shout and wave your arms' : null),
    minutes: 1,
    done: (s, _w, _t, ev) => {
      s.memory.shouted = s.tick;
      say(s, ANIMAL_TEXT.shout(who(s.protagonist)), ev);
    },
  },
  {
    id: 'pull-quills',
    offer: (s, _w, t) => (t === idx(s.player.x, s.player.y) && s.conditions.some((c) => c.id === 'quills') ? 'Pull out the quills' : null),
    minutes: 20,
    done: (s, _w, _t, ev) => {
      s.conditions = s.conditions.filter((c) => c.id !== 'quills');
      s.vitals.morale = Math.max(0, s.vitals.morale - 10);
      say(s, ANIMAL_TEXT.pulledQuills(who(s.protagonist)), ev);
    },
  },
];

export const HUNT_ITEM_ACTIONS: ItemActionDef[] = [
  {
    id: 'dress',
    offer: (s, _w, slot) => {
      const it = s.inventory[slot];
      if (it?.k !== 'game' || it.d === undefined || !steelTool(s)) return null;
      const g = GAME[it.d]!;
      return `${g.verb[0]!.toUpperCase()}${g.verb.slice(1)} the ${g.name}`;
    },
    minutes: 20,
    done: (s, _w, slot, ev) => {
      const it = s.inventory[slot];
      if (!it || it.d === undefined) return;
      const g = GAME[it.d]!;
      takeFromSlot(s, slot, 1);
      give(s, 'meat', g.meat, undefined, s.tick);
      if (g.hide) give(s, 'hide', g.hide);
      if (g.feathers) give(s, 'feathers', g.feathers);
      practise(s, 'hunting', 1);
      say(s, ANIMAL_TEXT.dressed(who(s.protagonist), g.verb, g.name), ev);
    },
  },
  {
    id: 'set-snare',
    offer: (s, w, slot) => {
      if (s.inventory[slot]?.k !== 'snare') return null;
      const t = frontTile(s);
      if (t < 0 || !TERRAIN[w.terrain[t]!]!.passable || TERRAIN[w.terrain[t]!]!.water || w.feature[t] !== F.none) return null;
      return buildAt(s, t, 'snare') ? null : 'Set the snare in front of you';
    },
    minutes: 10,
    done: (s, _w, slot, ev) => {
      const t = frontTile(s);
      if (!takeFromSlot(s, slot, 1)) return;
      s.builds.push({ kind: 'snare', x: t % 256, y: Math.floor(t / 256), items: [] });
      s.builds.sort((a, b) => a.y - b.y || a.x - b.x || (a.kind < b.kind ? -1 : 1));
      say(s, ANIMAL_TEXT.snareSet(who(s.protagonist)), ev);
    },
  },
  {
    id: 'splint',
    offer: (s, _w, slot) => (s.inventory[slot]?.k === 'splint' && s.conditions.some((c) => c.id === 'sprain') ? 'Bind the splint on' : null),
    minutes: 10,
    done: (s, _w, slot, ev) => {
      takeFromSlot(s, slot, 1);
      treat(s, 'sprain', 60);
      say(s, `${who(s.protagonist).name} bound the ankle tight between the sticks.`, ev);
    },
  },
];

/** Each hour: snares may catch a hare that runs nearby; a weir fills slowly. */
export function trapsHour(s: GameState, w: World, ev: SimEvent[]): void {
  for (const b of s.builds) {
    if (b.kind === 'snare' && !b.items?.length) {
      const h = clock(s.tick).hour;
      if (h >= 6 && h < 18) continue;
      const hare = s.animals.find((a) => a.kind === 'hare' && a.mode !== 'gone' && cheb(a.x, a.y, b.x, b.y) <= 6);
      if (hare && chance(s.rng.animals, 0.12 + 0.03 * level(s, 'hunting'))) {
        kill(s, hare);
        b.items = [{ k: 'game', n: 1, d: 0 }];
        if (cheb(b.x, b.y, s.player.x, s.player.y) <= 8) say(s, ANIMAL_TEXT.snareCaught(), ev);
      }
    } else if (b.kind === 'weir') {
      const n = (b.items ?? []).reduce((a, i) => a + i.n, 0);
      if (n < 3 && chance(s.rng.animals, fishHere(s, w, idx(b.x, b.y)) * 0.25)) b.items = [{ k: 'fish', n: n + 1, t: s.tick }];
    }
  }
}

