// Screenshots of the game at set times of day, for judging the mood (SPEC 12.1) without playing to
// dusk. Runs the dev server and headless Chromium; each shot fast-forwards by running ticks (`?ff=`).
//
//   npm run shots [-- [--seed S] [--out dir] [HH:MM ...]]
//
//   --seed   the valley (default first-light)
//   --out    where the PNGs go (default renders/shots, git-ignored)
//   --at     X,Y: start at that tile instead of the crash site
//   times    default: 15:00 19:00 19:50 20:40 23:00 05:50 07:00, then 23:00 with a test fire, and the map

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { openBrowser, sleep } from './browser.mjs';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const [value] = args.splice(i, 2).slice(1);
  return value;
};
const seed = flag('seed', 'first-light');
const outDir = resolve(root, flag('out', 'renders/shots'));
const at = flag('at', '');
const times = args.length ? args : ['15:00', '19:00', '19:50', '20:40', '23:00', '05:50', '07:00'];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await openBrowser();

async function shot(name, time, after) {
  await browser.goto(`${base}?seed=${encodeURIComponent(seed)}&debug=1&ff=${time}${at ? `&at=${at}` : ''}`);
  await browser.waitFor("document.querySelector('.hud') && !document.querySelector('.hud').hidden");
  await browser.evaluate("document.querySelector('.debug').hidden = true; document.querySelector('.caption').classList.remove('on')");
  if (after) await after();
  await sleep(1600);
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, await browser.screenshot());
  console.log(file);
}

try {
  for (const t of times) await shot(t.replace(':', ''), t);
  await shot('2300-fire', '22:30', async () => {
    await browser.evaluate("[...document.querySelectorAll('.debug button')].find((b) => b.textContent === 'test fire here').click()");
    await browser.evaluate("document.querySelector('.debug').hidden = true");
    // Walk a few tiles away from the fire, to see it from the dark.
    await browser.key('ArrowLeft', 900);
  });
  await shot('map', '15:00', async () => {
    await browser.key('KeyM');
  });
  if (browser.errors.length) console.log(`page errors:\n${browser.errors.join('\n')}`);
} finally {
  await browser.close();
  await server.close();
}
