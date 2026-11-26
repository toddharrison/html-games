import { defineConfig } from 'vitest/config';

/** `npm run sweep`: the slow, run-by-hand tests (SPEC 11.4), kept out of `npm test` by their `.sweep.ts` names. */
export default defineConfig({
  test: {
    include: ['tests/**/*.sweep.ts'],
    environment: 'node',
    testTimeout: 0,
    // Show the sweep's summary (tries per valley, reasons for retries).
    disableConsoleIntercept: true,
  },
});
