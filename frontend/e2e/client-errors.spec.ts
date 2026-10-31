import { Request } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  openHomeThenLoseNewChunks,
  openPolicyFromFooter,
  chunkLoadPageHeading,
} from './lost-chunks';

const CANARY = 'Zxqv Kanárek 7781,77 Kč 2099-778177';

test.describe('Given a visitor on a public page of the production build', () => {
  test('when an error carrying a name, an amount and a receipt number escapes the app, then one report of closed values reaches the server', async ({
    page,
  }) => {
    const reports: Request[] = [];
    await page.route('/api/operations/client-errors', (route) => {
      reports.push(route.request());
      return route.fulfill({ status: 204 });
    });
    await page.goto('/zasady-ochrany-osobnich-udaju');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.evaluate((canary) => {
      setTimeout(() => {
        throw new Error(canary);
      });
    }, CANARY);

    await expect.poll(() => reports.length).toBe(1);
    const [report] = reports;
    expect(report.method()).toBe('POST');
    expect(report.headers()['content-type']).toBe('application/json');
    expect(report.headers()['authorization']).toBeUndefined();
    expect(report.postDataJSON()).toEqual({
      kind: 'unexpected',
      place: 'global',
      name: 'Error',
      appVersion: 'dev',
      browser: 'chrome',
      browserMajor: expect.any(Number),
      os: expect.stringMatching(/^(windows|macos|linux)$/),
      display: 'browser',
      count: 1,
    });
    expect(report.postData()).not.toContain('Kanárek');
    expect(report.postData()).not.toContain('7781');
    expect(report.url()).not.toContain('zasady');
  });
});

test.describe('Given a visitor whose open tab is older than the deployed version', () => {
  test('when the chunk of the page they open is gone, then each page load sends exactly one chunk-load report and no unexpected one', async ({
    page,
  }) => {
    const reports: { kind: string; place: string; load: number }[] = [];
    const chunks = await openHomeThenLoseNewChunks(page);
    await page.route('/api/operations/client-errors', (route) => {
      const { kind, place } = route.request().postDataJSON() as { kind: string; place: string };
      reports.push({ kind, place, load: chunks.documents.length });
      return route.fulfill({ status: 204 });
    });

    await openPolicyFromFooter(page);

    await expect(page.getByRole('main').getByRole('heading', chunkLoadPageHeading)).toBeFocused();
    await page.waitForLoadState('networkidle');
    expect(reports).toEqual([
      { kind: 'chunk-load', place: 'navigation', load: 0 },
      { kind: 'chunk-load', place: 'navigation', load: 1 },
    ]);
  });
});
