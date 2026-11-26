// A locally installed headless Chromium, driven over the DevTools protocol, for the scripts that need a
// real browser (check-browser.mjs, shots.mjs). Nothing is added to the lockfile and CI downloads
// nothing: it uses Playwright's cached headless shell if there is one (`npx playwright install
// chromium-headless-shell`), or any Chromium binary named in CHROME_HEADLESS. Same approach as
// games/behemoth-protocol/scripts/playtest.mjs.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export function findShell() {
  if (process.env.CHROME_HEADLESS) return process.env.CHROME_HEADLESS;
  const caches = [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')];
  for (const cache of caches) {
    const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
    for (const d of dirs) {
      for (const sub of readdirSync(join(cache, d))) {
        const bin = join(cache, d, sub, 'chrome-headless-shell');
        if (existsSync(bin)) return bin;
      }
    }
  }
  throw new Error('No headless Chromium found: run `npx playwright install chromium-headless-shell` or set CHROME_HEADLESS');
}

function launch(bin, profile) {
  const proc = spawn(bin, [
    '--remote-debugging-port=0',
    '--no-first-run',
    `--user-data-dir=${profile}`,
    '--mute-audio',
    // A page opened from disk (dist/standalone.html) must be able to run.
    '--allow-file-access-from-files',
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

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Start the browser and open one page. Returns helpers: `goto(url)`, `evaluate(js)`, `waitFor(js)`,
 * `key(code)`, `screenshot()` (PNG bytes), the page `errors` seen so far, and `close()`.
 */
export async function openBrowser({ width = 1152, height = 648 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'snowline-browser-'));
  const { proc, ws } = await launch(findShell(), profile);
  const cdp = await devtools(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => cdp.send(method, params, sessionId);
  await page('Runtime.enable');
  await page('Page.enable');
  await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const errors = [];
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(d.exception?.description ?? d.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  return {
    errors,
    evaluate,
    async goto(url) {
      await page('Page.navigate', { url });
      await sleep(300);
    },
    async waitFor(expression, timeoutMs = 60000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        const v = await evaluate(expression).catch(() => undefined);
        if (v) return v;
        await sleep(100);
      }
      throw new Error(`timed out waiting for ${expression}`);
    },
    async key(code, holdMs = 60) {
      const keyName = { Backquote: '`', Escape: 'Escape', Space: ' ', Enter: 'Enter' }[code] ?? code.replace(/^Key|^Digit/, '').toLowerCase();
      await page('Input.dispatchKeyEvent', { type: 'keyDown', code, key: keyName });
      await sleep(holdMs);
      await page('Input.dispatchKeyEvent', { type: 'keyUp', code, key: keyName });
    },
    async screenshot() {
      const { data } = await page('Page.captureScreenshot', { format: 'png' });
      return Buffer.from(data, 'base64');
    },
    async close() {
      cdp.close();
      proc.kill();
      await sleep(200);
      rmSync(profile, { recursive: true, force: true });
    },
  };
}
