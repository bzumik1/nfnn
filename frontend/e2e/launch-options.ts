import type { LaunchOptions } from '@playwright/test';

export const ONE_GARBAGE_COLLECTOR_THREAD = '--js-flags=--single-threaded-gc';

export function launchOptionsOf(browserName: string, projectName: string): LaunchOptions {
  return browserName === 'chromium' && projectName === 'chromium'
    ? { args: [ONE_GARBAGE_COLLECTOR_THREAD] }
    : {};
}
