import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

// Fresh embedded database + storage for every run (config is evaluated once in the runner process for webServer).
const dataDir = process.env.E2E_DATA_DIR ?? path.join(os.tmpdir(), `cs-e2e-${process.pid}`);
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'off', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { PGLITE_DIR: path.join(dataDir, 'db'), STORAGE_DIR: path.join(dataDir, 'storage'), NODE_ENV: 'production', INSECURE_COOKIES: 'true', APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') },
  },
});
