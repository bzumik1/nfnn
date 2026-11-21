import type { JSHandle, Locator, Page } from '@playwright/test';
import {
  donorWithDonations,
  mockAdministration,
  rememberedSession,
  servePaymentDetails,
} from './baseline/screen-mocks';
import {
  mockDonorApi,
  rememberedDonorSession,
  showAccountList,
  whenAdministrationCopied,
} from './donor-session';
import { ADMINISTRATION_LOCKED, expect, test } from './fixtures';

const QR_BUTTON = 'Zvětšit: QR platba na účet Nadačního fondu Nová naděje';
const PHONE_LAYOUT_MAX_WIDTH = 899;
const MOST_TAB_STOPS = 90;
const SUBPIXEL = 0.5;
const HOVER_SKIP_REASON =
  'a mouse that rests over a card exists only in the desktop Chromium project; WebKit runs as an iPhone, which has no hover';

type RingShows = (element: Element | null) => boolean;

interface RingProblem {
  readonly stop: string;
  readonly problem: string;
}

function installRingCheck(page: Page): Promise<JSHandle<RingShows>> {
  return page.evaluateHandle(() => {
    const alphaOf = (colour: string): number => {
      if (colour === 'transparent') {
        return 0;
      }
      const slashed = /\/\s*([\d.]+)(%?)\s*\)$/.exec(colour);
      if (slashed) {
        return parseFloat(slashed[1]) / (slashed[2] === '%' ? 100 : 1);
      }
      const legacy = /^rgba\((?:[^,]+,){3}\s*([\d.]+)\)$/.exec(colour);
      return legacy ? parseFloat(legacy[1]) : 1;
    };
    const drawn = (style: CSSStyleDeclaration): boolean =>
      style.outlineStyle !== 'none' &&
      parseFloat(style.outlineWidth) > 0 &&
      alphaOf(style.outlineColor) > 0;
    return (element: Element | null): boolean => {
      if (element === null || element === document.body) {
        return false;
      }
      const field = element.closest('app-form-field');
      return (
        drawn(getComputedStyle(element)) ||
        drawn(getComputedStyle(element, '::after')) ||
        drawn(getComputedStyle(element, '::before')) ||
        (field !== null && drawn(getComputedStyle(field)))
      );
    };
  });
}

function focusedShowsRing(page: Page, ringShows: JSHandle<RingShows>): Promise<boolean> {
  return page.evaluate((shows) => shows(document.activeElement), ringShows);
}

interface SampledFrame {
  readonly ring: boolean;
  readonly onTarget: boolean;
}

interface FrameSampler {
  readonly frames: SampledFrame[];
  stop(): SampledFrame[];
}

async function sampleEveryFrame(
  page: Page,
  ringShows: JSHandle<RingShows>,
  target: Locator,
): Promise<JSHandle<FrameSampler>> {
  const element = await target.elementHandle();
  return page.evaluateHandle(
    ([shows, focusTarget]) => {
      const frames: SampledFrame[] = [];
      let sampling = true;
      const sample = () => {
        frames.push({
          ring: shows(document.activeElement),
          onTarget: document.activeElement === focusTarget,
        });
        if (sampling) {
          requestAnimationFrame(sample);
        }
      };
      requestAnimationFrame(sample);
      return {
        frames,
        stop: () => {
          sampling = false;
          return frames;
        },
      };
    },
    [ringShows, element] as const,
  );
}

function press(page: Page, control: Locator, browserName: string): Promise<void> {
  return browserName === 'webkit' ? control.tap() : control.click();
}

async function openDonatePage(page: Page): Promise<void> {
  await servePaymentDetails(page);
  await page.goto('/prispet');
  await expect(page.locator('#prispet .bank')).toContainText('5544332217/2010');
}

function qrButton(page: Page): Locator {
  return page.getByRole('button', { name: QR_BUTTON });
}

async function showQrButton(page: Page, browserName: string): Promise<void> {
  if ((page.viewportSize()?.width ?? 0) <= PHONE_LAYOUT_MAX_WIDTH) {
    await press(
      page,
      page.getByRole('button', { name: /Platíte z\sjiného zařízení\?/ }),
      browserName,
    );
  }
  await expect(qrButton(page)).toBeVisible();
}

