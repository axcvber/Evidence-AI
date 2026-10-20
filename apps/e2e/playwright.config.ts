import { defineConfig, devices } from '@playwright/test';
import { API_DIR, API_URL, apiEnv, WEB_DIR, WEB_PORT, WEB_URL } from './support/env.ts';

// Run through `pnpm e2e`, which builds and seeds first (prepare.ts).
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node --env-file-if-exists=.env dist/main.js',
      cwd: API_DIR,
      env: apiEnv(),
      url: `${API_URL}/api/health/ready`,
      timeout: 60_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `pnpm exec next start -p ${WEB_PORT}`,
      cwd: WEB_DIR,
      env: { API_URL },
      url: `${WEB_URL}/login`,
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
