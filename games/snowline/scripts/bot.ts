// The bot player (SPEC 11.4), run by hand: `npm run bot -- [--count N] [--days D]`. Plays N seeds
// (backgrounds in turn), each twice: learning the valley, and handed the deal. Prints a report and
// writes it, with every run, to renders/bot/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { botRuns, report } from '../src/tools/botReport.ts';

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : Number(args[i + 1]);
};
const count = flag('count', 70);
const days = flag('days', 75);
const out = resolve(import.meta.dirname, '../renders/bot');
mkdirSync(out, { recursive: true });
const t0 = performance.now();
const runs = botRuns(count, days, (r) => process.stdout.write(`${r.seed} ${r.background} ${r.knowsDeal ? 'told' : 'learning'}: ${r.outcome} ${r.cause} day ${r.days}\n`));
const text = report(runs);
console.log(`\n${text}\n(${Math.round((performance.now() - t0) / 1000)} s)`);
writeFileSync(join(out, 'report.txt'), text + '\n');
writeFileSync(join(out, 'runs.json'), JSON.stringify(runs, null, 1));