async function zoomAndCloseByPointer(page: Page, browserName: string): Promise<void> {
  await press(page, qrButton(page), browserName);
  const viewer = page.getByRole('dialog', { name: 'Zvětšený QR kód' });
  await expect(viewer).toBeVisible();
  await press(page, viewer.getByRole('button', { name: 'Zavřít' }), browserName);
  await expect(viewer).toHaveCount(0);
  await expect(qrButton(page)).toBeFocused();
}

test.describe('Given a visitor on the Přispět page who works with a finger or a mouse', () => {
  test.beforeEach(async ({ page, browserName }) => {
    await openDonatePage(page);
    await showQrButton(page, browserName);
  });

  test('when the zoomed QR closes and the site returns the focus to the QR, then the QR holds the focus without a ring', async ({
    page,
    browserName,
  }) => {
    const ringShows = await installRingCheck(page);

    await zoomAndCloseByPointer(page, browserName);

    expect(await focusedShowsRing(page, ringShows)).toBe(false);
  });

  test('when they press and the site moves the focus, then no frame from the press to the returned focus shows a ring', async ({
    page,
    browserName,
  }) => {
    const ringShows = await installRingCheck(page);
    const sampler = await sampleEveryFrame(page, ringShows, qrButton(page));

    await zoomAndCloseByPointer(page, browserName);
    await expect
      .poll(() => sampler.evaluate((sampled) => sampled.frames.some((frame) => frame.onTarget)))
      .toBe(true);
    const frames = await sampler.evaluate((sampled) => sampled.stop());

    expect(frames.filter((frame) => frame.ring)).toEqual([]);
  });

  test('when they press Tab after that, then the control the focus reaches shows its ring at once', async ({
    page,
    browserName,
  }) => {
    const ringShows = await installRingCheck(page);
    await zoomAndCloseByPointer(page, browserName);

    await page.keyboard.press('Tab');

    expect(await focusedShowsRing(page, ringShows)).toBe(true);
  });

  test('when they press Shift alone after that, then the QR still shows no ring', async ({
    page,
    browserName,
  }) => {
    const ringShows = await installRingCheck(page);
    await zoomAndCloseByPointer(page, browserName);

    await page.keyboard.press('Shift');

    await expect(qrButton(page)).toBeFocused();
    expect(await focusedShowsRing(page, ringShows)).toBe(false);
  });

  test('when they choose Jiná částka and the site moves the focus into its field, then the field shows no ring', async ({
    page,
    browserName,
  }) => {
    const ringShows = await installRingCheck(page);

    await press(page, page.getByRole('radio', { name: 'Jiná částka' }), browserName);

    await expect(page.getByLabel('Vlastní částka v korunách')).toBeFocused();
    expect(await focusedShowsRing(page, ringShows)).toBe(false);
  });

  test('when they type an amount into the field the site focused, then it still shows no ring, and Tab brings the ring to the next control', async ({
    page,
    browserName,
  }) => {
    const ringShows = await installRingCheck(page);
    const amount = page.getByLabel('Vlastní částka v korunách');
    await press(page, page.getByRole('radio', { name: 'Jiná částka' }), browserName);
    await expect(amount).toBeFocused();

    await page.keyboard.type('500');

    await expect(amount).toHaveValue('500');
    expect(await focusedShowsRing(page, ringShows)).toBe(false);

    await page.keyboard.press('Tab');

    await expect(amount).not.toBeFocused();
    expect(await focusedShowsRing(page, ringShows)).toBe(true);
  });
});

test.describe('Given a visitor on the Přispět page who works with the keyboard', () => {
  test('when the zoomed QR closes by Escape and the site returns the focus to the QR, then the QR shows its ring', async ({
    page,
    browserName,
  }) => {
    await openDonatePage(page);
    await showQrButton(page, browserName);
    const ringShows = await installRingCheck(page);
    await qrButton(page).focus();
    await page.keyboard.press('Enter');
    const viewer = page.getByRole('dialog', { name: 'Zvětšený QR kód' });
    await expect(viewer).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(viewer).toHaveCount(0);
    await expect(qrButton(page)).toBeFocused();
    expect(await focusedShowsRing(page, ringShows)).toBe(true);
  });
});

