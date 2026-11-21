import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  donationItem,
  donor,
  DonorApiMock,
  donorSyncOf,
  mockDonorApi,
  openDonorSection,
  rememberedDonorSession,
  session,
  signIn,
} from './donor-session';
import { donations as receiptDonations, openReceiptsAfterSignIn } from './receipt-donations';
import { RECEIPT_ISSUING_URL } from './receipt-issuing';

type Gift = ReturnType<typeof donationItem>;

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

function donationsOf(items: readonly Gift[]): DonorApiMock {
  const years = [...new Set(items.map((item) => Number(item.receivedAt.slice(0, 4))))];
  const totalOf = (gifts: readonly Gift[]) =>
    gifts.reduce((sum, item) => sum + (item.status === 'RECEIVED' ? item.amountMinor : 0), 0);
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

const LARGE_GIFTS = donationsOf([
  gift(4, '2026-03-15', 125000000),
  gift(3, '2026-02-10', 123450),
  gift(2, '2026-01-05', 50000),
  gift(1, '2025-05-20', 30000),
]);

const NOTES_IN_PLACE_OF_THE_PDF = donationsOf([
  gift(4, '2026-03-15', 50000),
  gift(3, '2026-02-10', 100, { accountVerification: true, receiptAvailable: false }),
  gift(2, '2026-01-05', 30000, { status: 'REFUNDED', receiptAvailable: false }),
  gift(5, '2025-06-10', 40000),
  gift(1, '2024-06-20', 30000, { receiptAvailable: false }),
]);

const YEARLY_RECEIPT_OF_2025 = {
  id: '0192f0f3-0000-7000-8000-000000002025',
  number: '2026-000101',
  kind: 'YEARLY',
  status: 'ACTIVE',
  donationId: null,
  year: 2025,
  issuedAt: '2026-01-15T09:30:00Z',
  receipt: { gifts: [{ receivedOn: '2025-06-10', amountMinor: 40000 }] },
};

async function notesInPlaceOfThePdf(): Promise<DonorApiMock> {
  const gifts = (NOTES_IN_PLACE_OF_THE_PDF.list as { items: Gift[] }).items;
  const received = gifts.filter((item) => item.status === 'RECEIVED');
  return {
    ...NOTES_IN_PLACE_OF_THE_PDF,
    sync: await donorSyncOf(
      {
        ...(NOTES_IN_PLACE_OF_THE_PDF.summary as object),
        ...(donationsOf(received).summary as object),
      },
      { gifts, receipts: [YEARLY_RECEIPT_OF_2025] },
    ),
  };
}

const LARGE_GIFTS_WITH_LONG_NOTES = donationsOf([
  gift(4, '2026-03-15', 125000000),
  gift(3, '2026-02-10', 100, { accountVerification: true, receiptAvailable: false }),
  gift(2, '2026-01-05', 123450),
  gift(1, '2024-06-20', 50000, { receiptAvailable: false }),
]);

interface GiftTableRecord {
  states: string[];
  errors: string[];
}

async function recordGiftTableStates(page: Page, rootFontPx = 16): Promise<void> {
  await page.addInitScript(() => {
    const record: GiftTableRecord = { states: [], errors: [] };
    Object.assign(window, { giftTableRecord: record });
    window.addEventListener('error', (event) => record.errors.push(event.message));
    window.addEventListener('unhandledrejection', (event) =>
      record.errors.push(String(event.reason)),
    );
    const state = (): string | null => {
      const host = document.querySelector('.payments-card app-donations-table');
      if (!host) {
        return null;
      }
      if (host.querySelector('.donation-rows')) {
        return 'rows';
      }
      const head = host.querySelector('thead');
      if (!head) {
        return null;
      }
      if (getComputedStyle(head).position === 'absolute') {
        return 'cards';
      }
      return Array.from(head.querySelectorAll('th')).some(
        (cell) => cell.textContent?.trim() === 'Stav',
      )
        ? 'full'
        : 'narrow';
    };
    const note = (): void => {
      const now = state();
      if (now !== null && record.states.at(-1) !== now) {
        record.states.push(now);
      }
    };
    new MutationObserver(note).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
    });
    const everyFrame = (): void => {
      note();
      requestAnimationFrame(everyFrame);
    };
    requestAnimationFrame(everyFrame);
  });
  if (rootFontPx !== 16) {
    await rootTextOf(page, rootFontPx);
  }
}

