import { defineConfig } from 'vitest/config';

// Only the pure, platform-free modules (navigation engine, map style/page builders)
// are unit-tested; anything importing react-native stays out of these tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