test.describe('Given a visitor whose system forces its own colours', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Playwright emulates forced colours only in Chromium, and WebKit on iOS and macOS never forces them',
  );

  test('when they choose Jiná částka by mouse and the focus moves into its field, then the field shows its ring all the same', async ({
    page,
    browserName,
  }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openDonatePage(page);
    const ringShows = await installRingCheck(page);

    await press(page, page.getByRole('radio', { name: 'Jiná částka' }), browserName);

    await expect(page.getByLabel('Vlastní částka v korunách')).toBeFocused();
    expect(await focusedShowsRing(page, ringShows)).toBe(true);
  });
});

const ARTICLES = ['Zahrada pro děti', 'Nová dílna'].map((title, index) => ({
  id: `0199f3e0-0000-7000-8000-00000000f00${index + 1}`,
  slug: `aktualita-${index + 1}`,
  title,
  tag: 'Projekt',
  perex: 'Krátké shrnutí aktuality.',
  body: 'První odstavec.',
  coverImage: null,
  publishedOn: `2026-10-2${index}`,
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
}));

const STORIES = ['Sofinka', 'Natálka'].map((title, index) => ({
  id: `0199f3e0-0000-7000-8000-00000000f10${index + 1}`,
  slug: `pribeh-${index + 1}`,
  title,
  year: 2025,
  category: 'CHILDREN',
  tag: 'Pomůcky',
  perex: `Příběh ${title}.`,
  body: 'Text příběhu.',
  coverImage: null,
  publishedOn: `2025-10-0${index + 1}`,
  createdAt: '2025-09-19T09:00:00Z',
  updatedAt: '2025-10-01T07:30:00Z',
  live: true,
}));

interface CardKind {
  readonly name: string;
  readonly listPath: string;
  readonly apiPath: string;
  readonly host: string;
  readonly items: readonly { readonly slug: string; readonly title: string }[];
}

const CARD_KINDS: readonly CardKind[] = [
  {
    name: 'an article to the news list',
    listPath: '/aktuality',
    apiPath: '/api/content/news',
    host: 'app-news-card',
    items: ARTICLES,
  },
  {
    name: 'a story to the Pomáháme tab',
    listPath: '/projekty',
    apiPath: '/api/content/projects',
    host: 'app-story-tile',
    items: STORIES,
  },
];

interface CardLift {
  readonly verticalShift: number;
  readonly shadow: number;
}

function cardItem(kind: CardKind): { readonly slug: string; readonly title: string } {
  return kind.items[kind.items.length - 1];
}

async function openCardItemFromList(
  page: Page,
  kind: CardKind,
  open: (link: Locator) => Promise<void>,
): Promise<void> {
  for (const item of kind.items) {
    await page.route(
      (url) => url.pathname === `${kind.apiPath}/${item.slug}`,
      (route) => route.fulfill({ json: item }),
    );
  }
  await page.route(
    (url) => url.pathname === kind.apiPath,
    (route) =>
      route.fulfill({
        json: { items: kind.items, page: 0, size: 50, total: kind.items.length, hasMore: false },
      }),
  );
  await page.goto(kind.listPath);
  await open(cardLink(page, kind));
  await expect(page.getByRole('heading', { level: 1, name: cardItem(kind).title })).toBeFocused();
}

function cardLink(page: Page, kind: CardKind): Locator {
  return page.locator(kind.host).getByRole('link', { name: cardItem(kind).title });
}

function cardOf(page: Page, kind: CardKind): Locator {
  return page.locator(kind.host).filter({ has: cardLink(page, kind) });
}

function backButton(page: Page): Locator {
  return page.getByRole('banner').getByRole('button', { name: 'Zpět' });
}

function settledLiftOf(card: Locator): Promise<CardLift> {
  return card.evaluate(async (host) => {
    await Promise.all(
      host
        .getAnimations({ subtree: true })
        .filter((animation) => (animation.effect as KeyframeEffect | null)?.target === host)
        .map((animation) => animation.finished),
    );
    const [, y = '0'] = getComputedStyle(host).translate.split(' ');
    return {
      verticalShift: parseFloat(y) || 0,
      shadow: parseFloat(getComputedStyle(host, '::after').opacity),
    };
  });
}

