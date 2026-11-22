import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000, // Phaser is one large chunk; that's expected.
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
