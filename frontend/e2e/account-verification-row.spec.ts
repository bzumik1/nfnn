import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { donationItem, mockDonorApi, openDonorSection, signIn } from './donor-session';

const verification = donationItem({
  id: '0192f0f1-0000-7000-8000-000000000002',
  receivedAt: '2026-03-20',
  amountMinor: 100,
  purpose: 'Ověření účtu',
  accountVerification: true,
  receiptAvailable: false,
});

const gift = donationItem({
  id: '0192f0f1-0000-7000-8000-000000000001',
  receivedAt: '2026-03-15',
  amountMinor: 50000,
});

const giftAndVerification = {
  summary: {
    totalAmountMinor: 50100,
    currency: 'CZK',
    count: 2,
    lastReceivedAt: '2026-03-20',
    byYear: [{ year: 2026, count: 2, totalAmountMinor: 50100 }],
    yearlyReceiptsAvailableThrough: 2025,
    receiptsAvailableFrom: 2026,
  },
  list: {
    items: [verification, gift],
    totalAmountMinor: 50100,
    currency: 'CZK',
    count: 2,
  },
};

const LISTS = [
  { name: 'Poslední dary', section: null, card: '.recent-card' },
  { name: 'Moje dary', section: 'Moje dary', card: '.payments-card' },
] as const;

const LAYOUTS = [
  { name: 'a table', width: 1280 },
  { name: 'rows', width: 390 },
] as const;

function rowsOf(page: Page, card: string): Locator {
  return page.locator(card).locator('tbody tr, .donation-rows > li');
}

function amountOf(row: Locator): Locator {
  return row.locator('td.amount, .donation-amount');
}

async function amountLook(row: Locator) {
  return amountOf(row).evaluate((amount) => {
    const style = getComputedStyle(amount);
    return {
      fontWeight: style.fontWeight,
      color: style.color,
      fontVariantNumeric: style.fontVariantNumeric,
    };
  });
}

async function openList(page: Page, list: (typeof LISTS)[number], width: number) {
  await mockDonorApi(page, giftAndVerification);
  await signIn(page);
  await page.setViewportSize({ width, height: 900 });
  if (list.section) {
    await openDonorSection(page, list.section);
  }
  const rows = rowsOf(page, list.card);
  await expect(rows).toHaveCount(2);
  return { verificationRow: rows.first(), giftRow: rows.last() };
}

test.describe('Given a donor whose account verification of 1 Kč arrived beside a gift', () => {
  for (const list of LISTS) {
    for (const layout of LAYOUTS) {
      test(`when ${list.name} shows them as ${layout.name}, then the verification amount looks like the gift's and the badge Ověření účtu is read before it`, async ({
        page,
      }) => {
        const { verificationRow, giftRow } = await openList(page, list, layout.width);

        await expect(amountOf(verificationRow)).toHaveText('1 Kč');
        expect(await amountLook(verificationRow)).toEqual(await amountLook(giftRow));

        const badge = verificationRow.locator('.ui-badge', { hasText: 'Ověření účtu' });
        await expect(badge).toBeVisible();
        await expect(badge).toHaveText('Ověření účtu');
        await expect(verificationRow).toContainText('Ověření účtu');
        expect(await badge.evaluate((element) => element.closest('[aria-hidden]'))).toBeNull();
        expect(
          await verificationRow.evaluate((row) => {
            const badgeElement = row.querySelector('.ui-badge');
            const amount = row.querySelector('td.amount, .donation-amount');
            return Boolean(
              badgeElement &&
              amount &&
              badgeElement.compareDocumentPosition(amount) & Node.DOCUMENT_POSITION_FOLLOWING,
            );
          }),
        ).toBe(true);
        expect((await verificationRow.textContent())?.match(/Ověření účtu/g)).toHaveLength(1);
        if (layout.width === 1280) {
          await expect(verificationRow).toHaveAccessibleName(/2026\s+Ověření účtu\s+1\s*Kč/);
        }
        await expect(giftRow.locator('.ui-badge', { hasText: 'Ověření účtu' })).toHaveCount(0);
      });
    }

    test(`when ${list.name} shows in forced colours, then the badge Ověření účtu keeps a border`, async ({
      page,
    }) => {
      const { verificationRow } = await openList(page, list, 390);

      await page.emulateMedia({ forcedColors: 'active' });

      const badge = verificationRow.locator('.ui-badge', { hasText: 'Ověření účtu' });
      await expect
        .poll(() =>
          badge.evaluate((element) => {
            const style = getComputedStyle(element);
            return style.borderTopStyle !== 'none' && parseFloat(style.borderTopWidth) > 0;
          }),
        )
        .toBe(true);
    });
  }
});

const newerGift = donationItem({
  id: '0192f0f1-0000-7000-8000-000000000003',
  receivedAt: '2026-03-25',
  amountMinor: 20000,
});

const giftsAroundVerification = {
  summary: {
    ...giftAndVerification.summary,
    totalAmountMinor: 70100,
    count: 3,
    lastReceivedAt: '2026-03-25',
    byYear: [{ year: 2026, count: 3, totalAmountMinor: 70100 }],
  },
  list: {
    ...giftAndVerification.list,
    items: [newerGift, verification, gift],
    totalAmountMinor: 70100,
    count: 3,
  },
};

test.describe('Given a donor whose account verification of 1 Kč stands between two gifts', () => {
  test('when Moje dary shows them as rows on a phone, then the row with Stáhnout PDF and the row with its note end as far from the next row', async ({
    page,
  }) => {
    await mockDonorApi(page, giftsAroundVerification);
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await openDonorSection(page, 'Moje dary');
    const rows = rowsOf(page, '.payments-card');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).locator('.download-btn')).toBeVisible();
    await expect(rows.nth(1).locator('.receipt-note')).toHaveText(
      'Započítá se do ročního potvrzení',
    );

    const spaceBelow = (index: number) =>
      rows.nth(index).evaluate((row) => {
        const shownParts = row.querySelectorAll(
          '.ui-list__title, .ui-list__meta, .ui-list__value, .ui-list__state, .download-btn, .receipt-note',
        );
        const lastBottom = Math.max(
          ...Array.from(shownParts, (part) => part.getBoundingClientRect().bottom),
        );
        const nextTop = row.nextElementSibling?.getBoundingClientRect().top ?? Number.NaN;
        return nextTop - lastBottom;
      });

    const belowGift = await spaceBelow(0);
    const belowVerification = await spaceBelow(1);
    expect(Math.abs(belowGift - belowVerification)).toBeLessThanOrEqual(1);
  });
});