for (const kind of CARD_KINDS) {
  test.describe(`Given a visitor who comes back from ${kind.name}`, () => {
    test('when they press Zpět with a finger or a mouse and the site focuses the card they came from, then the card is not lifted', async ({
      page,
      browserName,
    }) => {
      await mockDonorApi(page);
      await openCardItemFromList(page, kind, (link) => press(page, link, browserName));

      await press(page, backButton(page), browserName);

      await expect(cardLink(page, kind)).toBeFocused();
      const lift = await settledLiftOf(cardOf(page, kind));
      expect(lift.verticalShift).toBeCloseTo(0);
      expect(lift.shadow).toBe(0);
    });

    test('when they press Zpět with the keyboard and the site focuses the card they came from, then the card is lifted', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await openCardItemFromList(page, kind, async (link) => {
        await link.focus();
        await page.keyboard.press('Enter');
      });

      await backButton(page).focus();
      await page.keyboard.press('Enter');

      await expect(cardLink(page, kind)).toBeFocused();
      const lift = await settledLiftOf(cardOf(page, kind));
      expect(lift.verticalShift).toBeLessThan(0);
      expect(lift.shadow).toBe(1);
    });

    test('when they press Zpět with a mouse and then point at the card the site focused, then the card is lifted', async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', HOVER_SKIP_REASON);
      await mockDonorApi(page);
      await openCardItemFromList(page, kind, (link) => link.click());
      await backButton(page).click();
      await expect(cardLink(page, kind)).toBeFocused();

      await cardLink(page, kind).hover();

      await expect(cardLink(page, kind)).toBeFocused();
      const lift = await settledLiftOf(cardOf(page, kind));
      expect(lift.verticalShift).toBeLessThan(0);
      expect(lift.shadow).toBe(1);
    });
  });
}

function ringProblemsOfFocused(page: Page, ringShows: JSHandle<RingShows>): Promise<string[]> {
  return page.evaluate(
    ([shows, subpixel]) => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement) || element === document.body) {
        return [];
      }
      const problems: string[] = [];
      if (!shows(element)) {
        problems.push('shows no ring');
        return problems;
      }
      const style = getComputedStyle(element);
      const reach = Math.max(0, parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth));
      const box = element.getBoundingClientRect();
      const ring = {
        left: box.left - reach,
        right: box.right + reach,
        top: box.top - reach,
        bottom: box.bottom + reach,
      };
      const windowBottom = document.documentElement.clientHeight;
      if (ring.bottom - windowBottom > subpixel) {
        problems.push(`the window's bottom edge cuts ${ring.bottom - windowBottom} px`);
      }
      for (
        let clip = element.parentElement;
        clip !== null && clip !== document.body;
        clip = clip.parentElement
      ) {
        const clipStyle = getComputedStyle(clip);
        if (clipStyle.overflowX === 'visible' && clipStyle.overflowY === 'visible') {
          continue;
        }
        const outer = clip.getBoundingClientRect();
        const inner = {
          left: outer.left + clip.clientLeft,
          top: outer.top + clip.clientTop,
          right: outer.left + clip.clientLeft + clip.clientWidth,
          bottom: outer.top + clip.clientTop + clip.clientHeight,
        };
        const name = `${clip.tagName.toLowerCase()}.${[...clip.classList].join('.')}`;
        const cuts = {
          left: inner.left - ring.left,
          right: ring.right - inner.right,
          top: inner.top - ring.top,
          bottom: ring.bottom - inner.bottom,
        };
        for (const [side, cut] of Object.entries(cuts)) {
          if (cut > subpixel) {
            problems.push(`${name} cuts ${cut} px on the ${side}`);
          }
        }
        const corners = [
          ['top-left', box.top - inner.top, box.left - inner.left, 'borderTopLeftRadius'],
          ['top-right', box.top - inner.top, inner.right - box.right, 'borderTopRightRadius'],
          [
            'bottom-left',
            inner.bottom - box.bottom,
            box.left - inner.left,
            'borderBottomLeftRadius',
          ],
          [
            'bottom-right',
            inner.bottom - box.bottom,
            inner.right - box.right,
            'borderBottomRightRadius',
          ],
        ] as const;
        for (const [corner, fromEdge, fromSide, property] of corners) {
          const cardRadius = parseFloat(clipStyle[property]);
          const ownRadius = parseFloat(style[property]);
          if (
            cardRadius > 0 &&
            Math.abs(fromEdge) <= subpixel &&
            Math.abs(fromSide) <= subpixel &&
            Math.abs(cardRadius - ownRadius) > subpixel
          ) {
            problems.push(
              `its ${corner} corner has ${ownRadius} px where ${name} rounds ${cardRadius} px`,
            );
          }
        }
      }
      return problems;
    },
    [ringShows, SUBPIXEL] as const,
  );
}

