const { defineConfig } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    [path.join(__dirname, 'e2e/screenshot-reporter.cjs')],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5181',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: [],
});
