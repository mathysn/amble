import { defineConfig } from 'vitest/config';

// Importing the service graph evaluates config.ts (env validation), so the
// minimum env it needs is provided here. DATABASE_URL is set by the global
// setup: a fresh throwaway SQLite file per run, never the dev database.
export default defineConfig({
  test: {
    env: {
      OSM_CONTACT: 'amble-test',
    },
    globalSetup: ['./test/globalSetup.ts'],
    // Route tests share the run's SQLite file; keep files from racing each other.
    fileParallelism: false,
  },
});
