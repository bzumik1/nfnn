import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  donations as receiptDonations,
  ISSUING,
  openReceiptsAfterSignIn,
  pretendIphoneThatShares,
} from './receipt-donations';
import { answerReceiptIssuing, RECEIPT_ISSUING_URL } from './receipt-issuing';
import { donorWithDonations } from './baseline/screen-mocks';
import {
  donationItem,
  donor,
  mockDonorApi,
  noDonations,
  openDonorSection,
  problem,
  session,
  signIn,
} from './donor-session';

function donation(
  id: string,
  receivedAt: string,
  amountMinor: number,
  status = 'RECEIVED',
  receiptAvailable = status === 'RECEIVED',
) {
  return donationItem({ id, receivedAt, amountMinor, status, receiptAvailable });
}

const twoYears = {
  summary: {
    totalAmountMinor: 175000,
    currency: 'CZK',
    count: 3,
    lastReceivedAt: '2026-03-15',
    byYear: [
      { year: 2026, count: 2, totalAmountMinor: 150000 },
      { year: 2025, count: 1, totalAmountMinor: 25000 },
    ],
    yearlyReceiptsAvailableThrough: 2025,
    receiptsAvailableFrom: 2025,
  },
  list: {
    items: [
      donation('0192f0f1-0000-7000-8000-000000000004', '2026-03-15', 50000),
      donation('0192f0f1-0000-7000-8000-000000000003', '2026-01-10', 100000),
      donation('0192f0f1-0000-7000-8000-000000000002', '2025-11-05', 25000),
      donation('0192f0f1-0000-7000-8000-000000000001', '2025-08-20', 200000, 'REFUNDED'),
    ],
    totalAmountMinor: 175000,
    currency: 'CZK',
    count: 3,
  },
};

const withReceipts = {
  ...twoYears,
  receipts: { singleNumber: '2026-000001' },
};

const receiptsFrom2026 = {
  summary: { ...twoYears.summary, receiptsAvailableFrom: 2026 },
  list: {
    ...twoYears.list,
    items: twoYears.list.items.map((item) => ({
      ...item,
      receiptAvailable: item.receiptAvailable && item.receivedAt >= '2026-01-01',
    })),
  },
};

