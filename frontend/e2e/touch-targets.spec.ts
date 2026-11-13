import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

const FINGER_PX = 44;

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c201',
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

async function missedEdges(control: Locator): Promise<string[]> {
  await control.scrollIntoViewIfNeeded();
  return control.evaluate((element, finger) => {
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const reach = finger / 2 - 1;
    const edges: [string, number, number][] = [
      ['above', x, y - reach],
      ['below', x, y + reach],
      ['left of', x - reach, y],
      ['right of', x + reach, y],
    ];
    return edges
      .filter(([, px, py]) => {
        const hit = document.elementFromPoint(px, py);
        return !hit?.closest('a[href], button, input, select, textarea, [role="button"]');
      })
      .map(([edge]) => edge);
  }, FINGER_PX);
}

async function expectFingerSized(control: Locator): Promise<void> {
  await expect(control).toBeVisible();
  expect(await missedEdges(control), await control.innerText()).toEqual([]);
}

async function articleServed(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === `/api/content/news/${article.slug}`,
    (route) => route.fulfill({ json: article }),
  );
}

test.describe('Given a visitor tapping small controls on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('when they tap near the edge of the copy button of an article, then a finger-sized area around it still reaches it, or the control beside it, never empty space', async ({
    page,
  }) => {
    await articleServed(page);
    await page.goto(`/aktuality/${article.slug}`);

    await expectFingerSized(page.getByRole('button', { name: /^(Sdílet|Kopírovat odkaz)/ }));
  });

  test('when they tap near the edge of a Kopírovat button of the bank details, then a finger-sized area around it still reaches it, or the control beside it, never empty space', async ({
    page,
  }) => {
    await page.goto('/prispet');
    const copies = page.getByRole('button', { name: /^Kopírovat/ });
    await expect(copies.first()).toBeVisible();

    for (const copy of await copies.all()) {
      await expectFingerSized(copy);
    }
  });

  test('when they tap near the edge of Přihlásit se in the header, then a finger-sized area around it still reaches it, or the control beside it, never empty space', async ({
    page,
  }) => {
    await page.goto('/aktuality');

    await expectFingerSized(page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }));
  });

  test('when they tap near the edges of the controls of the sign-in dialog, then a finger-sized area around each still reaches it, or the control beside it, never empty space', async ({
    page,
  }) => {
    await page.goto('/aktuality');
    await page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expectFingerSized(dialog.getByRole('button', { name: 'Zavřít' }));
    await expectFingerSized(dialog.getByRole('button', { name: 'Přihlášení', exact: true }));
    await expectFingerSized(dialog.getByRole('button', { name: 'Registrace', exact: true }));
    await expectFingerSized(dialog.getByRole('button', { name: 'Zapomněli jste heslo?' }));
  });
});
