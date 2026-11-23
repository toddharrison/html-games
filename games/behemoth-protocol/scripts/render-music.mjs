// Renders the music offline (SPEC §11.4 "Music") to WAV and MIDI files for listening outside
// the game: starts a Vite dev server, loads src/audio/music/render.ts in Playwright's headless
// Chromium shell over the DevTools protocol, and writes what renderAll() returns.
//
//   npm run render:music [-- [--demos] <out dir>]     (default: renders/music, git-ignored; --demos skips the slow battle renders)
//
// Needs the headless shell (`npx playwright install chromium-headless-shell`), or set
// CHROME_HEADLESS to any Chromium binary.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const demosOnly = args.includes('--demos');
const outDir = resolve(root, args.find((a) => !a.startsWith('--')) ?? 'renders/music');

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

function launch(bin) {
  const proc = spawn(bin, ['--remote-debugging-port=0', '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank']);
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
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
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
  return new Promise((ok) => (ws.onopen = () => ok({ send, close: () => ws.close() })));
}

const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0];
const { proc, ws } = await launch(findShell());
try {
  const cdp = await devtools(ws);
  // Any same-origin page will do; this one doesn't boot the game.
  const { targetId } = await cdp.send('Target.createTarget', { url: `${base}src/audio/music/render.ts` });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await new Promise((r) => setTimeout(r, 500));
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  // Keep the renders in the page and fetch them one at a time: all at once is too big a message.
  const count = await evaluate(`import('/src/audio/music/render.ts').then(async (m) => (window.renders = await m.renderAll(${demosOnly})).length)`);
  mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < count; i++) {
    const r = await evaluate(`window.renders[${i}]`);
    writeFileSync(join(outDir, `${r.name}.wav`), Buffer.from(r.wav, 'base64'));
    if (r.mid) writeFileSync(join(outDir, `${r.name}.mid`), Buffer.from(r.mid, 'base64'));
    writeFileSync(join(outDir, `${r.name}.txt`), `${r.log.join('\n')}\n`);
    console.log(`${join(outDir, r.name)}.{wav,${r.mid ? 'mid,' : ''}txt}`);
  }
  cdp.close();
} finally {
  proc.kill();
  await server.close();
}
