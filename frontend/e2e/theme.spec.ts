import { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { administrator, mockDonorApi, openSignInDialog, session } from './donor-session';
import { expect, test } from './fixtures';
import {
  CHANGED_AMOUNT,
  scanAfterLoad,
  serveReceiptKeys,
  serveReceiptStatus,
  SINGLE_RECEIPT,
  YEARLY_RECEIPT,
} from './receipt-verification';
import {
  chunkLoadNotice,
  chunkLoadPageHeading,
  openHomeThenLoseNewChunks,
  openPolicyFromFooter,
  withoutSessionStorage,
} from './lost-chunks';

const THEME = process.env.E2E_THEME;
const REFERENCE_THEME = 'nova-nadeje';
const REFERENCE_FONTS = ['Playfair Display', 'Inter'];
const BLACK = '0, 0, 0';

const PUBLIC_PAGES = [
  '/',
  '/zasady-ochrany-osobnich-udaju',
  '/neexistuje',
  '/obnova-hesla',
  '/potvrzeni-emailu',
  '/pripojeni',
  '/overit',
];

const SIGNED_IN_PAGES = [
  '/darce/prehled',
  '/darce/dary',
  '/darce/potvrzeni',
  '/darce/ucty',
  '/darce/udaje',
  '/sprava',
  '/sprava/platby',
  '/sprava/darci',
  '/sprava/spravci',
  '/sprava/starsi-symboly',
  '/sprava/prehledy',
  '/sprava/aktuality',
  '/sprava/aktuality/nova',
  '/sprava/projekty',
  '/sprava/projekty/nova',
  '/sprava/o-nas',
  '/sprava/zalohy',
  '/sprava/logy',
  '/sprava/nastaveni',
  '/sprava/historie',
];

function colours(source: string): string[] {
  const hex = [...source.matchAll(/#([0-9a-f]{6})\b/gi)].map(([, value]) =>
    [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16)).join(', '),
  );
  const rgb = [...source.matchAll(/rgb\((\d+) (\d+) (\d+)/g)].map(([, r, g, b]) =>
    [r, g, b].join(', '),
  );
  return [...hex, ...rgb];
}

function referenceOnlyColours(rootDir: string, theme: string): string[] {
  const read = (name: string) =>
    readFileSync(join(rootDir, '..', 'src', 'themes', name, '_theme.scss'), 'utf8');
  const own = new Set(colours(read(theme)));
  return [...new Set(colours(read(REFERENCE_THEME)))].filter(
    (colour) => !own.has(colour) && colour !== BLACK,
  );
}

async function lookOfTheReferenceTheme(page: Page): Promise<string[]> {
  const forbidden = referenceOnlyColours(test.info().config.rootDir, THEME!);
  return page.evaluate(
    ({ forbidden, fonts }) => {
      const properties = [
        'color',
        'backgroundColor',
        'backgroundImage',
        'borderTopColor',
        'borderRightColor',
        'borderBottomColor',
        'borderLeftColor',
        'outlineColor',
        'boxShadow',
        'textShadow',
        'textDecorationColor',
        'fill',
        'stroke',
      ] as const;
      const describe = (element: Element) =>
        `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}.${Array.from(
          element.classList,
        ).join('.')}`;
      const found = new Set<string>();
      for (const element of Array.from(document.querySelectorAll('*'))) {
        if (element.getClientRects().length === 0) {
          continue;
        }
        const style = getComputedStyle(element);
        for (const property of properties) {
          for (const [, r, g, b] of style[property].matchAll(/rgba?\((\d+), (\d+), (\d+)/g)) {
            if (forbidden.includes(`${r}, ${g}, ${b}`)) {
              found.add(`${describe(element)} ${property} rgb(${r}, ${g}, ${b})`);
            }
          }
        }
        const family = style.fontFamily;
        if (fonts.some((font) => family.includes(font))) {
          found.add(`${describe(element)} font-family ${family}`);
        }
      }
      return [...found];
    },
    { forbidden, fonts: REFERENCE_FONTS },
  );
}

test.describe('Given the site built with another theme', () => {
  test.skip(!THEME, 'runs against a build with another theme (E2E_THEME)');

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  for (const width of [390, 1280]) {
    test(`when a visitor opens the public pages ${width} px wide, then none of them shows a colour or font of the default theme`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of PUBLIC_PAGES) {
        await page.goto(path);
        await expect(page.locator('h1').first()).toBeVisible();

        expect(await lookOfTheReferenceTheme(page), path).toEqual([]);
      }
    });
  }

  for (const width of [390, 1280]) {
    test(`when a visitor verifies a signed, a doubtful and a changed receipt code ${width} px wide, then none of the results shows a colour or font of the default theme`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await serveReceiptKeys(page);
      await serveReceiptStatus(page, 'active');
      await page.goto(`/overit#${YEARLY_RECEIPT.fragment}`);
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toHaveText('Podepsáno fondem Nová naděje');
      expect(await lookOfTheReferenceTheme(page), 'signed').toEqual([]);

      await serveReceiptStatus(page, 'unknown');
      await scanAfterLoad(page, SINGLE_RECEIPT);
      await expect(heading).toHaveText('Fond toto potvrzení ve své evidenci nevede');
      expect(await lookOfTheReferenceTheme(page), 'unrecorded').toEqual([]);

      await scanAfterLoad(page, CHANGED_AMOUNT);
      await expect(heading).toHaveText('Neověřeno: podpis neodpovídá údajům');
      expect(await lookOfTheReferenceTheme(page), 'invalid').toEqual([]);
    });
  }

  test('when the first page cannot be loaded, then its page of its own shows no colour or font of the default theme', async ({
    page,
  }) => {
    await openHomeThenLoseNewChunks(page);
    await openPolicyFromFooter(page);
    await expect(page.getByRole('heading', chunkLoadPageHeading)).toBeVisible();

    expect(await lookOfTheReferenceTheme(page)).toEqual([]);
  });

  test('when a later page cannot be loaded, then the reload bar shows no colour or font of the default theme', async ({
    page,
  }) => {
    await withoutSessionStorage(page);
    await openHomeThenLoseNewChunks(page);
    await openPolicyFromFooter(page);
    await expect(chunkLoadNotice(page)).toBeVisible();

    expect(await lookOfTheReferenceTheme(page)).toEqual([]);
  });

  test('when a visitor opens the sign-in dialog, then it shows no colour or font of the default theme', async ({
    page,
  }) => {
    await openSignInDialog(page);

    expect(await lookOfTheReferenceTheme(page)).toEqual([]);
  });

  test('when an administrator opens every page of their account and the administration, then none of them shows a colour or font of the default theme', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));

    for (const path of SIGNED_IN_PAGES) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator('h1').first()).toBeVisible();

      expect(await lookOfTheReferenceTheme(page), path).toEqual([]);
    }
  });
});
