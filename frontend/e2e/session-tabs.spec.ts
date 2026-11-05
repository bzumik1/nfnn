import { Page, Route } from '@playwright/test';
import { donor, mockDonorApi } from './donor-session';
import { expect, test, unmockedApi } from './fixtures';

const SESSION_HINT = 'nfnn.donor-session';

interface Refresh {
  presented: string;
  startedAt: number;
  answeredAt: number;
}

class RotatingRefreshCookie {
  private current = 'cookie-0';
  private issued = 0;
  readonly refreshes: Refresh[] = [];

  async answer(route: Route): Promise<void> {
    const startedAt = Date.now();
    const presented = /refresh_token=([^;]+)/.exec(
      (await route.request().allHeaders())['cookie'] ?? '',
    )?.[1];
    await new Promise((settle) => setTimeout(settle, 400));
    if (presented !== this.current) {
      this.refreshes.push({ presented: presented ?? '', startedAt, answeredAt: Date.now() });
      await route.fulfill({
        status: 401,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'https://nfnn.cz/problems/auth/invalid-refresh-token',
          title: 'Přihlášení už nelze obnovit',
          detail: 'Přihlaste se prosím znovu.',
          status: 401,
        }),
      });
      return;
    }
    this.issued += 1;
    this.current = `cookie-${this.issued}`;
    this.refreshes.push({ presented, startedAt, answeredAt: Date.now() });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'set-cookie': `refresh_token=${this.current}; Path=/api/donors/auth; HttpOnly; SameSite=Strict`,
      },
      body: JSON.stringify({
        user: donor,
        accessToken: `token-${this.issued}`,
        accessTokenExpiresAt: '2026-10-17T10:15:00Z',
      }),
    });
  }
}

async function aTabWithASession(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill(unmockedApi),
  );
  await mockDonorApi(page);
}

test.describe('Given a donor whose session lives in two tabs of one browser', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
      {
        name: 'refresh_token',
        value: 'cookie-0',
        url: new URL('/api/donors/auth', baseURL).toString(),
        httpOnly: true,
        sameSite: 'Strict',
      },
    ]);
    await context.addInitScript((key) => localStorage.setItem(key, '1'), SESSION_HINT);
  });

  test('when both tabs restore the session at once, then they refresh one after the other, each with the newest cookie, and both stay signed in', async ({
    page,
    context,
  }) => {
    const server = new RotatingRefreshCookie();
    const second = await context.newPage();
    await aTabWithASession(second);
    await mockDonorApi(page);
    for (const tab of [page, second]) {
      await tab.route('**/api/donors/auth/refresh', (route) => server.answer(route));
    }

    await Promise.all([page.goto('/darce/prehled'), second.goto('/darce/prehled')]);

    for (const tab of [page, second]) {
      await expect(tab.getByRole('heading', { level: 1, name: 'Můj přehled' })).toBeVisible();
      await expect(tab.getByRole('dialog')).toHaveCount(0);
    }
    const presented = server.refreshes.map((refresh) => refresh.presented);
    expect(new Set(presented).size, 'no refresh cookie was presented twice').toBe(presented.length);
    for (let index = 1; index < server.refreshes.length; index += 1) {
      expect(server.refreshes[index].startedAt).toBeGreaterThanOrEqual(
        server.refreshes[index - 1].answeredAt,
      );
    }
  });

  test('when the answer of a refresh is lost on the way, then the donor is not signed out and the next try restores the session', async ({
    page,
  }) => {
    const server = new RotatingRefreshCookie();
    let lost = false;
    await mockDonorApi(page);
    await page.route('**/api/donors/auth/refresh', async (route) => {
      if (!lost) {
        lost = true;
        await route.abort('connectionreset');
        return;
      }
      await server.answer(route);
    });

    await page.goto('/');
    await expect.poll(() => lost).toBe(true);
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_HINT)).toBe('1');

    await page.goto('/darce/prehled');

    await expect(page.getByRole('heading', { level: 1, name: 'Můj přehled' })).toBeVisible();
    expect(server.refreshes.map((refresh) => refresh.presented)).toEqual(['cookie-0']);
  });
});
