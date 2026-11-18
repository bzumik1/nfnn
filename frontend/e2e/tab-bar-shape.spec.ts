import { Locator, Page } from '@playwright/test';
import { mockPublicContent, servePaymentDetails } from './baseline/screen-mocks';
import { expect, test } from './fixtures';

const PILL_INSET_PX = 4;
const BAR_HEIGHT_PX = 62;
const FINGER_PX = 44;

function bar(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Hlavní sekce' });
}

function tab(page: Page, name: string): Locator {
  return bar(page).getByRole('link', { name, exact: true });
}

async function openTab(page: Page, path: string, name: string): Promise<void> {
  await page.goto(path);
  await expect(tab(page, name)).toHaveAttribute('aria-current', 'page');
}

interface Shape {
  insetTop: number;
  insetBottom: number;
  insetRight: number;
  barInnerHeight: number;
  tabHeight: number;
}

function shapeOf(page: Page, name: string): Promise<Shape> {
  return tab(page, name).evaluate((current) => {
    const nav = current.closest('nav')!;
    const outer = nav.getBoundingClientRect();
    const left = outer.left + nav.clientLeft;
    const top = outer.top + nav.clientTop;
    const box = current.getBoundingClientRect();
    return {
      insetTop: box.top - top,
      insetBottom: top + nav.clientHeight - box.bottom,
      insetRight: left + nav.clientWidth - box.right,
      barInnerHeight: nav.clientHeight,
      tabHeight: box.height,
    };
  });
}

function labelWidth(page: Page, name: string): Promise<number> {
  return tab(page, name)
    .locator('.tab-label')
    .evaluate((label) => label.getBoundingClientRect().width);
}

interface Spacing {
  gaps: number[];
  paddingStart: number;
  paddingEnd: number;
}

function spacingOf(page: Page): Promise<Spacing> {
  return bar(page).evaluate((nav) => {
    const outer = nav.getBoundingClientRect();
    const left = outer.left + nav.clientLeft;
    const right = left + nav.clientWidth;
    const boxes = [...nav.querySelectorAll('a')].map((link) => link.getBoundingClientRect());
    return {
      gaps: boxes.slice(1).map((box, index) => box.left - boxes[index].right),
      paddingStart: boxes[0].left - left,
      paddingEnd: right - boxes[boxes.length - 1].right,
    };
  });
}

interface ShadowFit {
  reach: number;
  gap: number;
}

function shadowFit(page: Page): Promise<ShadowFit> {
  return bar(page).evaluate((nav) => {
    const lengths = /(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?/g;
    const reach = Math.max(
      0,
      ...[...getComputedStyle(nav).boxShadow.matchAll(lengths)].map(
        ([, , y, blur, spread]) => Number(y) + Number(blur) + Number(spread ?? 0),
      ),
    );
    return { reach, gap: window.innerHeight - nav.getBoundingClientRect().bottom };
  });
}

async function enlargeText(page: Page, rootPx: number): Promise<void> {
  await page.addStyleTag({ content: `html { font-size: ${rootPx}px !important; }` });
}

test.describe('Given a visitor on a phone with the floating tab bar', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await mockPublicContent(page);
    await servePaymentDetails(page);
  });

  test('when a tab is current, then its pill stands 4 px inside the bar, the bar keeps its height and the tab still holds a finger', async ({
    page,
  }) => {
    await openTab(page, '/prispet', 'Přispět');

    const shape = await shapeOf(page, 'Přispět');

    expect(shape.insetTop).toBeCloseTo(PILL_INSET_PX, 0);
    expect(shape.insetBottom).toBeCloseTo(PILL_INSET_PX, 0);
    expect(shape.insetRight).toBeGreaterThanOrEqual(PILL_INSET_PX - 0.5);
    expect(shape.barInnerHeight).toBeCloseTo(BAR_HEIGHT_PX, 0);
    expect(shape.tabHeight).toBeGreaterThanOrEqual(FINGER_PX);
  });

  test('when a tab becomes current and its label turns bold, then the label keeps its width', async ({
    page,
  }) => {
    await openTab(page, '/aktuality', 'Aktuality');
    const regular = await labelWidth(page, 'Přispět');

    await tab(page, 'Přispět').click();
    await expect(tab(page, 'Přispět')).toHaveAttribute('aria-current', 'page');

    expect(await labelWidth(page, 'Přispět')).toBeCloseTo(regular, 1);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`when the page is ${colorScheme}, then the bar's shadow ends inside the gap below it`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openTab(page, '/prispet', 'Přispět');

      const fit = await shadowFit(page);

      expect(fit.reach).toBeGreaterThan(0);
      expect(fit.reach).toBeLessThanOrEqual(fit.gap);
    });
  }

  test('when the bar floats over the dark landing page, then its shadow ends inside the gap below it', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(bar(page)).toHaveClass(/ui-glass--on-dark/);

    const fit = await shadowFit(page);

    expect(fit.reach).toBeGreaterThan(0);
    expect(fit.reach).toBeLessThanOrEqual(fit.gap);
  });

  test("when the text grows, then the gaps between the tabs and the bar's inner padding grow with it", async ({
    page,
  }) => {
    await openTab(page, '/prispet', 'Přispět');
    await enlargeText(page, 16);
    const regular = await spacingOf(page);

    await enlargeText(page, 24);
    const large = await spacingOf(page);

    for (const [index, gap] of large.gaps.entries()) {
      expect(gap).toBeGreaterThan(regular.gaps[index]);
    }
    expect(large.paddingStart).toBeGreaterThan(regular.paddingStart);
    expect(large.paddingEnd).toBeGreaterThan(regular.paddingEnd);
  });
});
