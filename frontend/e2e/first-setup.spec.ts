import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { problem } from './donor-session';

const STATUS = '/api/operations/setup';
const BACKUP_KEY = 'AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH';

async function freshInstall(
  page: Page,
  codeRequired: boolean,
  testEmails: unknown[] = [],
): Promise<unknown[]> {
  const posted: unknown[] = [];
  let completed = false;
  let restarting = 0;
  await page.route(
    (url) => url.pathname === '/api/content/home',
    (route) => route.fulfill({ json: { news: [], projects: [] } }),
  );
  await page.route(
    (url) => url.pathname === STATUS,
    (route) => {
      if (route.request().method() === 'POST') {
        posted.push(route.request().postDataJSON());
        completed = true;
        return route.fulfill({ status: 202, json: { changed: ['PUBLIC_URL'], restarting: true } });
      }
      if (completed && restarting++ < 1) {
        return route.fulfill({ status: 502, body: '' });
      }
      return route.fulfill({ json: { required: !completed, codeRequired } });
    },
  );
  await page.route(
    (url) => url.pathname === `${STATUS}/unlock`,
    (route) =>
      route.request().postDataJSON().code === 'K7QM-2XPA-9TRD'
        ? route.fulfill({ status: 204, body: '' })
        : route.fulfill(problem(403, 'operations/setup-locked', 'Kód nesedí', '')),
  );
  await page.route(
    (url) => url.pathname === `${STATUS}/backup-key`,
    (route) => route.fulfill({ json: { key: BACKUP_KEY, checkPositions: [2, 13, 24] } }),
  );
  await page.route(
    (url) => url.pathname === `${STATUS}/test-email`,
    (route) => {
      const request = route.request().postDataJSON();
      testEmails.push(request);
      return route.fulfill({
        json: { outcome: 'SENT', sent: true, recipient: request.recipient },
      });
    },
  );
  return posted;
}

