import type { Locator, Page } from '@playwright/test';
import { bankAccountItem, mockDonorApi, openDonorSection, signIn } from './donor-session';
import { expect, test } from './fixtures';

const DOUBLED_TEXT_PX = 32;

async function showDoubledText(page: Page): Promise<void> {
  await page.addInitScript((px) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `html { font-size: ${px}px; }`;
      document.head.append(style);
    });
  }, DOUBLED_TEXT_PX);
}

async function linesOf(figure: Locator): Promise<string[]> {
  await figure.evaluate(() => document.fonts.ready);
  return figure.evaluate((element) => {
    const lines = new Map<number, string>();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      for (let index = 0; index < text.length; index++) {
        if (text[index].trim() === '' || text[index] === ' ') {
          continue;
        }
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const top = Math.round(range.getBoundingClientRect().top);
        lines.set(top, (lines.get(top) ?? '') + text[index]);
      }
    }
    return [...lines.entries()].sort(([a], [b]) => a - b).map(([, characters]) => characters);
  });
}

test.describe('Given a phone with the text at twice its size', () => {
  test.beforeEach(async ({ page }) => {
    await showDoubledText(page);
  });

  test('when the bank details on Přispět show, then the account number and the amount each stand on one line', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/prispet');
    const rows = page.locator('.bank-row');

    for (const label of ['Číslo účtu', 'Částka']) {
      const value = rows.filter({ hasText: label }).locator('.bank-value');
      await expect(value).toBeVisible();
      expect(await linesOf(value)).toHaveLength(1);
    }
  });

  test('when the foundation IBAN on O nás shows, then it breaks only between its groups of four', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/o-nas');
    const iban = page
      .getByRole('definition')
      .filter({ hasText: 'CZ26' })
      .locator('.accounting-value');
    await expect(iban).toHaveText('CZ26 2010 0000 0055 4433 2217');

    const lines = await linesOf(iban);

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line).toMatch(/^([A-Z0-9]{4})+$/);
    }
  });

  test('when a donor opens Účty, then each account number stands on one line', async ({ page }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === '/api/donations/me/bank-accounts',
      (route) =>
        route.fulfill({
          json: {
            items: [
              bankAccountItem({
                accountNumber: '19-2000145399/0800',
                donationCount: 2,
                totalAmountMinor: 150000,
              }),
            ],
          },
        }),
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openDonorSection(page, 'Bankovní účty');

    const number = page.locator('.account-number', { hasText: '19-2000145399/0800' });
    await expect(number).toBeVisible();
    expect(await linesOf(number)).toHaveLength(1);
  });
});
