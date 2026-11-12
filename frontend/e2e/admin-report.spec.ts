import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, problem, session } from './donor-session';

const REPORT = '/api/admin/donations/report';
const SETTINGS = '/api/admin/donations/report/settings';
const SEND = '/api/admin/donations/report/send';
const SENT = '/api/admin/donations/report/sent';

function reportView(overrides: Record<string, unknown> = {}) {
  return {
    settings: {
      recipients: ['info@nfnn.cz'],
      sendDay: 1,
      sendHour: 7,
      sections: { donors: true, donations: true, unpairedPayments: true, bankImport: true },
      changedAt: null,
    },
    sentReports: [{ month: '2026-09', sentAt: '2026-10-01T05:00:12Z' }],
    nextReport: { month: '2026-10', dueOn: '2026-11-01' },
    lastEndedMonth: '2026-10',
    ...overrides,
  };
}

function content() {
  return {
    donors: { registered: 2, newInMonth: 1 },
    donations: {
      received: { count: 3, totalMinor: 85000, currency: 'CZK' },
      paired: { count: 2, totalMinor: 70000, currency: 'CZK' },
      receivedInYear: { count: 9, totalMinor: 240000, currency: 'CZK' },
    },
    unpairedPayments: { count: 1, totalMinor: 15000, currency: 'CZK' },
    bankImport: { lastSucceededAt: '2026-10-01T04:00:00Z', lastFailure: null },
  };
}

