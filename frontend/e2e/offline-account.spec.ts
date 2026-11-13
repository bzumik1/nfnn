import type { Page } from '@playwright/test';
import { donations as twoGifts } from './receipt-donations';
import {
  donorSyncOf,
  mockDonorApi,
  openAccountItem,
  openDonorSection,
  openSignInDialog,
  session,
} from './donor-session';
import { expect, test } from './fixtures';

async function signInAs(page: Page, remembered: boolean): Promise<void> {
  await page.route('**/api/donors/auth/login', async (route) => {
    const kind: unknown = route.request().postDataJSON().session;
    const answer = session(200);
    await route.fulfill({
      ...answer,
      body: JSON.stringify({ ...JSON.parse(answer.body), session: kind }),
    });
  });
  await openSignInDialog(page);
  if (remembered) {
    await page.getByRole('checkbox', { name: 'Zapamatovat si mě' }).check();
  }
  await page.locator('#login-email').fill('jana@example.cz');
  await page.locator('#login-password').fill('correct horse battery');
  await page.getByRole('dialog').locator('.ui-button--block').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await openAccountItem(page, 'Údaje a zabezpečení');
  await expect(page.getByText(/Uloženo v zařízení · aktualizováno /)).toBeVisible();
}

async function cutOffTheServer(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      asked.push(new URL(route.request().url()).pathname);
      return route.abort('internetdisconnected');
    },
  );
  return asked;
}

const gifts = (page: Page) =>
  page.locator('.payments-card tbody tr, .payments-card .donation-rows > li:not(.donation-last)');

test.describe('Given a donor whose copy on this device holds her gifts', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page, {
      ...twoGifts,
      sync: await donorSyncOf(twoGifts.summary, { gifts: twoGifts.list.items }),
    });
  });

  test('when she signed in with Zapamatovat si mě and the site opens again while the server cannot be reached, then Moje dary shows her gifts from the copy without the sign-in dialog', async ({
    page,
  }) => {
    await signInAs(page, true);
    const asked = await cutOffTheServer(page);

    await page.goto('/darce/dary');

    await expect(page.getByRole('heading', { level: 1, name: 'Moje dary' })).toBeVisible();
    await expect(gifts(page)).toHaveCount(2);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(asked).toContain('/api/donors/auth/refresh');
  });

  test('when she signed in with Zapamatovat si mě and opens Údaje a zabezpečení while the server cannot be reached, then the page says it loads once she is connected', async ({
    page,
  }) => {
    await signInAs(page, true);
    await cutOffTheServer(page);

    await page.goto('/darce/prehled');
    await openDonorSection(page, 'Údaje a zabezpečení');

    await expect(
      page.getByText(
        'Údaje a zabezpečení se bez připojení nenačtou. Jakmile budete připojeni, ukážou se tu samy.',
      ),
    ).toBeVisible();
  });

  test('when she signed in without Zapamatovat si mě and the site opens again while the server cannot be reached, then her account does not open from the copy', async ({
    page,
  }) => {
    await signInAs(page, false);
    await cutOffTheServer(page);

    await page.goto('/darce/dary');

    await expect(page).not.toHaveURL(/\/darce\//);
    await expect(gifts(page)).toHaveCount(0);
  });
});
