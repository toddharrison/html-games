// Text audit: opens every screen in Playwright's headless Chromium, stages the states that put the
// most text on it (every weapon, add-on, module, and upgrade for sale in the depot, and each one
// selected; every map node's intel; every event, option, and outcome; the title's run setup; the
// summaries; battles in each mode), and runs the page's text audit (src/dev/textAudit.ts) on each:
// text off the screen, outside the box it was fitted to, or over other text.
//
//   npm run audit:text [-- [--res 480|576|640] [--only name] [--all] [--out dir]]
//
//   --res   the internal resolution to check (default 576)
//   --only  just the screens whose name starts with this (title, map, event, depot, summary, battle)
//   --all   a screenshot of every state, not only the first of each screen and the ones with problems
//   --out   where the report and screenshots go (default renders/text-audit, git-ignored)
//
// Exits non-zero if it found a problem or the page threw. Needs the headless shell (`npx playwright
// install chromium-headless-shell`), or set CHROME_HEADLESS to any Chromium binary.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};
const res = Number(flag('res', 576));
const only = flag('only', '');
const everyShot = args.includes('--all');
const outDir = resolve(root, flag('out', 'renders/text-audit'));
const SIZES = { 480: [480, 270], 576: [576, 324], 640: [640, 360] };
const [gameW, gameH] = SIZES[res] ?? SIZES[576];

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
    '--mute-audio',
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

// ── The screens ──────────────────────────────────────────────────────────────────────────────────
// Each visit opens `path` and runs `stage` in the page, which lists the states to check as
// `state(name, fn)`; `fn` puts the screen in that state. In `stage`: `game`, `scene(key)`, and
// `load(path)` for a source module. Scenes' private fields are fair game here (it's JavaScript).

/** In the page, before a visit's `stage`: the helpers it's written with. */
const PRELUDE = `
  const game = window.__ui.game;
  const scene = (key) => game.scene.getScene(key);
  const load = (path) => import(path);
  const states = (window.__states = []);
  const state = (name, fn) => states.push([name, fn]);
  const frames = (n) => new Promise((ok) => { const step = () => (n-- > 0 ? requestAnimationFrame(step) : ok()); step(); });
  // A scene restarted with new data, once it's drawn.
  const restart = async (key, data) => { scene(key).scene.restart(data); await frames(3); };
`;

/** A Behemoth with every add-on, a full trailer, and a gun on every mount: the most parts and rows. */
const FULL = 'addons=all&trailer=missilePod,droneBay&weapons=sponsonL:autocannon,sponsonR:rotaryGun,flankL:pulseLaser,flankR:flamethrower';

/** The depot with everything in the game for sale, and every part and stock item selected in turn. */
const DEPOT_STAGE = `
  const { DEPOT_WEAPONS, DEPOT_ADDONS, DEPOT_MODULES, DEPOT_GRADES } = await load('/src/content/depot.ts');
  const d = scene('depot');
  const base = d.ctx.run;
  const stocked = (run, sold = false) => ({
    ...run,
    depot: {
      ...run.depot,
      stock: Object.keys(DEPOT_WEAPONS).map((weapon) => ({ weapon, sold })),
      addons: Object.keys(DEPOT_ADDONS).map((addon) => ({ addon, sold })),
      modules: Object.keys(DEPOT_MODULES).map((module) => ({ module, sold })),
      grades: Object.entries(DEPOT_GRADES).flatMap(([component, gens]) => Object.keys(gens).map((gen) => ({ component, gen: Number(gen), sold }))),
    },
  });
  // Worn all over, so every repair has something to say.
  const worn = (run) => {
    const b = structuredClone(run.behemoth);
    for (const k of ['treads', 'sensors', 'fireControl', 'magazine', 'reactor']) b[k] *= 0.37;
    for (const arc of Object.keys(b.armor)) b.armor[arc] *= 0.37;
    for (const h of b.hardpoints) { h.hp *= 0.37; if (h.ammo !== null) h.ammo = 0; }
    for (const a of b.addons) if (a.hp !== null) a.hp *= 0.37;
    if (b.trailer) { b.trailer.armor *= 0.37; for (const bay of b.trailer.bays) if (bay) { if (bay.hp !== null) bay.hp *= 0.37; if (bay.loads !== null) bay.loads = 0; } }
    return { ...run, behemoth: b };
  };
  const runs = {
    rich: stocked(worn(base)),
    broke: { ...stocked(worn(base)), salvage: 7 },
    spent: (() => { const r = stocked(worn(base)); return { ...r, depot: { ...r.depot, actions: 0 } }; })(),
    caches: (() => { const r = stocked(base, true); return { ...r, salvage: 123456, cache: 3, depot: { ...r.depot, actions: 9, total: 9 } }; })(),
  };
  for (const [name, run] of Object.entries(runs)) {
    const open = () => { d.ctx = { ...d.ctx, run }; d.history = []; d.confirmLeave = false; };
    state(name + ' nothing selected', () => { open(); d.stockScroll = 0; d.select(null); });
    state(name + ' leaving', () => { open(); d.selection = null; d.confirmLeave = true; d.refresh(); });
    state(name + ' list scrolled', () => { open(); d.select(null); d.scrollStock(999); });
    for (const id of ['armor', ...d.parts.map((p) => p.id)]) state(name + ' part ' + id, () => { open(); d.select({ kind: 'part', id }); });
    for (const [kind, list] of [['stock', run.depot.stock], ['addon', run.depot.addons], ['module', run.depot.modules], ['grade', run.depot.grades]]) {
      list.forEach((item, index) => state(name + ' ' + kind + ' ' + (item.weapon ?? item.addon ?? item.module ?? item.component + item.gen), () => { open(); d.select({ kind, index }); }));
    }
  }
`;

