import { Page } from '@playwright/test';
import { donationItem, DonorApiMock } from './donor-session';
import { expect } from './fixtures';

type Gift = ReturnType<typeof donationItem>;

export const VERIFICATION_TAG_WIDTHS = [1000, 1180, 1280] as const;

function gift(
  number: number,
  receivedAt: string,
  amountMinor: number,
  overrides: Record<string, unknown> = {},
): Gift {
  return donationItem({
    id: `0192f0f1-0000-7000-8000-${String(number).padStart(12, '0')}`,
    receivedAt,
    amountMinor,
    ...overrides,
  });
}

function giftsOf(items: readonly Gift[]): DonorApiMock {
  const years = [...new Set(items.map((item) => Number(item.receivedAt.slice(0, 4))))];
  const totalOf = (gifts: readonly Gift[]) =>
    gifts.reduce((sum, item) => sum + item.amountMinor, 0);
  const totalAmountMinor = totalOf(items);
  return {
    summary: {
      totalAmountMinor,
      currency: 'CZK',
      count: items.length,
      lastReceivedAt: items[0].receivedAt,
      byYear: years.map((year) => {
        const ofYear = items.filter((item) => item.receivedAt.startsWith(`${year}-`));
        return { year, count: ofYear.length, totalAmountMinor: totalOf(ofYear) };
      }),
      yearlyReceiptsAvailableThrough: 2025,
      receiptsAvailableFrom: 2025,
    },
    list: { items, totalAmountMinor, currency: 'CZK', count: items.length },
  };
}

function verificationBeside(widest: Gift): DonorApiMock {
  return giftsOf([
    gift(4, '2026-03-15', 50000),
    gift(3, '2026-02-10', 100, {
      accountVerification: true,
      receiptAvailable: false,
      pairedBy: 'SENDER_ACCOUNT',
      senderAccount: '19-2000145399/0800',
    }),
    widest,
    gift(1, '2024-06-20', 30000, { receiptAvailable: false }),
  ]);
}

export const VERIFICATION_BESIDE_WIDEST_AMOUNTS = [
  {
    name: 'a gift of 999 999 Kč, the widest amount of the ordinary column',
    gifts: verificationBeside(gift(2, '2025-06-10', 99999900)),
    widest: /^999\s999\sKč$/,
  },
  {
    name: 'a gift of 1 000 000 Kč, the largest the payment accepts',
    gifts: verificationBeside(gift(2, '2025-06-10', 100000000)),
    widest: /^1\s000\s000\sKč$/,
  },
] as const;

export async function expectVerificationNoteUnderItsGiftInAlignedYears(
  page: Page,
  widest: RegExp,
): Promise<void> {
  const card = page.locator('.payments-card');
  await expect(card.locator('table')).toHaveCount(3);
  await expect(card.locator('td.amount').filter({ hasText: widest })).toHaveCount(1);
  const tag = card.locator('td.date .verification-tag', { hasText: 'Ověření účtu' });
  await expect(tag).toBeVisible();

  const placed = await tag.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const lines = new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)))
      .size;
    const row = element.closest('tr')!;
    const cell = element.closest('td')!;
    const own = element.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    const dateTextStart =
      cell.getBoundingClientRect().left + parseFloat(getComputedStyle(cell).paddingLeft);
    const shown = (node: Node) =>
      !element.contains(node) && !node.parentElement?.closest('.visually-hidden');
    const bottoms: number[] = [];
    const texts = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let node = texts.nextNode(); node; node = texts.nextNode()) {
      if (node.textContent!.trim() && shown(node)) {
        const text = document.createRange();
        text.selectNodeContents(node);
        bottoms.push(...Array.from(text.getClientRects()).map((rect) => rect.bottom));
      }
    }
    row.querySelectorAll('.ui-badge, .pairing-tag, button').forEach((box) => {
      if (shown(box)) {
        bottoms.push(box.getBoundingClientRect().bottom);
      }
    });
    return {
      lines,
      startsAtTheDateText: Math.abs(own.left - dateTextStart) <= 0.5,
      underTheWholeRow: own.top >= Math.max(...bottoms) - 0.5,
      insideItsRow:
        own.top >= rowBox.top && own.bottom <= rowBox.bottom + 0.5 && own.right <= rowBox.right,
    };
  });
  expect(placed).toEqual({
    lines: 1,
    startsAtTheDateText: true,
    underTheWholeRow: true,
    insideItsRow: true,
  });

  const amountsOutside = await card.locator('td.amount').evaluateAll((cells) =>
    cells
      .filter((cell) => {
        const box = cell.getBoundingClientRect();
        const style = getComputedStyle(cell);
        const amount = cell.querySelector('.ui-amount')!.getBoundingClientRect();
        return (
          amount.left < box.left + parseFloat(style.paddingLeft) - 0.5 ||
          amount.right > box.right - parseFloat(style.paddingRight) + 0.5
        );
      })
      .map((cell) => cell.textContent!.trim()),
  );
  expect(amountsOutside).toEqual([]);

  const starts = await card.locator('table').evaluateAll((tables) =>
    tables.map((table) =>
      Array.from(table.querySelectorAll('thead th'))
        .map((heading) => Math.round(heading.getBoundingClientRect().left))
        .join(' '),
    ),
  );
  expect(new Set(starts).size).toBe(1);
}
