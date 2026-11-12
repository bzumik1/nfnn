import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi } from './donor-session';

const ROOM_UNDER_THE_HEADER = 16;

function roomUnderTheHeader(page: Page): Promise<number> {
  return page.evaluate(() => {
    const row = document.querySelector('.app-header-inner')!.getBoundingClientRect();
    const firstText = [...document.querySelectorAll('main *')].find(
      (element) =>
        element.getBoundingClientRect().height > 0 &&
        [...element.childNodes].some(
          (child) => child.nodeType === Node.TEXT_NODE && child.textContent!.trim() !== '',
        ),
    )!;
    return firstText.getBoundingClientRect().top - row.bottom;
  });
}

for (const [device, viewport] of [
  ['a phone', { width: 390, height: 844 }],
  ['a phone on its side', { width: 844, height: 390 }],
  ['a computer', { width: 1280, height: 800 }],
] as const) {
  test.describe(`Given a visitor on ${device}`, () => {
    test.use({ viewport });

    for (const path of ['/o-nas', '/prispet', '/aktuality', '/projekty']) {
      test(`when ${path} opens, then its first line keeps clear of the header row with the logo`, async ({
        page,
      }) => {
        await mockDonorApi(page);
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        expect(await roomUnderTheHeader(page)).toBeGreaterThanOrEqual(ROOM_UNDER_THE_HEADER);
      });
    }
  });
}

test.describe('Given a visitor on a phone with the largest text of the installed app', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('when a page opens, then the logo keeps its readable width beside Přihlásit se', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.goto('/o-nas');
    await page.addStyleTag({ content: 'html { font-size: 53px !important; }' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const logo = await page.getByRole('banner').getByRole('img').boundingBox();

    expect(logo!.width).toBeGreaterThanOrEqual(96);
  });
});
