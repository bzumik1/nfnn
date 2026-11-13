import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { article, mockPublicContent, project } from './baseline/screen-mocks';
import { mockDonorApi } from './donor-session';

const TABS = ['/o-nas', '/aktuality', '/projekty', '/prispet'];
const PAGES_UNDER_TABS = [
  `/aktuality/${article.slug}`,
  `/projekty/${project.slug}`,
  '/zasady-ochrany-osobnich-udaju',
  '/neexistuje',
];

interface Header {
  readonly path: string;
  readonly top: number;
  readonly left: number;
  readonly size: string;
  readonly ground: string;
  readonly ownGrounds: readonly string[];
}

async function headerOf(page: Page, path: string): Promise<Header> {
  await page.goto(path);
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const header = await title.evaluate((heading) => {
    const box = heading.getBoundingClientRect();
    let ground = '';
    const ownGrounds: string[] = [];
    for (let at = heading.parentElement; at; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (style.backgroundImage !== 'none') {
        ownGrounds.push(`${at.tagName.toLowerCase()}.${at.className}`);
      }
      if (ground === '' && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        ground = style.backgroundColor;
      }
    }
    return {
      top: Math.round(box.top + window.scrollY),
      left: Math.round(box.left),
      size: getComputedStyle(heading).fontSize,
      ground,
      ownGrounds,
    };
  });
  return { path, ...header };
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [390, 1280]) {
    test.describe(`Given a visitor in the ${colorScheme} appearance at ${width} px`, () => {
      test.use({ colorScheme, viewport: { width, height: 900 } });

      test.beforeEach(async ({ page }) => {
        await mockDonorApi(page);
        await mockPublicContent(page);
      });

      test('when the four tabs open, then each shows its title at the same place and size, on the one page ground', async ({
        page,
      }) => {
        const headers: Header[] = [];
        for (const path of TABS) {
          headers.push(await headerOf(page, path));
        }

        for (const header of headers) {
          expect(header.ownGrounds, header.path).toEqual([]);
          expect([header.top, header.left, header.size, header.ground], header.path).toEqual([
            headers[0].top,
            headers[0].left,
            headers[0].size,
            headers[0].ground,
          ]);
        }
      });

      test('when an article, a story, the privacy policy and a missing address open, then they stay on the ground of their tab', async ({
        page,
      }) => {
        const tab = await headerOf(page, '/o-nas');

        for (const path of PAGES_UNDER_TABS) {
          const header = await headerOf(page, path);

          expect(header.ownGrounds, path).toEqual([]);
          expect(header.ground, path).toBe(tab.ground);
        }
      });
    });
  }
}
