import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEVICE_PROJECT_PREFIX, DeviceOptions, POSES } from './e2e/devices/poses';

const theme = process.env.E2E_THEME;
const builtApp = theme ? `dist/${theme}-theme/browser` : 'dist/frontend/browser';
const build = theme
  ? `npx ng build --configuration=production,${theme}-theme --output-path=dist/${theme}-theme`
  : 'npx ng build';
const served = process.env.E2E_DIST ?? builtApp;
const askedProjects = process.argv.filter((argument) => argument.startsWith('--project='));
const onlyWebApp =
  process.env.E2E_DIST !== undefined &&
  askedProjects.length > 0 &&
  askedProjects.every((argument) => argument === '--project=pwa');

export default defineConfig<DeviceOptions>({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 3 : undefined,
  reporter: [[process.env.CI ? 'github' : 'list'], ['./e2e/devices/device-report.ts']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /baseline\/|pwa\/|devices\/devices\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'iphone',
      testMatch: /(receipt-pdf|verify-receipt|donate-qr|second-factor|dialog-back|security-headers)\.spec\.ts$/,
      testIgnore: /pwa\//,
      use: { ...devices['iPhone 15'] },
    },
    {
      name: 'pwa',
      default: false,
      testMatch: /pwa\/.*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], channel: 'chromium', serviceWorkers: 'allow' },
    },
    ...POSES.map((pose) => ({
      name: `${DEVICE_PROJECT_PREFIX}${pose.id}`,
      testMatch: /devices\/devices\.spec\.ts$/,
      use: { ...devices[pose.device], textScale: pose.textScale ?? 100 },
    })),
    {
      name: 'baseline',
      testMatch: /baseline\/.*\.spec\.ts$/,
      snapshotPathTemplate: `${process.env.BASELINE_SCREENS_DIR ?? join(tmpdir(), 'nfnn-baseline-screens')}/{arg}{ext}`,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--num-raster-threads=1',
            '--disable-partial-raster',
            '--disable-skia-runtime-opts',
            '--disable-gpu',
          ],
          env: { ...process.env, LANG: 'cs_CZ.UTF-8', LANGUAGE: 'cs', LC_ALL: 'cs_CZ.UTF-8' },
        },
      },
    },
  ],
  webServer:
    process.env.E2E_BASE_URL || onlyWebApp
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
