import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/** The build's version stamp (shown on the title screen): package.json's version and the git commit. */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
function commit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit()),
  },
  build: {
    target: 'es2022',
    // One script and one stylesheet, so scripts/standalone.mjs can inline them into dist/standalone.html.
    modulePreload: { polyfill: false },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // A real valley takes about a second to make (its geology and history are simulated), and tests that
    // build several run alongside each other. CI runs about 2.5x slower than a laptop.
    testTimeout: 40000,
  },
});
