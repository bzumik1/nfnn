import { expect, Page, test } from '@playwright/test';
import { administrator, mockDonorApi, problem, session } from './donor-session';

const REPORT = '/api/admin/donations/report';
const SETTINGS = '/api/admin/donations/report/settings';
const SEND = '/api/admin/donations/report/send';

function reportView(overrides: Record<string, unknown> = {}) {
  return {
    settings: {
      recipients: ['info@nfnn.cz'],
      sendDay: 1,
      sections: { donors: true, donations: true, unpairedPayments: true, bankImport: true },
      changedAt: null,
    },
    sentReports: [{ month: '2026-09', sentAt: '2026-10-01T05:00:12Z' }],
    nextReport: { month: '2026-10', dueOn: '2026-11-01' },
    lastEndedMonth: '2026-10',
    ...overrides,
  };
}

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

test.describe('Given an administrator on the monthly report page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
  });

  test('when they change the recipients, the day and the sections, then the settings are saved and the page confirms', async ({
    page,
  }) => {
    let view = reportView();
    const saved: unknown[] = [];
    await page.route(
      (url) => url.pathname === REPORT,
      (route) => route.fulfill({ json: view }),
    );
    await page.route(
      (url) => url.pathname === SETTINGS,
      (route) => {
        const body = route.request().postDataJSON();
        saved.push(body);
        view = reportView({
          settings: { ...body, changedAt: '2026-10-23T08:00:00Z' },
          nextReport: { month: '2026-10', dueOn: '2026-11-05' },
        });
        return route.fulfill({ json: { ...body, changedAt: '2026-10-23T08:00:00Z' } });
      },
    );

    await page.goto('/sprava/prehledy');

    await expect(page).toHaveTitle('Měsíční přehled | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Měsíční přehled' })).toBeFocused();
    await expect(
      page.getByText('Příští přehled za říjen 2026 odejde 01. 11. 2026 ráno.'),
    ).toBeVisible();
    await expect(page.getByText('Zatím platí výchozí nastavení ze serveru.')).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveText(['září 2026 01. 10. 2026 07:00']);

    await page.getByLabel('Příjemci').fill('pavel@example.cz\njakub@example.cz');
    await page.getByLabel('Den odeslání').selectOption({ label: '5.' });
    await page.getByLabel('Platby bez dárce').uncheck();
    await page.getByRole('button', { name: 'Uložit nastavení' }).click();

    await expect(page.locator('.ui-notice--status')).toHaveText(
      'Nastavení jsme uložili. Příští přehled odejde podle něj.',
    );
    await expect(page.getByText('Naposledy změněno 23. 10. 2026 10:00.')).toBeVisible();
    await expect(
      page.getByText('Příští přehled za říjen 2026 odejde 05. 11. 2026 ráno.'),
    ).toBeVisible();
    expect(saved).toEqual([
      {
        recipients: ['pavel@example.cz', 'jakub@example.cz'],
        sendDay: 5,
        sections: { donors: true, donations: true, unpairedPayments: false, bankImport: true },
      },
    ]);
  });

  test('when an address is not an e-mail, then the field says so and nothing is saved', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === REPORT,
      (route) => route.fulfill({ json: reportView() }),
    );
    let saved = 0;
    await page.route(
      (url) => url.pathname === SETTINGS,
      (route) => {
        saved++;
        return route.fulfill({ status: 500 });
      },
    );

    await page.goto('/sprava/prehledy');
    await page.getByLabel('Příjemci').fill('pavel');
    await page.getByRole('button', { name: 'Uložit nastavení' }).click();

    await expect(page.getByLabel('Příjemci')).toBeFocused();
    await expect(page.getByLabel('Příjemci')).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByText(
        'Některá z adres není platná e-mailová adresa. Pište každou na vlastní řádek.',
      ),
    ).toBeVisible();
    expect(saved).toBe(0);
  });

  test('when they send a past month again, then the confirmation names the month and the recipients and the report is listed as sent', async ({
    page,
  }) => {
    let view = reportView();
    const sent: unknown[] = [];
    await page.route(
      (url) => url.pathname === REPORT,
      (route) => route.fulfill({ json: view }),
    );
    await page.route(
      (url) => url.pathname === SEND,
      (route) => {
        sent.push(route.request().postDataJSON());
        view = reportView({
          sentReports: [
            { month: '2026-10', sentAt: '2026-10-23T08:00:00Z' },
            { month: '2026-09', sentAt: '2026-10-01T05:00:12Z' },
          ],
          nextReport: { month: '2026-11', dueOn: '2026-12-01' },
        });
        return route.fulfill({
          json: { month: '2026-10', recipients: ['info@nfnn.cz'], sentAt: '2026-10-23T08:00:00Z' },
        });
      },
    );

    await page.goto('/sprava/prehledy');
    await expect(page.getByLabel('Měsíc', { exact: true })).toHaveValue('2026-10');
    await page.getByRole('button', { name: 'Poslat', exact: true }).click();

    const question = page.getByRole('group', { name: 'Poslat přehled znovu?' });
    await expect(question).toContainText('Poslat přehled za říjen 2026 na info@nfnn.cz?');
    await question.getByRole('button', { name: 'Ano, poslat' }).click();

    await expect(page.locator('.ui-notice--status')).toHaveText(
      'Přehled za říjen 2026 jsme poslali na info@nfnn.cz.',
    );
    await expect(page.locator('tbody tr')).toHaveText([
      'říjen 2026 23. 10. 2026 10:00',
      'září 2026 01. 10. 2026 07:00',
    ]);
    await expect(
      page.getByText('Příští přehled za listopad 2026 odejde 01. 12. 2026 ráno.'),
    ).toBeVisible();
    expect(sent).toEqual([{ month: '2026-10' }]);
  });

  test('when the mail server refuses the report, then the alert carries the backend words and nothing is listed', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === REPORT,
      (route) => route.fulfill({ json: reportView() }),
    );
    await page.route(
      (url) => url.pathname === SEND,
      (route) =>
        route.fulfill(
          problem(
            502,
            'donations/report-not-delivered',
            'Přehled se nepodařilo odeslat',
            'Poštovní server e-mail odmítl. Zkontrolujte nastavení MAIL_* a log backendu.',
          ),
        ),
    );

    await page.goto('/sprava/prehledy');
    await page.getByRole('button', { name: 'Poslat', exact: true }).click();
    await page.getByRole('button', { name: 'Ano, poslat' }).click();

    await expect(page.getByRole('alert')).toHaveText(
      'Přehled se nepodařilo odeslat. Poštovní server e-mail odmítl. Zkontrolujte nastavení MAIL_* a log backendu.',
    );
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Poslat přehled znovu?' })).toHaveCount(0);
  });
});
