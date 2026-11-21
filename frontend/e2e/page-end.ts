import type { Page } from '@playwright/test';

export async function lowestContentEdge(page: Page): Promise<number> {
  return page.evaluate(() => {
    const underFixedChrome = (element: Element): boolean => {
      for (let node: Element | null = element; node !== null; node = node.parentElement) {
        const position = getComputedStyle(node).position;
        if (position === 'fixed' || position === 'sticky') {
          return true;
        }
      }
      return false;
    };
    const holdsContent = (element: Element): boolean =>
      element.matches('a[href], button, input, select, textarea, img') ||
      [...element.childNodes].some(
        (child) => child.nodeType === Node.TEXT_NODE && child.textContent!.trim() !== '',
      );
    let lowest = 0;
    for (const element of document.querySelectorAll('main *')) {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (
        box.height === 0 ||
        style.visibility === 'hidden' ||
        element.closest('[aria-hidden="true"], .visually-hidden') !== null ||
        !holdsContent(element) ||
        underFixedChrome(element)
      ) {
        continue;
      }
      lowest = Math.max(lowest, box.bottom);
    }
    return lowest;
  });
}

export async function scrolledToTheEnd(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
  );
  await page.waitForFunction(
    () =>
      Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1,
  );
}