/** The map: every node's intel, then the left panel after a battle and after an event. */
const MAP_STAGE = `
  const m = scene('map');
  const run = m.ctx.run;
  const nodes = run.map.sectors[m.sector].nodes;
  for (const n of nodes) state('intel node ' + n.id + ' ' + n.kind, () => { m.hover = { sector: m.sector, node: n.id }; m.drawIntel(); });
  const battle = nodes.find((n) => n.kind === 'battle');
  const at = { sector: m.sector, node: battle.id };
  const report = (mode, taken) => ({ battle: 12, kills: 148, salvage: 1260, bonus: 240, time: 754, objective: { mode, destroyed: 11, total: 12, lost: 1, salvage: 1100 }, ...(taken === undefined ? {} : { taken }) });
  for (const mode of ['breach', 'chase', 'intercept', 'gauntlet']) {
    state('after a ' + mode + ' battle', () => restart('map', { ...m.ctx, run: { ...run, at, path: [at], cache: 3, salvage: 123456, kills: 1480, battle: 12, lastBattle: report(mode, mode === 'chase' ? false : true) } }));
  }
  const event = nodes.find((n) => n.kind === 'event');
  if (event) {
    const { MAP_EVENTS } = await load('/src/content/mapEvents.ts');
    const { chooseEventOption, currentEvent } = await load('/src/sim/mapEvents.ts');
    const { enterMapNode } = await load('/src/sim/run.ts');
    for (const id of Object.keys(MAP_EVENTS)) {
      MAP_EVENTS[id].options.forEach((_, i) => state('after event ' + id + ' option ' + (i + 1), async () => {
        const map = structuredClone(run.map);
        map.sectors[m.sector].nodes[event.id].event = { ...event.event, id };
        const here = { sector: m.sector, node: event.id };
        let r = { ...run, map, at: here, path: [here], next: 'event', salvage: 500 };
        if (!currentEvent(r)) return;
        r = chooseEventOption(r, i);
        await restart('map', { ...m.ctx, run: r });
      }));
    }
  }
`;

/** An event: each option selected, with and without the salvage for it, then each option's outcome. */
const EVENT_STAGE = `
  const e = scene('event');
  const ctx = e.ctx;
  const { MAP_EVENTS } = await load('/src/content/mapEvents.ts');
  const { currentEvent } = await load('/src/sim/mapEvents.ts');
  const count = MAP_EVENTS[currentEvent(ctx.run).id].options.length;
  for (let i = 0; i < count; i++) {
    state('option ' + (i + 1), async () => { await restart('event', ctx); scene('event').pick(i); });
    state('option ' + (i + 1) + ', no salvage', async () => { await restart('event', { ...ctx, run: { ...ctx.run, salvage: 0 } }); scene('event').pick(i); });
    state('outcome ' + (i + 1), async () => { await restart('event', { ...ctx, run: { ...ctx.run, salvage: 9999 } }); scene('event').pick(i); scene('event').confirm(); });
  }
`;

/** The run summary, with and without the still of the blast (three columns, or two). */
const SUMMARY_STAGE = `
  const s = scene('summary');
  const data = s.summaryData;
  const long = { ...data.summary, callsign: 'Glasya-Labolas', kills: 12480, earned: 123456, time: 35999, battles: 48 };
  state('as it is', () => {});
  state('long names', () => restart('summary', { ...data, summary: long, rank: 1 }));
  state('with the still', () => restart('summary', { ...data, summary: long, rank: 7, shot: 'font_pixel' }));
`;

