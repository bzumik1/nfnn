import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, samplePngBase64 } from './donor-session';

const SIGNATURE_ID = '0199f3e0-0000-7000-8000-00000000e001';
const PORTRAIT_ID = '0199f3e0-0000-7000-8000-00000000e002';
const ALIGNMENT_TOLERANCE = 0.5;

function image(id: string, width: number, height: number) {
  return { id, url: `/api/content/media/${id}`, width, height };
}

const RICH_PEOPLE = {
  featured: [],
  board: [],
  footnote: null,
  note: {
    text: 'Fond jsme založili, abychom pomáhali.\n\nDěkujeme všem, kdo pomáhají s námi.',
    signatures: [
      {
        ...image(SIGNATURE_ID, 600, 180),
        name: 'Eva Vzorová',
        role: 'Zakladatelka a předsedkyně správní rady fondu',
        portrait: image(PORTRAIT_ID, 640, 640),
      },
      { ...image(SIGNATURE_ID, 600, 180), name: 'Adam Vzor', role: null, portrait: null },
    ],
  },
};

const FEATURED_PEOPLE = {
  featured: [
    {
      name: 'Eva Vzorová',
      role: 'Zakladatelka a předsedkyně správní rady fondu',
      portrait: image(PORTRAIT_ID, 640, 640),
    },
    { name: 'Adam Vzor', role: null, portrait: null },
    { name: 'Jana Příkladná', role: 'Členka rady', portrait: image(PORTRAIT_ID, 640, 640) },
  ],
  board: [],
  footnote: null,
  note: null,
};

interface SignerLine {
  rowTop: number;
  portraitTop: number;
  nameBaseline: number;
}

async function servePeople(page: Page, people: unknown): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/content/home',
    (route) => route.fulfill({ json: { news: [], projects: [], people } }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) =>
      route.fulfill({ contentType: 'image/png', body: Buffer.from(samplePngBase64, 'base64') }),
  );
}

async function signerLines(page: Page): Promise<SignerLine[]> {
  return page.locator('#o-nas .signers').evaluate((list) =>
    [...list.querySelectorAll('.signer')].map((signer) => {
      const name = signer.querySelector('.signer-name')!;
      const text = name.firstChild!;
      const firstLetter = document.createRange();
      firstLetter.setStart(text, 0);
      firstLetter.setEnd(text, 1);
      return {
        rowTop: signer.getBoundingClientRect().top,
        portraitTop: signer.querySelector('.signer-photo')!.getBoundingClientRect().top,
        nameBaseline: firstLetter.getBoundingClientRect().bottom,
      };
    }),
  );
}

function spreadWithinRows(lines: SignerLine[], measure: (line: SignerLine) => number): number {
  const rows = new Map<number, number[]>();
  for (const line of lines) {
    const row = [...rows.keys()].find((top) => Math.abs(top - line.rowTop) < 1) ?? line.rowTop;
    rows.set(row, [...(rows.get(row) ?? []), measure(line)]);
  }
  return Math.max(...[...rows.values()].map((values) => Math.max(...values) - Math.min(...values)));
}

for (const [width, height] of [
  [1280, 900],
  [1920, 1080],
  [900, 800],
]) {
  test.describe(`Given a visitor on O nás at ${width} × ${height}`, () => {
    test.use({ viewport: { width, height }, reducedMotion: 'reduce' });

    test.beforeEach(async ({ page }) => {
      await mockDonorApi(page);
    });

    for (const [state, people] of [
      ['the founders’ note with signatures', RICH_PEOPLE],
      ['the featured people', FEATURED_PEOPLE],
      ['the site’s own block', null],
    ] as const) {
      test(`when ${state} show side by side, then their portraits share their top and their names their baseline`, async ({
        page,
      }) => {
        await servePeople(page, people);
        await page.goto('/o-nas');
        const signers = page.locator('#o-nas .signer');
        await expect(signers.first()).toBeVisible();
        await signers.first().scrollIntoViewIfNeeded();
        await page.evaluate(() => document.fonts.ready);

        await expect
          .poll(async () => {
            const lines = await signerLines(page);
            return Math.max(
              spreadWithinRows(lines, (line) => line.portraitTop),
              spreadWithinRows(lines, (line) => line.nameBaseline),
            );
          })
          .toBeLessThanOrEqual(ALIGNMENT_TOLERANCE);
      });
    }
  });
}