async function giftTableRecord(page: Page): Promise<GiftTableRecord> {
  return page.evaluate(
    () => (window as unknown as { giftTableRecord: GiftTableRecord }).giftTableRecord,
  );
}

async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

async function rootTextOf(page: Page, rootFontPx: number): Promise<void> {
  await page.addInitScript((root) => {
    const apply = (): boolean => {
      if (!document.documentElement) {
        return false;
      }
      document.documentElement.style.fontSize = `${root}px`;
      return true;
    };
    if (!apply()) {
      const untilRoot = new MutationObserver(() => {
        if (apply()) {
          untilRoot.disconnect();
        }
      });
      untilRoot.observe(document, { childList: true });
    }
  }, rootFontPx);
}

async function textOfHomeScreenApp(page: Page): Promise<void> {
  await rootTextOf(page, 17);
}

const ONE_YEAR = donationsOf([gift(1, '2026-03-15', 50000)]);

const TWO_YEARS = donationsOf([gift(2, '2026-03-15', 50000), gift(1, '2025-11-05', 25000)]);

const MANY_YEARS = donationsOf([
  gift(14, '2026-03-15', 50000),
  ...[1, 2, 3, 4, 5, 6].map((month) =>
    gift(7 + month, `2025-0${month}-10`, month === 6 ? 25000000 : 20000000),
  ),
  gift(7, '2025-07-10', 100, { accountVerification: true, receiptAvailable: false }),
  gift(6, '2025-08-10', 100, { accountVerification: true, receiptAvailable: false }),
  gift(5, '2024-05-10', 70000, { receiptAvailable: false }),
  gift(4, '2023-05-10', 60000, { receiptAvailable: false }),
  gift(3, '2022-05-10', 40000, { receiptAvailable: false }),
]);

async function openReceiptsOf(
  page: Page,
  shown: () => DonorApiMock,
  path = '/darce/potvrzeni',
): Promise<void> {
  await mockDonorApi(page, shown());
  await page.route(
    (url) => url.pathname === '/api/donations/me/summary',
    (route) => route.fulfill({ json: shown().summary }),
  );
  await page.route(
    (url) => url.pathname === '/api/donations/me',
    (route) => route.fulfill({ json: shown().list }),
  );
  await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200, donor)));
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
  await page.goto(path);
}

function yearsOf(data: DonorApiMock): number {
  return (data.summary as { byYear: readonly unknown[] }).byYear.length;
}

async function amountsFromCardEnd(page: Page): Promise<number[]> {
  return page.locator('.yearly-card').evaluate((card) => {
    const style = getComputedStyle(card);
    const end =
      card.getBoundingClientRect().right -
      parseFloat(style.borderRightWidth) -
      parseFloat(style.paddingRight);
    return Array.from(card.querySelectorAll('.year-total')).map((total) =>
      Math.round(end - total.getBoundingClientRect().right),
    );
  });
}

async function linesOf(elements: Locator): Promise<number[]> {
  return elements.evaluateAll((found) =>
    found.map((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
    }),
  );
}

