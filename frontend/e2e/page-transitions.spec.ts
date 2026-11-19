import { Locator, Page } from '@playwright/test';
import { stepBack } from './app-history';
import { fingerAlong } from './finger';
import { waitWhileNothingMayHappen } from './fixed-waits';
import {
  administrator,
  mockDonorApi,
  openAccountItem,
  session,
  whenAdministrationCopied,
} from './donor-session';
import { expect, test } from './fixtures';

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c011',
  slug: 'zahrada-pro-deti',
  title: 'Zahrada pro děti',
  tag: 'Projekt',
  perex: 'Stavíme zahradu, kde si děti budou hrát.',
  body: 'První odstavec.',
  coverImage: null,
  publishedOn: '2026-10-20',
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
};

const LIST_TITLE = 'Co je u nás nového';

interface SeenTransition {
  readonly kind: 'push' | 'pop' | 'none';
  readonly hiddenFromAssistiveTech: boolean;
  readonly copies: number;
  readonly moved: readonly string[];
}

declare global {
  interface Window {
    nfnnSeenTransitions: SeenTransition[];
    nfnnSeenTops: [string, number, boolean][];
  }
}

async function watchTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.nfnnSeenTransitions = [];
    const seen = new WeakMap<Element, SeenTransition>();
    const MOTION_KEYS = new Set(['offset', 'easing', 'composite', 'computedOffset']);
    new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && node.classList.contains('page-transition')) {
            const entry: SeenTransition = {
              kind: node.classList.contains('page-transition--push')
                ? 'push'
                : node.classList.contains('page-transition--pop')
                  ? 'pop'
                  : 'none',
              hiddenFromAssistiveTech: node.getAttribute('aria-hidden') === 'true' && node.inert,
              copies: 0,
              moved: [],
            };
            seen.set(node, entry);
            window.nfnnSeenTransitions.push(entry);
          }
        });
        const target = record.target;
        if (
          record.type === 'attributes' &&
          target instanceof HTMLElement &&
          target.classList.contains('page-transition--moving')
        ) {
          const entry = seen.get(target) as { copies: number; moved: string[] } | undefined;
          if (entry === undefined || entry.copies > 0) {
            continue;
          }
          entry.copies = target.querySelectorAll('.page-transition__page').length;
          target.querySelectorAll('.page-transition__page, .page-transition__dim').forEach((part) =>
            part.getAnimations().forEach((animation) => {
              const effect = animation.effect as KeyframeEffect;
              effect
                .getKeyframes()
                .flatMap((frame) => Object.keys(frame))
                .filter((key) => !MOTION_KEYS.has(key))
                .forEach((key) => entry.moved.push(key));
            }),
          );
        }
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  });
}

function seenTransitions(page: Page): Promise<SeenTransition[]> {
  return page.evaluate(() => window.nfnnSeenTransitions);
}

async function forgetTransitions(page: Page): Promise<void> {
  await page.evaluate(() => (window.nfnnSeenTransitions = []));
}

function overlays(page: Page) {
  return page.locator('.page-transition');
}

function back(page: Page) {
  return page.getByRole('banner').getByRole('button', { name: 'Zpět' });
}

function tabs(page: Page) {
  return page.getByRole('navigation', { name: 'Hlavní sekce' });
}

