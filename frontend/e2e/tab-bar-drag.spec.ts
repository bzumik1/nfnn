import { Locator, Page } from '@playwright/test';
import { browserEntries } from './app-history';
import { mockDonorApi } from './donor-session';
import { expect, test } from './fixtures';

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c001',
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

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Finger {
  down(point: Point): Promise<void>;
  move(point: Point): Promise<void>;
  up(point: Point): Promise<void>;
}

async function realFinger(page: Page): Promise<Finger> {
  const cdp = await page.context().newCDPSession(page);
  return {
    down: async ({ x, y }) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    },
    move: async ({ x, y }) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    },
    up: async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
  };
}

function pointerFinger(page: Page): Finger {
  const fire = (type: string, point: Point) =>
    page.evaluate(
      ({ type, point }) => {
        const target = document.elementFromPoint(point.x, point.y) ?? document.body;
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            button: type === 'pointermove' ? -1 : 0,
            clientX: point.x,
            clientY: point.y,
            bubbles: true,
            cancelable: true,
          }),
        );
        return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      },
      { type, point },
    );
  return {
    down: (point) => fire('pointerdown', point),
    move: (point) => fire('pointermove', point),
    up: (point) => fire('pointerup', point),
  };
}

async function fingerOn(page: Page, browserName: string): Promise<Finger> {
  return browserName === 'chromium' ? realFinger(page) : pointerFinger(page);
}

function bar(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Hlavní sekce' });
}

function tab(page: Page, name: string): Locator {
  return bar(page).getByRole('link', { name, exact: true });
}

async function centreOf(locator: Locator): Promise<Point> {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function slide(finger: Finger, from: Point, to: Point): Promise<void> {
  await finger.down(from);
  for (let step = 1; step <= 8; step++) {
    await finger.move({
      x: from.x + ((to.x - from.x) * step) / 8,
      y: from.y + ((to.y - from.y) * step) / 8,
    });
  }
  await finger.up(to);
}

test.describe('Given a visitor on a phone with the tab bar under the finger', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await page.route(
      (url) => url.pathname === `/api/content/news/${article.slug}`,
      (route) => route.fulfill({ json: article }),
    );
    await page.route(
      (url) => url.pathname === '/api/content/news',
      (route) =>
        route.fulfill({ json: { items: [article], page: 0, size: 10, total: 1, hasMore: false } }),
    );
    await page.goto('/o-nas');
    await expect(tab(page, 'O nás')).toHaveAttribute('aria-current', 'page');
  });

  test('when the finger slides along the bar from O nás to Pomáháme and lets go, then Pomáháme opens without a new browser entry', async ({
    page,
    browserName,
  }) => {
    const entries = await browserEntries(page);
    const finger = await fingerOn(page, browserName);

    await slide(finger, await centreOf(tab(page, 'O nás')), await centreOf(tab(page, 'Pomáháme')));

    await expect(page).toHaveURL('/projekty');
    await expect(tab(page, 'Pomáháme')).toHaveAttribute('aria-current', 'page');
    expect(await browserEntries(page)).toBe(entries);
  });

  test('when the finger slides to a tab left deeper in it, then that tab opens where it was left', async ({
    page,
    browserName,
  }) => {
    await page.goto(`/aktuality/${article.slug}`);
    await tab(page, 'O nás').tap();
    await expect(page).toHaveURL('/o-nas');
    const finger = await fingerOn(page, browserName);

    await slide(finger, await centreOf(tab(page, 'O nás')), await centreOf(tab(page, 'Aktuality')));

    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
    await expect(tab(page, 'Aktuality')).toHaveAttribute('aria-current', 'true');
  });

  test('when the finger slides over the tabs and then up off the bar before letting go, then the page stays on O nás', async ({
    page,
    browserName,
  }) => {
    const finger = await fingerOn(page, browserName);
    const start = await centreOf(tab(page, 'O nás'));
    const over = await centreOf(tab(page, 'Přispět'));

    await finger.down(start);
    await finger.move({ x: start.x + 40, y: start.y });
    await finger.move(over);
    await finger.move({ x: over.x, y: over.y - 200 });
    await finger.up({ x: over.x, y: over.y - 200 });

    await expect(tab(page, 'O nás')).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveURL('/o-nas');
  });

  test('when the finger holds over the last tab, then the pill stands centred under the finger', async ({
    page,
    browserName,
  }) => {
    const finger = await fingerOn(page, browserName);
    const start = await centreOf(tab(page, 'O nás'));
    const last = tab(page, 'Přispět');
    const end = await centreOf(last);

    await finger.down(start);
    for (let step = 1; step <= 8; step++) {
      await finger.move({ x: start.x + ((end.x - start.x) * step) / 8, y: start.y });
    }

    const pill = await centreOf(bar(page).locator('.tab-bar-pill'));
    expect(Math.abs(pill.x - end.x)).toBeLessThan(2);
    expect(Math.abs(pill.y - end.y)).toBeLessThan(2);
    await finger.up(end);
    await expect(page).toHaveURL('/prispet');
  });

  test('when reduced motion is asked for and the finger rests off a tab centre, then the pill jumps to the centre of the tab under it', async ({
    page,
    browserName,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const finger = await fingerOn(page, browserName);
    const start = await centreOf(tab(page, 'O nás'));
    const target = tab(page, 'Aktuality');
    const centre = await centreOf(target);
    const offCentre = { x: centre.x + 15, y: centre.y };

    await finger.down(start);
    await finger.move({ x: (start.x + offCentre.x) / 2, y: start.y });
    await finger.move(offCentre);

    const pill = await centreOf(bar(page).locator('.tab-bar-pill'));
    expect(Math.abs(pill.x - centre.x)).toBeLessThan(2);
    await finger.up(offCentre);
    await expect(page).toHaveURL('/aktuality');
  });

  test('when a tab is tapped, then it opens as before', async ({ page }) => {
    await tab(page, 'Aktuality').tap();

    await expect(page).toHaveURL('/aktuality');
    await expect(tab(page, 'Aktuality')).toHaveAttribute('aria-current', 'page');
  });

  test('when the finger drags up from the bar, then the page under it does not scroll', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'real touch input through CDP is Chromium only; Safari on the simulators and the device checklist cover the scroll there',
    );
    const finger = await realFinger(page);
    const start = await centreOf(tab(page, 'Aktuality'));

    await finger.down(start);
    for (let step = 1; step <= 8; step++) {
      await finger.move({ x: start.x, y: start.y - step * 40 });
    }
    await finger.up({ x: start.x, y: start.y - 320 });

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page).toHaveURL('/o-nas');
  });
});
