import type Phaser from 'phaser';
import { clearRun, saveRun } from '../save/runSave';
import { summarizeRun, type RunState, type RunSummary } from '../sim/run';

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

/** What the run summary scene shows (SPEC §5.1, §10). */
export interface SummaryData {
  summary: RunSummary;
  /** Texture key of the still frame of the blast (a destroyed run), if one was taken. */
  shot: string | null;
}

/**
 * Opens wherever the run picks up: the map, a battle, a depot, or an event; or, for a run over without a
 * death (the Directive complete or failed), the run summary, which ends the run.
 */
export function enterNode(scene: Phaser.Scene, ctx: RunContext): void {
  const next = ctx.run.next;
  if (next === 'won' || next === 'failed') {
    endRun(ctx);
    showSummary(scene, { summary: summarizeRun(ctx.run), shot: null });
    return;
  }
  scene.scene.start(next === 'battle' || next === 'depot' || next === 'event' ? next : 'map', ctx);
}

export function showSummary(scene: Phaser.Scene, data: SummaryData): void {
  scene.scene.start('summary', data);
}