function nameOfFocused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (element === null) {
      return '';
    }
    const text = (element.getAttribute('aria-label') ?? element.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
    return `${element.tagName.toLowerCase()} "${text}"`;
  });
}

async function ringProblemsAlongTab(
  page: Page,
  within: Locator | null = null,
): Promise<RingProblem[]> {
  const ringShows = await installRingCheck(page);
  const problems: RingProblem[] = [];
  const reached = new Set<string>();
  for (let stop = 0; stop < MOST_TAB_STOPS; stop++) {
    await page.keyboard.press('Tab');
    const key = await page.evaluate(() => {
      const element = document.activeElement;
      if (element === null || element === document.body) {
        return 'body';
      }
      const index = [...document.querySelectorAll('*')].indexOf(element);
      return `${index}`;
    });
    if (reached.has(key)) {
      break;
    }
    reached.add(key);
    if (
      within !== null &&
      !(await within.evaluate((box) => box.contains(document.activeElement)))
    ) {
      continue;
    }
    const name = await nameOfFocused(page);
    for (const problem of await ringProblemsOfFocused(page, ringShows)) {
      problems.push({ stop: name, problem });
    }
  }
  expect(reached.size).toBeGreaterThan(3);
  return problems;
}

const AREAS = [
  {
    name: 'the donor overview',
    open: async (page: Page) => {
      await mockDonorApi(page, donorWithDonations);
      await rememberedDonorSession(page);
      await page.goto('/darce/prehled');
      await expect(page.getByRole('heading', { level: 1, name: 'Můj přehled' })).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 2, name: 'Poslední dar', exact: true }),
      ).toBeVisible();
    },
  },
  {
    name: 'the administration overview',
    open: async (page: Page) => {
      await mockDonorApi(page, donorWithDonations);
      await mockAdministration(page);
      await rememberedSession(page);
      const copied = whenAdministrationCopied(page);
      await page.goto('/sprava');
      await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
      await copied();
    },
  },
];

test.describe('Given a keyboard user on a computer', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    "the side navigation and the window's bottom edge at 1280 px are a computer's layout; WebKit runs the phone cases above",
  );
  test.use({ viewport: { width: 1280, height: 640 } });

  for (const area of AREAS) {
    test(`when they Tab through ${area.name}, then every ring shows whole: inside the window, uncut by the side navigation or a card, and round where a card's corner is`, async ({
      page,
    }) => {
      await area.open(page);

      expect(await ringProblemsAlongTab(page)).toEqual([]);
    });
  }

  test("when Tab reaches a control whose box ends just above the window's bottom edge, then the page scrolls until its ring shows whole", async ({
    page,
  }) => {
    await AREAS[0].open(page);
    const ringShows = await installRingCheck(page);
    const target = page.getByRole('main').locator('a[href], button').last();
    await target.evaluate((element: HTMLElement) => element.focus({ preventScroll: true }));
    await page.keyboard.press('Shift+Tab');
    await target.evaluate((element) => {
      const below = element.getBoundingClientRect().bottom - document.documentElement.clientHeight;
      window.scrollBy({ top: below + 1, behavior: 'instant' });
    });
    const bottomBefore = await target.evaluate(
      (element) => document.documentElement.clientHeight - element.getBoundingClientRect().bottom,
    );
    expect(bottomBefore).toBeGreaterThan(0);
    expect(bottomBefore).toBeLessThan(2);

    await page.keyboard.press('Tab');

    await expect(target).toBeFocused();
    expect(await ringProblemsOfFocused(page, ringShows)).toEqual([]);
  });

  test("when they Tab through the account sheet's rows, then the first and last row's rings follow the group's corners", async ({
    page,
  }) => {
    await mockDonorApi(page, donorWithDonations);
    await rememberedDonorSession(page);
    await page.goto('/darce/prehled');
    await expect(page.getByRole('heading', { level: 1, name: 'Můj přehled' })).toBeVisible();
    const sheet = await showAccountList(page);

    expect(await ringProblemsAlongTab(page, sheet)).toEqual([]);
  });
});