function sentReport(overrides: Record<string, unknown> = {}) {
  return {
    month: '2026-09',
    firstSentAt: '2026-10-01T05:00:12Z',
    deliveries: [
      { sentAt: '2026-10-02T08:00:00Z', byHand: true, recipientCount: 1, content: content() },
      {
        sentAt: '2026-10-01T05:00:12Z',
        byHand: false,
        recipientCount: 1,
        content: { ...content(), unpairedPayments: null, bankImport: null },
      },
    ],
    recomputed: null,
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
    await page.clock.setFixedTime(new Date('2026-10-23T08:00:00Z'));
    await mockDonorApi(page);
    await rememberedSession(page);
  });

  test('when the ended month has not gone out by its sending time, then the page says so and that only an ended month can be sent', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-10-30T14:52:00Z'));
    const view = reportView({
      sentReports: [{ month: '2026-08', sentAt: '2026-09-01T05:00:12Z' }],
      nextReport: { month: '2026-09', dueOn: '2026-10-01' },
      lastEndedMonth: '2026-09',
    });
    await page.route(
      (url) => url.pathname === REPORT,
      (route) => route.fulfill({ json: view }),
    );

    await page.goto('/sprava/prehledy');

    await expect(
      page.getByText(
        'Přehled za září 2026 měl odejít 1. 10. 2026 v 7:00, ale zatím neodešel. Web ho zkusí poslat znovu v příští celou hodinu; poslat ho můžete i hned níže.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Poslat jde jen měsíc, který už skončil: přehled za říjen 2026 půjde poslat od 1. 11. 2026.',
      ),
    ).toBeVisible();
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

    await expect(page).toHaveTitle('Měsíční e-mail | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Měsíční e-mail' })).toBeFocused();
    await expect(
      page.getByText('Příští přehled za říjen 2026 odejde 1. 11. 2026 v 7:00.'),
    ).toBeVisible();
    await expect(page.getByText('Nastavení jste zatím neměnili.')).toBeVisible();
    await expect(page.locator('.sent-reports .ui-list__title')).toHaveText(['září 2026']);
    await expect(page.locator('.sent-reports .ui-list__meta')).toHaveText([
      'Odesláno 1. 10. 2026 7:00',
    ]);

    await page.getByLabel('Příjemci').fill('pavel@example.cz\njakub@example.cz');
    await page.getByLabel('Den odeslání').selectOption({ label: '5.' });
    await page.getByLabel('Hodina odeslání').selectOption({ label: '18:00' });
    await page.getByLabel('Platby bez dárce').uncheck();
    await page.getByRole('button', { name: 'Uložit nastavení' }).click();

    await expect(page.locator('.ui-form-status')).toHaveText(
      'Nastavení jsme uložili. Příští přehled odejde podle něj.',
    );
    await expect(page.getByText('Naposledy změněno 23. 10. 2026 10:00.')).toBeVisible();
    await expect(
      page.getByText('Příští přehled za říjen 2026 odejde 5. 11. 2026 v 18:00.'),
    ).toBeVisible();
    expect(saved).toEqual([
      {
        recipients: ['pavel@example.cz', 'jakub@example.cz'],
        sendDay: 5,
        sendHour: 18,
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
        'Adresa „pavel“ není platná e-mailová adresa. Pište každou adresu na vlastní řádek.',
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
    await page.getByRole('button', { name: 'Poslat přehled', exact: true }).click();

    const question = page.getByRole('group', { name: 'Poslat přehled?' });
    await expect(question).toContainText('Poslat přehled za říjen 2026 na info@nfnn.cz?');
    await question.getByRole('button', { name: 'Poslat přehled' }).click();

    await expect(page.locator('.send-card .ui-notice--status')).toHaveText(
      'Přehled za říjen 2026 jsme poslali na info@nfnn.cz.',
    );
    await expect(page.locator('.sent-reports .ui-list__title')).toHaveText([
      'říjen 2026',
      'září 2026',
    ]);
    await expect(page.locator('.sent-reports .ui-list__meta')).toHaveText([
      'Odesláno 23. 10. 2026 10:00',
      'Odesláno 1. 10. 2026 7:00',
    ]);
    await expect(
      page.getByText('Příští přehled za listopad 2026 odejde 1. 12. 2026 v 7:00.'),
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
            'Poštovní server e-mail odmítl. V Nastavení si pošlete zkušební e-mail, který řekne, co je špatně, a zkuste to znovu.',
          ),
        ),
    );

    await page.goto('/sprava/prehledy');
    await page.getByRole('button', { name: 'Poslat přehled', exact: true }).click();
    await page
      .getByRole('group', { name: 'Poslat přehled?' })
      .getByRole('button', { name: 'Poslat přehled' })
      .click();

    await expect(page.getByRole('alert')).toHaveText(
      'Přehled se nepodařilo odeslat. Poštovní server e-mail odmítl. V Nastavení si pošlete zkušební e-mail, který řekne, co je špatně, a zkuste to znovu.',
    );
    await expect(page.locator('.sent-reports li')).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Poslat přehled?' })).toHaveCount(0);
  });

  test('when they open a sent month from the list on a phone, then its latest sending and the earlier one are shown and the back arrow returns to the list', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(
      (url) => url.pathname === REPORT,
      (route) => route.fulfill({ json: reportView() }),
    );
    const asked: string[] = [];
    await page.route(
      (url) => url.pathname === SENT,
      (route) => {
        asked.push(new URL(route.request().url()).search);
        return route.fulfill({ json: sentReport() });
      },
    );

    await page.goto('/sprava/prehledy');
    await page.getByRole('link', { name: /září 2026/ }).click();

    await expect(page).toHaveURL('/sprava/prehledy/2026-09');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Přehled za září 2026' }),
    ).toBeFocused();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Naposledy odesláno 2. 10. 2026 10:00',
      'Dříve odesláno 1. 10. 2026 7:00',
    ]);
    await expect(page.locator('.delivery').first()).toContainText('Přijaté dary za září 2026');
    await expect(page.locator('.delivery').last()).not.toContainText('Banka');
    expect(asked).toEqual(['?month=2026-09']);

    await page.getByRole('banner').getByRole('button', { name: 'Zpět' }).click();
    await expect(page).toHaveURL('/sprava/prehledy');
    await expect(page.getByRole('heading', { level: 1, name: 'Měsíční e-mail' })).toBeVisible();
  });

  test('when a month sent before the sendings were kept is opened, then today\u2019s figures come with the note and without the bank', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === SENT,
      (route) =>
        route.fulfill({
          json: sentReport({
            firstSentAt: '2026-10-19T05:00:00Z',
            deliveries: [],
            recomputed: { ...content(), bankImport: null },
          }),
        }),
    );

    await page.goto('/sprava/prehledy/2026-09');

    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Odesláno 19. 10. 2026 7:00',
    ]);
    await expect(
      page.getByText('Spočteno z dnešních dat, odeslaný e-mail se mohl lišit.', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Banka' })).toHaveCount(0);
  });
});
