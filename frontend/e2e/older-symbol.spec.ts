import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  bankAccountItem,
  donationItem,
  mockDonorApi,
  openDonorSection,
  signIn,
} from './donor-session';

const ACCOUNT_ID = '0192f0c4-0000-7000-8000-000000000001';
const ACCOUNT = '19-2000145399/0800';
const SYMBOL = '6123456789';
const ACTIVE_HINT = 'Platby bez variabilního symbolu z něj vám přiřazujeme automaticky.';

const verification = donationItem({
  id: '0192f0f1-0000-7000-8000-000000000002',
  receivedAt: '2027-01-12',
  amountMinor: 100,
  purpose: 'Ověření účtu',
});

const earlierGift = donationItem({
  id: '0192f0f1-0000-7000-8000-000000000001',
  receivedAt: '2026-06-10',
  amountMinor: 50000,
});

const confirmedGifts = ['2027-01-05', '2026-12-05', '2026-11-05'].map((receivedAt, index) =>
  donationItem({
    id: `0192f0f1-0000-7000-8000-00000000001${index}`,
    receivedAt,
    amountMinor: 30000,
    pairedBy: 'CONFIRMED_SYMBOL',
    senderAccount: ACCOUNT,
    confirmedSymbol: SYMBOL,
  }),
);

function overview(items: ReturnType<typeof donationItem>[]) {
  const total = items.reduce((sum, item) => sum + item.amountMinor, 0);
  const years = [...new Set(items.map((item) => Number(item.receivedAt.slice(0, 4))))].sort(
    (a, b) => b - a,
  );
  return {
    summary: {
      totalAmountMinor: total,
      currency: 'CZK',
      count: items.length,
      lastReceivedAt: items[0].receivedAt,
      byYear: years.map((year) => {
        const ofYear = items.filter((item) => item.receivedAt.startsWith(`${year}`));
        return {
          year,
          count: ofYear.length,
          totalAmountMinor: ofYear.reduce((sum, item) => sum + item.amountMinor, 0),
        };
      }),
      yearlyReceiptsAvailableThrough: 2026,
      receiptsAvailableFrom: 2026,
    },
    list: { items, totalAmountMinor: total, currency: 'CZK', count: items.length },
  };
}

const beforeAnswer = overview([verification, earlierGift]);
const afterConfirmation = overview([
  verification,
  confirmedGifts[0],
  confirmedGifts[1],
  confirmedGifts[2],
  earlierGift,
]);

interface Answers {
  posted: { path: string; body: unknown }[];
  overviewLoads: number;
}

