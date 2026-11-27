// Screenshots of a valley's interesting places (scripts/places.ts picks them), at midday, for judging
// world generation in the game's own drawing.
//
//   node scripts/places.mjs [--seed S] [--time HH:MM] [--only name,prefix]   -> renders/places/<seed>/<name>.png

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { openBrowser, sleep } from './browser.mjs';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};
const seed = flag('seed', 'first-light');
const time = flag('time', '13:00');
const outDir = resolve(root, 'renders/places', seed.replace(/[^\w.-]+/g, '_'));
const only = flag('only', '');
const places = JSON.parse(execFileSync('node', [join(root, 'scripts/places.ts'), seed], { encoding: 'utf8' })).filter(
  (p) => !only || only.split(',').some((o) => p.name.startsWith(o)),
);

if (!only) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await openBrowser();
try {
  for (const p of places) {
    await browser.goto(`${base}?seed=${encodeURIComponent(seed)}&debug=1&ff=${time}&at=${p.x},${p.y}`);
    await browser.waitFor("document.querySelector('.hud') && !document.querySelector('.hud').hidden");
    await browser.evaluate("document.querySelector('.debug').hidden = true; document.querySelector('.caption').classList.remove('on')");
    await sleep(1400);
    await browser.clearNotes();
    const file = join(outDir, `${p.name}.png`);
    writeFileSync(file, await browser.screenshot());
    console.log(`${p.name} (${p.x},${p.y}) -> ${file}`);
  }
  if (browser.errors.length) console.log(`page errors:\n${browser.errors.join('\n')}`);
} finally {
  await browser.close();
  await server.close();
}