async function publishedArticle(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/content/news/${article.slug}`,
    (route) => route.fulfill({ json: article }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) =>
      route.fulfill({ json: { items: [article], page: 0, size: 10, total: 1, hasMore: false } }),
  );
}

const pairedPayment = {
  id: '019a1c00-0000-7000-8000-000000001001',
  bankTransactionId: 1001,
  bookedOn: '2026-10-10',
  amountMinor: 50000,
  currency: 'CZK',
  variableSymbol: '1111111111',
  counterpartyAccount: '2900233333/2010',
  counterpartyName: 'Nováková Jana',
  messageForRecipient: 'Dar pro fond',
  importedAt: '2026-10-17T10:00:00Z',
  unpairedByAdminAt: null,
  accountVerification: false,
  donation: {
    id: 'd1',
    donorId: administrator.id,
    donorName: 'Jana Nováková',
    pairedBy: 'MANUAL',
    status: 'RECEIVED',
    recordedAt: '2026-10-18T09:00:00Z',
    receiptIssued: false,
  },
};

const otherPayments = Array.from({ length: 24 }, (_, index) => ({
  ...pairedPayment,
  id: `019a1c00-0000-7000-8000-0000000020${String(index).padStart(2, '0')}`,
  bankTransactionId: 2000 + index,
  bookedOn: `2026-10-${String(30 - index).padStart(2, '0')}`,
  variableSymbol: '2222222222',
  counterpartyName: 'Dvořák Petr',
  donation: {
    ...pairedPayment.donation,
    id: `d2${index}`,
    donorId: '0199f3e0-0000-7000-8000-00000000d002',
    donorName: 'Petr Dvořák',
  },
}));

async function expectWhollyInView(page: Page, target: Locator): Promise<void> {
  await expect(async () => {
    const box = (await target.boundingBox())!;
    const banner = (await page.getByRole('banner').boundingBox())!;
    const tabBar = page.getByRole('navigation', { name: 'Hlavní sekce' });
    const floor = (await tabBar.isVisible())
      ? (await tabBar.boundingBox())!.y
      : page.viewportSize()!.height;
    expect(Math.round(box.y)).toBeGreaterThanOrEqual(Math.round(banner.y + banner.height));
    expect(Math.round(box.y + box.height)).toBeLessThanOrEqual(floor);
  }).toPass();
}

interface FocusRing {
  readonly visible: boolean;
  readonly width: number;
  readonly outside: number;
}

function focusRingOfActive(page: Page): Promise<FocusRing> {
  return page.evaluate(() => {
    const focused = document.activeElement as HTMLElement;
    const style = getComputedStyle(focused);
    const width = style.outlineStyle === 'none' ? 0 : parseFloat(style.outlineWidth);
    const ring = Math.max(0, width + parseFloat(style.outlineOffset));
    const box = focused.getBoundingClientRect();
    let clipping = focused.parentElement;
    while (
      clipping !== null &&
      clipping !== document.documentElement &&
      getComputedStyle(clipping).overflowX === 'visible' &&
      getComputedStyle(clipping).overflowY === 'visible'
    ) {
      clipping = clipping.parentElement;
    }
    const area =
      clipping === null || clipping === document.documentElement || clipping === document.body
        ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
        : (() => {
            const edge = clipping.getBoundingClientRect();
            const left = edge.left + clipping.clientLeft;
            const top = edge.top + clipping.clientTop;
            return {
              left,
              top,
              right: left + clipping.clientWidth,
              bottom: top + clipping.clientHeight,
            };
          })();
    const outside = Math.max(
      area.left - (box.left - ring),
      area.top - (box.top - ring),
      box.right + ring - area.right,
      box.bottom + ring - area.bottom,
    );
    return { visible: focused.matches(':focus-visible'), width, outside };
  });
}

async function expectFocusRingWhole(page: Page): Promise<void> {
  await expect(async () => {
    const ring = await focusRingOfActive(page);
    expect(ring.visible).toBe(true);
    expect(ring.width).toBeGreaterThan(0);
    expect(Math.round(ring.outside)).toBeLessThanOrEqual(0);
  }).toPass();
}

async function pressZpetByKeyboard(page: Page): Promise<void> {
  await back(page).focus();
  await page.keyboard.press('Enter');
}

async function pairedPayments(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.route(
    (url) => url.pathname === '/api/admin/donations/payments',
    (route) => {
      const pairedOnly = new URL(route.request().url()).searchParams.get('pairing') === 'paired';
      return route.fulfill({
        json: {
          year: null,
          availableYears: pairedOnly ? [2026] : [],
          items: pairedOnly ? [...otherPayments, pairedPayment] : [],
          total: pairedOnly ? otherPayments.length + 1 : 0,
        },
      });
    },
  );
}

function paymentRow(page: Page) {
  return page
    .getByRole('row')
    .filter({ hasText: '10. 10. 2026' })
    .filter({ hasText: 'Nováková Jana' });
}

async function followPairedPaymentsDonor(page: Page): Promise<void> {
  await page.goto('/aktuality');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Co je u nás nového' })).toBeVisible();
  await openAccountItem(page, 'Správa');
  await expect(page).toHaveURL(/\/sprava$/);
  await page
    .getByRole('main')
    .getByRole('link', { name: /^Platby z banky/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/sprava\/platby/);
  await page.getByRole('button', { name: 'Přiřazené', exact: true }).click();
  await page.getByRole('button', { name: /^Nováková Jana 10\. 10\. 2026/ }).click();
  await page
    .getByRole('dialog', { name: 'Přiřazená platba' })
    .getByRole('link', { name: 'Jana Nováková' })
    .click();
  await expect(page).toHaveURL(new RegExp(`/sprava/darci/${administrator.id}$`));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(overlays(page)).toHaveCount(0);
}

async function openArticleFromList(page: Page): Promise<void> {
  await page.goto('/aktuality');
  await page.getByRole('link', { name: article.title }).click();
  await expect(page).toHaveURL(`/aktuality/${article.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeFocused();
  await expect(overlays(page)).toHaveCount(0);
}

test.describe('Given a visitor reading the news on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedArticle(page);
    await watchTransitions(page);
  });

  test('when they open an article from the list, then the article slides in over the list with only transform and opacity moving, and its heading takes the focus', async ({
    page,
  }) => {
    await openArticleFromList(page);

    const [transition, ...more] = await seenTransitions(page);
    expect(more).toHaveLength(0);
    expect(transition).toMatchObject({ kind: 'push', hiddenFromAssistiveTech: true, copies: 2 });
    expect(transition.moved.length).toBeGreaterThan(0);
    expect(new Set(transition.moved)).toEqual(new Set(['transform', 'opacity']));
  });

  test('when they press Zpět on the article, then the article slides away off the list and the link to that article takes the focus', async ({
    page,
  }) => {
    await openArticleFromList(page);
    await forgetTransitions(page);

    await back(page).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(
      page.getByRole('main').locator(`a[href="/aktuality/${article.slug}"]`).first(),
    ).toBeFocused();
    await expect(overlays(page)).toHaveCount(0);
    expect(await seenTransitions(page)).toEqual([
      expect.objectContaining({ kind: 'pop', hiddenFromAssistiveTech: true, copies: 2 }),
    ]);
  });

  test('when the app steps back without Zpět, then the article slides away the same way', async ({
    page,
  }) => {
    await openArticleFromList(page);
    await forgetTransitions(page);

    await stepBack(page);

    await expect(page).toHaveURL('/aktuality');
    await expect(overlays(page)).toHaveCount(0);
    expect(await seenTransitions(page)).toEqual([expect.objectContaining({ kind: 'pop' })]);
  });

  test('when they reload the article and press Zpět, then the list it opens in place of the article comes back the same way', async ({
    page,
  }) => {
    await page.goto(`/aktuality/${article.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: article.title })).toBeVisible();

    await back(page).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(overlays(page)).toHaveCount(0);
    expect(await seenTransitions(page)).toEqual([expect.objectContaining({ kind: 'pop' })]);
  });

  test('when they switch tabs, then the pages change without a slide', async ({ page }) => {
    await page.goto('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: 'Co je u nás nového' })).toBeVisible();

    await tabs(page).getByRole('link', { name: 'Pomáháme' }).click();

    await expect(page).toHaveURL(/\/projekty/);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    expect(await seenTransitions(page)).toEqual([]);
  });

  test('when they ask the system for less motion, then pages change at once without a slide', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await openArticleFromList(page);
    await back(page).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(
      page.getByRole('main').locator(`a[href="/aktuality/${article.slug}"]`).first(),
    ).toBeFocused();
    expect(await seenTransitions(page)).toEqual([]);
  });
});

test.describe("Given an administrator on a phone who opened the administration from the account sheet over the news and followed a paired payment's donor from the payments", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await pairedPayments(page);
    await followPairedPaymentsDonor(page);
  });

  test("when they press Zpět on the donor card, then the payments return with the payment's row focused", async ({
    page,
  }) => {
    await back(page).click();

    await expect(page).toHaveURL(/\/sprava\/platby\?stav=prirazene$/);
    await expect(page.getByRole('button', { name: /^Nováková Jana 10\. 10\. 2026/ })).toBeFocused();
    await expectWhollyInView(
      page,
      page.getByRole('button', { name: /^Nováková Jana 10\. 10\. 2026/ }),
    );
    await expect(overlays(page)).toHaveCount(0);
  });

  test("when they press Zpět on the donor card by keyboard, then the payment's row shows its whole focus ring", async ({
    page,
  }) => {
    await pressZpetByKeyboard(page);

    await expect(page).toHaveURL(/\/sprava\/platby\?stav=prirazene$/);
    await expect(page.getByRole('button', { name: /^Nováková Jana 10\. 10\. 2026/ })).toBeFocused();
    await expectFocusRingWhole(page);
  });

  test("when the app steps back without Zpět, then the payments return with the payment's row focused", async ({
    page,
  }) => {
    await stepBack(page);

    await expect(page).toHaveURL(/\/sprava\/platby\?stav=prirazene$/);
    await expect(page.getByRole('button', { name: /^Nováková Jana 10\. 10\. 2026/ })).toBeFocused();
    await expectWhollyInView(
      page,
      page.getByRole('button', { name: /^Nováková Jana 10\. 10\. 2026/ }),
    );
  });

  test('when they close the administration on the donor card, then the news it was opened over return', async ({
    page,
  }) => {
    await page.getByRole('banner').getByRole('button', { name: 'Zavřít' }).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: 'Co je u nás nového' })).toBeVisible();
  });
});

test.describe("Given an administrator on a wide screen who followed a paired payment's donor from the payments", () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await pairedPayments(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/platby?stav=prirazene');
    await paymentRow(page).getByRole('link', { name: 'Jana Nováková' }).click();
    await expect(page).toHaveURL(new RegExp(`/sprava/darci/${administrator.id}$`));
  });

  test("when the app steps back without Zpět, then the payments return with focus in the payment's row on the donor it left", async ({
    page,
  }) => {
    await stepBack(page);

    await expect(page).toHaveURL(/\/sprava\/platby\?stav=prirazene$/);
    await expect(paymentRow(page).getByRole('link', { name: 'Jana Nováková' })).toBeFocused();
    await expectWhollyInView(page, paymentRow(page).getByRole('link', { name: 'Jana Nováková' }));
  });

  test("when a keyboard user steps back from the donor card, then the donor link in the payment's row shows its whole focus ring", async ({
    page,
  }) => {
    await page.keyboard.press('Tab');
    await stepBack(page);

    await expect(page).toHaveURL(/\/sprava\/platby\?stav=prirazene$/);
    await expect(paymentRow(page).getByRole('link', { name: 'Jana Nováková' })).toBeFocused();
    await expectFocusRingWhole(page);
  });
});

test.describe('Given a visitor reading the news on a wide screen', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedArticle(page);
    await watchTransitions(page);
  });

  test('when they open an article and press Zpět, then pages change at once without a slide', async ({
    page,
  }) => {
    await openArticleFromList(page);
    await back(page).click();

    await expect(page).toHaveURL('/aktuality');
    expect(await seenTransitions(page)).toEqual([]);
  });
});

for (const [screen, viewport] of [
  ['a phone', { width: 390, height: 844 }],
  ['a wide screen', { width: 1280, height: 800 }],
] as const) {
  test.describe(`Given a visitor far down a long page on ${screen}`, () => {
    test.use({ viewport, reducedMotion: 'no-preference' });

    test('when they follow a link to a page not seen before, then that page shows from its top in its first frame and never slides up', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await page.goto('/o-nas');
      const band = page.locator('app-donate-band');
      await band.scrollIntoViewIfNeeded();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
      await page.evaluate(() => {
        window.nfnnSeenTops = [];
        const sample = () => {
          window.nfnnSeenTops.push([
            location.pathname,
            window.scrollY,
            document.querySelector('.page-fade') !== null,
          ]);
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });

      await band.getByRole('link', { name: 'Přispět', exact: true }).click();
      await expect(page).toHaveURL('/prispet');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight))
        .toBeGreaterThan(300);
      await expect
        .poll(() =>
          page.evaluate(() => window.nfnnSeenTops.filter(([path]) => path === '/prispet').length),
        )
        .toBeGreaterThan(20);

      const tops = await page.evaluate(() =>
        window.nfnnSeenTops
          .filter(([path, , covered]) => path === '/prispet' && !covered)
          .map(([, top]) => top),
      );
      expect(tops.filter((top) => top !== 0)).toEqual([]);
    });
  });
}

async function fingerFromEdge(target: Locator, xs: readonly number[]): Promise<void> {
  await fingerAlong(
    target,
    xs.map((x) => ({ x, y: 420 })),
    true,
  );
}

const DRAGGED_ACROSS = [30, 60, 90, 120, 150, 180, 210, 250];

function accountSheet(page: Page) {
  return page.getByRole('dialog', { name: 'Účet' });
}

test.describe('Given an administrator in the app on the home screen of a phone with the account sheet open over the news', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: 'no-preference',
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 });
      localStorage.setItem('nfnn.donor-session-app', '1');
    });
    await mockDonorApi(page);
    await publishedArticle(page);
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await page.goto('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeVisible();
  });

  async function openAdministration(page: Page): Promise<void> {
    const copied = whenAdministrationCopied(page);
    await openAccountItem(page, 'Správa');
    await expect(page).toHaveURL(/\/sprava$/);
    await copied();
    await expect(overlays(page)).toHaveCount(0);
  }

  async function backInTheAccountSheet(page: Page): Promise<void> {
    await expect(page).toHaveURL('/aktuality');
    await expect(accountSheet(page).getByRole('link', { name: /^Správa/ })).toBeFocused();
    await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeAttached();
    await expect(overlays(page)).toHaveCount(0);
  }

  async function holdTheStepBackAtItsEnd(page: Page): Promise<void> {
    await page.evaluate(() => {
      const watch = new MutationObserver(() => {
        const overlay = document.querySelector('.page-transition--moving');
        const motions = overlay?.getAnimations({ subtree: true }) ?? [];
        if (motions.length === 0) {
          return;
        }
        watch.disconnect();
        motions.forEach((motion) => {
          motion.pause();
          motion.currentTime = Number(motion.effect?.getComputedTiming().endTime ?? 0) - 1;
        });
        requestAnimationFrame(() =>
          requestAnimationFrame(() => document.documentElement.classList.add('nfnn-held')),
        );
      });
      watch.observe(document.body, { childList: true, subtree: true, attributes: true });
    });
  }

  function shareOfPixelsThatDiffer(page: Page, one: Buffer, other: Buffer): Promise<number> {
    return page.evaluate(
      async ([first, second]) => {
        const pixels = async (base64: string): Promise<ImageData> => {
          const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d')!;
          context.drawImage(bitmap, 0, 0);
          return context.getImageData(0, 0, bitmap.width, bitmap.height);
        };
        const [one, other] = await Promise.all([pixels(first), pixels(second)]);
        const [a, b] = [one.data, other.data];
        const width = one.width;
        const awayFromTheLeavingEdge = Math.floor(width * 0.95);
        let differing = 0;
        let compared = 0;
        for (let index = 0; index < a.length; index += 4) {
          if ((index / 4) % width >= awayFromTheLeavingEdge) {
            continue;
          }
          compared++;
          const distance =
            Math.abs(a[index] - b[index]) +
            Math.abs(a[index + 1] - b[index + 1]) +
            Math.abs(a[index + 2] - b[index + 2]);
          if (distance > 48) {
            differing++;
          }
        }
        return differing / compared;
      },
      [one.toString('base64'), other.toString('base64')],
    );
  }

  test('when they press Zpět in Správa, then what lies under the leaving page at the end of its way is the account sheet over the news as it then stands, nothing of the news drawn over it', async ({
    page,
  }) => {
    await openAdministration(page);
    await holdTheStepBackAtItsEnd(page);

    await page.getByRole('banner').getByRole('button', { name: 'Zpět' }).click();
    await expect(page.locator('html.nfnn-held')).toBeAttached();
    const underTheLeavingPage = await page.screenshot();
    await page.evaluate(() =>
      document
        .querySelector('.page-transition')
        ?.getAnimations({ subtree: true })
        .forEach((motion) => motion.play()),
    );
    await backInTheAccountSheet(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const standing = await page.screenshot();

    expect(await shareOfPixelsThatDiffer(page, underTheLeavingPage, standing)).toBeLessThan(0.005);
  });

  test('when they open Správa and press Zpět, then the account sheet is open over the news again with Správa focused', async ({
    page,
  }) => {
    await openAdministration(page);

    await page.getByRole('banner').getByRole('button', { name: 'Zpět' }).click();

    await backInTheAccountSheet(page);
  });

  test('when they open Správa and press Esc, then the account sheet is open over the news again with Správa focused', async ({
    page,
  }) => {
    await openAdministration(page);

    await page.keyboard.press('Escape');

    await backInTheAccountSheet(page);
  });

  test('when they open Správa and the app steps back by itself, then the account sheet is open over the news again with Správa focused', async ({
    page,
  }) => {
    await openAdministration(page);

    await stepBack(page);

    await backInTheAccountSheet(page);
  });

  test('when they open Správa, go a section deeper and step back twice, then the account sheet is open over the news again', async ({
    page,
  }) => {
    await openAdministration(page);
    await page
      .getByRole('navigation', { name: 'Sekce správy' })
      .getByRole('link', { name: /Lidé fondu, správci, zálohy/ })
      .click();
    await expect(page).toHaveURL(/\/sprava\/vice$/);

    await page.getByRole('banner').getByRole('button', { name: 'Zpět' }).click();
    await expect(page).toHaveURL(/\/sprava$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(overlays(page)).toHaveCount(0);
    await page.getByRole('banner').getByRole('button', { name: 'Zpět' }).click();

    await backInTheAccountSheet(page);
  });

  test.describe('on an iPad held upright with a keyboard', () => {
    test.use({ viewport: { width: 820, height: 1180 } });

    test('when they press Esc while typing a search for donors in Správa, then the field keeps it and the administration stays', async ({
      page,
    }) => {
      await openAdministration(page);
      await page
        .getByRole('navigation', { name: 'Sekce správy' })
        .getByRole('link', { name: /^Dárci/ })
        .click();
      await expect(page).toHaveURL(/\/sprava\/darci/);
      const search = page.getByLabel('Jméno, e-mail nebo variabilní symbol');
      await search.focus();
      await page.keyboard.type('nov');

      await page.keyboard.press('Escape');

      await waitWhileNothingMayHappen(page, 500);
      await expect(page).toHaveURL(/\/sprava\/darci/);
      await expect(search).toBeFocused();
      await expect(accountSheet(page)).toHaveCount(0);
    });
  });

  test('when they open Správa and press Zavřít, then the news returns without the account sheet', async ({
    page,
  }) => {
    await openAdministration(page);

    await page.getByRole('banner').getByRole('button', { name: 'Zavřít' }).click();

    await expect(page).toHaveURL('/aktuality');
    await expect(page.getByRole('heading', { level: 1, name: LIST_TITLE })).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('when a finger drags Správa back from the edge and lets go, then the account sheet is open over the news with Správa focused', async ({
    page,
  }) => {
    await openAdministration(page);

    await fingerFromEdge(page.getByRole('main'), [...DRAGGED_ACROSS, 300]);

    await backInTheAccountSheet(page);
  });

  test('when they open Moje dary and press Zpět, then the account sheet shows its list again over the news with Moje dary focused', async ({
    page,
  }) => {
    await openAccountItem(page, 'Moje dary');

    await page
      .getByRole('dialog', { name: 'Moje dary' })
      .getByRole('button', { name: 'Zpět' })
      .click();

    await expect(accountSheet(page).getByRole('link', { name: /^Moje dary/ })).toBeFocused();
    await expect(page).toHaveURL('/aktuality');
  });

  test('when they open Moje dary and a finger drags from the edge, then the account sheet shows its list again over the news with Moje dary focused', async ({
    page,
  }) => {
    await openAccountItem(page, 'Moje dary');

    await fingerFromEdge(
      page.getByRole('dialog', { name: 'Moje dary' }).locator('.account-section-body'),
      [...DRAGGED_ACROSS, 300],
    );

    await expect(accountSheet(page).getByRole('link', { name: /^Moje dary/ })).toBeFocused();
    await expect(page).toHaveURL('/aktuality');
  });
});
