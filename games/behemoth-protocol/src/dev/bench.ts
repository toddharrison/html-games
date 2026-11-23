import { BIOMES } from '../content/biomes';
import { demoCommand } from '../input/demoBot';
import { createDemoWorld, demoClip, type DemoClip } from '../scenes/demo';
import { treadIntegrity } from '../sim/behemoth';
import { SIM_DT } from '../sim/loop';
import { stepWorld } from '../sim/world';

/**
 * The autopilot bench (`npm run bench`, scripts/bench.mjs): plays battles with the autopilot in the
 * bare sim, with no browser, rendering, or sound, as fast as the CPU goes (a 90 s battle takes about
 * half a second). For tuning the autopilot and the battles it plays; use `npm run playtest` only to
 * see the real page. Pure: no Phaser, no DOM.
 */

export interface BenchOptions {
  /** Battles to play: clip settings `first`, `first + 1`, … (biome, mode, approach, condition). */
  count: number;
  first: number;
  /** Seconds of battle each, at most (it stops sooner on extraction or destruction). */
  seconds: number;
  /** 'random': each clip's random attract-mode loadout; 'stock': the stock Class II. */
  loadout: 'random' | 'stock';
}

export interface BenchRow {
  clip: DemoClip;
  /** The guns on the turret rings. */
  guns: string;
  outcome: 'extracted' | 'destroyed' | 'running';
  seconds: number;
  /** Share of the way to the extraction line. */
  progress: number;
  treads: number;
  kills: number;
  /** Steering reversals (left to right or back) a minute, and mean sideways speed. */
  reversals: number;
  sideways: number;
}

const BENCH_DEFAULTS: BenchOptions = { count: 12, first: 0, seconds: 120, loadout: 'random' };

/** The attract mode's field: the default 576×324 screen, battlefield across the whole width. */
const FIELD = { frameWidth: 324, fieldRows: 36 };

export function runBench(opts: Partial<BenchOptions> = {}): BenchRow[] {
  const o = { ...BENCH_DEFAULTS, ...opts };
  const rows: BenchRow[] = [];
  for (let i = o.first; i < o.first + o.count; i++) {
    const clip = demoClip(i, 7919 * (i + 1));
    const played = o.loadout === 'stock' ? { ...clip, loadout: { addons: [], bays: [], weapons: {} } } : clip;
    const w = createDemoWorld(played, FIELD.frameWidth, FIELD.fieldRows);
    const startX = w.behemoth.x;
    let last = 0;
    let reversals = 0;
    let sideways = 0;
    let steps = 0;
    while (steps * SIM_DT < o.seconds && !w.behemoth.destroyed && w.extractedAt === null) {
      const cmd = demoCommand(w);
      if (cmd.steer !== 0 && last !== 0 && cmd.steer !== last) reversals++;
      if (cmd.steer !== 0) last = cmd.steer;
      stepWorld(w, cmd);
      w.events.length = 0;
      sideways += Math.abs(w.behemoth.vy);
      steps++;
    }
    const seconds = steps * SIM_DT;
    rows.push({
      clip: played,
      guns: w.behemoth.hardpoints.filter((h) => h.slot.size === 'L' && h.weapon).map((h) => h.weapon!.short).join('+'),
      outcome: w.behemoth.destroyed ? 'destroyed' : w.extractedAt !== null ? 'extracted' : 'running',
      seconds,
      progress: Math.min(1, (w.behemoth.x - startX) / Math.max(1, w.exitX - startX)),
      treads: treadIntegrity(w.behemoth),
      kills: w.stats.kills,
      reversals: reversals / Math.max(1e-9, seconds / 60),
      sideways: sideways / Math.max(1, steps),
    });
  }
  return rows;
}

/** The bench as a plain-text table, one battle a row, with means at the foot. */
export function benchReport(rows: readonly BenchRow[]): string {
  const pad = (v: string | number, n: number) => String(v).padEnd(n);
  const lines = [
    `${pad('#', 4)}${pad('biome', 11)}${pad('mode', 9)}${pad('guns', 22)}${pad('outcome', 11)}${pad('time', 7)}${pad('way', 6)}${pad('treads', 8)}${pad('kills', 7)}${pad('rev/min', 9)}|vy|`,
  ];
  rows.forEach((r, i) => {
    lines.push(
      `${pad(i, 4)}${pad(BIOMES[r.clip.biome].name.split(' ')[0]!, 11)}${pad(r.clip.mode, 9)}${pad(r.guns.slice(0, 21), 22)}${pad(r.outcome, 11)}${pad(`${Math.round(r.seconds)}s`, 7)}${pad(`${Math.round(r.progress * 100)}%`, 6)}${pad(`${Math.round(r.treads * 100)}%`, 8)}${pad(r.kills, 7)}${pad(r.reversals.toFixed(1), 9)}${r.sideways.toFixed(1)}`,
    );
  });
  const mean = (f: (r: BenchRow) => number) => rows.reduce((t, r) => t + f(r), 0) / Math.max(1, rows.length);
  const n = (o: BenchRow['outcome']) => rows.filter((r) => r.outcome === o).length;
  lines.push(
    '',
    `extracted ${n('extracted')}/${rows.length}, destroyed ${n('destroyed')}, still going ${n('running')}; mean way ${Math.round(mean((r) => r.progress) * 100)}%, treads ${Math.round(mean((r) => r.treads) * 100)}%, kills ${mean((r) => r.kills).toFixed(1)}, rev/min ${mean((r) => r.reversals).toFixed(1)}, |vy| ${mean((r) => r.sideways).toFixed(1)}`,
  );
  return lines.join('\n');
}
