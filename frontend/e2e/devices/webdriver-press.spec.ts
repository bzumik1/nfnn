import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { PressMemory, WATCH_CLICK } from './webdriver';

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

test.describe('Given the presses Safari is tried with, in their order', () => {
  const presses = [{ name: 'element click' }, { name: 'touch tap' }, { name: 'script click' }];

  test('when nothing was pressed yet, then every target is tried in that order', () => {
    expect(new PressMemory().order('button.lock-unlock', presses).map(({ name }) => name)).toEqual([
      'element click',
      'touch tap',
      'script click',
    ]);
  });

  test('when a press clicked a target, then that target is tried with it first and the others after it', () => {
    const memory = new PressMemory();
    memory.remember('button.lock-unlock', 'script click');
    expect(memory.order('button.lock-unlock', presses).map(({ name }) => name)).toEqual([
      'script click',
      'element click',
      'touch tap',
    ]);
  });

  test('when a press clicked another target, then this one is still tried in the first order', () => {
    const memory = new PressMemory();
    memory.remember('button.lock-use-password', 'script click');
    expect(memory.order('button.lock-unlock', presses).map(({ name }) => name)).toEqual([
      'element click',
      'touch tap',
      'script click',
    ]);
  });
});