test.describe('Given a signed-in donor whose gifts fill the tables of the portal', () => {
  for (const width of [1280, 1920]) {
    for (const section of ['Můj přehled', 'Moje dary']) {
      test(`when ${section} lists gifts of a million crowns and of hellers in a ${width} px window, then every amount stays inside its column and all amounts end on one edge`, async ({
        page,
      }) => {
        await mockDonorApi(page, LARGE_GIFTS);
        await signIn(page);
        await page.setViewportSize({ width, height: 900 });
        await openDonorSection(page, section);

        const cells = page.locator('main td.amount');
        await expect(cells.filter({ hasText: /1\s250\s000\sKč/ }).first()).toBeVisible();
        const head = (await page.locator('main table thead').first().boundingBox())!;
        expect(head.height).toBeGreaterThan(1);
        const placed = await cells.evaluateAll((found) =>
          found.map((cell) => {
            const box = cell.getBoundingClientRect();
            const style = getComputedStyle(cell);
            const start = box.left + parseFloat(style.paddingLeft);
            const end = box.right - parseFloat(style.paddingRight);
            const amount = cell.querySelector('.ui-amount')!.getBoundingClientRect();
            return {
              text: cell.textContent!.trim(),
              inside: amount.left >= start - 0.5 && amount.right <= end + 0.5,
              end: Math.round(amount.right),
            };
          }),
        );
        expect(placed.filter((each) => !each.inside)).toEqual([]);
        expect(new Set(placed.map((each) => each.end)).size).toBe(1);
      });
    }

    test(`when Moje dary shows a note in place of the PDF in a ${width} px window, then each note keeps to one line and its row is no taller than a row with the button`, async ({
      page,
    }) => {
      await mockDonorApi(page, await notesInPlaceOfThePdf());
      await signIn(page);
      await page.setViewportSize({ width, height: 900 });
      await openDonorSection(page, 'Moje dary');

      const notes = page.locator('.payments-card td.receipt .receipt-note');
      await expect(notes).toHaveText([
        'Započítá se do ročního potvrzení',
        'Vrácený dar potvrzení nemá',
        'Je na ročním potvrzení za rok 2025',
        'Potvrzení vystavujeme od roku 2025',
      ]);
      expect(await linesOf(notes)).toEqual([1, 1, 1, 1]);

      const heights = await page.locator('.payments-card tbody tr').evaluateAll((rows) =>
        rows
          .filter((row) => !row.querySelector('.verification-tag, .pairing-tag'))
          .map((row) => ({
            withButton: row.querySelector('.download-btn') !== null,
            height: row.getBoundingClientRect().height,
          })),
      );
      const buttonRow = heights.find((row) => row.withButton)!;
      const noteRows = heights.filter((row) => !row.withButton);
      expect(noteRows).toHaveLength(3);
      for (const row of noteRows) {
        expect(row.height).toBeLessThanOrEqual(buttonRow.height + 0.5);
      }
    });

    test(`when Moje dary shows notes in place of the PDF in some years in a ${width} px window, then every year's columns start at the same places`, async ({
      page,
    }) => {
      await mockDonorApi(page, await notesInPlaceOfThePdf());
      await signIn(page);
      await page.setViewportSize({ width, height: 900 });
      await openDonorSection(page, 'Moje dary');
      await expect(page.locator('.payments-card table')).toHaveCount(3);
      await expect(page.locator('.payments-card td.receipt .receipt-note')).toHaveCount(4);

      const starts = await page
        .locator('.payments-card table')
        .evaluateAll((tables) =>
          tables.map((table) =>
            Array.from(table.querySelectorAll('thead th')).map((heading) =>
              Math.round(heading.getBoundingClientRect().left),
            ),
          ),
        );
      expect(new Set(starts.map((each) => each.join(' '))).size).toBe(1);
    });

    test(`when Potvrzení o daru lists many years, some with a long note, in a ${width} px window, then no count of gifts runs into the amount of its year`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openReceiptsOf(page, () => MANY_YEARS);

      const rows = page.locator('.year-row');
      await expect(rows).toHaveCount(yearsOf(MANY_YEARS));
      await expect(rows.nth(1).locator('.year-count')).toHaveText('6 darů a 2 ověření účtu');
      const crossings = await rows.evaluateAll((found) =>
        found.flatMap((row) => {
          const textBox = (selector: string) => {
            const range = document.createRange();
            range.selectNodeContents(row.querySelector(selector)!);
            return range.getBoundingClientRect();
          };
          const count = textBox('.year-count');
          const total = textBox('.year-total');
          const action = row.querySelector('.year-action')!.getBoundingClientRect();
          return count.right <= total.left && total.right <= action.left
            ? []
            : [row.querySelector('.year')!.textContent!.trim()];
        }),
      );
      expect(crossings).toEqual([]);
    });

    test(`when Potvrzení o daru lists one, two or many years in a ${width} px window, then the yearly amounts end at the same place`, async ({
      page,
    }) => {
      let shown = ONE_YEAR;
      await page.setViewportSize({ width, height: 900 });
      await openReceiptsOf(page, () => shown);

      const ends: number[][] = [];
      for (const data of [ONE_YEAR, TWO_YEARS, MANY_YEARS]) {
        if (data !== shown) {
          shown = data;
          await page.reload();
        }
        await expect(page.locator('.year-row')).toHaveCount(yearsOf(data));
        ends.push(await amountsFromCardEnd(page));
      }
      expect(new Set(ends.flat()).size).toBe(1);
    });
  }

  for (const width of [900, 1000, 1100, 1150, 1180, 1194]) {
    test(`when Moje dary lists gifts in a ${width} px window, from nav until the table's container reaches ledger (54 rem), then each year stays a table without the Stav column, no cell runs past the card and only a refunded gift or an account verification names its state under the date`, async ({
      page,
    }) => {
      await mockDonorApi(page, await notesInPlaceOfThePdf());
      await signIn(page);
      await page.setViewportSize({ width, height: 900 });
      await openDonorSection(page, 'Moje dary');

      const card = page.locator('.payments-card');
      await expect(card.locator('table')).toHaveCount(3);
      const heads = card.locator('table').first().locator('thead th');
      await expect(heads).toHaveText(['Datum', 'Částka', 'Účel', 'Potvrzení']);
      expect((await heads.first().boundingBox())!.height).toBeGreaterThan(1);

      const pastTheCard = await card.evaluate((element) => {
        const edge = element.getBoundingClientRect();
        return Array.from(element.querySelectorAll('table, th, td'))
          .filter((cell) => {
            const box = cell.getBoundingClientRect();
            return box.left < edge.left - 0.5 || box.right > edge.right + 0.5;
          })
          .map((cell) => cell.textContent!.trim());
      });
      expect(pastTheCard).toEqual([]);
      expect(
        await card
          .locator('table')
          .evaluateAll(
            (tables) => tables.filter((table) => table.scrollWidth > table.clientWidth).length,
          ),
      ).toBe(0);

      await expect(card.locator('td.date .verification-tag')).toHaveText([
        'Ověření účtu',
        'Vráceno',
      ]);
      await expect(card.getByText('Přijato')).toHaveCount(0);
      const refunded = card.locator('tbody tr', { hasText: 'Vráceno' });
      const tagBox = (await refunded.locator('td.date .verification-tag').boundingBox())!;
      const dateBox = (await refunded.locator('td.date').boundingBox())!;
      expect(tagBox.x).toBeGreaterThanOrEqual(dateBox.x - 0.5);
      expect(tagBox.x + tagBox.width).toBeLessThanOrEqual(dateBox.x + dateBox.width + 0.5);

      const cells = refunded.getByRole('cell');
      await expect(cells.first()).toHaveAccessibleName(/^5\.\s1\.\s2026 Stav: Vráceno$/);
      await expect(cells.nth(1)).toHaveAccessibleName(/^300\sKč$/);
    });
  }

  for (const width of [1150, 1180]) {
    test(`when Moje dary lists gifts in a ${width} px window with the 17 px text of the home-screen app, then the refunded gift's date cell reads its state before the amount cell`, async ({
      page,
    }) => {
      await textOfHomeScreenApp(page);
      await page.setViewportSize({ width, height: 900 });
      await openOwnPage(page, '/darce/dary', await notesInPlaceOfThePdf());

      const card = page.locator('.payments-card');
      await expect(card.locator('table').first().locator('thead th')).toHaveText([
        'Datum',
        'Částka',
        'Účel',
        'Potvrzení',
      ]);
      const cells = card.locator('tbody tr', { hasText: 'Vráceno' }).getByRole('cell');
      await expect(cells.first()).toHaveAccessibleName(/^5\.\s1\.\s2026 Stav: Vráceno$/);
      await expect(cells.nth(1)).toHaveAccessibleName(/^300\sKč$/);
    });
  }

  for (const width of [1150, 1180]) {
    test(`when Moje dary opens directly in a ${width} px window, whose container is narrower than ledger, then no frame shows the gifts as cards before the table without Stav`, async ({
      page,
    }) => {
      await recordGiftTableStates(page);
      await page.setViewportSize({ width, height: 900 });
      await openOwnPage(page, '/darce/dary', await notesInPlaceOfThePdf());

      await expect(page.locator('.payments-card table').first().locator('thead th')).toHaveText([
        'Datum',
        'Částka',
        'Účel',
        'Potvrzení',
      ]);
      await nextFrames(page);
      expect(await giftTableRecord(page)).toEqual({ states: ['narrow'], errors: [] });
    });
  }

  for (const { root, widths, expected } of [
    { root: 16, widths: [1194, 1200], expected: ['narrow', 'full'] },
    { root: 17, widths: [1194, 1200], expected: ['narrow', 'narrow'] },
  ]) {
    test(`when Moje dary opens at ${widths.join(' and ')} px with a ${root} px root, then each shows either the table without Stav or the full table, never cards`, async ({
      page,
    }) => {
      const shown: string[] = [];
      await recordGiftTableStates(page, root);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await openOwnPage(page, '/darce/dary', await notesInPlaceOfThePdf());
        await expect(page.locator('.payments-card table').first()).toBeVisible();
        await nextFrames(page);
        const record = await giftTableRecord(page);
        expect(record.errors).toEqual([]);
        expect(record.states).toHaveLength(1);
        shown.push(record.states[0]);
      }
      expect(shown).toEqual(expected);
    });
  }

  for (const { root, from, to, edges } of [
    { root: 16, from: 890, to: 1300, edges: [899, 900, 1194, 1195] },
    { root: 17, from: 890, to: 1650, edges: [955, 956, 1599, 1600] },
  ]) {
    test(`when the window of Moje dary widens step by step from ${from} to ${to} px with a ${root} px root, then the gifts go from rows to the table without Stav to the full table, each switch once and without an error`, async ({
      page,
    }) => {
      test.slow();
      await recordGiftTableStates(page, root);
      await page.setViewportSize({ width: from, height: 900 });
      await openOwnPage(page, '/darce/dary', await notesInPlaceOfThePdf());
      await expect(page.locator('.payments-card .donation-rows').first()).toBeVisible();

      const widths = [
        ...new Set([
          ...Array.from({ length: (to - from) / 10 + 1 }, (_, i) => from + i * 10),
          ...edges,
        ]),
      ].sort((a, b) => a - b);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await nextFrames(page);
      }

      await expect(page.locator('.payments-card table').first().locator('thead th')).toHaveText([
        'Datum',
        'Částka',
        'Účel',
        'Stav',
        'Potvrzení',
      ]);
      expect(await giftTableRecord(page)).toEqual({
        states: ['rows', 'narrow', 'full'],
        errors: [],
      });
    });
  }

  test('when an iPad with the 17 px text of the home-screen app turns between 820 and 1180 px, then Moje dary goes between rows and the table without Stav, never through cards and without an error', async ({
    page,
  }) => {
    await recordGiftTableStates(page, 17);
    await page.setViewportSize({ width: 820, height: 1180 });
    await openOwnPage(page, '/darce/dary', await notesInPlaceOfThePdf());
    await expect(page.locator('.payments-card .donation-rows').first()).toBeVisible();

    for (const [width, height] of [
      [1180, 820],
      [820, 1180],
      [1180, 820],
      [820, 1180],
    ]) {
      await page.setViewportSize({ width, height });
      await nextFrames(page);
    }

    await expect(page.locator('.payments-card .donation-rows').first()).toBeVisible();
    expect(await giftTableRecord(page)).toEqual({
      states: ['rows', 'narrow', 'rows', 'narrow', 'rows'],
      errors: [],
    });
  });

  test("when the text of an open Moje dary grows from 16 to 17 px in a 1280 px window, which leaves the table's container narrower than ledger, then the full table becomes the table without Stav and back", async ({
    page,
  }) => {
    await recordGiftTableStates(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await openOwnPage(page, '/darce/dary', await notesInPlaceOfThePdf());
    const heads = page.locator('.payments-card table').first().locator('thead th');
    await expect(heads).toHaveText(['Datum', 'Částka', 'Účel', 'Stav', 'Potvrzení']);

    await page.evaluate(() => (document.documentElement.style.fontSize = '17px'));
    await expect(heads).toHaveText(['Datum', 'Částka', 'Účel', 'Potvrzení']);
    await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
    await expect(heads).toHaveText(['Datum', 'Částka', 'Účel', 'Stav', 'Potvrzení']);

    expect(await giftTableRecord(page)).toEqual({
      states: ['full', 'narrow', 'full'],
      errors: [],
    });
  });

  test('when Moje dary in a 900 px window lists gifts of a million crowns with long notes in place of the PDF, then Účel keeps the width it has beside buttons only, and the notes wrap inside Potvrzení', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    const purposeWidth = async (): Promise<number> => {
      const heads = page.locator('.payments-card table').first().locator('thead th');
      await expect(heads).toHaveText(['Datum', 'Částka', 'Účel', 'Potvrzení']);
      return (await heads.nth(2).boundingBox())!.width;
    };

    let shown = LARGE_GIFTS;
    await openReceiptsOf(page, () => shown, '/darce/dary');
    await expect(page.locator('.payments-card td.amount').first()).toHaveText(/1\s250\s000\sKč/);
    await expect(page.locator('.payments-card .receipt-note')).toHaveCount(0);
    const besideButtons = await purposeWidth();
    shown = LARGE_GIFTS_WITH_LONG_NOTES;
    await page.reload();
    await expect(page.locator('.payments-card .receipt-note--long')).toHaveCount(2);

    expect(Math.abs((await purposeWidth()) - besideButtons)).toBeLessThanOrEqual(0.5);
    const outside = await page.locator('.payments-card').evaluate((card) => {
      const edge = card.getBoundingClientRect();
      return Array.from(card.querySelectorAll('.receipt-note')).filter((note) => {
        const cell = note.closest('td')!.getBoundingClientRect();
        const box = note.getBoundingClientRect();
        return box.left < cell.left - 0.5 || box.right > Math.min(cell.right, edge.right) + 0.5;
      }).length;
    });
    expect(outside).toBe(0);
  });

  for (const path of ['/darce/prehled', '/darce/dary', '/darce/potvrzeni']) {
    test(`when ${path} shows its gifts table in a 900 px window, then nothing reaches past its card or the window`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 900, height: 900 });
      await openOwnPage(page, path, await notesInPlaceOfThePdf());
      const table = page.locator('app-donations-table table').first();
      await expect(table.locator('thead th').first()).toHaveText('Datum');

      const pastTheCard = await page.locator('app-donations-table').evaluateAll((hosts) =>
        hosts.flatMap((host) => {
          const edge = host.closest('.ui-card')!.getBoundingClientRect();
          return Array.from(host.querySelectorAll('table, th, td'))
            .filter((cell) => {
              const box = cell.getBoundingClientRect();
              return box.left < edge.left - 0.5 || box.right > edge.right + 0.5;
            })
            .map((cell) => cell.textContent!.trim());
        }),
      );
      expect(pastTheCard).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
    });
  }

  for (const place of [
    {
      name: 'a year on Moje dary',
      section: 'Moje dary',
      row: (page: Page) => page.locator('.gift-year-head').last(),
    },
    {
      name: 'a year on Potvrzení o daru',
      section: 'Potvrzení o daru',
      row: (page: Page) => page.locator('.year-row').last(),
    },
  ]) {
    test(`when an iPad turns while the PDF of ${place.name} is being prepared, then the one status after its button stays and keeps its text`, async ({
      page,
    }) => {
      await mockDonorApi(page, receiptDonations);
      await page.clock.install();
      await page.route(
        (url) => url.pathname === RECEIPT_ISSUING_URL,
        () => new Promise<void>(() => undefined),
      );
      await page.setViewportSize({ width: 1194, height: 834 });
      await openReceiptsAfterSignIn(page);
      await openDonorSection(page, place.section);
      const row = place.row(page);
      const button = row.locator('.yearly-pdf');
      await expect(button).toBeVisible();

      await button.click();
      const status = row.getByRole('status');
      await expect(status).toHaveText('Připravujeme údaje potvrzení…');
      const followsButton = () =>
        button.evaluate((element) => {
          const shown = element
            .closest('.gift-year-head, .year-row')!
            .querySelector('[role="status"]')!;
          return Boolean(element.compareDocumentPosition(shown) & Node.DOCUMENT_POSITION_FOLLOWING);
        });
      expect(await followsButton()).toBe(true);
      await status.evaluate((element) => element.setAttribute('data-before-turn', ''));

      await page.setViewportSize({ width: 834, height: 1194 });
      await expect(row.locator('.receipt-saved')).toHaveCount(1);
      await expect(row.locator('[role="status"][data-before-turn]')).toHaveText(
        'Připravujeme údaje potvrzení…',
      );
      expect(await followsButton()).toBe(true);
    });
  }
});

