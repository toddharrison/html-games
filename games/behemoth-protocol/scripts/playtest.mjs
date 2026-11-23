// Headless autopilot playtest: starts a Vite dev server, opens the game in Playwright's headless
// Chromium shell over the DevTools protocol, and lets the autopilot (src/input/demoBot.ts, the
// title screen's attract-mode driver) play a real run: Enter through the title, the Directive
// picker, the map, depots, events, and summaries; the autopilot drives every battle. Logs scene
// changes, battle snapshots, and every page error, and saves screenshots.
//
//   npm run playtest [-- [--minutes N] [--title S] [--speed K] [--out dir] [path]]
//
//   --minutes  how long to play (default 5)
//   --title    seconds to watch the title's attract mode first, a screenshot every 4 s (default 0)
//   --speed    battle sim speed (default 2; the dev console's time scale)
//   --out      where the log and screenshots go (default renders/playtest, git-ignored)
//   path       the page to open (default `/`; e.g. `/?seed=3&biome=desert` for a practice run)
//
// Exits non-zero if the page threw. Needs the headless shell (`npx playwright install
// chromium-headless-shell`), or set CHROME_HEADLESS to any Chromium binary.
//
// It patches `Controls.prototype.command` in the page (the same module instance the game imports),
// so editing a source file mid-run makes Vite reload the page; the patch is put back when it does.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const [value] = args.splice(i, 2).slice(1);
  return value;
};
const minutes = Number(flag('minutes', 5));
const titleSeconds = Number(flag('title', 0));
const speed = Number(flag('speed', 2));
const outDir = resolve(root, flag('out', 'renders/playtest'));
const path = (args.find((a) => !a.startsWith('--')) ?? '/').replace(/^\//, '');

function findShell() {
  if (process.env.CHROME_HEADLESS) return process.env.CHROME_HEADLESS;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
  for (const d of dirs) {
    for (const sub of readdirSync(join(cache, d))) {
      const bin = join(cache, d, sub, 'chrome-headless-shell');
      if (existsSync(bin)) return bin;
    }
  }
  throw new Error('No headless Chromium found: run `npx playwright install chromium-headless-shell` or set CHROME_HEADLESS');
}

function launch(bin, profile) {
  // SwiftShader WebGL, or Phaser falls back to Canvas and every text tint shows white.
  const proc = spawn(bin, [
    '--remote-debugging-port=0',
    '--no-first-run',
    `--user-data-dir=${profile}`,
    '--autoplay-policy=no-user-gesture-required',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    'about:blank',
  ]);
  return new Promise((ok, fail) => {
    let err = '';
    proc.stderr.on('data', (d) => {
      err += d;
      const m = /DevTools listening on (ws:\S+)/.exec(err);
      if (m) ok({ proc, ws: m[1] });
    });
    proc.on('exit', (code) => fail(new Error(`browser exited (${code}): ${err}`)));
  });
}

function devtools(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method) return listeners.forEach((l) => l(msg));
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.fail(new Error(msg.error.message));
    else p.ok(msg.result);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((ok, fail) => {
      pending.set(++id, { ok, fail });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  return new Promise((ok) => (ws.onopen = () => ok({ send, on: (l) => listeners.push(l), close: () => ws.close() })));
}

/** In the page: the autopilot drives every battle, and the scene and game are exposed for reading. */
const AUTOPILOT = `(async () => {
  const { Controls } = await import('/src/input/controls.ts');
  const { demoCommand } = await import('/src/input/demoBot.ts');
  const orig = Controls.prototype.command;
  window.__auto = true;
  window.__last = 0;
  Controls.prototype.command = function (cam) {
    const base = orig.call(this, cam);
    const s = this.scene;
    window.__last = performance.now();
    window.__scene = s;
    window.__game = s.game;
    s.devTimeScale = ${speed};
    return s.world ? { ...demoCommand(s.world), toggleAuto: base.toggleAuto } : base;
  };
})()`;

/** In the page: the active scenes, and the battle's state while one runs. */
const STATE = `(() => {
  const g = window.__game;
  const inBattle = performance.now() - window.__last < 800;
  const scenes = g ? g.scene.getScenes(true).map((s) => s.sys.settings.key).join(',') : 'title';
  if (!inBattle || !window.__scene) return { inBattle, scenes, battle: null };
  const w = window.__scene.world;
  const b = w.behemoth;
  const pct = (i) => Math.round((100 * i.hp) / i.max);
  return {
    inBattle,
    scenes,
    battle: {
      t: Math.round(w.time),
      x: Math.round(b.x),
      exit: w.exitX,
      enemies: w.enemies.filter((e) => e.alive).length,
      kills: w.stats.kills,
      treads: pct(b.treads),
      armor: Math.round(Object.values(b.armor).reduce((a, i) => a + pct(i), 0) / Object.keys(b.armor).length),
      state: b.destroyed ? 'destroyed' : b.immobilized ? 'immobilized' : w.extractedAt !== null ? 'extracted' : 'fighting',
    },
  };
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const t0 = Date.now();
const log = [];
let errors = 0;
const note = (line) => {
  const s = `[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s] ${line}`;
  log.push(s);
  console.log(s);
};

const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
await server.listen();
const profile = mkdtempSync(join(tmpdir(), 'behemoth-playtest-'));
const { proc, ws } = await launch(findShell(), profile);
try {
  const cdp = await devtools(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => cdp.send(method, params, sessionId);
  await page('Runtime.enable');
  await page('Page.enable');
  // 2× the 576×324 internal resolution.
  await page('Emulation.setDeviceMetricsOverride', { width: 1152, height: 648, deviceScaleFactor: 1, mobile: false });
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') {
      errors++;
      const d = msg.params.exceptionDetails;
      note(`EXCEPTION ${d.exception?.description ?? d.text}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
      if (msg.params.type === 'error') errors++;
      note(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
  });
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  // A key press: Phaser needs it held for a few frames to see it (~250 ms).
  const enter = async () => {
    const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 };
    await page('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
    await sleep(250);
    await page('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
  };
  let shots = 0;
  const shot = async (name) => {
    const { data } = await page('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, `${String(++shots).padStart(3, '0')}-${name}.png`), Buffer.from(data, 'base64'));
  };

  await page('Page.navigate', { url: server.resolvedUrls.local[0] + path });
  await sleep(2500);
  await evaluate(AUTOPILOT);
  for (let s = 4; s <= titleSeconds; s += 4) {
    await sleep(4000);
    await shot(`title-${s}s`);
  }

  let scenes = '';
  let lastSnapshot = 0;
  let lastState = '';
  while (Date.now() - t0 < minutes * 60_000) {
    if (!(await evaluate('window.__auto === true'))) {
      note('page reloaded (a source file changed?): autopilot put back');
      await evaluate(AUTOPILOT);
    }
    const st = await evaluate(STATE);
    if (st.scenes !== scenes) {
      scenes = st.scenes;
      note(`scenes: ${scenes}`);
      await sleep(1200);
      await shot(scenes.replace(/,/g, '+'));
    }
    const b = st.battle;
    if (b) {
      if (b.state !== lastState || Date.now() - lastSnapshot > 15_000) {
        lastSnapshot = Date.now();
        lastState = b.state;
        note(`battle t ${b.t}s  x ${b.x}/${b.exit}  enemies ${b.enemies}  kills ${b.kills}  treads ${b.treads}%  armor ${b.armor}%  ${b.state}`);
        await shot(`battle-t${b.t}-${b.state}`);
      }
      // The reactor went: Enter goes on to the run summary.
      if (b.state === 'destroyed') await enter();
    } else {
      lastState = '';
      // Title, Directive picker, map, depot, event, summary: Enter moves on.
      await enter();
    }
    await sleep(1000);
  }
  await shot('end');
  cdp.close();
} finally {
  writeFileSync(join(outDir, 'log.txt'), `${log.join('\n')}\n`);
  proc.kill();
  await server.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(`${errors} error(s); log and screenshots in ${outDir}`);
process.exit(errors > 0 ? 1 : 0);
