import { Page } from '@playwright/test';
import { LOGO_IMAGE_ID, mockBankLogos } from './bank-logos';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, session } from './donor-session';

const LOGOS = '/api/admin/donations/bank-logos';
const NEW_SOURCE = 'https://is2-ssl.mzstatic.com/image/thumb/Purple/csas/512x512bb.jpg';

const csas = {
  code: '0800',
  bankName: 'Česká spořitelna, a.s.',
  sourceUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Purple/csas/512x512bb.jpg',
  sourceAllowed: true,
  version: '5e1c0a9f3b7d2486',
  imageId: LOGO_IMAGE_ID,
  imageSha256: 'a'.repeat(64),
  fetchedAt: '2026-11-11T04:50:03Z',
  checkedAt: '2026-11-11T04:50:03Z',
  lastFailure: null,
};

const fio = {
  ...csas,
  code: '2010',
  bankName: 'Fio banka, a.s.',
  sourceUrl: 'https://www.fio.cz/logo.png',
  version: '1b2c3d4e5f607182',
  imageId: null,
  imageSha256: null,
  fetchedAt: null,
  checkedAt: null,
  lastFailure: 'redirected',
};

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

test.describe('Given an administrator on the bank logos page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await mockBankLogos(page, [{ code: '0800', imageId: LOGO_IMAGE_ID }]);
    await rememberedSession(page);
  });

  test('when they change an address, remove a logo and add another bank, then each write names its precondition and the status says what changed', async ({
    page,
  }) => {
    const writes: { method: string; code: string; ifMatch?: string; ifNoneMatch?: string }[] = [];
    let items: object[] = [csas, fio];
    await page.route(
      (url) => url.pathname === LOGOS,
      (route) => route.fulfill({ json: { items } }),
    );
    await page.route(
      (url) => url.pathname.startsWith(`${LOGOS}/`),
      async (route) => {
        const request = route.request();
        const code = new URL(request.url()).pathname.split('/')[5];
        writes.push({
          method: request.method(),
          code,
          ifMatch: request.headers()['if-match'],
          ifNoneMatch: request.headers()['if-none-match'],
        });
        if (request.method() === 'DELETE') {
          items = items.filter((item) => (item as { code: string }).code !== code);
          return route.fulfill({ status: 204 });
        }
        const body = request.postDataJSON() as { sourceUrl: string };
        const saved =
          code === '0800'
            ? { ...csas, sourceUrl: body.sourceUrl, version: '9e4b2d7c1a0f6358' }
            : { ...csas, code, bankName: 'Komerční banka, a.s.', sourceUrl: body.sourceUrl };
        return route.fulfill({ json: saved });
      },
    );

    await page.goto('/sprava/loga-bank');

    await expect(page).toHaveTitle('Loga bank | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Loga bank' })).toBeFocused();
    const csasRow = page.locator('[data-code="0800"]');
    const fioRow = page.locator('[data-code="2010"]');
    await expect(csasRow.locator('.bank-title')).toHaveText('0800 · Česká spořitelna');
    await expect(csasRow.locator('app-bank-mark img')).toHaveAttribute(
      'src',
      `/api/donations/bank-logos/images/${LOGO_IMAGE_ID}`,
    );
    await expect(fioRow.locator('[data-monogram]')).toHaveAttribute('data-monogram', 'FB');
    await expect(fioRow.locator('.bank-failure')).toHaveText(
      'Poslední stažení se nepovedlo: adresa přesměrovává jinam.',
    );

    await csasRow.getByLabel('Adresa loga').fill(NEW_SOURCE);
    await csasRow.getByRole('button', { name: 'Uložit a stáhnout' }).click();
    await expect(page.locator('app-live-notice').getByRole('status')).toHaveText(
      'Logo banky 0800 jsme stáhli z nové adresy a uložili.',
    );

    await fioRow.getByRole('button', { name: 'Odebrat' }).click();
    const dialog = page.getByRole('dialog', { name: 'Odebrat logo banky 2010?' });
    await expect(dialog.getByRole('heading', { name: 'Odebrat logo banky 2010?' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Odebrat logo' }).click();
    await expect(dialog).toBeHidden();
    await expect(fioRow).toHaveCount(0);
    await expect(page.locator('app-live-notice').getByRole('status')).toHaveText(
      'Logo banky 2010 jsme odebrali. U jejích účtů se teď ukazuje zkratka názvu.',
    );

    await page.getByLabel('Kód banky').fill('0100');
    await page.locator('#bank-logo-new-source').fill(NEW_SOURCE);
    await page.getByRole('button', { name: 'Přidat a stáhnout' }).click();
    await expect(page.locator('[data-code="0100"] .bank-title')).toHaveText(
      '0100 · Komerční banka',
    );

    expect(writes).toEqual([
      { method: 'PUT', code: '0800', ifMatch: `"${csas.version}"`, ifNoneMatch: undefined },
      { method: 'DELETE', code: '2010', ifMatch: `"${fio.version}"`, ifNoneMatch: undefined },
      { method: 'PUT', code: '0100', ifMatch: undefined, ifNoneMatch: '*' },
    ]);
  });
});
