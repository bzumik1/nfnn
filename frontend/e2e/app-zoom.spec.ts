import { CDPSession, devices, Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi } from './donor-session';

const IMAGE_ID = '0199f3e0-0000-7000-8000-00000000a001';
const WIDE_PHOTO = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900"><rect width="1440" height="900" fill="#7aa"/><circle cx="720" cy="450" r="200" fill="#fd8"/></svg>`;

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c001',
  slug: 'zahrada-pro-deti',
  title: 'Zahrada pro děti',
  tag: 'Projekt',
  perex: 'Stavíme zahradu, kde si děti budou hrát.',
  body: 'První odstavec.\n\nDruhý odstavec.',
  coverImage: { id: IMAGE_ID, url: `/api/content/media/${IMAGE_ID}`, alt: 'Děti sázejí stromek' },
  publishedOn: '2026-10-20',
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
};

async function publishedArticle(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/content/news/${article.slug}`,
    (route) => route.fulfill({ json: article }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/svg+xml', body: WIDE_PHOTO }),
  );
}

async function pageScale(page: Page): Promise<number> {
  return page.evaluate(() => window.visualViewport?.scale ?? 1);
}

async function width(locator: Locator): Promise<number> {
  return (await locator.boundingBox())?.width ?? 0;
}

async function left(locator: Locator): Promise<number> {
  return (await locator.boundingBox())?.x ?? 0;
}

async function tap(cdp: CDPSession, x: number, y: number): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function openArticlePhoto(page: Page): Promise<{ viewer: Locator; photo: Locator }> {
  await page.goto(`/aktuality/${article.slug}`);
  await page.getByRole('button', { name: 'Zvětšit fotku: Děti sázejí stromek' }).click();
  const viewer = page.getByRole('dialog', { name: 'Zvětšená fotka' });
  const photo = viewer.getByRole('img', { name: 'Děti sázejí stromek' });
  await expect.poll(() => width(photo)).toBeGreaterThan(300);
  return { viewer, photo };
}

async function pinch(
  cdp: CDPSession,
  x: number,
  y: number,
  from: number,
  to: number,
): Promise<void> {
  const fingers = (spread: number) => [
    { x: x - spread / 2, y, id: 1 },
    { x: x + spread / 2, y, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(from) });
  for (let step = 1; step <= 10; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: fingers(from + ((to - from) * step) / 10),
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe('Given a visitor on a phone, where the site behaves like an app', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'touch input through CDP is Chromium only; the iPhone pinch lock is on the device checklist',
  );
  test.use({
    viewport: devices['Pixel 7'].viewport,
    userAgent: devices['Pixel 7'].userAgent,
    deviceScaleFactor: devices['Pixel 7'].deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
  });

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they pinch the page with two fingers, then the whole page stays at its size', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const cdp = await page.context().newCDPSession(page);

    await pinch(cdp, 195, 400, 80, 240);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

    expect(await pageScale(page)).toBe(1);
  });

  test('when the page loads, then the browser is told to answer a double tap without zooming', async ({
    page,
  }) => {
    await page.goto('/');

    expect(await page.evaluate(() => getComputedStyle(document.documentElement).touchAction)).toBe(
      'manipulation',
    );
  });

  test('when they tap the photo of a news article and spread two fingers on it, then the photo grows in the viewer while the page stays at its size, and Back returns to the photo', async ({
    page,
  }) => {
    await publishedArticle(page);
    await page.goto(`/aktuality/${article.slug}`);
    const trigger = page.getByRole('button', { name: 'Zvětšit fotku: Děti sázejí stromek' });

    await trigger.click();

    const viewer = page.getByRole('dialog', { name: 'Zvětšená fotka' });
    await expect(viewer).toBeVisible();
    const photo = viewer.getByRole('img', { name: 'Děti sázejí stromek' });
    await expect(photo).toBeVisible();
    await expect.poll(() => width(photo)).toBeGreaterThan(300);
    const fitted = await width(photo);
    const stage = await viewer.getByRole('group', { name: 'Zvětšená fotka' }).boundingBox();
    const cdp = await page.context().newCDPSession(page);

    await pinch(cdp, stage!.x + stage!.width / 2, stage!.y + stage!.height / 2, 80, 240);

    await expect.poll(() => width(photo)).toBeGreaterThan(fitted * 2.5);
    expect(await pageScale(page)).toBe(1);
    await expect(viewer.getByRole('button', { name: /vrátit původní velikost/ })).not.toHaveText(
      '100\u00a0%',
    );

    await page.goBack();

    await expect(viewer).toBeHidden();
    await expect(page).toHaveURL(`/aktuality/${article.slug}`);
    await expect(trigger).toBeFocused();
  });

  test('when they double-tap the photo in the viewer with a finger, then it zooms in, and after two more taps it fits again', async ({
    page,
  }) => {
    await publishedArticle(page);
    const { viewer, photo } = await openArticlePhoto(page);
    const fitted = await width(photo);
    const stage = (await viewer.getByRole('group', { name: 'Zvětšená fotka' }).boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const x = stage.x + stage.width / 2;
    const y = stage.y + stage.height / 2;

    await tap(cdp, x, y);
    await tap(cdp, x, y);
    await expect.poll(() => width(photo)).toBeCloseTo(fitted * 2.5, 0);

    await tap(cdp, x, y);
    await tap(cdp, x, y);
    await expect.poll(() => width(photo)).toBeCloseTo(fitted, 0);
  });

  test('when they tap the payment QR in Přispět, then the code opens large in the viewer and the plus button enlarges it further', async ({
    page,
  }) => {
    await page.goto('/');
    const trigger = page.getByRole('button', {
      name: 'Zvětšit: QR platba na účet Nadačního fondu Nová naděje',
    });
    await expect(trigger).toBeVisible();
    const onPage = await width(trigger);

    await trigger.click();

    const viewer = page.getByRole('dialog', { name: 'Zvětšený QR kód' });
    const code = viewer.getByRole('img', { name: 'QR platba na účet Nadačního fondu Nová naděje' });
    await expect(code).toBeVisible();
    await expect.poll(() => width(code)).toBeGreaterThan(onPage);
    const fitted = await width(code);

    await viewer.getByRole('button', { name: 'Přiblížit' }).click();

    await expect.poll(() => width(code)).toBeCloseTo(fitted * 1.5, 0);
    await expect(viewer.getByRole('status').filter({ hasText: /\S/ })).toHaveText(
      'Přiblíženo na 150\u00a0%',
    );

    await page.keyboard.press('Escape');

    await expect(viewer).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe('Given a visitor on a computer', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await publishedArticle(page);
  });

  test('when the page loads, then its viewport stops pinching only by its largest scale and never forbids scaling outright', async ({
    page,
  }) => {
    await page.goto('/');

    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    const parts = viewport!.split(',').map((part) => part.trim());

    expect(parts).toContain('maximum-scale=1');
    expect(parts.filter((part) => part.startsWith('user-scalable'))).toEqual([]);
    expect(parts.filter((part) => part.startsWith('minimum-scale'))).toEqual([]);
  });

  test('when a news article has a square photo, then the page still shows it cropped to its wide frame, and the viewer shows it whole', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname.startsWith('/api/content/media/'),
      (route) =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect width="900" height="900" fill="#7aa"/></svg>',
        }),
    );
    await page.goto(`/aktuality/${article.slug}`);
    const onPage = page.getByRole('img', { name: 'Děti sázejí stromek' });
    await expect.poll(async () => (await onPage.boundingBox())?.height ?? 0).toBeGreaterThan(100);

    const frame = (await onPage.boundingBox())!;
    expect(frame.width / frame.height).toBeCloseTo(1.6, 1);

    await page.getByRole('button', { name: 'Zvětšit fotku: Děti sázejí stromek' }).click();
    const whole = page
      .getByRole('dialog', { name: 'Zvětšená fotka' })
      .getByRole('img', { name: 'Děti sázejí stromek' });
    await expect.poll(() => width(whole)).toBeGreaterThan(100);
    const shown = (await whole.boundingBox())!;
    expect(shown.width / shown.height).toBeCloseTo(1, 1);
  });

  test('when Safari starts a pinch of the page, then the site cancels the gesture', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const cancelled = await page.evaluate(() =>
      ['gesturestart', 'gesturechange', 'gestureend'].map((type) => {
        const gesture = new Event(type, { bubbles: true, cancelable: true });
        document.body.dispatchEvent(gesture);
        return gesture.defaultPrevented;
      }),
    );

    expect(cancelled).toEqual([true, true, true]);
  });

  test('when they zoom the photo in and drag it with the mouse, then it follows the pointer and stops at its edge', async ({
    page,
  }) => {
    const { viewer, photo } = await openArticlePhoto(page);
    const stage = (await viewer.getByRole('group', { name: 'Zvětšená fotka' }).boundingBox())!;
    const fitted = await width(photo);
    await viewer.getByRole('button', { name: 'Přiblížit' }).click();
    await viewer.getByRole('button', { name: 'Přiblížit' }).click();
    await expect.poll(() => width(photo)).toBeCloseTo(fitted * 2.25, 0);
    const centred = await left(photo);
    const x = stage.x + stage.width / 2;
    const y = stage.y + stage.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y, { steps: 4 });
    await page.mouse.up();

    expect(await left(photo)).toBeCloseTo(centred + 60, -1);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + stage.width, y, { steps: 8 });
    await page.mouse.up();

    expect(await left(photo)).toBeCloseTo(stage.x, 0);
  });

  test('when they zoom the photo in with the keyboard and press the right arrow, then the photo moves to show more of its right side', async ({
    page,
  }) => {
    const { viewer, photo } = await openArticlePhoto(page);
    const stage = viewer.getByRole('group', { name: 'Zvětšená fotka' });
    await stage.focus();
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await expect(viewer.getByRole('button', { name: /vrátit původní velikost/ })).toHaveText(
      '225 %',
    );
    await expect.poll(() => width(photo)).toBeGreaterThan(1000);
    const centred = await left(photo);
    const reach = ((await stage.boundingBox())!.width * 0.1) | 0;

    await page.keyboard.press('ArrowRight');

    await expect.poll(async () => centred - (await left(photo))).toBeGreaterThanOrEqual(reach);
  });

  test('when the window narrows while the zoomed photo is at its right edge, then the photo still covers the screen to its edge', async ({
    page,
  }) => {
    const { viewer, photo } = await openArticlePhoto(page);
    const stage = viewer.getByRole('group', { name: 'Zvětšená fotka' });
    const fitted = await width(photo);
    await viewer.getByRole('button', { name: 'Přiblížit' }).click();
    await viewer.getByRole('button', { name: 'Přiblížit' }).click();
    const box = (await stage.boundingBox())!;
    await expect.poll(() => width(photo)).toBeCloseTo(fitted * 2.25, 0);
    await expect(viewer.getByRole('button', { name: /vrátit původní velikost/ })).toHaveText(
      '225\u00a0%',
    );
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - box.width, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    await page.setViewportSize({ width: 900, height: 720 });

    await expect
      .poll(async () => {
        const shown = (await photo.boundingBox())!;
        const area = (await stage.boundingBox())!;
        return Math.round(shown.x + shown.width - (area.x + area.width));
      })
      .toBeGreaterThanOrEqual(0);
    const shown = (await photo.boundingBox())!;
    const area = (await stage.boundingBox())!;
    expect(shown.x).toBeLessThanOrEqual(area.x + 1);
  });

  test('when they open the photo of a news article and turn the mouse wheel over it, then the photo grows under the pointer and the page does not scroll', async ({
    page,
  }) => {
    await page.goto(`/aktuality/${article.slug}`);
    await page.getByRole('button', { name: 'Zvětšit fotku: Děti sázejí stromek' }).click();
    const viewer = page.getByRole('dialog', { name: 'Zvětšená fotka' });
    const photo = viewer.getByRole('img', { name: 'Děti sázejí stromek' });
    await expect.poll(() => width(photo)).toBeGreaterThan(300);
    const fitted = await width(photo);
    const box = (await photo.boundingBox())!;
    const scrolled = await page.evaluate(() => window.scrollY);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -347);

    await expect.poll(async () => (await width(photo)) / fitted).toBeCloseTo(2, 1);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  });

  test('when they open the photo by keyboard, then plus and zero on the focused photo zoom it in and back', async ({
    page,
  }) => {
    await page.goto(`/aktuality/${article.slug}`);
    await page.getByRole('button', { name: 'Zvětšit fotku: Děti sázejí stromek' }).focus();
    await page.keyboard.press('Enter');
    const viewer = page.getByRole('dialog', { name: 'Zvětšená fotka' });
    const stage = viewer.getByRole('group', { name: 'Zvětšená fotka' });
    const level = viewer.getByRole('button', { name: /vrátit původní velikost/ });

    await stage.focus();
    await page.keyboard.press('+');
    await expect(level).toHaveText('150\u00a0%');

    await page.keyboard.press('0');
    await expect(level).toHaveText('100\u00a0%');
  });
});