test.describe('Given a signed-in donor', () => {
  for (const [width, stacked] of [
    [900, true],
    [940, true],
    [1024, false],
  ] as const) {
    test(`when Přihlášení a zabezpečení shows in a window ${width} px wide, then its rows keep one left axis and their buttons stand on one right edge, ${stacked ? 'with each value under its label' : 'with each value beside its label'}`, async ({
      page,
    }) => {
      await mockDonorApi(page);
      await signIn(page);
      await page.setViewportSize({ width, height: 900 });
      await openDonorSection(page, 'Údaje a zabezpečení');
      const card = page.locator('app-account-card');
      await expect(card.locator('.account-row').first()).toBeVisible();

      const axes = await card.evaluate((element) => {
        const left = (selector: string): number[] =>
          [...element.querySelectorAll(selector)].map((cell) =>
            Math.round(cell.getBoundingClientRect().left),
          );
        const right = (selector: string): number[] =>
          [...element.querySelectorAll(selector)].map((cell) =>
            Math.round(cell.getBoundingClientRect().right),
          );
        return {
          labels: left('.account-row > dt'),
          rows: left('.account-row'),
          buttons: right('.account-row .account-actions .ui-button:last-child'),
          rowEnds: right('.account-row'),
          valueUnderLabel:
            element.querySelector('.account-row > .account-value')!.getBoundingClientRect().top >=
            element.querySelector('.account-row > dt')!.getBoundingClientRect().bottom,
        };
      });

      expect(axes.labels.length).toBeGreaterThan(1);
      expect(new Set(axes.labels).size).toBe(1);
      expect(axes.labels[0]).toBe(axes.rows[0]);
      expect(axes.buttons.length).toBeGreaterThan(1);
      expect(new Set(axes.buttons).size).toBe(1);
      expect(axes.buttons[0]).toBe(axes.rowEnds[0]);
      expect(axes.valueUnderLabel).toBe(stacked);
    });
  }

  test('when they have given in two years, then the sections show their totals, their payments and each year on its own', async ({
    page,
  }) => {
    await mockDonorApi(page, twoYears);

    await signIn(page);

    await expect(
      page.locator('.last-gift').locator('.last-gift-amount, .last-gift-date, .last-gift-status'),
    ).toHaveText(['500 Kč', '15. 3. 2026', 'Přijato']);
    await expect(page.locator('.stat-value')).toHaveText(['1 750 Kč', '3', '1 500 Kč']);
    await expect(page.locator('.recent-card tbody tr')).toHaveCount(4);

    await openDonorSection(page, 'Moje dary');

    await expect(page.locator('.payments-card tbody tr')).toHaveCount(4);
    await expect(page.locator('.payments-card tbody tr').first().locator('td')).toHaveText([
      '15. 3. 2026',
      '500 Kč',
      'Obecný příspěvek',
      'Přijato',
      'Stáhnout PDF, dar z 15. 3. 2026, 500 Kč',
    ]);
    await expect(page.locator('.payments-card tbody tr').last()).toContainText('Vráceno');
    await expect(page.locator('.gift-year-title')).toHaveText(['2026', '2025']);
    await expect(page.locator('.gift-year-sum')).toHaveText([
      '2 dary · 1 500 Kč',
      '1 dar · 250 Kč',
    ]);
    await expect(page.locator('.gift-year').first().locator('.gift-year-note')).toHaveText(
      'Ke stažení od 1. ledna 2027',
    );

    await openDonorSection(page, 'Potvrzení o daru');

    const cells = '.year, .year-count, .year-total, .year-action';
    await expect(page.locator('.year-row').first().locator(cells)).toHaveText([
      '2026',
      '2 dary',
      '1 500 Kč',
      'Ke stažení od 1. ledna 2027',
    ]);
    await expect(page.locator('.year-row').last().locator(cells)).toHaveText([
      '2025',
      '1 dar',
      '250 Kč',
      'Stáhnout potvrzení za rok 2025 (PDF)',
    ]);
  });

  test('when they download the receipt of a completed year, then the browser saves the PDF under the name the server gives', async ({
    page,
  }) => {
    await mockDonorApi(page, withReceipts);
    await signIn(page);
    await openDonorSection(page, 'Potvrzení o daru');

    await expect(page.locator('.yearly-pdf')).toHaveCount(1);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.yearly-pdf').click(),
    ]);

    expect(download.suggestedFilename()).toBe('potvrzeni-o-darech-2025.pdf');
    await expect(page.locator('.yearly-pdf')).toHaveText('Stáhnout potvrzení za rok 2025 (PDF)');
    await expect(page.locator('.year-row').getByRole('status')).toHaveText(
      'Potvrzení potvrzeni-o-darech-2025.pdf je stažené. Najdete ho ve stažených souborech.',
    );
  });

  test('when they open the receipts page during the year, then the gifts of this year are listed there and one receipt downloads from its row', async ({
    page,
  }) => {
    await mockDonorApi(page, withReceipts);
    await signIn(page);
    await openDonorSection(page, 'Potvrzení o daru');

    const rows = page.locator('.single-card tbody tr');
    await expect(rows).toHaveCount(2);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      rows.nth(1).getByRole('button', { name: 'Stáhnout PDF' }).click(),
    ]);

    expect(download.suggestedFilename()).toBe('potvrzeni-o-daru-2026-000001.pdf');
    await expect(rows.nth(1).getByRole('status')).toHaveText(
      'Potvrzení potvrzeni-o-daru-2026-000001.pdf je stažené. Najdete ho ve stažených souborech.',
    );
  });

  test('when they download the receipt of one payment, then the browser saves that PDF and a refunded payment offers none', async ({
    page,
  }) => {
    await mockDonorApi(page, withReceipts);
    await signIn(page);
    await openDonorSection(page, 'Moje dary');

    await expect(
      page.locator('.payments-card tbody tr').last().locator('.download-btn'),
    ).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page
        .locator('.payments-card tbody tr')
        .nth(1)
        .getByRole('button', { name: 'Stáhnout PDF' })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe('potvrzeni-o-daru-2026-000001.pdf');
    await expect(page.locator('.payments-card tbody tr').nth(1).getByRole('status')).toHaveText(
      'Potvrzení potvrzeni-o-daru-2026-000001.pdf je stažené. Najdete ho ve stažených souborech.',
    );
  });

  test('when some gifts arrived before the first receipt year, then those offer no PDF, nor does their year, and lines say from when receipts are issued', async ({
    page,
  }) => {
    await mockDonorApi(page, receiptsFrom2026);
    await signIn(page);
    await openDonorSection(page, 'Moje dary');

    const rows = page.locator('.payments-card tbody tr');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(1).getByRole('button', { name: 'Stáhnout PDF' })).toBeVisible();
    await expect(rows.nth(2)).toContainText('Přijato');
    await expect(rows.nth(2).getByRole('button', { name: 'Stáhnout PDF' })).toHaveCount(0);
    await expect(rows.nth(2)).toContainText('Potvrzení vystavujeme od roku 2026');
    await expect(page.locator('.payments-card .receipts-from')).toHaveText(
      'Potvrzení o daru tu vystavujeme za dary přijaté od 1. ledna 2026, u starších darů proto tlačítko „Stáhnout PDF“ chybí.',
    );

    await openDonorSection(page, 'Potvrzení o daru');

    await expect(page.locator('.yearly-pdf')).toHaveCount(0);
    await expect(page.locator('.year-row').last()).toContainText(
      'Za tento rok potvrzení na webu nevystavujeme',
    );
    await expect(page.locator('.yearly-hint')).toHaveText(
      'Potvrzení za rok tu vystavujeme za dary od roku 2026.',
    );
  });

  test('when no donation has arrived yet, then the overview explains how to send the first gift and the sections stay empty', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);

    await signIn(page);

    await expect(page.locator('.stat-value')).toHaveCount(0);
    await expect(page.locator('.last-gift')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Jak poslat první dar' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Zobrazit číslo účtu a QR kód' })).toHaveCount(0);
    const sendGift = page.getByRole('region', { name: 'Poslat dar' });
    await expect(sendGift.locator('.bank-value')).toHaveText([
      '5544332217/2010',
      '500 Kč',
      '1234567890',
      'CZ26 2010 0000 0055 4433 2217',
    ]);
    await expect(sendGift.getByRole('img', { name: /QR platba/ })).toBeVisible();

    await openDonorSection(page, 'Moje dary');

    await expect(page.locator('.payments-card table')).toHaveCount(0);
    await expect(page.locator('.payments-empty')).toHaveText('Zatím tu není žádný dar.');
    await expect(
      page.getByRole('heading', { level: 3, name: 'Poslali jste dar a nevidíte ho?' }),
    ).toBeVisible();

    await openDonorSection(page, 'Potvrzení o daru');

    await expect(page.locator('.year-row')).toHaveCount(0);
    await expect(page.locator('.yearly-pdf')).toHaveCount(0);
  });

  test('when no donation has arrived yet and they open the standing order guide, then it lists the account and their symbol and leads to the bank accounts for an older symbol', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);
    await signIn(page);

    const toggle = page.getByRole('button', { name: 'Jak nastavit trvalý příkaz' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const guide = page.getByRole('region', { name: 'Jak nastavit trvalý příkaz' });
    await expect(guide.locator('.standing-value')).toHaveText([
      '5544332217/2010',
      '1234567890',
      '500 Kč, nebo jiná, kterou chcete posílat',
      'Každý měsíc, nebo jak často chcete',
    ]);

    await guide.getByRole('link', { name: 'Bankovní účty' }).click();

    await expect(page).toHaveURL(/\/darce\/ucty$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Bankovní účty' })).toBeFocused();
    await expect(page.locator('.accounts-nudge')).toContainText(
      'Posíláte trvalým příkazem s jiným symbolem?',
    );
  });

  test('when they open the standing order guide on a phone, then it sits after the bank details and the opened guide comes into view', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });

    const card = page.locator('.send-gift');
    await expect(card.locator('.bank')).toContainText('5544332217/2010');
    const toggle = card.getByRole('button', { name: 'Jak nastavit trvalý příkaz' });
    await expect
      .poll(async () => {
        const toggleTop = (await toggle.boundingBox())!.y;
        const bankTop = (await card.locator('.bank').boundingBox())!.y;
        const bankAppTop = (await card.locator('.bank-app').boundingBox())!.y;
        return bankTop < toggleTop && toggleTop < bankAppTop;
      })
      .toBe(true);

    await toggle.click();

    await expect(page.getByRole('region', { name: 'Jak nastavit trvalý příkaz' })).toBeInViewport({
      ratio: 0.5,
    });
    await expect(toggle).toBeInViewport();
  });

  test('when no donation has arrived yet and they sent a gift without the symbol, then the overview opens Přidat účet for the account it came from', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);
    await signIn(page);

    await page.getByRole('link', { name: 'Přidat bankovní účet, ze kterého jste platili' }).click();

    await expect(page).toHaveURL(/\/darce\/ucty$/);
    const dialog = page.getByRole('dialog', { name: 'Přidat bankovní účet' });
    await expect(dialog).toBeVisible();
    await dialog.locator('.add-account-close').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Přidat bankovní účet' })).toBeFocused();
  });

  test('when they check for new payments and a gift has arrived, then the page says so and lists it', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);
    let arrived = false;
    await page.route(
      (url) => url.pathname === '/api/donations/me/summary',
      (route) => route.fulfill({ json: arrived ? twoYears.summary : noDonations.summary }),
    );
    await page.route(
      (url) => url.pathname === '/api/donations/me',
      (route) => route.fulfill({ json: arrived ? twoYears.list : noDonations.list }),
    );
    await signIn(page);
    await openDonorSection(page, 'Moje dary');
    await expect(page.locator('.payments-empty')).toBeVisible();

    arrived = true;
    await page.getByRole('button', { name: 'Zkontrolovat nové platby' }).click();

    await expect(
      page.getByRole('status').filter({ hasText: 'Přibyly 3 nové dary.' }),
    ).toBeVisible();
    await expect(page.locator('.payments-card tbody tr')).toHaveCount(4);
  });

  test('when they correct their address, then the details page saves it and shows it as the receipts will', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);
    const patched: unknown[] = [];
    await page.route('**/api/donors/me', async (route) => {
      if (route.request().method() !== 'PATCH') {
        return route.fallback();
      }
      const body = route.request().postDataJSON();
      patched.push({ ifMatch: route.request().headers()['if-match'], body });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...donor, ...body, version: '00000000000000d2' }),
      });
    });

    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    await page.getByRole('button', { name: 'Upravit údaje' }).click();
    await expect(page.getByLabel('Jméno a příjmení')).toBeFocused();
    await page.getByLabel('Ulice a číslo').fill('Krátká 3');
    await page.getByLabel('Jazyk potvrzení').selectOption('en');
    await page.getByRole('button', { name: 'Uložit údaje' }).click();

    await expect(page.locator('.profile-data')).toContainText('Krátká 3, 400 01 Ústí nad Labem');
    await expect(page.locator('.profile-data')).toContainText('angličtina (dvojjazyčné)');
    await expect(page.getByRole('status').filter({ hasText: 'Údaje jsme uložili.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upravit údaje' })).toBeFocused();
    expect(patched).toEqual([
      {
        ifMatch: '"00000000000000d1"',
        body: {
          name: 'Jana Nováková',
          address: { street: 'Krátká 3', city: 'Ústí nad Labem', postalCode: '400 01' },
          preferredLocale: 'en',
        },
      },
    ]);
  });

  test('when they change the password with the current one, then the details page keeps them signed in and says the other sign-ins ended', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);
    const sent: unknown[] = [];
    await page.route('**/api/donors/me/password', async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill(session(200));
    });

    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    await page.getByRole('button', { name: 'Změnit heslo' }).click();
    await expect(page.getByLabel('Současné heslo')).toBeFocused();
    await page.getByLabel('Současné heslo').fill('correct horse battery');
    await page.getByLabel('Nové heslo', { exact: true }).fill('a brand new passphrase');
    await page.getByLabel('Nové heslo znovu').fill('a brand new passphrase');
    await page.getByRole('button', { name: 'Změnit heslo', exact: true }).last().click();

    await expect(page.getByRole('status').filter({ hasText: 'Heslo jsme změnili.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Změnit heslo' })).toBeFocused();
    await expect(page).toHaveURL(/\/darce\/udaje$/);
    expect(sent).toEqual([
      { currentPassword: 'correct horse battery', newPassword: 'a brand new passphrase' },
    ]);
  });

  test('when they ask for a new e-mail, then the details page sends the link and keeps showing the current address until it is confirmed', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);
    const sent: unknown[] = [];
    await page.route('**/api/donors/me/email-change', async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill({ status: 202 });
    });
    await page.route(
      (url) => url.pathname === '/api/donors/me',
      (route) =>
        route.fulfill({
          json: {
            ...donor,
            pendingEmailChange: {
              newEmail: 'jana.nova@example.cz',
              expiresAt: '2026-10-25T10:00:00Z',
            },
          },
        }),
    );

    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    await page.getByRole('button', { name: 'Změnit e-mail' }).click();
    await expect(page.getByLabel('Nový e-mail')).toBeFocused();
    await page.getByLabel('Nový e-mail').fill('jana.nova@example.cz');
    await page.getByLabel('Současné heslo').fill('correct horse battery');
    await page.getByRole('button', { name: 'Poslat potvrzovací odkaz' }).click();

    await expect(
      page.getByRole('status').filter({ hasText: 'Odkaz jsme poslali na jana.nova@example.cz.' }),
    ).toBeVisible();
    await expect(page.locator('.account-email')).toHaveText('jana@example.cz');
    await expect(page.locator('.account-pending-address')).toHaveText(
      'Čeká na potvrzení: jana.nova@example.cz',
    );
    await expect(page.getByRole('button', { name: 'Změnit e-mail' })).toBeFocused();
    expect(sent).toEqual([{ newEmail: 'jana.nova@example.cz', password: 'correct horse battery' }]);
  });

  test('when an e-mail change waits for confirmation, then the details page shows it and the donor can send the link again or cancel the change', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);
    const pending = { newEmail: 'jana.nova@example.cz', expiresAt: '2026-10-21T10:00:00Z' };
    let current: typeof pending | null = pending;
    const calls: string[] = [];
    await page.route('**/api/donors/me/email-change/resend', async (route) => {
      calls.push('resend');
      current = { ...pending, expiresAt: '2026-10-21T11:00:00Z' };
      await route.fulfill({ status: 202 });
    });
    await page.route('**/api/donors/me/email-change', async (route) => {
      calls.push(route.request().method());
      current = null;
      await route.fulfill({ status: 204 });
    });
    await page.route(
      (url) => url.pathname === '/api/donors/me',
      (route) => route.fulfill({ json: { ...donor, pendingEmailChange: current } }),
    );

    await signIn(page, { ...donor, pendingEmailChange: pending });
    await openDonorSection(page, 'Údaje a zabezpečení');
    const row = page.locator('.account-row').filter({ hasText: 'Čeká na potvrzení' });
    await expect(row).toContainText('Potvrzovací odkaz platí do 21. 10. 2026 12:00.');

    await row.getByRole('button', { name: 'Poslat znovu potvrzovací odkaz' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Nový potvrzovací odkaz je na cestě.' }),
    ).toBeVisible();
    await expect(row).toContainText('Potvrzovací odkaz platí do 21. 10. 2026 13:00.');

    await row.getByRole('button', { name: 'Zrušit změnu e-mailu' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Změnu e-mailu jsme zrušili.' }),
    ).toBeVisible();
    await expect(page.locator('.account-pending')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Změnit e-mail' })).toBeFocused();
    expect(calls).toEqual(['resend', 'DELETE']);
  });

  test('when the current password is wrong, then the e-mail form stays and shows the reason', async ({
    page,
  }) => {
    await mockDonorApi(page, noDonations);
    await page.route('**/api/donors/me/email-change', (route) =>
      route.fulfill(
        problem(
          400,
          'donors/wrong-password',
          'Nesprávné současné heslo',
          'Zadejte prosím heslo, kterým se teď přihlašujete.',
        ),
      ),
    );

    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    await page.getByRole('button', { name: 'Změnit e-mail' }).click();
    await page.getByLabel('Nový e-mail').fill('jana.nova@example.cz');
    await page.getByLabel('Současné heslo').fill('wrong horse battery');
    await page.getByRole('button', { name: 'Poslat potvrzovací odkaz' }).click();

    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText(
      'Nesprávné současné heslo. Zadejte prosím heslo, kterým se teď přihlašujete.',
    );
    await expect(page.getByLabel('Nový e-mail')).toHaveValue('jana.nova@example.cz');
  });
});

