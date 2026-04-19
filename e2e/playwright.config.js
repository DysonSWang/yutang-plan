const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5181',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'cd ../backend && npm run dev',
      port: 3005,
      reuseExistingServer: true,
      timeout: 30000,
      url: 'http://localhost:3005',
    },
    {
      command: 'cd ../frontend && npm run dev',
      port: 5181,
      reuseExistingServer: true,
      timeout: 30000,
      url: 'http://localhost:5181',
    },
  ],
});
