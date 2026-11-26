// Noticing (SPEC 6.7): wreckage washing up on the shore in the first days, and the survivor noticing
// obvious things (the wreckage, landmarks) the first time they come near in daylight. Subtle things
// (tracks, a feather) are only drawn: they are never pointed out.

import { DEBRIS, LANDMARK_NOTICE, NOTICE_RANGE } from '../content/discoveries.ts';
import { WATER } from '../content/terrain.ts';
import { drop } from './inventory.ts';
import { say } from './log.ts';
import { hash2, hashString } from './rng.ts';
import type { GameState, SimEvent } from './state.ts';
import { daylight } from './time.ts';
import { cheb } from './animals.ts';
import { idx, inBounds, passableAt, type World } from './world.ts';

const SIZE = 256;
const MIN = 10;

/** Shore tiles near the crash where wreckage can wash up: dry, open, beside the lake. */
function shoreNearCrash(w: World, r: number): number[] {
  const out: number[] = [];
  const c = w.crash;
  for (let y = c.y - r; y <= c.y + r; y++) {
    for (let x = c.x - r; x <= c.x + r; x++) {
      if (!inBounds(x, y)) continue;
      const i = idx(x, y);
      if (!passableAt(w, i) || w.feature[i] !== 0 || w.loose[i] !== 0) continue;
      if (w.water[i] === WATER.lake) continue;
      const lake = [i - 1, i + 1, i - SIZE, i + SIZE].some((n) => n >= 0 && n < SIZE * SIZE && w.water[n] === WATER.lake);
      if (lake) out.push(i);
    }
  }
  return out;
}

/** Where each piece of wreckage washes up: the same for a seed, never the same two pieces on one tile. */
export function debrisSites(s: GameState, w: World): number[] {
  // Close to the crash if the shore allows, so the first days' walks find them.
  let shore = shoreNearCrash(w, 14);
  if (shore.length < DEBRIS.length) shore = shoreNearCrash(w, 30);
  if (!shore.length) return [];
  const word = hashString(`${s.seed}/debris`)[0];
  const used: number[] = [];
  return DEBRIS.map((_, k) => {
    let at = hash2(word, k, 0, 31) % shore.length;
    while (used.includes(at) && used.length < shore.length) at = (at + 7) % shore.length;
    used.push(at);
    return shore[at]!;
  });
}

export function noticeMinute(s: GameState, w: World, ev: SimEvent[]): void {
  if (s.sleep && !s.sleep.awake) return;
  const p = s.player;
  const light = daylight(s.tick) >= 30;
  let sites: number[] | null = null;
  DEBRIS.forEach((d, k) => {
    const key = `debris-${d.id}`;
    const state = s.memory[key] ?? 0;
    if (state === 0 && s.tick >= d.after * MIN) {
      sites ??= debrisSites(s, w);
      const at = sites[k];
      if (at === undefined) return;
      for (const it of d.items) drop(s, at % SIZE, Math.floor(at / SIZE), it);
      s.memory[key] = 1;
      s.memory[`${key}-at`] = at;
      return;
    }
    if (state !== 1 || !light) return;
    const at = s.memory[`${key}-at`]!;
    const x = at % SIZE;
    const y = Math.floor(at / SIZE);
    const still = s.stashes.some((st) => st.x === x && st.y === y && st.items.some((it) => d.items.some((di) => di.k === it.k)));
    if (!still) {
      s.memory[key] = 2;
      return;
    }
    if (cheb(x, y, p.x, p.y) > NOTICE_RANGE) return;
    s.memory[key] = 2;
    notice(s, d.notice, x, y, ev);
  });
  if (!light) return;
  w.landmarks.forEach((lm, k) => {
    const key = `noticed-${k}`;
    if (s.memory[key] || cheb(lm.x, lm.y, p.x, p.y) > NOTICE_RANGE) return;
    s.memory[key] = 1;
    const text = LANDMARK_NOTICE[lm.kind];
    if (text) notice(s, text, lm.x, lm.y, ev);
  });
}

function notice(s: GameState, text: string, x: number, y: number, ev: SimEvent[]): void {
  say(s, text, ev);
  s.stats.discoveries++;
  s.vitals.morale = Math.min(100, s.vitals.morale + 2);
  ev.push({ type: 'notice', x, y });
}
