import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, openSignInDialog, session } from './donor-session';

async function signInCapturingTheKind(page: Page): Promise<unknown[]> {
  const kinds: unknown[] = [];
  await page.route('**/api/donors/auth/login', async (route) => {
    const kind: unknown = route.request().postDataJSON().session;
    kinds.push(kind);
    const answer = session(200);
    await route.fulfill({
      ...answer,
      body: JSON.stringify({ ...JSON.parse(answer.body), session: kind }),
    });
  });
  return kinds;
}

async function sessionFlags(page: Page): Promise<{ local: string | null; tab: string | null }> {
  return page.evaluate(() => ({
    local: localStorage.getItem('nfnn.donor-session'),
    tab: sessionStorage.getItem('nfnn.donor-session'),
  }));
}

async function deviceDatabases(page: Page): Promise<string[]> {
  return page.evaluate(async () =>
    (await indexedDB.databases()).flatMap((database) => (database.name ? [database.name] : [])),
  );
}

function copyOpened(page: Page): Promise<unknown> {
  return page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/api/donations/me/sync',
  );
}

async function submitPassword(page: Page): Promise<void> {
  await page.locator('#login-email').fill('jana@example.cz');
  await page.locator('#login-password').fill('correct horse battery');
  await page.getByRole('dialog').locator('.ui-button--block').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('Given a visitor with the sign-in dialog open in a browser tab', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await openSignInDialog(page);
  });

  test('when they sign in without touching the row, then the session lasts until the browser closes', async ({
    page,
  }) => {
    const kinds = await signInCapturingTheKind(page);
    await expect(page.getByRole('checkbox', { name: 'Zapamatovat si mě' })).not.toBeChecked();

    await submitPassword(page);

    expect(kinds).toEqual(['BROWSER']);
    expect(await sessionFlags(page)).toEqual({ local: '1', tab: null });
    await expect.poll(() => deviceDatabases(page)).toContain('nfnn.device');
  });

  test('when they tick "Zapamatovat si mě", then the sign-in asks to be remembered', async ({
    page,
  }) => {
    const kinds = await signInCapturingTheKind(page);

    await page.getByRole('checkbox', { name: 'Zapamatovat si mě' }).check();
    await submitPassword(page);

    expect(kinds).toEqual(['REMEMBERED']);
  });

  test('when they choose a public computer, then the hint says nothing stays, the sign-in asks for a public session and nothing but the session flag of the tab is stored, even after a reload', async ({
    page,
  }) => {
    const kinds = await signInCapturingTheKind(page);

    await page.getByRole('button', { name: 'Cizí počítač?' }).click();

    const publicChoice = page.getByRole('checkbox', { name: 'Cizí počítač, nic neukládat' });
    await expect(publicChoice).toBeChecked();
    await expect(publicChoice).toBeFocused();
    await expect(publicChoice).toHaveAccessibleDescription(
      'Po zavření prohlížeče tu nic nezůstane.',
    );
    const openedAtSignIn = copyOpened(page);
    await submitPassword(page);
    await openedAtSignIn;

    expect(kinds).toEqual(['PUBLIC']);
    expect(await sessionFlags(page)).toEqual({ local: null, tab: '1' });
    await expect(page.getByRole('link', { name: 'Můj přehled' }).first()).toBeVisible();
    await page.route('**/api/donors/auth/refresh', async (route) => {
      const answer = session(200);
      await route.fulfill({
        ...answer,
        body: JSON.stringify({ ...JSON.parse(answer.body), session: 'PUBLIC' }),
      });
    });
    const openedAfterReload = copyOpened(page);
    await page.reload();
    await openedAfterReload;
    expect(await deviceDatabases(page)).toEqual([]);
  });

  test('when they choose a public computer and then "Zpět", then the first row returns unticked', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Cizí počítač?' }).click();

    await page.getByRole('button', { name: 'Zpět', exact: true }).click();

    const remember = page.getByRole('checkbox', { name: 'Zapamatovat si mě' });
    await expect(remember).not.toBeChecked();
    await expect(remember).toBeFocused();
    await expect(page.getByText('Po zavření prohlížeče tu nic nezůstane.')).toHaveCount(0);
  });
});
