import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const theme = process.env.E2E_THEME;
const builtApp = theme ? `dist/${theme}-theme/browser` : 'dist/frontend/browser';
const build = theme
  ? `npx ng build --configuration=production,${theme}-theme --output-path=dist/${theme}-theme`
  : 'npx ng build';
const served = process.env.E2E_DIST ?? builtApp;

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate: `${process.env.BASELINE_SCREENS_DIR ?? join(tmpdir(), 'nfnn-baseline-screens')}/{arg}{ext}`,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 3 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: process.env.E2E_DIST
          ? `node scripts/serve-dist.mjs ${served}`
          : `${build} && node scripts/serve-dist.mjs ${served}`,
        url: 'http://localhost:4200',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
