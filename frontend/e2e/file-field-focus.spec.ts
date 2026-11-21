import { Page } from '@playwright/test';
import { mockAdministrationCopy } from './administration-copy';
import { administrator, mockDonorApi, session } from './donor-session';
import { expect, test } from './fixtures';
import { keyList, serveReceiptApi } from './receipt-verification';

const MOST_TABS_TO_THE_FILE_FIELD = 40;

interface FocusRing {
  readonly fieldOutline: string;
  readonly controlOutline: string;
  readonly controlOutlineWidth: number;
  readonly ringInsideViewport: boolean;
  readonly clippingAncestors: readonly string[];
}

async function tabToFileField(page: Page): Promise<void> {
  const field = page.locator('#proof-file');
  for (let tab = 0; tab < MOST_TABS_TO_THE_FILE_FIELD; tab++) {
    await page.keyboard.press('Tab');
    if (await field.evaluate((input) => input === document.activeElement)) {
      return;
    }
  }
  throw new Error('Tab never reached the file field');
}

function focusRingOfFileField(page: Page): Promise<FocusRing> {
  return page.locator('#proof-file').evaluate((input) => {
    const control = document.querySelector(`label[for="${input.id}"]`) as HTMLElement;
    const style = getComputedStyle(control);
    const reach = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
    const box = control.getBoundingClientRect();
    const ring = {
      left: box.left - reach,
      top: box.top - reach,
      right: box.right + reach,
      bottom: box.bottom + reach,
    };
    const clippingAncestors: string[] = [];
    for (let ancestor = control.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const overflow = getComputedStyle(ancestor);
      if (overflow.overflowX === 'visible' && overflow.overflowY === 'visible') {
        continue;
      }
      const frame = ancestor.getBoundingClientRect();
      const left = frame.left + ancestor.clientLeft;
      const top = frame.top + ancestor.clientTop;
      const clips =
        ring.left < left - 0.5 ||
        ring.top < top - 0.5 ||
        ring.right > left + ancestor.clientWidth + 0.5 ||
        ring.bottom > top + ancestor.clientHeight + 0.5;
      if (clips && ancestor !== document.documentElement && ancestor !== document.body) {
        clippingAncestors.push(ancestor.className || ancestor.tagName);
      }
    }
    return {
      fieldOutline: getComputedStyle(input).outlineStyle,
      controlOutline: style.outlineStyle,
      controlOutlineWidth: parseFloat(style.outlineWidth),
      ringInsideViewport:
        ring.left >= 0 &&
        ring.top >= 0 &&
        ring.right <= document.documentElement.clientWidth &&
        ring.bottom <= window.innerHeight,
      clippingAncestors,
    };
  });
}

async function expectWholeRingOnTheVisibleControl(page: Page): Promise<void> {
  await tabToFileField(page);
  await page.locator('label[for="proof-file"]').scrollIntoViewIfNeeded();

  const ring = await focusRingOfFileField(page);

  expect(ring.fieldOutline).toBe('none');
  expect(ring.controlOutline).toBe('solid');
  expect(ring.controlOutlineWidth).toBe(3);
  expect(ring.ringInsideViewport).toBe(true);
  expect(ring.clippingAncestors).toEqual([]);
}

test.describe('Given a keyboard user on a computer who tabs to the file field of Ověřit', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('when they are in the administration, then the whole ring is drawn on the visible row and none on the hidden field', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await mockAdministrationCopy(page, { donations: [{ id: 'receipts:2026', rows: [] }] });
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await serveReceiptApi(page, { keys: keyList(), status: 'active' });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
    await page.goto('/sprava/overit');
    await expect(page.getByRole('heading', { level: 1, name: 'Ověřit potvrzení' })).toBeFocused();

    await expectWholeRingOnTheVisibleControl(page);
  });

  test('when they are on the public page, then the whole ring is drawn on the visible row and none on the hidden field', async ({
    page,
  }) => {
    await serveReceiptApi(page, { keys: keyList(), status: 'active' });
    await page.goto('/overit');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ověření potvrzení o daru');

    await expectWholeRingOnTheVisibleControl(page);
  });
});
