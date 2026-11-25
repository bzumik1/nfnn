import { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { bankAccountItem, mockDonorApi, openAccountItem, signIn } from './donor-session';

const BANK_ACCOUNTS = Array.from({ length: 8 }, (_, index) =>
  bankAccountItem({
    id: `0192f0c4-0000-7000-8000-00000000001${index}`,
    accountNumber: `29002333${String(index).padStart(2, '0')}/2010`,
  }),
);

interface NestedDialog {
  readonly section: string;
  readonly opener: string;
  readonly dialog: (page: Page) => Locator;
}

const NESTED_DIALOGS: readonly NestedDialog[] = [
  {
    section: 'Údaje a zabezpečení',
    opener: 'Smazat data z tohoto zařízení',
    dialog: (page) => page.getByRole('alertdialog', { name: 'Smazat data z tohoto zařízení?' }),
  },
  {
    section: 'Bankovní účty',
    opener: 'Přidat bankovní účet',
    dialog: (page) => page.getByRole('dialog', { name: 'Přidat bankovní účet' }),
  },
];

const CLOSES = [
  {
    way: 'Zavřít',
    close: (dialog: Locator) => dialog.locator(':scope > .dialog-panel > .dialog-close').click(),
  },
  { way: 'Esc', close: (dialog: Locator) => dialog.page().keyboard.press('Escape') },
] as const;

function scrollTopAfterTwoFrames(panel: Locator): Promise<number> {
  return panel.evaluate(
    (element) =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(element.scrollTop))),
      ),
  );
}

async function bringIntoMiddle(panel: Locator, opener: Locator): Promise<number> {
  let settled = 0;
  await expect(async () => {
    await opener.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    const first = await scrollTopAfterTwoFrames(panel);
    settled = await scrollTopAfterTwoFrames(panel);
    expect(settled).toBe(first);
  }).toPass();
  return settled;
}

async function watchScrolls(panel: Locator): Promise<void> {
  await panel.evaluate((element) => {
    element.dataset['scrolledTo'] = '';
    element.addEventListener('scroll', () => {
      element.dataset['scrolledTo'] += ` ${element.scrollTop}`;
    });
  });
}

async function scrollsSeen(panel: Locator): Promise<number[]> {
  const seen = await panel.evaluate((element) => element.dataset['scrolledTo'] ?? '');
  return seen
    .trim()
    .split(/\s+/)
    .filter((value) => value !== '')
    .map(Number);
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test.describe(`Given a signed-in donor on a phone (${reducedMotion} motion) who has scrolled a section of the account sheet down to a button that opens a dialog inside the sheet`, () => {
    test.use({ viewport: { width: 390, height: 520 }, reducedMotion });

    test.beforeEach(async ({ page }) => {
      await mockDonorApi(page);
      await page.route(
        (url) => url.pathname === '/api/donations/me/bank-accounts',
        (route) => route.fulfill({ json: { items: BANK_ACCOUNTS } }),
      );
      await signIn(page);
    });

    for (const nested of NESTED_DIALOGS) {
      for (const { way, close } of CLOSES) {
        test(`when ${nested.opener} is closed with ${way}, then the sheet stays where it was and the focus is back on ${nested.opener}`, async ({
          page,
        }) => {
          await openAccountItem(page, nested.section);
          const sheet = page.getByRole('dialog', { name: nested.section });
          const panel = sheet.locator(':scope > .dialog-panel');
          const opener = panel.getByRole('button', { name: nested.opener, exact: true });
          await expect(page.locator('.first-sync')).toHaveCount(0, { timeout: 10_000 });
          await expect(opener).toBeEnabled({ timeout: 10_000 });
          const scrolledTo = await bringIntoMiddle(panel, opener);
          expect(scrolledTo).toBeGreaterThan(0);

          await opener.click();
          const dialog = nested.dialog(page);
          await expect(dialog).toBeVisible();
          await watchScrolls(panel);
          await close(dialog);

          await expect(dialog).toHaveCount(0);
          await expect(opener).toBeFocused();
          expect(await scrollTopAfterTwoFrames(panel)).toBe(scrolledTo);
          expect(await scrollsSeen(panel)).toEqual([]);
        });
      }
    }
  });
}
