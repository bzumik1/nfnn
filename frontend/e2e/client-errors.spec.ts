import { Request } from '@playwright/test';

import { expect, test } from './fixtures';

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