test.describe('Given a freshly installed site', () => {
  test('when it is opened from the home network, then the home page leads to the setup, which saves everything and waits for the restart', async ({
    page,
  }) => {
    const testEmails: unknown[] = [];
    const posted = await freshInstall(page, false, testEmails);

    await page.goto('/');
    await expect(page).toHaveURL(/\/prvni-nastaveni$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'První nastavení webu' }),
    ).toBeFocused();

    await page.locator('#setup-admin-email').fill('spravce@example.cz');
    await page.locator('#setup-mail-username').fill('abc@smtp-brevo.com');
    await page.locator('#setup-mail-password').fill('xsmtpsib-key');
    await page.getByRole('button', { name: 'Poslat zkušební e-mail' }).click();
    await expect(page.getByRole('status').filter({ hasText: /\S/ })).toContainText(
      'Zkušební e-mail odešel na spravce@example.cz.',
    );
    expect(testEmails).toEqual([
      expect.objectContaining({
        host: 'smtp-relay.brevo.com',
        password: 'xsmtpsib-key',
        sender: 'info@nfnn.cz',
        recipient: 'spravce@example.cz',
      }),
    ]);
    await expect(
      page.getByRole('list', { name: 'Klíč k zálohám je těchto 24 slov' }).getByRole('listitem'),
    ).toHaveCount(24);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Stáhnout jako soubor' }).click();
    expect((await download).suggestedFilename()).toBe('nfnn-klic-k-zaloham.txt');
    await page.getByRole('button', { name: 'Mám uloženo, ověřit' }).click();
    await page.getByLabel('2. slovo klíče', { exact: true }).fill('komora');
    await page.getByLabel('13. slovo klíče', { exact: true }).fill('MOTIVACE');
    await page.getByLabel('24. slovo klíče', { exact: true }).fill('studna');
    await page.getByRole('button', { name: 'Uložit a spustit' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Web se restartuje' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Web je nastavený' })).toBeVisible({
      timeout: 15_000,
    });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      code: null,
      backupKeyWords: [
        { position: 2, word: 'komora' },
        { position: 13, word: 'MOTIVACE' },
        { position: 24, word: 'studna' },
      ],
      settings: expect.arrayContaining([
        { name: 'MAIL_PASSWORD', value: 'xsmtpsib-key' },
        { name: 'ADMIN_EMAILS', value: 'spravce@example.cz' },
      ]),
    });

    await expect(page.locator('.next-steps li').first()).toHaveText(
      'Zaregistrujte se s adresou spravce@example.cz.',
    );
    await page.getByRole('button', { name: 'Zaregistrovat se' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel('E-mail')).toHaveValue('spravce@example.cz');
  });

  test('when the operator saves without a test e-mail, then the page warns first and saves only on request', async ({
    page,
  }) => {
    const posted = await freshInstall(page, false);

    await page.goto('/prvni-nastaveni');
    await page.getByRole('button', { name: 'Uložit a spustit' }).click();
    await expect(page.locator('#setup-admin-email')).toBeFocused();
    await expect(page.locator('#setup-mail-username-error')).toHaveText(
      'Vyplňte prosím přihlašovací jméno ze stránky SMTP v Brevo.',
    );

    await page.locator('#setup-mail-username').fill('abc@smtp-brevo.com');
    await page.locator('#setup-mail-password').fill('xsmtpsib-key');
    await page.locator('#setup-admin-email').fill('spravce@example.cz');
    await page.getByRole('button', { name: 'Mám uloženo, ověřit' }).click();
    await page.getByLabel('2. slovo klíče', { exact: true }).fill('komora');
    await page.getByLabel('13. slovo klíče', { exact: true }).fill('motivace');
    await page.getByLabel('24. slovo klíče', { exact: true }).fill('studna');
    await page.getByRole('button', { name: 'Uložit a spustit' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText(
      'Zkušební e-mail s těmito údaji zatím neodešel.',
    );
    expect(posted).toHaveLength(0);

    await page.getByRole('button', { name: 'Uložit i tak' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Web se restartuje' })).toBeVisible();
    expect(posted).toHaveLength(1);
  });

  test('when the operator leaves the setup for the home page, then the setup comes back', async ({
    page,
  }) => {
    await freshInstall(page, false);

    await page.goto('/prvni-nastaveni');
    await expect(
      page.getByRole('heading', { level: 1, name: 'První nastavení webu' }),
    ).toBeFocused();
    await page.getByRole('navigation').getByRole('link', { name: 'Domů' }).click();

    await expect(page).toHaveURL(/\/prvni-nastaveni$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'První nastavení webu' }),
    ).toBeVisible();
  });

  test('when it is opened from elsewhere, then the code from the log unlocks the form', async ({
    page,
  }) => {
    await freshInstall(page, true);

    await page.goto('/prvni-nastaveni');
    await page.locator('#setup-code').fill('AAAA-BBBB-CCCC');
    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(page.getByRole('alert')).toContainText('Kód nesedí');

    await page.locator('#setup-code').fill('K7QM-2XPA-9TRD');
    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await expect(page.locator('#setup-admin-email')).toBeVisible();
  });

  test('when it is restored from a backup, then the uploaded file restores the site and the administrator signs in', async ({
    page,
  }) => {
    let uploaded: Buffer | null = null;
    let polls = 0;
    await page.route(
      (url) => url.pathname === '/api/content/home',
      (route) => route.fulfill({ json: { news: [], projects: [] } }),
    );
    await page.route(
      (url) => url.pathname === STATUS,
      (route) => {
        if (uploaded === null) {
          return route.fulfill({
            json: { required: true, codeRequired: false, lastRestore: null },
          });
        }
        if (polls++ < 1) {
          return route.fulfill({ status: 502, body: '' });
        }
        return route.fulfill({ json: { required: false, codeRequired: true, lastRestore: null } });
      },
    );
    await page.route(
      (url) => url.pathname === `${STATUS}/restore`,
      (route) => {
        uploaded = route.request().postDataBuffer();
        return route.fulfill({
          status: 202,
          json: {
            requestId: '019a1b2c-0000-7000-8000-000000000001',
            fileName: '019a1b2c-0000-7000-8000-000000000001.upload',
            requestedAt: '2026-10-23T18:00:00Z',
          },
        });
      },
    );

    await page.goto('/prvni-nastaveni');
    await page.getByRole('button', { name: 'Obnovit ze zálohy' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Obnovit web ze zálohy' }),
    ).toBeFocused();
    await expect(page.getByRole('button', { name: 'Nahrát a obnovit' })).toBeDisabled();
    await page.getByLabel('Soubor zálohy').setInputFiles({
      name: 'nfnn-2026-10-22_0300.dump',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('PGDMP-backup'),
    });
    await page.getByRole('button', { name: 'Nahrát a obnovit' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Obnovujeme web ze zálohy' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Web je obnovený ze zálohy' }),
    ).toBeVisible({ timeout: 15_000 });
    expect(uploaded?.toString()).toBe('PGDMP-backup');
    await expect(page.getByRole('status')).toContainText('token Fio');

    await page.locator('.ui-status').getByRole('button', { name: 'Přihlásit se' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('when it is opened on a 390 px phone, then the form fits the screen', async ({ page }) => {
    await freshInstall(page, false);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/prvni-nastaveni');
    await expect(page.locator('#setup-public-url')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
