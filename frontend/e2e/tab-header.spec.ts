import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { article, mockPublicContent, project } from './baseline/screen-mocks';
import { mockDonorApi, rememberedDonorSession } from './donor-session';

const TABS = ['/o-nas', '/aktuality', '/projekty', '/prispet'];
const DETAILS = [
  `/aktuality/${article.slug}`,
  `/projekty/${project.slug}`,
  '/zasady-ochrany-osobnich-udaju',
];

interface Header {
  readonly top: number;
  readonly left: number;
  readonly size: string;
  readonly ownGrounds: readonly string[];
  readonly labelled: boolean;
}

async function headerOf(page: Page, path: string): Promise<Header> {
  await page.goto(path);
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return title.evaluate((heading) => {
    const box = heading.getBoundingClientRect();
    const page = getComputedStyle(document.body).backgroundColor;
    const ownGrounds: string[] = [];
    for (let at = heading.parentElement; at && at !== document.body; at = at.parentElement) {
      const style = getComputedStyle(at);
      const transparent = style.backgroundColor === 'rgba(0, 0, 0, 0)';
      if (style.backgroundImage !== 'none' || !(transparent || style.backgroundColor === page)) {
        ownGrounds.push(`${at.tagName.toLowerCase()}.${at.className}`);
      }
    }
    const intro = heading.closest('.ui-intro');
    return {
      top: Math.round(box.top + window.scrollY),
      left: Math.round(box.left),
      size: getComputedStyle(heading).fontSize,
      ownGrounds,
      labelled: intro?.querySelector('.ui-eyebrow') != null,
    };
  });
}

async function accountButtonLook(page: Page, path: string): Promise<string> {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const account = page.getByRole('banner').getByRole('button', { name: /^Účet/ });
  await expect(account).toBeVisible();
  return account.evaluate((button) => {
    const style = getComputedStyle(button);
    return `${style.borderTopStyle} ${style.borderTopWidth} ${style.borderTopColor}`;
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [390, 1280]) {
    test.describe(`Given a visitor in the ${colorScheme} appearance at ${width} px`, () => {
      test.use({ colorScheme, viewport: { width, height: 900 } });

      test.beforeEach(async ({ page }) => {
        await mockDonorApi(page);
        await mockPublicContent(page);
      });

      test('when the four tabs open, then each shows its title at the same place and size on the page ground, with no label above it', async ({
        page,
      }) => {
        const headers = [];
        for (const path of TABS) {
          headers.push({ path, ...(await headerOf(page, path)) });
        }

        for (const header of headers) {
          expect(header.ownGrounds, header.path).toEqual([]);
          expect(header.labelled, header.path).toBe(false);
          expect([header.top, header.left, header.size], header.path).toEqual([
            headers[0].top,
            headers[0].left,
            headers[0].size,
          ]);
        }
      });

      test('when a story, an article and the privacy policy open, then they stay on the same ground as their tab, with no label above the title', async ({
        page,
      }) => {
        for (const path of DETAILS) {
          const header = await headerOf(page, path);

          expect(header.ownGrounds, path).toEqual([]);
          expect(header.labelled, path).toBe(false);
        }
      });
    });
  }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Given a signed-in donor in the ${colorScheme} appearance`, () => {
    test.use({ colorScheme });

    test('when a story, an article and the privacy policy open, then the header looks as on their tab', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await mockPublicContent(page);
      await rememberedDonorSession(page);
      const onTab = await accountButtonLook(page, '/o-nas');

      for (const path of DETAILS) {
        expect(await accountButtonLook(page, path), path).toBe(onTab);
      }
    });
  });
}