test.describe('Given a signed-in donor on a computer', () => {
  test('when the window leaves the gift list too narrow for its columns, then each gift is a card and Stáhnout PDF stays on one line inside it', async ({
    page,
  }) => {
    await mockDonorApi(page, withReceipts);
    await signIn(page);
    await openDonorSection(page, 'Moje dary');
    await page.setViewportSize({ width: 1000, height: 800 });

    const card = page.locator('.payments-card');
    await expect(card.locator('thead').first()).toHaveCSS('position', 'absolute');
    const buttons = card.getByRole('button', { name: /^Stáhnout PDF/ });
    await expect(buttons).toHaveCount(3);
    const lines = await buttons.evaluateAll((elements) =>
      elements.map((element) => {
        const range = document.createRange();
        range.selectNodeContents(
          element.querySelector(
            '.pdf-button__layer--current .pdf-button__label:not(.pdf-button__reserve)',
          )!,
        );
        return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
      }),
    );
    expect(lines).toEqual([1, 1, 1]);
    const overflow = await card.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('when the window is as wide as an iPad mini held sideways, then the gifts with a receipt column are cards, so neither the purpose nor the account tag has to wrap', async ({
    page,
  }) => {
    await mockDonorApi(page, withReceipts);
    await signIn(page);
    await openDonorSection(page, 'Moje dary');
    await page.setViewportSize({ width: 1133, height: 744 });

    await expect(page.locator('.payments-card thead').first()).toHaveCSS('position', 'absolute');
  });

  test('when the gifts are cards at a 1180 px window with the larger text of the home-screen app, then each button keeps its whole name and no column label is read twice', async ({
    page,
  }) => {
    await mockDonorApi(page, withReceipts);
    await signIn(page);
    await openDonorSection(page, 'Moje dary');
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.addStyleTag({ content: 'html { font-size: 106.25%; }' });

    const card = page.locator('.payments-card');
    await expect(card.locator('thead').first()).toHaveCSS('position', 'absolute');
    const row = card.locator('tbody tr').first();
    await expect(
      row.getByRole('button', { name: /^Stáhnout PDF\s*, dar z 15\. 3\. 2026, 500\sKč$/ }),
    ).toBeVisible();
    await expect(row.getByRole('cell', { name: 'Obecný příspěvek', exact: true })).toBeVisible();
    await expect(row.getByRole('cell', { name: 'Přijato', exact: true })).toBeVisible();
  });

  test('when the gifts of two years are listed, then their columns start at the same places', async ({
    page,
  }) => {
    await mockDonorApi(page, withReceipts);
    await signIn(page);
    await openDonorSection(page, 'Moje dary');

    const tables = page.locator('.payments-card table');
    await expect(tables).toHaveCount(2);
    const starts = await tables.evaluateAll((elements) =>
      elements.map((table) =>
        Array.from(table.querySelectorAll('thead th')).map((cell) =>
          Math.round(cell.getBoundingClientRect().left),
        ),
      ),
    );
    expect(starts[1]).toEqual(starts[0]);
  });

  test('when the browser shows text twice as large, then no year of the yearly receipts runs into its count of gifts', async ({
    page,
  }) => {
    await mockDonorApi(page, withReceipts);
    await signIn(page);
    await openDonorSection(page, 'Potvrzení o daru');
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await expect(page.locator('.year-row')).toHaveCount(2);

    const overlaps = await page.locator('.year-row').evaluateAll((rows) =>
      rows.flatMap((row) => {
        const textBox = (selector: string) => {
          const range = document.createRange();
          range.selectNodeContents(row.querySelector(selector)!);
          return range.getBoundingClientRect();
        };
        const year = textBox('.year');
        const count = textBox('.year-count');
        const apart =
          year.right <= count.left ||
          count.right <= year.left ||
          year.bottom <= count.top ||
          count.bottom <= year.top;
        return apart ? [] : [row.querySelector('.year')!.textContent!.trim()];
      }),
    );
    expect(overlaps).toEqual([]);
  });

  const PDF_PLACES = [
    {
      name: 'a gift in the table of Moje dary',
      statusAfterButton: true,
      section: 'Moje dary',
      wrappedStatus: 'beside',
      row: (page: Page) => page.locator('.payments-card tbody tr').first(),
      button: (row: Locator) => row.locator('.download-btn'),
    },
    {
      name: 'a year on Moje dary',
      statusAfterButton: false,
      section: 'Moje dary',
      wrappedStatus: 'beside',
      row: (page: Page) => page.locator('.gift-year-head').last(),
      button: (row: Locator) => row.locator('.yearly-pdf'),
    },
    {
      name: 'a year on Potvrzení o daru',
      statusAfterButton: false,
      section: 'Potvrzení o daru',
      wrappedStatus: 'beside',
      row: (page: Page) => page.locator('.year-row').last(),
      button: (row: Locator) => row.locator('.yearly-pdf'),
    },
    {
      name: 'the ready receipt on Můj přehled',
      statusAfterButton: true,
      section: 'Můj přehled',
      wrappedStatus: 'below',
      row: (page: Page) => page.locator('.receipt-ready'),
      button: (row: Locator) => row.locator('.receipt-ready-pdf'),
    },
  ];

  async function placement(row: Locator, button: Locator): Promise<number[]> {
    const rowBox = (await row.boundingBox())!;
    const buttonBox = (await button.boundingBox())!;
    return [rowBox.height, buttonBox.x, buttonBox.y, buttonBox.width].map((value) =>
      Math.round(value),
    );
  }

  for (const place of PDF_PLACES) {
    test(`when the PDF of ${place.name} takes long to prepare, then the button stays put, the row keeps its height or the status opens under it, and Tab meets Zrušit in the order it is seen`, async ({
      page,
    }) => {
      await mockDonorApi(page, receiptDonations);
      await page.clock.install();
      await page.route(
        (url) => url.pathname === RECEIPT_ISSUING_URL,
        () => new Promise<void>(() => undefined),
      );
      await openReceiptsAfterSignIn(page);
      await openDonorSection(page, place.section);
      const row = place.row(page);
      const button = place.button(row);
      await expect(button).toBeVisible();
      const resting = await placement(row, button);

      const kept = (values: number[]) => (place.statusAfterButton ? values.slice(1) : values);

      await button.click();
      const status = row.getByRole('status');
      await expect(status).toHaveText('Připravujeme údaje potvrzení…');
      expect(kept(await placement(row, button))).toEqual(kept(resting));

      await page.clock.fastForward(8000);
      const cancel = row.getByRole('button', { name: 'Zrušit' });
      await expect(cancel).toBeVisible();
      expect(kept(await placement(row, button))).toEqual(kept(resting));

      if (place.statusAfterButton) {
        const buttonBox = (await button.boundingBox())!;
        expect((await status.boundingBox())!.y).toBeGreaterThanOrEqual(
          buttonBox.y + buttonBox.height,
        );
        await button.focus();
        await page.keyboard.press('Tab');
        await expect(cancel).toBeFocused();
      } else {
        await cancel.focus();
        await page.keyboard.press('Tab');
        await expect(button).toBeFocused();
      }
    });

    test(`when the PDF of ${place.name} waits for the second tap, then its row keeps its height and the button stays put`, async ({
      page,
    }) => {
      await pretendIphoneThatShares(page);
      await mockDonorApi(page, receiptDonations);
      await page.route(
        (url) => url.pathname === RECEIPT_ISSUING_URL,
        (route) => answerReceiptIssuing(route, ISSUING),
      );
      await openReceiptsAfterSignIn(page);
      await openDonorSection(page, place.section);
      const row = place.row(page);
      const button = place.button(row);
      await expect(button).toBeVisible();
      const resting = await placement(row, button);

      await button.click();
      await expect(button).toHaveText(/^Otevřít/);
      await expect(row.locator('.pdf-progress__brief')).toHaveAttribute(
        'data-brief',
        'PDF je připravené',
      );
      const ready = await placement(row, button);
      const settled = (values: number[]) =>
        place.statusAfterButton
          ? [values[1] + values[3], values[2]]
          : [values[0], values[1] + values[3], values[2]];
      expect(settled(ready)).toEqual(settled(resting));
    });
  }

  for (const place of PDF_PLACES.filter(
    (each) => each.name !== 'a gift in the table of Moje dary',
  )) {
    test(`when the window wraps ${place.name} and its PDF takes long, then the button keeps the right edge with Zrušit beside or under it and Tab meets Zrušit in the order it is seen`, async ({
      page,
    }) => {
      await mockDonorApi(page, receiptDonations);
      await page.clock.install();
      await page.route(
        (url) => url.pathname === RECEIPT_ISSUING_URL,
        () => new Promise<void>(() => undefined),
      );
      await page.setViewportSize({ width: 900, height: 800 });
      await openReceiptsAfterSignIn(page);
      await openDonorSection(page, place.section);
      const row = place.row(page);
      const button = place.button(row);
      await expect(button).toBeVisible();
      const contentEnd = await row.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return Math.round(
          box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
        );
      });

      await button.click();
      await expect(row.getByRole('status')).toHaveText('Připravujeme údaje potvrzení…');
      await page.clock.fastForward(8000);
      const cancel = row.getByRole('button', { name: 'Zrušit' });
      await expect(cancel).toBeVisible();
      const buttonBox = (await button.boundingBox())!;
      const cancelBox = (await cancel.boundingBox())!;
      expect(Math.round(buttonBox.x + buttonBox.width)).toBe(contentEnd);
      if (place.wrappedStatus === 'beside') {
        expect(cancelBox.x + cancelBox.width).toBeLessThanOrEqual(buttonBox.x);
      } else {
        expect(cancelBox.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height);
      }

      if (place.statusAfterButton) {
        await button.focus();
        await page.keyboard.press('Tab');
        await expect(cancel).toBeFocused();
      } else {
        await cancel.focus();
        await page.keyboard.press('Tab');
        await expect(button).toBeFocused();
      }
    });
  }

  test('when the text is twice as large on an iPad held sideways, then the ready receipt on Můj přehled keeps its button text on one line', async ({
    page,
  }) => {
    await mockDonorApi(page, receiptDonations);
    await page.setViewportSize({ width: 1194, height: 834 });
    await openReceiptsAfterSignIn(page);
    await openDonorSection(page, 'Můj přehled');
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });

    const label = page.locator(
      '.receipt-ready-pdf .pdf-button__layer--current .pdf-button__label:not(.pdf-button__reserve)',
    );
    await expect(label).toHaveText('Stáhnout potvrzení za rok 2025 (PDF)');
    const lines = await label.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
    });
    expect(lines).toBe(1);
  });

  test('when the gifts are cards in a 900 px window, then the date, the purpose and the account tag keep whole words inside their column', async ({
    page,
  }) => {
    await mockDonorApi(page, donorWithDonations);
    await signIn(page);
    await openDonorSection(page, 'Moje dary');
    await page.setViewportSize({ width: 900, height: 800 });

    const card = page.locator('.payments-card');
    await expect(card.locator('thead').first()).toHaveCSS('position', 'absolute');
    await expect(card.locator('.pairing-tag').first()).toBeVisible();
    const problems = await card.locator('tbody tr').evaluateAll((rows) =>
      rows.flatMap((row) => {
        const found: string[] = [];
        const rowBox = row.getBoundingClientRect();
        const cell = row.querySelector('td.purpose-cell')!.getBoundingClientRect();
        const texts = [
          row.querySelector('td.date'),
          row.querySelector('.purpose > span'),
          row.querySelector('.pairing-tag [aria-hidden="true"]'),
        ].filter((element): element is Element => element !== null);
        for (const element of texts) {
          const content = element.textContent ?? '';
          const box = element.getBoundingClientRect();
          if (box.right > rowBox.right + 0.5 || box.left < rowBox.left - 0.5) {
            found.push(`outside the card: ${content.trim()}`);
          }
          if (element.closest('td.purpose-cell') && box.right > cell.right + 0.5) {
            found.push(`outside its column: ${content.trim()}`);
          }
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            for (const match of (node.textContent ?? '').matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(node, match.index);
              range.setEnd(node, match.index + match[0].length);
              const lines = new Set(
                Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)),
              );
              if (lines.size > 1) {
                found.push(`split word: ${match[0]}`);
              }
            }
          }
        }
        return found;
      }),
    );
    expect(problems).toEqual([]);
  });

  for (const { width, textSize, wraps } of [
    { width: 1194, textSize: '100 %', wraps: false },
    { width: 1194, textSize: '200 %', wraps: true },
    { width: 1280, textSize: '100 %', wraps: false },
  ]) {
    test(`when the ready receipt on Můj přehled shows in a ${width} px window with text at ${textSize}, then its button ends at the card's edge, ${wraps ? 'under the title with no empty strip above it' : 'beside the title on its axis with the card no taller than that row'}`, async ({
      page,
    }) => {
      await mockDonorApi(page, receiptDonations);
      await page.setViewportSize({ width, height: 834 });
      await openReceiptsAfterSignIn(page);
      await openDonorSection(page, 'Můj přehled');
      if (textSize === '200 %') {
        await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      }
      const card = page.locator('.receipt-ready');
      await expect(card.locator('.receipt-ready-pdf')).toBeVisible();

      const layout = await card.evaluate((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const heading = element.querySelector('.ui-card__title')!;
        const title = heading.getBoundingClientRect();
        const titleEnd = title.bottom + parseFloat(getComputedStyle(heading).marginBottom);
        const button = element.querySelector('.receipt-ready-pdf')!.getBoundingClientRect();
        const rowHeight = Math.max(title.height, button.height);
        return {
          cardHeight: Math.round(box.height),
          rowWithPadding: Math.round(
            rowHeight +
              parseFloat(style.paddingTop) +
              parseFloat(style.paddingBottom) +
              parseFloat(style.borderTopWidth) +
              parseFloat(style.borderBottomWidth),
          ),
          axisOffset: Math.abs((button.top + button.bottom) / 2 - (title.top + title.bottom) / 2),
          contentEnd: Math.round(
            box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
          ),
          buttonEnd: Math.round(button.right),
          wrapped: button.top >= title.bottom,
          gapAbove: Math.round(button.top - titleEnd),
          rowGap: Math.round(
            parseFloat(style.rowGap) +
              parseFloat(
                getComputedStyle(element.querySelector('.receipt-ready-action')!).marginTop,
              ),
          ),
        };
      });
      expect(layout.buttonEnd).toBe(layout.contentEnd);
      expect(layout.wrapped).toBe(wraps);
      if (wraps) {
        expect(layout.gapAbove).toBeLessThanOrEqual(layout.rowGap);
      } else {
        expect(layout.axisOffset).toBeLessThanOrEqual(2);
        expect(layout.cardHeight).toBeLessThanOrEqual(layout.rowWithPadding + 1);
      }
    });
  }

  test('when the ready receipt on Můj přehled shows on a 390 px phone, then only the card padding stands under its button until the status text opens the line', async ({
    page,
  }) => {
    await mockDonorApi(page, receiptDonations);
    await page.clock.install();
    await page.route(
      (url) => url.pathname === RECEIPT_ISSUING_URL,
      () => new Promise<void>(() => undefined),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await openReceiptsAfterSignIn(page);
    await page.goto('/darce/prehled');
    const card = page.locator('.receipt-ready');
    const button = card.locator('.receipt-ready-pdf');
    await expect(button).toBeVisible();

    const spaceUnder = () =>
      card.evaluate((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const pdf = element.querySelector('.receipt-ready-pdf')!.getBoundingClientRect();
        return {
          under: Math.round(box.bottom - parseFloat(style.borderBottomWidth) - pdf.bottom),
          padding: Math.round(parseFloat(style.paddingBottom)),
        };
      });
    const resting = await spaceUnder();
    expect(resting.under).toBe(resting.padding);

    await button.click();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    const beforeText = await card.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const pdf = element.querySelector('.receipt-ready-pdf')!.getBoundingClientRect();
      return {
        text: element.querySelector('[role="status"]')!.textContent!.trim(),
        closing: element
          .querySelector('.receipt-status')!
          .classList.contains('receipt-status--closing'),
        under: Math.round(box.bottom - parseFloat(style.borderBottomWidth) - pdf.bottom),
      };
    });
    expect(beforeText.closing).toBe(beforeText.text === '');
    if (beforeText.text === '') {
      expect(beforeText.under).toBe(resting.under);
    }

    await page.clock.runFor(300);
    await expect(card.getByRole('status')).toHaveText('Připravujeme údaje potvrzení…');
    const status = (await card.getByRole('status').boundingBox())!;
    expect(status.height).toBeGreaterThan(0);
    await expect.poll(async () => (await spaceUnder()).under).toBeGreaterThan(resting.padding);
  });

  for (const width of [1280, 1000]) {
    test(`when the gifts of Moje dary show in a ${width} px window, then each account tag stays on one line and the card does not overflow`, async ({
      page,
    }) => {
      await mockDonorApi(page, donorWithDonations);
      await signIn(page);
      await openDonorSection(page, 'Moje dary');
      await page.setViewportSize({ width, height: 800 });

      const card = page.locator('.payments-card');
      const tags = card.locator('.pairing-tag [aria-hidden="true"]');
      await expect(tags.first()).toBeVisible();
      const lines = await tags.evaluateAll((elements) =>
        elements.map((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)))
            .size;
        }),
      );
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every((count) => count === 1)).toBe(true);
      const overflow = await card.evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  for (const width of [1280, 390]) {
    test(`when the status of the ready receipt on Můj přehled appears in a ${width} px window, then its line opens by the shared expand`, async ({
      page,
    }) => {
      await mockDonorApi(page, receiptDonations);
      await page.clock.install();
      await page.route(
        (url) => url.pathname === RECEIPT_ISSUING_URL,
        () => new Promise<void>(() => undefined),
      );
      await page.setViewportSize({ width, height: 844 });
      await openReceiptsAfterSignIn(page);
      await page.goto('/darce/prehled');
      const button = page.locator('.receipt-ready-pdf');
      await expect(button).toBeVisible();
      await expect(page.locator('.receipt-ready .receipt-status')).toHaveClass(
        /receipt-status--closing/,
      );

      const opening = page.evaluate(
        () =>
          new Promise<string[]>((resolve) => {
            const wrapper = document.querySelector('.receipt-ready .receipt-status')!;
            const line = wrapper.querySelector('[role="status"]')!;
            new MutationObserver((_, observer) => {
              if (!line.textContent?.trim()) {
                return;
              }
              observer.disconnect();
              resolve(
                wrapper
                  .getAnimations()
                  .map((animation) => (animation as CSSTransition).transitionProperty ?? ''),
              );
            }).observe(line, { childList: true, subtree: true, characterData: true });
          }),
      );
      await button.click();
      await expect(button).toHaveAttribute('aria-busy', 'true');
      await page.clock.runFor(300);
      expect(await opening).toContain('grid-template-rows');
      await expect(page.locator('.receipt-ready .receipt-status')).not.toHaveClass(
        /receipt-status--closing/,
      );
    });
  }
});
