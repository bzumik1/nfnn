import { Page } from '@playwright/test';
import { administrator, mockDonorApi, problem, session, signIn } from './donor-session';
import {
  ADMINISTRATION_LOCKED,
  ADMINISTRATION_UNLOCK_PATH,
  expect,
  test,
  unlockAdministration,
} from './fixtures';

const REPORT = '/api/admin/donations/report';
const FIVE_MINUTES_MS = 5 * 60 * 1000;

const reportView = {
  settings: {
    recipients: ['info@nfnn.cz'],
    sendDay: 1,
    sendHour: 7,
    sections: { donors: true, donations: true, unpairedPayments: true, bankImport: true },
    changedAt: null,
    version: '0f1e2d3c4b5a6978',
  },
  sentReports: [{ month: '2026-09', sentAt: '2026-10-01T05:00:12Z' }],
  nextReport: { month: '2026-10', dueOn: '2026-11-01' },
  lastEndedMonth: '2026-10',
};

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

async function leaveTheApp(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

async function comeBack(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test.describe('Given an administrator whose administration locks on this device', () => {
  test.use({ unlocksAdministration: false });

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-05T08:00:00Z') });
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === REPORT,
      (route) => route.fulfill({ json: reportView }),
    );
  });

  test('when the app starts with a remembered session, then the administration is locked until the server accepts the password and a fresh code', async ({
    page,
  }) => {
    const sent: unknown[] = [];
    await page.route(
      (url) => url.pathname === ADMINISTRATION_UNLOCK_PATH,
      (route) => {
        const body = route.request().postDataJSON() as { secondFactorCode: string };
        sent.push(body);
        return body.secondFactorCode === '482913'
          ? route.fulfill({ status: 204 })
          : route.fulfill(
              problem(
                400,
                'https://nfnn.cz/problems/donors/second-factor-code-rejected',
                'Kód z aplikace nesouhlasí',
                'Opište prosím nový kód z aplikace.',
              ),
            );
      },
    );
    await rememberedSession(page);

    await page.goto('/sprava/prehledy');

    await expect(
      page.getByRole('heading', { level: 1, name: ADMINISTRATION_LOCKED }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Měsíční e-mail' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Odemknout přístupovým klíčem' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Použít heslo' }).click();
    await expect(page.locator('#zamek-heslo')).toBeFocused();
    await page.locator('#zamek-heslo').fill('correct horse battery');
    await page.locator('#zamek-kod').fill('000000');
    await page.getByRole('button', { name: 'Odemknout', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText(
      'Kód z aplikace nesouhlasí',
    );
    await page.locator('#zamek-kod').fill('482913');
    await page.getByRole('button', { name: 'Odemknout', exact: true }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Měsíční e-mail' })).toBeVisible();
    expect(sent).toEqual([
      { password: 'correct horse battery', secondFactorCode: '000000' },
      { password: 'correct horse battery', secondFactorCode: '482913' },
    ]);
  });

  test('when the administrator has just signed in, then the administration opens without asking again', async ({
    page,
  }) => {
    await signIn(page, administrator);

    await page.getByRole('link', { name: 'Správa' }).first().click();

    await expect(page.getByRole('heading', { level: 1, name: 'Správa' })).toBeVisible();
    await expect(page.getByRole('heading', { name: ADMINISTRATION_LOCKED })).toHaveCount(0);
  });

  test.describe('when the administration was unlocked', () => {
    test.beforeEach(async ({ page }) => {
      await page.route(
        (url) => url.pathname === ADMINISTRATION_UNLOCK_PATH,
        (route) => route.fulfill({ status: 204 }),
      );
      await rememberedSession(page);
      await page.goto('/sprava/prehledy');
      await unlockAdministration(page);
      await expect(page.getByRole('heading', { level: 1, name: 'Měsíční e-mail' })).toBeVisible();
    });

    test('and the app is away for less than five minutes, then it stays unlocked', async ({
      page,
    }) => {
      await leaveTheApp(page);
      await page.clock.runFor(FIVE_MINUTES_MS - 60 * 1000);
      await comeBack(page);

      await expect(page.getByRole('heading', { level: 1, name: 'Měsíční e-mail' })).toBeVisible();
    });

    test('and the app is away for five minutes, then it locks', async ({ page }) => {
      await leaveTheApp(page);
      await page.clock.runFor(FIVE_MINUTES_MS);
      await comeBack(page);

      await expect(
        page.getByRole('heading', { level: 1, name: ADMINISTRATION_LOCKED }),
      ).toBeVisible();
      await expect(page.getByLabel('Příjemci')).toHaveCount(0);
    });

    test('and it locks while the recipients are half-typed, then after unlocking the typed text is still there', async ({
      page,
    }) => {
      await page.getByLabel('Příjemci').fill('pavel@example.cz');
      await leaveTheApp(page);
      await page.clock.runFor(FIVE_MINUTES_MS);
      await comeBack(page);
      await expect(
        page.getByRole('heading', { level: 1, name: ADMINISTRATION_LOCKED }),
      ).toBeVisible();
      await expect(page.getByLabel('Příjemci')).toBeHidden();

      await unlockAdministration(page);

      await expect(page.getByLabel('Příjemci')).toHaveValue('pavel@example.cz');
    });
  });

  test.describe('when the administration is on the news editor', () => {
    const tabs = (page: Page) => page.getByRole('navigation', { name: 'Hlavní sekce' });

    test.beforeEach(async ({ page }) => {
      await page.route(
        (url) => url.pathname === ADMINISTRATION_UNLOCK_PATH,
        (route) => route.fulfill({ status: 204 }),
      );
      await rememberedSession(page);
    });

    test('and it is locked from the start, then a tab still leads out of the administration', async ({
      page,
    }) => {
      await page.goto('/sprava/aktuality/nova');
      await expect(
        page.getByRole('heading', { level: 1, name: ADMINISTRATION_LOCKED }),
      ).toBeFocused();

      await tabs(page).getByRole('link', { name: 'O nás' }).click();

      await expect(page).toHaveURL('/o-nas');
    });

    test('and it locks with a half-written article and a tab is pressed, then the question about unsaved changes waits behind the panel until the administration is unlocked', async ({
      page,
    }) => {
      await page.goto('/sprava/aktuality/nova');
      await unlockAdministration(page);
      await page.getByLabel('Titulek').fill('Benefiční koncert');
      await leaveTheApp(page);
      await page.clock.runFor(FIVE_MINUTES_MS);
      await comeBack(page);
      await expect(
        page.getByRole('heading', { level: 1, name: ADMINISTRATION_LOCKED }),
      ).toBeFocused();

      await tabs(page).getByRole('link', { name: 'O nás' }).click();
      await expect(page.getByRole('dialog', { name: 'Máte neuložené změny' })).toHaveCount(0);
      await unlockAdministration(page);

      const question = page.getByRole('dialog', { name: 'Máte neuložené změny' });
      await expect(question).toBeVisible();
      await question.getByRole('button', { name: 'Zůstat a uložit' }).click();
      await expect(page).toHaveURL('/sprava/aktuality/nova');
      await expect(page.getByLabel('Titulek')).toHaveValue('Benefiční koncert');
    });
  });

  test.describe('when the administration locked with a half-written article kept under the panel', () => {
    test.beforeEach(async ({ page }) => {
      await page.route(
        (url) => url.pathname === ADMINISTRATION_UNLOCK_PATH,
        (route) => route.fulfill({ status: 204 }),
      );
      await page.route('**/api/donors/auth/logout', (route) => route.fulfill({ status: 204 }));
      await rememberedSession(page);
      await page.goto('/sprava/aktuality/nova');
      await unlockAdministration(page);
      await page.getByLabel('Titulek').fill('Benefiční koncert');
      await leaveTheApp(page);
      await page.clock.runFor(FIVE_MINUTES_MS);
      await comeBack(page);
      await expect(
        page.getByRole('heading', { level: 1, name: ADMINISTRATION_LOCKED }),
      ).toBeVisible();
    });

    test('and the administrator signs out from the panel, then the site opens and the article stays out of sight', async ({
      page,
    }) => {
      await page.getByRole('button', { name: 'Odhlásit se z tohoto zařízení' }).click();

      await expect(page).toHaveURL('/');
      await expect(page.getByLabel('Titulek')).toHaveCount(0);
    });

    test('and a tab was pressed before signing out, then signing out still opens the site', async ({
      page,
    }) => {
      await page
        .getByRole('navigation', { name: 'Hlavní sekce' })
        .getByRole('link', { name: 'O nás' })
        .click();

      await page.getByRole('button', { name: 'Odhlásit se z tohoto zařízení' }).click();

      await expect(page).toHaveURL('/');
      await expect(page.getByLabel('Titulek')).toHaveCount(0);
    });
  });

  test('when the device is offline, then the panel says that the password waits for a connection', async ({
    page,
    context,
  }) => {
    await rememberedSession(page);
    await page.goto('/sprava');
    await expect(
      page.getByRole('heading', { level: 1, name: ADMINISTRATION_LOCKED }),
    ).toBeVisible();

    await context.setOffline(true);

    await expect(page.getByText('Jste offline.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Použít heslo' })).toBeDisabled();
    await context.setOffline(false);
  });
});
