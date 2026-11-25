import type { Locator, Page } from '@playwright/test';

export async function pressHandsFocusToPageAsIos(button: Locator): Promise<void> {
  await button.evaluate((pressed) => {
    pressed.addEventListener('mousedown', (event) => {
      event.preventDefault();
      pressed.parentElement
        ?.closest<HTMLElement>('[tabindex="-1"]')
        ?.focus({ preventScroll: true });
    });
    document.addEventListener(
      'click',
      () => {
        const focused = document.activeElement;
        (window as unknown as { focusAtPress: string | null }).focusAtPress =
          focused === null ? null : focused.id || focused.localName;
      },
      { capture: true },
    );
  });
}

export async function focusAtPress(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as unknown as { focusAtPress: string | null }).focusAtPress);
}
