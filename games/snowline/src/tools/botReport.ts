// Run the bot over many seeds and backgrounds and summarise (SPEC 11.4): survival by background, in both
// modes, and the gap between them: what learning the valley costs.

import { BACKGROUNDS } from '../content/protagonists.ts';
import { candidate } from '../sim/protagonist.ts';
import { type BotResult, playBot } from './bot.ts';

export function botRuns(count: number, maxDays = 75, onRun?: (r: BotResult) => void): BotResult[] {
  const out: BotResult[] = [];
  for (let k = 0; k < count; k++) {
    const seed = `bot-${k}`;
    const bg = BACKGROUNDS[k % BACKGROUNDS.length]!.id;
    const who = { ...candidate(seed, 0), background: bg };
    for (const knows of [false, true]) {
      const r = playBot(seed, who, knows, maxDays);
      out.push(r);
      onRun?.(r);
    }
  }
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};

/** A plain-text report. */
export function report(rs: BotResult[]): string {
  const lines: string[] = [];
  for (const knows of [false, true]) {
    const set = rs.filter((r) => r.knowsDeal === knows);
    const rescued = set.filter((r) => r.outcome === 'rescue').length;
    lines.push(`${knows ? 'Handed the deal' : 'Learning the valley'}: ${set.length} runs, median ${median(set.map((r) => r.days))} days, rescued ${rescued} (${Math.round((100 * rescued) / Math.max(1, set.length))}%)`);
    const causes = new Map<string, number>();
    for (const r of set) causes.set(r.cause || r.outcome, (causes.get(r.cause || r.outcome) ?? 0) + 1);
    lines.push(`  how runs ended: ${[...causes].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ')}`);
    const fires = set.filter((r) => r.firstFireDay > 0).map((r) => r.firstFireDay);
    lines.push(`  first fire: ${fires.length}/${set.length} runs, median day ${median(fires)}`);
    lines.push(`  survived to day: 3 ${pct(set, 3)} · 7 ${pct(set, 7)} · 14 ${pct(set, 14)} · 21 ${pct(set, 21)} · 30 ${pct(set, 30)} · 45 ${pct(set, 45)}`);
    for (const bg of BACKGROUNDS) {
      const b = set.filter((r) => r.background === bg.id);
      if (b.length) lines.push(`    ${bg.name.padEnd(13)} median ${String(median(b.map((r) => r.days))).padStart(5)} days, rescued ${b.filter((r) => r.outcome === 'rescue').length}/${b.length}`);
    }
  }
  const learn = rs.filter((r) => !r.knowsDeal).map((r) => r.days);
  const told = rs.filter((r) => r.knowsDeal).map((r) => r.days);
  lines.push(`What learning the valley costs: ${Math.round((median(told) - median(learn)) * 10) / 10} days of median survival.`);
  return lines.join('\n');
}

function pct(set: BotResult[], day: number): string {
  return `${Math.round((100 * set.filter((r) => r.days >= day || r.outcome === 'rescue').length) / Math.max(1, set.length))}%`;
}