const YEARS_OF_LONG_AND_SHORT_SUMMARIES = donationsOf([
  gift(9, '2026-03-15', 125000000),
  gift(8, '2026-02-10', 150000),
  gift(7, '2026-01-20', 200),
  gift(6, '2026-01-05', 100, { accountVerification: true, receiptAvailable: false }),
  gift(5, '2025-06-10', 26000),
  gift(4, '2025-05-02', 30000, { status: 'REFUNDED', receiptAvailable: false }),
  gift(3, '2024-04-10', 50000),
]);

async function openOwnPage(page: Page, path: string, shown: DonorApiMock): Promise<void> {
  await mockDonorApi(page, shown);
  await rememberedDonorSession(page);
  await page.goto(path);
}

async function linePitchOf(element: Locator): Promise<number> {
  return element.evaluate((found) => {
    const range = document.createRange();
    range.selectNodeContents(found);
    const tops = [...new Set(Array.from(range.getClientRects()).map((rect) => rect.top))].sort(
      (a, b) => a - b,
    );
    return Math.round((tops[1] - tops[0]) * 10) / 10;
  });
}

test.describe('Given a signed-in donor on a phone', () => {
  test('when Moje dary heads years whose summaries are long and short on a 375 pt phone, then every year puts its summary the same way against its year', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openOwnPage(page, '/darce/dary', YEARS_OF_LONG_AND_SHORT_SUMMARIES);
    const heads = page.locator('.gift-year-head');
    await expect(heads).toHaveCount(3);

    const stacked = await heads.evaluateAll((found) =>
      found.map((head) => {
        const title = head.querySelector('.gift-year-title')!.getBoundingClientRect();
        const sum = head.querySelector('.gift-year-sum')!.getBoundingClientRect();
        return sum.top >= title.bottom - 1;
      }),
    );
    expect(new Set(stacked).size).toBe(1);
  });

  for (const path of ['/darce/dary', '/darce/potvrzeni']) {
    test(`when ${path} lists ordinary, refunded and verification gifts on a 390 pt phone, then every row sets its amount on the line of its date`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openOwnPage(page, path, YEARS_OF_LONG_AND_SHORT_SUMMARIES);
      const rows = page.locator('.donation-rows .ui-list__row');
      await expect(rows.first()).toBeVisible();
      await expect(page.locator('.donation-rows .ui-list__state')).toHaveCount(
        path === '/darce/dary' ? 1 : 0,
      );

      const offsets = await rows.evaluateAll((found) =>
        found.map((row) => {
          const title = row.querySelector('.ui-list__title')!.getBoundingClientRect();
          const value = row.querySelector('.ui-list__value')!.getBoundingClientRect();
          return Math.round(value.bottom - title.bottom);
        }),
      );
      expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThanOrEqual(1);
      expect(offsets.every((offset) => offset < 12)).toBe(true);
    });
  }

  for (const width of [390, 1280]) {
    test(`when Potvrzení o daru lists its years at ${width} px, then the lines between the years run from edge to edge of the card like its footer's, and each year starts on the card's text edge`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openOwnPage(page, '/darce/potvrzeni', YEARS_OF_LONG_AND_SHORT_SUMMARIES);
      await expect(page.locator('.year-row')).toHaveCount(3);

      const placed = await page.locator('.yearly-card').evaluate((card) => {
        const edge = card.getBoundingClientRect();
        const inner = {
          left: edge.left + card.clientLeft,
          right: edge.left + card.clientLeft + card.clientWidth,
        };
        const title = card.querySelector('.ui-card__title')!.getBoundingClientRect();
        const footer = card.querySelector('.ui-card__footer')!.getBoundingClientRect();
        return Array.from(card.querySelectorAll('.year-row')).map((row) => {
          const box = row.getBoundingClientRect();
          const year = row.querySelector('.year')!.getBoundingClientRect();
          return {
            divider: Math.round(box.left - inner.left) + ' ' + Math.round(inner.right - box.right),
            footer:
              Math.round(footer.left - inner.left) + ' ' + Math.round(inner.right - footer.right),
            year: Math.round(year.left - title.left),
          };
        });
      });
      for (const row of placed) {
        expect(row.divider).toBe(row.footer);
        expect(row.year).toBe(0);
      }
    });
  }

  test("when Moje dary and Můj přehled show their small grey notes on a 390 pt phone, then the year note sets its lines as far apart as the notes at the card's end, and the bank hint reads the same on both pages", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openOwnPage(page, '/darce/dary', YEARS_OF_LONG_AND_SHORT_SUMMARIES);
    const yearNote = page.locator('.gift-year-note').first();
    await expect(yearNote).toBeVisible();
    const footerPitch = await linePitchOf(page.locator('.gifts-tax-note'));
    expect(await linePitchOf(yearNote)).toBe(footerPitch);
    const giftsHint = await linePitchOf(page.locator('.bank-hint'));

    await page.goto('/darce/prehled');
    const overviewHint = page.locator('.recent-hint').first();
    await expect(overviewHint).toBeVisible();
    expect(await linePitchOf(overviewHint)).toBe(giftsHint);
  });
});

test.describe('Given a signed-in donor on an upright iPad', () => {
  test('when Moje dary heads a year that has its yearly PDF, then the button ends on the edge where the amounts under it end', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 834, height: 1194 });
    await openOwnPage(page, '/darce/dary', YEARS_OF_LONG_AND_SHORT_SUMMARIES);
    const year = page.locator('.gift-year').nth(1);
    const button = year.locator('.yearly-pdf');
    await expect(button).toBeVisible();

    const buttonEnd = Math.round(
      (await button.boundingBox())!.x + (await button.boundingBox())!.width,
    );
    const amountEnds = await year
      .locator('.donation-amount')
      .evaluateAll((found) =>
        found.map((amount) => Math.round(amount.getBoundingClientRect().right)),
      );
    expect(amountEnds.length).toBeGreaterThan(0);
    for (const end of amountEnds) {
      expect(Math.abs(end - buttonEnd)).toBeLessThanOrEqual(1);
    }
  });
});
