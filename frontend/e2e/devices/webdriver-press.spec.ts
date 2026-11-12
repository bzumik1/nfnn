import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { WATCH_CLICK } from './webdriver';

async function watchedButton(page: Page, button: string): Promise<string> {
  await page.setContent(`<!doctype html><html><body>${button}</body></html>`);
  return page.evaluate(
    `(function () { ${WATCH_CLICK} }).call(null, document.querySelector('button'))`,
  );
}

test.describe('Given a button watched before a press in Safari', () => {
  test('when the button can be pressed, then the watch names it attached, enabled, online and visible', async ({
    page,
  }) => {
    expect(await watchedButton(page, '<button>Použít heslo</button>')).toBe(
      'attached, enabled, online, visible',
    );
  });

  test('when the button is disabled, then the watch says so', async ({ page }) => {
    expect(await watchedButton(page, '<button disabled>Použít heslo</button>')).toBe(
      'attached, disabled, online, visible',
    );
  });

  test('when the browser is offline, then the watch says so', async ({ page, context }) => {
    await context.setOffline(true);
    expect(await watchedButton(page, '<button>Použít heslo</button>')).toBe(
      'attached, enabled, offline, visible',
    );
  });

  test('when the button left the page, then the watch says it is detached', async ({ page }) => {
    await page.setContent('<!doctype html><html><body></body></html>');
    expect(
      await page.evaluate(
        `(function () { ${WATCH_CLICK} }).call(null, document.createElement('button'))`,
      ),
    ).toBe('detached, enabled, online, visible');
  });
});
