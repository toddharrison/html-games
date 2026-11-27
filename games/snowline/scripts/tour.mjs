// A tour of the screens: drives the real game in headless Chromium through the title, selection, play,
// the menus, the journal, sleep, and the end of a run, saving a screenshot of each to renders/tour/.
// Exits non-zero if the page threw. A smoke test as much as a picture book.
//
//   npm run tour [-- --out dir]

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { openBrowser, sleep } from './browser.mjs';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const outDir = resolve(root, outAt >= 0 ? args[outAt + 1] : 'renders/tour');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0];
const b = await openBrowser();
let n = 0;
const shot = async (name) => {
  await sleep(350);
  const file = join(outDir, `${String(++n).padStart(2, '0')}-${name}.png`);
  writeFileSync(file, await b.screenshot());
  console.log(file);
};
const click = (text) => b.evaluate(`[...document.querySelectorAll('button')].find((x) => x.textContent.startsWith(${JSON.stringify(text)})).click()`);
const consoleCmd = (cmd) =>
  b.evaluate(`(() => { const i = document.querySelector('.debug .console input'); i.value = ${JSON.stringify(cmd)}; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); })()`);
const speed = (s) => b.evaluate(`[...document.querySelectorAll('.debug button')].find((x) => x.dataset.speed === '${s}').click()`);
const hideDebug = () => b.evaluate("document.querySelector('.debug').hidden = true");

try {
  await b.goto(`${base}?debug=1`);
  await b.waitFor("document.querySelector('.title')");
  await hideDebug();
  await shot('title');
  await click('First valley');
  await b.waitFor("document.querySelector('.select .card')");
  await shot('select');
  await b.evaluate("document.querySelector('.select .card').click()");
  await b.waitFor("document.querySelector('.hud') && !document.querySelector('.hud').hidden");
  await hideDebug();
  await sleep(1500);
  await shot('start');
  await b.key('ArrowDown', 700);
  await b.key('KeyE');
  await shot('act');
  await b.key('Escape');
  await consoleCmd('give plant 0 3');
  await consoleCmd('give plant 3 2');
  await consoleCmd('give crayfish -1 2');
  await hideDebug();
  await sleep(600);
  await b.key('KeyI');
  await shot('inventory');
  await b.key('Escape');
  const slot = await b.evaluate("document.querySelectorAll('.hud').length && 0");
  void slot;
  // Taste the first plant: find its slot from the inventory menu's order.
  await b.key('KeyI');
  const idx = await b.evaluate("[...document.querySelectorAll('.menu-list li .label')].findIndex((l) => l.textContent.includes('berries') || l.textContent.includes('bulbs') || l.textContent.includes('greens') || l.textContent.includes('fungus') || l.textContent.includes('mushrooms'))");
  await b.key(`Digit${idx + 1}`);
  await shot('item');
  await b.key('Digit2');
  await speed(64);
  await sleep(3000);
  await speed(1);
  await hideDebug();
  await shot('after-taste');
  await b.key('KeyJ');
  await shot('journal-notes');
  await b.key('ArrowRight');
  await shot('journal-log');
  await b.key('ArrowRight');
  await b.key('ArrowRight');
  await shot('journal-body');
  await b.key('Escape');
  await b.key('KeyR');
  await shot('rest');
  await b.key('Digit2');
  await sleep(1200);
  await shot('asleep');
  await b.key('KeyE');
  await sleep(500);
  // E may have opened what's on offer instead (if the survivor had already woken): Esc until paused.
  for (let k = 0; k < 3; k++) {
    await b.key('Escape');
    await sleep(200);
    if (await b.evaluate("[...document.querySelectorAll('button')].some((x) => x.textContent.startsWith('Settings'))")) break;
  }
  await shot('pause');
  await click('Settings');
  await shot('settings');
  await click('Done');
  await b.key('Escape');
  // Camp and fire (M3).
  await consoleCmd('give boughs -1 4');
  await consoleCmd('give stick -1 8');
  await hideDebug();
  await sleep(600);
  await b.key('KeyC');
  await shot('craft');
  await b.evaluate("[...document.querySelectorAll('.menu-list li')].find((l) => l.textContent.includes('bough bed')).click()");
  await speed(16);
  await sleep(1500);
  await speed(1);
  // The bed used the boughs, which frees a place for firewood (the fire then offers more than one thing).
  await consoleCmd('give firewood 2 3');
  await b.evaluate("[...document.querySelectorAll('.debug button')].find((x) => x.textContent === 'test fire here').click()");
  await hideDebug();
  // Let a tick pass so the fire exists before E asks what can be done to it.
  await sleep(300);
  await b.key('KeyE');
  await shot('fire-menu');
  await b.key('Escape');
  await speed(64);
  await sleep(2500);
  await speed(1);
  await hideDebug();
  await shot('camp');
  await consoleCmd('set hydration 0');
  await consoleCmd('set health 0.5');
  await hideDebug();
  await speed(16);
  await b.waitFor("document.querySelector('.summary')", 30000);
  await hideDebug();
  await shot('summary');
  if (b.errors.length) {
    console.log(`page errors:\n${b.errors.join('\n')}`);
    process.exitCode = 1;
  }
} catch (e) {
  console.log(`tour failed: ${e.message}`);
  if (b.errors.length) console.log(`page errors:\n${b.errors.join('\n')}`);
  process.exitCode = 1;
} finally {
  await b.close();
  await server.close();
}
