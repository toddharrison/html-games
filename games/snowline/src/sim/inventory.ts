// The inventory (SPEC 7.8): pockets and hands, about 8 slots and a weight limit; a basket adds more.
// Items on the ground are stashes, one per tile.

import { BASKET_CARRY, BASKET_SLOTS, CARRY_LIMIT, POCKET_SLOTS, itemDef } from '../content/items.ts';
import type { GameState, Item } from './state.ts';

export function maxSlots(s: GameState): number {
  return POCKET_SLOTS + (has(s, 'basket') ? BASKET_SLOTS : 0);
}

export function carryLimit(s: GameState): number {
  return CARRY_LIMIT + (has(s, 'basket') ? BASKET_CARRY : 0) + (has(s, 'warm-layers') ? 1.5 : 0);
}

export function weightOf(items: readonly Item[]): number {
  let w = 0;
  for (const it of items) w += itemDef(it.k).weight * it.n;
  return w;
}

export function load(s: GameState): number {
  return weightOf(s.inventory);
}

export function count(s: GameState, k: string, d?: number): number {
  let n = 0;
  for (const it of s.inventory) if (it.k === k && (d === undefined || it.d === d)) n += it.n;
  return n;
}

export function has(s: GameState, k: string, d?: number): boolean {
  return count(s, k, d) > 0;
}

/** The slot holding a kind (and data), or -1. */
export function slotOf(s: GameState, k: string, d?: number): number {
  return s.inventory.findIndex((it) => it.k === k && (d === undefined || it.d === d));
}

/**
 * Add up to `n` of an item. Returns how many fitted (by slots and weight). Stacks merge with the same
 * kind and data, keeping the oldest gathered time.
 */
export function give(s: GameState, k: string, n: number, d?: number, t?: number): number {
  const def = itemDef(k);
  let left = n;
  const room = () => (def.weight > 0 ? Math.floor((carryLimit(s) - load(s)) / def.weight + 1e-9) : left);
  for (const it of s.inventory) {
    if (left <= 0) break;
    if (it.k !== k || it.d !== d || it.n >= def.stack) continue;
    const take = Math.min(left, def.stack - it.n, room());
    if (take <= 0) break;
    it.n += take;
    if (t !== undefined) it.t = it.t === undefined ? t : Math.min(it.t, t);
    left -= take;
  }
  while (left > 0 && s.inventory.length < maxSlots(s)) {
    const take = Math.min(left, def.stack, room());
    if (take <= 0) break;
    const it: Item = { k, n: take };
    if (d !== undefined) it.d = d;
    if (t !== undefined) it.t = t;
    s.inventory.push(it);
    left -= take;
  }
  return n - left;
}

/** Take `n` from a slot; an emptied slot is removed. */
export function takeFromSlot(s: GameState, slot: number, n = 1): Item | null {
  const it = s.inventory[slot];
  if (!it || it.n < n) return null;
  it.n -= n;
  const out: Item = { ...it, n };
  if (it.n === 0) s.inventory.splice(slot, 1);
  return out;
}

/** Take `n` of a kind from wherever it is. Returns false (taking nothing) if there aren't enough. */
export function take(s: GameState, k: string, n = 1, d?: number): boolean {
  if (count(s, k, d) < n) return false;
  let left = n;
  for (let i = s.inventory.length - 1; i >= 0 && left > 0; i--) {
    const it = s.inventory[i]!;
    if (it.k !== k || (d !== undefined && it.d !== d)) continue;
    const t = Math.min(left, it.n);
    takeFromSlot(s, i, t);
    left -= t;
  }
  return true;
}

/** Put items on the ground at a tile, merging with what is already there. */
export function drop(s: GameState, x: number, y: number, item: Item): void {
  let st = s.stashes.find((t) => t.x === x && t.y === y);
  if (!st) {
    st = { x, y, items: [] };
    s.stashes.push(st);
    s.stashes.sort((a, b) => a.y - b.y || a.x - b.x);
  }
  const same = st.items.find((it) => it.k === item.k && it.d === item.d);
  if (same) {
    same.n += item.n;
    if (item.t !== undefined) same.t = same.t === undefined ? item.t : Math.min(same.t, item.t);
  } else st.items.push({ ...item });
}

export function stashAt(s: GameState, x: number, y: number) {
  return s.stashes.find((t) => t.x === x && t.y === y) ?? null;
}

/** Remove empty stashes. */
export function tidyStashes(s: GameState): void {
  for (const st of s.stashes) st.items = st.items.filter((it) => it.n > 0);
  s.stashes = s.stashes.filter((st) => st.items.length > 0);
}
