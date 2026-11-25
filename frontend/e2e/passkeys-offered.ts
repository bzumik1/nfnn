import { Page } from '@playwright/test';

export async function offerPasskeysAsAnIPhoneDoes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const refused = () => Promise.reject(new DOMException('Not in this test', 'NotAllowedError'));
    if (typeof window.PublicKeyCredential !== 'function') {
      Object.defineProperty(window, 'PublicKeyCredential', {
        configurable: true,
        value: class {},
      });
    }
    if (typeof navigator.credentials?.create !== 'function') {
      Object.defineProperty(navigator, 'credentials', {
        configurable: true,
        value: { create: refused, get: refused },
      });
    }
  });
}
