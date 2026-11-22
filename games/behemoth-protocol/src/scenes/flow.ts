import type Phaser from 'phaser';
import { clearRun, saveRun } from '../save/runSave';
import type { RunState } from '../sim/run';

/**
 * Scene-to-scene hand-off for a run: title → sector map → battle or depot → map … (SPEC §3).
 * `persist` is false for URL-parameter playtest runs, which never touch the run save.
 */
export interface RunContext {
  run: RunState;
  persist: boolean;
}

/** A fresh run seed (render side, so Math.random is fine here). */
export function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/** Saves the run (when it's a real one) at a node boundary. */
export function checkpoint(ctx: RunContext): void {
  if (ctx.persist) saveRun(ctx.run);
}

/** Permadeath: the run save goes with the reactor (SPEC §9). */
export function endRun(ctx: RunContext): void {
  if (ctx.persist) clearRun();
}

/** Opens wherever the run picks up: the map (also for a won run), a battle, or a depot. */
export function enterNode(scene: Phaser.Scene, ctx: RunContext): void {
  const next = ctx.run.next;
  scene.scene.start(next === 'battle' || next === 'depot' ? next : 'map', ctx);
}
