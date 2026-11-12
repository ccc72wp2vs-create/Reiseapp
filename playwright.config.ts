import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'off',
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15 Pro'], browserName: 'chromium' } },
    { name: 'iphone-se', use: { ...devices['iPhone SE'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'bash scripts/e2e-server.sh',
    url: 'http://localhost:4173/api/v1/health',
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
