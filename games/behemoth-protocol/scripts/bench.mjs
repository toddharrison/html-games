// Autopilot bench: plays battles with the autopilot (src/input/demoBot.ts) in the bare sim, with no
// browser, rendering, or sound, as fast as the CPU goes, and prints a table (src/dev/bench.ts). Use it
// to tune the autopilot or check battles; `npm run playtest` is for seeing the real page.
//
//   npm run bench [-- [--count N] [--first K] [--seconds S] [--stock]]
//
//   --count    battles to play (default 12)
//   --first    the first attract-mode clip setting to play (default 0); each battle is the next clip's
//              biome, mode, approach, and condition
//   --seconds  most battle seconds each (default 120); a battle stops sooner on extraction or death
//   --stock    the stock Class II instead of each clip's random loadout

import { resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : Number(args[i + 1]);
};
const opts = {
  ...(flag('count') !== undefined ? { count: flag('count') } : {}),
  ...(flag('first') !== undefined ? { first: flag('first') } : {}),
  ...(flag('seconds') !== undefined ? { seconds: flag('seconds') } : {}),
  loadout: args.includes('--stock') ? 'stock' : 'random',
};

// Vite compiles the TypeScript sim for Node; nothing is served.
const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
try {
  const bench = await server.ssrLoadModule('/src/dev/bench.ts');
  const t0 = performance.now();
  const rows = bench.runBench(opts);
  const ms = performance.now() - t0;
  const simSeconds = rows.reduce((t, r) => t + r.seconds, 0);
  console.log(bench.benchReport(rows));
  console.log(`\n${Math.round(simSeconds)} s of battle in ${(ms / 1000).toFixed(1)} s (${Math.round((simSeconds * 1000) / ms)}x real time)`);
} finally {
  await server.close();
}
