// The browser replay check (SPEC 11.4), run by hand before a release: builds the game, then runs the
// golden replays in headless Chromium against the Pages build (served) and against
// dist/standalone.html opened from disk. Exits non-zero on any mismatch or page error.
//
//   npm run check:browser [-- --no-build]
//
// Firefox and Safari: `npm run preview`, open /?check=1, and read the result.

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { openBrowser } from './browser.mjs';

const root = resolve(import.meta.dirname, '..');
if (!process.argv.includes('--no-build')) execSync('npm run build', { cwd: root, stdio: 'inherit' });

const server = await preview({ root, logLevel: 'error', preview: { port: 0, open: false } });
const served = server.resolvedUrls.local[0];
const fromDisk = pathToFileURL(resolve(root, 'dist/standalone.html')).href;
const browser = await openBrowser();
let failed = false;
try {
  for (const [label, url] of [
    ['Pages build', `${served}?check=1`],
    ['standalone.html from disk', `${fromDisk}?check=1`],
  ]) {
    await browser.goto(url);
    const result = await browser.waitFor('window.__snowlineCheck');
    console.log(`${label}: ${result.ok ? 'PASS' : 'FAIL'} (${result.version})`);
    for (const r of result.results) {
      console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}: world ${r.worldHash} (want ${r.expectedWorld}), state ${r.stateHash} (want ${r.expectedState})`);
    }
    if (result.error) console.log(`  error: ${result.error}`);
    if (!result.ok) failed = true;
  }
  if (browser.errors.length) {
    failed = true;
    for (const e of browser.errors) console.log(`page error: ${e}`);
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
