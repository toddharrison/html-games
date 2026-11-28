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
  if (name !== 'note' && !name.startsWith('waking')) await b.clearNotes();
  await sleep(350);
  const file = join(outDir, `${String(++n).padStart(2, '0')}-${name}.png`);
  writeFileSync(file, await b.screenshot());
  console.log(file);
};
const click = (text) => b.evaluate(`[...document.querySelectorAll('button')].find((x) => x.textContent.startsWith(${JSON.stringify(text)})).click()`);
const consoleCmd = (cmd) =>
  b.evaluate(`(() => { const i = document.querySelector('.debug .console input'); i.value = ${JSON.stringify(cmd)}; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); })()`);
const speed = (s) => b.evaluate(`[...document.querySelectorAll('.debug button')].find((x) => x.dataset.speed === '${s}').click()`);
// A thought or insight stops the game as a note: read it away before pressing anything.
const key = async (code, holdMs) => {
  await b.clearNotes();
  await b.key(code, holdMs);
};
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
  // The opening: the crash in the dark, then waking by the wreck as the scene fades in.
  await b.waitFor("document.querySelector('.waking-page')");
  await hideDebug();
  await shot('waking-dark');
  for (let k = 0; k < 2; k++) {
    await sleep(450);
    await b.evaluate("document.querySelector('.overlay').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))");
  }
  await sleep(3200);
  await shot('waking');
  await b.clearNotes();
  await b.waitFor("document.querySelector('.hud') && !document.querySelector('.hud').hidden");
  await hideDebug();
  await sleep(1500);
  await shot('start');
  // The first thought: the game stops for it.
  await speed(16);
  await b.waitFor("document.querySelector('.note')", 30000);
  await speed(1);
  await shot('note');
  await key('ArrowDown', 700);
  await key('KeyE');
  await shot('act');
  // E opens what's on offer, if anything is: close it (an Esc with nothing open would pause).
  if (await b.evaluate("!!document.querySelector('.menu-list')")) await key('Escape');
  await consoleCmd('give plant 0 3');
  await consoleCmd('give plant 3 2');
  await consoleCmd('give crayfish -1 2');
  await hideDebug();
  await sleep(600);
  await key('KeyI');
  await shot('inventory');
  await key('ArrowRight');
  await shot('inventory-found');
  await key('ArrowLeft');
  // Taste the first plant: find its slot from the inventory page's order.
  const idx = await b.evaluate("[...document.querySelectorAll('.pack .thing .what b')].findIndex((l) => /berries|bulbs|greens|fungus|mushrooms/.test(l.textContent))");
  await key(`Digit${idx + 1}`);
  await shot('item');
  await key('Digit2');
  await speed(64);
  await sleep(3000);
  await speed(1);
  await hideDebug();
  await shot('after-taste');
  await key('KeyJ');
  await shot('journal-notes');
  await key('ArrowRight');
  await shot('journal-log');
  await key('ArrowRight');
  await key('ArrowRight');
  await shot('journal-body');
  await key('Escape');
  await key('KeyR');
  await shot('rest');
  await key('Digit2');
  await sleep(1200);
  await shot('asleep');
  await key('KeyE');
  await sleep(500);
  // E may have opened what's on offer instead (if the survivor had already woken): Esc until paused.
  for (let k = 0; k < 3; k++) {
    await key('Escape');
    await sleep(200);
    if (await b.evaluate("[...document.querySelectorAll('button')].some((x) => x.textContent.startsWith('Settings'))")) break;
  }
  await shot('pause');
  await click('Settings');
  await shot('settings');
  await click('Done');
  await key('Escape');
  // Camp and fire (M3).
  await consoleCmd('give boughs -1 4');
  await consoleCmd('give stick -1 8');
  await hideDebug();
  await sleep(600);
  await key('KeyC');
  await shot('craft');
  // Every build is placed the same way: choose it, see where it would go, place it in front.
  await b.evaluate("[...document.querySelectorAll('.make .entry')].find((l) => l.textContent.includes('lean-to')).click()");
  await sleep(300);
  await shot('placing-lean-to');
  await key('KeyE');
  await speed(16);
  await sleep(2500);
  await speed(1);
  // Turn away from the lean-to before laying the fire.
  await key('ArrowLeft');
  await sleep(150);
  // Lay a fire from the Make page: choose it, see where it would go, place it in front, then the laid fire's menu.
  await consoleCmd('give tinder 0 2');
  await consoleCmd('give stick -1 2');
  await hideDebug();
  await key('KeyC');
  await sleep(200);
  await key('Digit1');
  await sleep(300);
  await shot('placing');
  await key('KeyE');
  await speed(16);
  await sleep(1500);
  await speed(1);
  await key('KeyE');
  await shot('laid-fire');
  await key('Escape');
  // The lean-to used the boughs, which frees a place for firewood (the fire then offers more than one thing).
  await consoleCmd('give firewood 2 3');
  await b.evaluate("[...document.querySelectorAll('.debug button')].find((x) => x.textContent === 'test fire here').click()");
  await hideDebug();
  // Let a tick pass so the fire exists before E asks what can be done to it.
  await sleep(300);
  await key('KeyE');
  await shot('fire-menu');
  await key('Escape');
  await speed(64);
  await sleep(2500);
  await speed(1);
  await hideDebug();
  await shot('camp');
  await consoleCmd('set hydration 0');
  await consoleCmd('set health 0.5');
  await hideDebug();
  await speed(16);
  for (let t = 0; t < 150 && !(await b.evaluate("!!document.querySelector('.summary')")); t++) {
    await b.clearNotes();
    await sleep(200);
  }
  await b.waitFor("document.querySelector('.summary')", 1000);
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
