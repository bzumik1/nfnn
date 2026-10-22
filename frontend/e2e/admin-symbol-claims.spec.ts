import { expect, Page, test } from '@playwright/test';
import { administrator, mockDonorApi, problem, session } from './donor-session';

const CLAIMS = '/api/admin/donations/symbol-claims';
const YES_ID = '019a1c00-0000-7000-8000-00000000c001';
const NO_ID = '019a1c00-0000-7000-8000-00000000c002';

const yes = {
  id: YES_ID,
  donorId: administrator.id,
  donorName: 'Jana Nováková',
  account: '1234567/0800',
  variableSymbol: '6123456789',
  answer: 'CONFIRMED',
  answeredAt: '2026-10-20T09:00:00Z',
  donationCount: 3,
};

const no = {
  id: NO_ID,
  donorId: '019a1c00-0000-7000-8000-00000000a002',
  donorName: 'Petr Svoboda',
  account: '2900233333/2010',
  variableSymbol: '777',
  answer: 'DECLINED',
  answeredAt: '2026-10-19T08:30:00Z',
  donationCount: 0,
};

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

test.describe('Given an administrator on the older symbols page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
  });

  test('when they reverse a "Yes" and delete a "No", then each asks for a confirmation and the status says what changed', async ({
    page,
  }) => {
    const calls: string[] = [];
    let items = [yes, no];
    await page.route(
      (url) => url.pathname === CLAIMS,
      (route) => route.fulfill({ json: { items } }),
    );
    await page.route(
      (url) => url.pathname === `${CLAIMS}/${YES_ID}/reverse`,
      (route) => {
        calls.push('reverse');
        items = [{ ...yes, answer: 'DECLINED', donationCount: 0 }, no];
        return route.fulfill({ status: 204 });
      },
    );
    await page.route(
      (url) => url.pathname === `${CLAIMS}/${NO_ID}`,
      (route) => {
        calls.push(route.request().method());
        items = items.filter((item) => item.id !== NO_ID);
        return route.fulfill({ status: 204 });
      },
    );

    await page.goto('/sprava/starsi-symboly');

    await expect(page).toHaveTitle('Starší symboly | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Starší symboly' })).toBeFocused();
    await expect(page.locator('tbody tr')).toHaveCount(2);
    const janaRow = page.locator('tbody tr').nth(0);
    const petrRow = page.locator('tbody tr').nth(1);
    await expect(janaRow).toContainText('Ano, jsou moje');
    await expect(janaRow).toContainText('3 dary');

    await janaRow.getByRole('button', { name: 'Zrušit Ano' }).click();
    await expect(janaRow).toContainText('Smazat 3 dary a změnit odpověď na Ne?');
    await janaRow.getByRole('button', { name: 'Ne', exact: true }).click();
    expect(calls).toEqual([]);

    await janaRow.getByRole('button', { name: 'Zrušit Ano' }).click();
    await janaRow.getByRole('button', { name: 'Ano, zrušit' }).click();
    await expect(page.getByRole('status').filter({ hasNotText: 'Načítáme' })).toHaveText(
      'Odpověď Ano u Jana Nováková (VS 6123456789) je zrušená: 3 dary jsme smazali a platby s tímto symbolem jsou zase nespárované. Dárce se už neptáme.',
    );
    await expect(janaRow).toContainText('Ne, nejsou moje');
    await expect(janaRow.getByRole('button', { name: 'Smazat Ne' })).toBeVisible();

    await petrRow.getByRole('button', { name: 'Smazat Ne' }).click();
    await expect(petrRow).toContainText('Dárce dostane otázku znovu. Smazat?');
    await petrRow.getByRole('button', { name: 'Ano, smazat' }).click();

    await expect(page.getByRole('status').filter({ hasNotText: 'Načítáme' })).toHaveText(
      'Odpověď Ne u Petr Svoboda (VS 777) jsme smazali. Pokud otázka pořád platí, nástěnka se dárce zeptá znovu.',
    );
    await expect(page.locator('tbody tr')).toHaveCount(1);
    expect(calls).toEqual(['reverse', 'DELETE']);
  });

  test('when a reversal is refused because of a receipt, then the alert shows the reason and the answer stays', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === CLAIMS,
      (route) => route.fulfill({ json: { items: [yes] } }),
    );
    await page.route(
      (url) => url.pathname === `${CLAIMS}/${YES_ID}/reverse`,
      (route) =>
        route.fulfill(
          problem(
            409,
            'donations/symbol-claim-has-receipt',
            'Na dary z této odpovědi odkazuje vydané potvrzení',
            'Odpověď nejde zrušit, dokud potvrzení platí.',
          ),
        ),
    );

    await page.goto('/sprava/starsi-symboly');
    const row = page.locator('tbody tr').first();
    await row.getByRole('button', { name: 'Zrušit Ano' }).click();
    await row.getByRole('button', { name: 'Ano, zrušit' }).click();

    await expect(page.getByRole('alert')).toHaveText(
      'Na dary z této odpovědi odkazuje vydané potvrzení. Odpověď nejde zrušit, dokud potvrzení platí.',
    );
    await expect(row).toContainText('Ano, jsou moje');
    await expect(row.getByRole('button', { name: 'Zrušit Ano' })).toBeVisible();
  });
});
