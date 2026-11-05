import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEVICE_PROJECT_PREFIX,
  DeviceOptions,
  POSES,
  SAFARI_POSES,
  SafariPose,
} from './e2e/devices/poses';

const theme = process.env.E2E_THEME;
const builtApp = theme ? `dist/${theme}-theme/browser` : 'dist/frontend/browser';
const build = theme
  ? `npm run build -- --configuration=production,${theme}-theme --output-path=dist/${theme}-theme`
  : 'npm run build';
const served = process.env.E2E_DIST ?? builtApp;
const askedProjects = process.argv.filter((argument) => argument.startsWith('--project='));
const onlyWebApp =
  process.env.E2E_DIST !== undefined &&
  askedProjects.length > 0 &&
  askedProjects.every((argument) => argument === '--project=pwa');
const safari = !!process.env.SAFARI;

const SAFARI_TEST_TIMEOUT_MS = 60_000;
const SAFARI_MAX_FAILURES = 10;
const safariProjects = SAFARI_POSES.map((pose) => ({
  name: `${DEVICE_PROJECT_PREFIX}${pose.id}`,
  testMatch: /devices\/safari\.spec\.ts$/,
  timeout: SAFARI_TEST_TIMEOUT_MS,
  use: { safariPose: pose },
}));

export default defineConfig<DeviceOptions, { safariPose?: SafariPose }>({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: !!process.env.CI,
  retries: process.env.CI && !safari ? 2 : 0,
  maxFailures: safari ? SAFARI_MAX_FAILURES : undefined,
  workers: safari ? 1 : process.env.CI ? 3 : undefined,
  reporter: [[process.env.CI && !safari ? 'github' : 'list'], ['./e2e/devices/device-report.ts']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    serviceWorkers: 'block',
  },
  projects: safari
    ? safariProjects
    : [
        {
          name: 'chromium',
          testIgnore: /baseline\/|pwa\/|devices\/(devices|safari)\.spec\.ts$/,
          use: { ...devices['Desktop Chrome'] },
        },
        {
          name: 'iphone',
          testMatch:
            /(receipt-pdf|verify-receipt|donate-qr|second-factor|dialog-back|security-headers|device-copy|app-shell)\.spec\.ts$/,
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
    safari || process.env.E2E_BASE_URL || onlyWebApp
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
