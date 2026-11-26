// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('node:path');

const exerciseRepo = process.env.EXERCISE_REPO;
if (!exerciseRepo) throw new Error('Set EXERCISE_REPO to the path of the saved-search exercise repository.');

const PORT = Number(process.env.STAND_PORT || 5199);

module.exports = defineConfig({
  testDir: './e2e',
  // One shared in-memory store per server: tests reset it, so they must not run concurrently.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node "${path.join(__dirname, 'server.js')}" "${path.resolve(exerciseRepo)}" ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/saved-searches/cheap-laptops`,
    reuseExistingServer: false,
  },
});
