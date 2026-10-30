import { defineConfig, devices } from '@playwright/test';

const PORT = 4322;
// ChromebookなどでPlaywrightのブラウザを入れていない場合は CHROME_PATH で既存Chromiumを指定できる
const executablePath = process.env.CHROME_PATH || undefined;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: { executablePath, args: ['--no-sandbox'] }
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /responsive|mobile/ }
  ],
  webServer: {
    command: `node tests/e2e/setup-db.mjs && npx astro dev --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: { D1_PERSIST_DIR: '.e2e/state', IP_HASH_SALT: 'e2e-salt' }
  }
});