/** The title: the prompt for a saved run, the score list, and the run setup with every choice. */
const TITLE_STAGE = `
  const t = scene('title');
  const { DIRECTIVE_IDS } = await load('/src/content/directives.ts');
  const { DIFFICULTY_IDS } = await load('/src/content/difficulties.ts');
  const { SECTOR_MAP } = await load('/src/content/tuning.ts');
  state('title', () => {});
  state('abandon the saved run?', () => { t.confirmNew = true; t.refresh(); });
  for (let i = 0; i < DIRECTIVE_IDS.length; i++) {
    for (const d of DIFFICULTY_IDS) {
      for (const n of SECTOR_MAP.sectorChoices) state('setup ' + DIRECTIVE_IDS[i] + ' ' + d + ' ' + n, () => { t.confirmNew = false; t.choose(i); t.setDifficulty(d); t.setSectors(n); });
    }
  }
`;

/** A saved run and a full score list for the title to show (then it's reloaded). */
const TITLE_SAVES = `(async () => {
  const { newRun } = await import('/src/sim/run.ts');
  const { saveRun } = await import('/src/save/runSave.ts');
  const { SCORES_KEY, SCORES_VERSION } = await import('/src/save/scores.ts');
  const run = newRun(7, 'class2', [], {}, [], undefined, 'decapitation', 'normal', 5);
  saveRun({ ...run, callsign: 'Glasya-Labolas', battle: 47, salvage: 123456 });
  const outcomes = ['won', 'failed', 'destroyed'];
  const scores = Array.from({ length: 10 }, (_, i) => ({ callsign: i % 2 ? 'Mephistopheles' : 'Glasya-Labolas', score: 12345678 - i * 1111111, outcome: outcomes[i % 3], reached: 5, sectors: 5, directive: 'decapitation', difficulty: 'normal', seed: i, date: '2026-11-24' }));
  localStorage.setItem(SCORES_KEY, JSON.stringify({ version: SCORES_VERSION, scores }));
})()`;

/** A battle: the HUD as it opens, with the debug readout, in the last stand, and each kind of message. */
const BATTLE_STAGE = `
  const b = scene('battle');
  state('opening', () => {});
  state('debug readout', () => { b.showDebug = true; });
  state('a long message', () => { b.statusMessage = () => 'Extracted\\nSector objective missed\\n11 of 12 engines destroyed (92%): +1100\\nEnter - run summary   R - restart'; });
  state('later', async () => { b.statusMessage = Object.getPrototypeOf(b).statusMessage; b.devTimeScale = 8; await new Promise((ok) => setTimeout(ok, 6000)); b.devTimeScale = 1; });
  state('paused', () => { b.paused = true; });
`;

const visits = [
  { name: 'title', path: '/', before: TITLE_SAVES, stage: TITLE_STAGE },
  ...[3, 11].flatMap((seed) => [1, 2, 3].map((n) => ({ name: `map sector ${n} seed ${seed}`, path: `/?seed=${seed}&map=${n}&sectors=5`, stage: MAP_STAGE }))),
  ...['convoy', 'orders', 'hulk', 'dump', 'drop', 'scavengers'].map((id) => ({ name: `event ${id}`, path: `/?seed=3&event=${id}`, stage: EVENT_STAGE })),
  { name: 'depot stock hull', path: '/?seed=3&depot=3', stage: DEPOT_STAGE },
  { name: 'depot full hull', path: `/?seed=5&depot=6&${FULL}&grades=reactor:2,fireControl:2&mods=turret.traverse:2,reactor.capacitor:1`, stage: DEPOT_STAGE },
  ...['won', 'failed', 'destroyed'].map((o) => ({ name: `summary ${o}`, path: `/?seed=3&summary=${o}&sectors=5`, stage: SUMMARY_STAGE })),
  { name: 'battle stock hull', path: '/?seed=3', stage: BATTLE_STAGE },
  ...['breach', 'chase', 'intercept', 'gauntlet'].map((mode) => ({
    name: `battle ${mode} full hull`,
    path: `/?seed=4&mode=${mode}&objective=1&directive=${mode === 'chase' ? 'interdiction' : 'decapitation'}&condition=thunderstorm&biome=wasteland&${FULL}`,
    stage: BATTLE_STAGE,
  })),
  { name: 'battle last stand', path: `/?seed=6&immobilize=1&condition=storm&biome=wasteland&approach=urban&${FULL}`, stage: BATTLE_STAGE },
].filter((v) => v.name.startsWith(only));

