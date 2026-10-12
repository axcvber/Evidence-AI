import { defineConfig } from 'vitest/config';

// Lets `pnpm vitest` at the root (and editor integrations) run every workspace's tests.
// `pnpm test` runs them per workspace through turbo instead.
export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],
  },
});