async function askAboutAnOlderSymbol(page: Page): Promise<Answers> {
  const answers: Answers = { posted: [], overviewLoads: 0 };
  let answer: 'confirm' | 'decline' | null = null;
  await mockDonorApi(page, beforeAnswer);
  await page.route(
    (url) => url.pathname === '/api/donations/me/summary',
    (route) =>
      route.fulfill({ json: (answer === 'confirm' ? afterConfirmation : beforeAnswer).summary }),
  );
  await page.route(
    (url) => url.pathname === '/api/donations/me',
    (route) => {
      answers.overviewLoads++;
      return route.fulfill({
        json: (answer === 'confirm' ? afterConfirmation : beforeAnswer).list,
      });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/donations/me/bank-accounts',
    (route) =>
      route.fulfill({
        json: {
          items: [
            bankAccountItem({
              id: ACCOUNT_ID,
              accountNumber: ACCOUNT,
              verifiedOn: '2027-01-12',
              verificationPaymentOn: '2027-01-12',
              donationCount: 0,
              symbolOffer:
                answer === null
                  ? {
                      variableSymbol: SYMBOL,
                      paymentCount: 3,
                      firstMonth: '2026-11',
                      lastMonth: '2027-01',
                    }
                  : null,
              confirmedSymbols: answer === 'confirm' ? [SYMBOL] : [],
            }),
          ],
        },
      }),
  );
  await page.route(
    (url) => url.pathname.startsWith(`/api/donations/me/bank-accounts/${ACCOUNT_ID}/symbol-claim/`),
    (route) => {
      const path = new URL(route.request().url()).pathname;
      answers.posted.push({ path, body: route.request().postDataJSON() });
      if (path.endsWith('/confirm')) {
        answer = 'confirm';
        return route.fulfill({ json: { pairedCount: 3, changedYearlyReceipts: [2026] } });
      }
      answer = 'decline';
      return route.fulfill({ status: 204 });
    },
  );
  return answers;
}

test.describe('Given a signed-in donor whose verified account sent payments with an older symbol', () => {
  test('when they answer that the payments are theirs, then the row says so, the status names the payments and the changed receipt, and the payments carry the symbol', async ({
    page,
  }) => {
    const answers = await askAboutAnOlderSymbol(page);
    await signIn(page);
    await openDonorSection(page, 'Bankovní účty');
    const question = page.getByRole('group', {
      name: /Z tohoto účtu k nám chodí i platby s variabilním symbolem/,
    });
    await expect(question).toContainText(
      `Z tohoto účtu k nám chodí i platby s variabilním symbolem ${SYMBOL} (3 platby, listopad 2026 – leden 2027). Jsou to dary od vás (Jana Nováková)?`,
    );

    await question.getByRole('button', { name: 'Ano, jsou moje' }).click();

    await expect(page.locator('.accounts-status')).toHaveText(
      `Přiřadili jsme vám 3 platby s VS ${SYMBOL} z účtu ${ACCOUNT}. Potvrzení za rok 2026 se změnilo, stáhněte si nové.`,
    );
    expect(answers.posted).toEqual([
      {
        path: `/api/donations/me/bank-accounts/${ACCOUNT_ID}/symbol-claim/confirm`,
        body: { variableSymbol: SYMBOL },
      },
    ]);
    await expect(question).toHaveCount(0);
    await expect(page.locator('.accounts-list .account-hint')).toHaveText([
      ACTIVE_HINT,
      `Platby s VS ${SYMBOL} z tohoto účtu jste potvrdili jako své a přiřazujeme vám je stejně jako platby bez VS.`,
    ]);
    await expect(page.getByRole('heading', { name: 'Moje bankovní účty' })).toBeFocused();

    await openDonorSection(page, 'Moje dary');

    await expect(page.locator('.payments-card tbody tr')).toHaveCount(5);
    await expect(page.locator('.payments-card .pairing-tag [aria-hidden="true"]')).toHaveText([
      `VS ${SYMBOL} · …5399/0800`,
      `VS ${SYMBOL} · …5399/0800`,
      `VS ${SYMBOL} · …5399/0800`,
    ]);

    await openDonorSection(page, 'Přehled');

    await expect(page.locator('.stat-value').first()).toHaveText('1 401 Kč');
  });

  test('when they answer that the payments are not theirs, then the question disappears, the status says they stay unassigned and the payments do not change', async ({
    page,
  }) => {
    const answers = await askAboutAnOlderSymbol(page);
    await signIn(page);
    await openDonorSection(page, 'Bankovní účty');
    const question = page.getByRole('group', {
      name: /Z tohoto účtu k nám chodí i platby s variabilním symbolem/,
    });
    await expect(question).toBeVisible();

    await question.getByRole('button', { name: 'Ne, nejsou moje' }).click();

    await expect(page.locator('.accounts-status')).toHaveText(
      `Odpověď jsme uložili. Platby s VS ${SYMBOL} z účtu ${ACCOUNT} vám nepřiřadíme.`,
    );
    expect(answers.posted).toEqual([
      {
        path: `/api/donations/me/bank-accounts/${ACCOUNT_ID}/symbol-claim/decline`,
        body: { variableSymbol: SYMBOL },
      },
    ]);
    await expect(question).toHaveCount(0);
    await expect(page.locator('.accounts-list .account-hint')).toHaveText([ACTIVE_HINT]);

    await openDonorSection(page, 'Moje dary');

    await expect(page.locator('.payments-card tbody tr')).toHaveCount(2);
    await expect(page.locator('.pairing-tag')).toHaveCount(0);
    expect(answers.overviewLoads).toBe(1);
  });
});
