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

interface FrameSampler {
  readonly frames: boolean[];
  stop(): boolean[];
}

function sampleEveryFrame(
  page: Page,
  ringShows: JSHandle<RingShows>,
): Promise<JSHandle<FrameSampler>> {
  return page.evaluateHandle((shows) => {
    const frames: boolean[] = [];
    let sampling = true;
    const sample = () => {
      frames.push(shows(document.activeElement));
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
  }, ringShows);
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
    const sampler = await sampleEveryFrame(page, ringShows);

    await zoomAndCloseByPointer(page, browserName);
    await expect.poll(() => sampler.evaluate((frames) => frames.frames.length)).toBeGreaterThan(2);
    const frames = await sampler.evaluate((frames) => frames.stop());

    expect(frames.filter(Boolean)).toEqual([]);
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
    'Playwright emulates forced colours only in Chromium; iOS has none, and real Safari on a Mac runs in safari.yml',
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
    "the side navigation and the window's bottom edge at 1280 px are a computer's layout; real Safari on a Mac runs them in safari.yml",
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
