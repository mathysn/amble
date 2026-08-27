import { defineConfig } from 'vitest/config';

// Unit tests don't touch the DB or the network, but importing the service graph
// evaluates config.ts (env validation), so provide the minimum it requires.
export default defineConfig({
  test: {
    env: {
      DATABASE_URL: 'file:./dev.db',
      OSM_CONTACT: 'amble-test',
    },
  },
});