// ── The run ──────────────────────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const report = [];
const note = (line) => {
  report.push(line);
  console.log(line);
};
let errors = 0;
/** Each distinct problem, with the first state it showed in and how many states had it. */
const found = new Map();
let checked = 0;

const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
await server.listen();
const profile = mkdtempSync(join(tmpdir(), 'behemoth-text-audit-'));
const { proc, ws } = await launch(findShell(), profile);
try {
  const cdp = await devtools(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => cdp.send(method, params, sessionId);
  await page('Runtime.enable');
  await page('Page.enable');
  // Twice the internal resolution, so the game draws at an integer scale of 2.
  await page('Emulation.setDeviceMetricsOverride', { width: gameW * 2, height: gameH * 2, deviceScaleFactor: 1, mobile: false });
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') {
      errors++;
      const d = msg.params.exceptionDetails;
      note(`EXCEPTION ${d.exception?.description ?? d.text}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors++;
      note(`console.error: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
  });
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  let shots = 0;
  const shot = async (name) => {
    const { data } = await page('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, `${String(++shots).padStart(3, '0')}-${name.replace(/[^a-z0-9]+/gi, '-')}.png`), Buffer.from(data, 'base64'));
  };
  const base = server.resolvedUrls.local[0].replace(/\/$/, '');
  const open = async (path) => {
    const url = `${base}${path}${path.includes('?') ? '&' : '?'}res=${res}`;
    await page('Page.navigate', { url: path === '/' && res === 576 ? `${base}/` : url });
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      if (await evaluate('!!window.__ui && window.__ui.game.scene.getScenes(true).some((s) => s.sys.settings.key !== "boot")').catch(() => false)) break;
    }
    await sleep(600);
  };

  for (const visit of visits) {
    await open(visit.path);
    if (visit.before) {
      await evaluate(visit.before);
      await open(visit.path);
    }
    let count;
    try {
      count = await evaluate(`(async () => { ${PRELUDE} ${visit.stage} return states.length; })()`);
    } catch (e) {
      errors++;
      note(`${visit.name}: could not stage it: ${e.message.split('\n')[0]}`);
      continue;
    }
    let bad = 0;
    for (let i = 0; i < count; i++) {
      let name;
      try {
        name = await evaluate(`(async () => { const [name, fn] = window.__states[${i}]; await fn(); await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))); return name; })()`);
      } catch (e) {
        errors++;
        note(`${visit.name} state ${i}: ${e.message.split('\n')[0]}`);
        continue;
      }
      const problems = await evaluate('window.__ui.audit()');
      checked++;
      let fresh = false;
      for (const p of problems) {
        const key = `${p.scene}|${p.kind}|${p.text}|${p.other ?? ''}`;
        const seen = found.get(key);
        if (seen) seen.count++;
        else {
          fresh = true;
          found.set(key, { ...p, where: `${visit.name}: ${name}`, count: 1 });
        }
      }
      if (problems.length > 0) bad++;
      if (everyShot || i === 0 || fresh) await shot(`${visit.name}-${name}${fresh ? '-PROBLEM' : ''}`);
    }
    note(`${visit.name}: ${count} states, ${bad} with problems`);
  }
  cdp.close();
} finally {
  // The browser is still writing its profile until it's gone.
  const gone = new Promise((ok) => proc.once('exit', ok));
  proc.kill();
  await gone;
  await server.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

note('');
for (const kind of ['off-screen', 'outside-box', 'overlap']) {
  const list = [...found.values()].filter((p) => p.kind === kind);
  if (list.length === 0) continue;
  note(`${kind} (${list.length}):`);
  for (const p of list) {
    const what = kind === 'overlap' ? `"${p.text}" over "${p.other}"` : `"${p.text}"`;
    note(`  ${what}  at ${p.x},${p.y} ${p.w}x${p.h}  [${p.scene}; first in ${p.where}; ${p.count} state${p.count === 1 ? '' : 's'}]`);
  }
}
note(`${checked} states checked at ${gameW}x${gameH}: ${found.size} distinct text problem(s), ${errors} error(s). Report and screenshots in ${outDir}`);
writeFileSync(join(outDir, 'report.txt'), `${report.join('\n')}\n`);
process.exit(found.size > 0 || errors > 0 ? 1 : 0);
