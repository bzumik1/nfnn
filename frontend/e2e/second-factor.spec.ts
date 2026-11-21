import { expect, test } from './fixtures';
import {
  administrator,
  CHALLENGE,
  donor,
  mockDonorApi,
  openDonorSection,
  openSignInDialog,
  problem,
  secondFactorEnrolment,
  secondFactorRecovery,
  secondFactorRequired,
  session,
  signIn,
} from './donor-session';
import { Locator, Page } from '@playwright/test';
import jsQR from 'jsqr';

const QUIET_ZONE = 4;
const PIXELS_PER_MODULE = 4;
const DARK_SQUARE = /M(\d+) (\d+)h1v1h-1z/g;

async function plainQrText(qr: Locator): Promise<string | undefined> {
  const side = Number((await qr.getAttribute('viewBox'))?.split(' ')[2]);
  const path = (await qr.locator('.qr-plain').getAttribute('d')) ?? '';
  const width = side * PIXELS_PER_MODULE;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (const [, x, y] of path.matchAll(DARK_SQUARE)) {
    for (
      let row = Number(y) * PIXELS_PER_MODULE;
      row < (Number(y) + 1) * PIXELS_PER_MODULE;
      row++
    ) {
      const start = (row * width + Number(x) * PIXELS_PER_MODULE) * 4;
      for (let pixel = start; pixel < start + PIXELS_PER_MODULE * 4; pixel += 4) {
        pixels.fill(0, pixel, pixel + 3);
      }
    }
  }
  return side > 2 * QUIET_ZONE
    ? jsQR(pixels, width, width, { inversionAttempts: 'dontInvert' })?.data
    : undefined;
}

const protectedDonor = {
  ...donor,
  secondFactor: { enabled: true, neededForAdministration: false },
};

test.describe('Given a donor who protects the account with an authenticator app', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
  });

  test('when they open the overview and sign in, then the password alone is not enough and the code from the app opens the overview', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(secondFactorRequired()));
    const completed: unknown[] = [];
    await page.route('**/api/donors/auth/login/second-factor', async (route) => {
      completed.push(route.request().postDataJSON());
      await route.fulfill(session(200, protectedDonor));
    });

    await page.goto('/darce/prehled');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();

    const code = page.getByLabel('Kód z aplikace');
    await expect(code).toBeFocused();
    await expect(page.getByRole('dialog')).toContainText(
      'Přihlášení dokončíte kódem z ověřovací aplikace',
    );
    await code.fill('287082');
    await page.getByRole('dialog').locator('.ui-button--block').click();

    await expect(page).toHaveURL(/\/darce\/prehled$/);
    expect(completed).toEqual([{ challenge: CHALLENGE, code: '287082', session: 'BROWSER' }]);
    await openDonorSection(page, 'Údaje a zabezpečení');
    await expect(page.locator('.account-data')).toContainText('Zapnuté, kód z ověřovací aplikace');
  });

  test('when they lost the phone, then the dialog offers recovery by payment, names what to pay and goes back to the code', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(secondFactorRequired()));
    const asked: unknown[] = [];
    await page.route('**/api/donors/auth/login/second-factor/recovery', async (route) => {
      asked.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(secondFactorRecovery),
      });
    });

    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();
    await page.getByRole('button', { name: 'Obnovit přístup platbou' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Obnova přístupu platbou' })).toBeFocused();
    expect(asked).toEqual([{ challenge: CHALLENGE }]);
    await expect(dialog).toContainText('5544332217/2010');
    await expect(dialog).toContainText('OBNOVA K7MP4RXA');
    await expect(dialog).toContainText('Platbu pošlete nejdříve 27. 10. 2026');
    await expect(dialog).toContainText('Zpráva pro příjemce platí do 31. 10. 2026 11:00');
    await expect(dialog.getByRole('button', { name: 'Přihlášení', exact: true })).toHaveCount(0);

    await dialog.getByRole('button', { name: '← Zpět na kód' }).click();
    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();
  });

  test('when they start the recovery again on a phone while it is open, then the dialog shows the same message, says when it started and puts the bank details before the QR code', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(secondFactorRequired()));
    await page.route('**/api/donors/auth/login/second-factor/recovery', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...secondFactorRecovery, resumed: true }),
      }),
    );

    await openSignInDialog(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await page.getByRole('button', { name: 'Obnovit přístup platbou' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(
      'Tuto obnovu už jste zahájili 17. 10. 2026 12:00. Pošlete platbu s tímto kódem.',
    );
    await expect(dialog).toContainText('OBNOVA K7MP4RXA');
    const qrCode = dialog.getByRole('img', {
      name: 'QR platba 1 Kč se zprávou pro obnovu přístupu',
    });
    await expect(qrCode).toBeVisible();
    const detailsTop = (await dialog.locator('.recovery-details').boundingBox())!.y;
    const qrTop = (await qrCode.boundingBox())!.y;
    expect(detailsTop).toBeLessThan(qrTop);
  });

  test('when they type a wrong code and then the challenge expires, then the dialog says so and goes back to the password', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/login', (route) => route.fulfill(secondFactorRequired()));
    let attempts = 0;
    await page.route('**/api/donors/auth/login/second-factor', (route) => {
      attempts++;
      return route.fulfill(
        attempts === 1
          ? problem(
              401,
              'auth/invalid-second-factor-code',
              'Nesprávný kód',
              'Zadejte prosím aktuální kód z ověřovací aplikace; každý kód platí jen jednou.',
            )
          : problem(
              401,
              'auth/invalid-second-factor-challenge',
              'Přihlášení vypršelo',
              'Zadejte prosím znovu e-mail a heslo.',
            ),
      );
    });

    await openSignInDialog(page);
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('correct horse battery');
    await page.getByRole('dialog').locator('.ui-button--block').click();
    await page.getByLabel('Kód z aplikace').fill('000000');
    await page.getByRole('dialog').locator('.ui-button--block').click();

    await expect(page.getByRole('alert')).toContainText('Nesprávný kód.');
    await expect(page.getByLabel('Kód z aplikace')).toBeVisible();

    await page.getByLabel('Kód z aplikace').fill('111111');
    await page.getByRole('dialog').locator('.ui-button--block').click();

    await expect(page.getByRole('alert')).toContainText(
      'Přihlášení vypršelo. Zadejte prosím znovu e-mail a heslo.',
    );
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('when they turn the second factor on in the overview, then the QR code and the key appear and the first code enables it', async ({
    page,
  }) => {
    const posted: { path: string; body: unknown }[] = [];
    await page.route('**/api/donors/me/second-factor/setup', async (route) => {
      posted.push({ path: 'setup', body: route.request().postDataJSON() });
      await route.fulfill({ json: secondFactorEnrolment });
    });
    await page.route('**/api/donors/me/second-factor/confirm', async (route) => {
      posted.push({ path: 'confirm', body: route.request().postDataJSON() });
      await route.fulfill(session(200, protectedDonor));
    });
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');

    await page.getByRole('button', { name: 'Zapnout dvoufaktorové ověření' }).click();
    await expect(page.getByLabel('Současné heslo')).toBeFocused();
    await expect(page.locator('.account-lost-phone')).toContainText(
      'přístup obnovíte platbou 1 Kč z bankovního účtu na vaše jméno, který u nás máte ověřený aspoň týden',
    );
    await page.getByLabel('Současné heslo').fill('correct horse battery');
    await page.getByRole('button', { name: 'Pokračovat' }).click();

    const qr = page.getByRole('img', { name: 'QR kód s nastavením pro ověřovací aplikaci' });
    await expect(qr).toBeVisible();
    await expect.poll(() => plainQrText(qr)).toBe(secondFactorEnrolment.otpauthUri);
    await expect(page.locator('.account-secret-spoken')).toHaveText(
      'GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ',
    );
    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();
    await page.getByLabel('Kód z aplikace').fill('287082');
    await page.getByRole('button', { name: 'Zapnout kód z aplikace' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Kód z aplikace' })).toContainText(
      'Kód z aplikace je zapnutý.',
    );
    await expect(page.locator('.account-data')).toContainText('Zapnuté, kód z ověřovací aplikace');
    await expect(page.getByRole('button', { name: 'Vypnout dvoufaktorové ověření' })).toBeFocused();
    expect(posted).toEqual([
      { path: 'setup', body: { password: 'correct horse battery' } },
      { path: 'confirm', body: { code: '287082' } },
    ]);
  });

  test('when they press the button slowly after a short code, then the press still sends the form and the code field says what is wrong', async ({
    page,
  }) => {
    await page.route('**/api/donors/me/second-factor/setup', (route) =>
      route.fulfill({ json: secondFactorEnrolment }),
    );
    await signIn(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    await page.getByRole('button', { name: 'Zapnout dvoufaktorové ověření' }).click();
    await page.getByLabel('Současné heslo').fill('correct horse battery');
    await page.getByRole('button', { name: 'Pokračovat' }).click();
    await page.getByLabel('Kód z aplikace').fill('12345');

    const button = page.getByRole('button', { name: 'Zapnout kód z aplikace' });
    await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.evaluate(
      () =>
        new Promise((rendered) =>
          requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(rendered))),
        ),
    );
    await page.mouse.up();

    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();
    await expect(page.getByText('Kód má přesně šest číslic.')).toBeVisible();
  });

  test('when they turn the second factor off, then the password and the code go together and the card says it is off', async ({
    page,
  }) => {
    const posted: unknown[] = [];
    await page.route('**/api/donors/me/second-factor/disable', async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill(session(200, donor));
    });
    await signIn(page, protectedDonor);
    await openDonorSection(page, 'Údaje a zabezpečení');

    await page.getByRole('button', { name: 'Vypnout dvoufaktorové ověření' }).click();
    await page.getByLabel('Současné heslo').fill('correct horse battery');
    await page.getByLabel('Kód z aplikace').fill('287082');
    await page.getByRole('button', { name: 'Vypnout kód z aplikace' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Kód z aplikace' })).toContainText(
      'Kód z aplikace jsme vypnuli.',
    );
    await expect(page.locator('.account-data')).toContainText('Vypnuté');
    expect(posted).toEqual([{ password: 'correct horse battery', code: '287082' }]);
  });

  test('when an administrator has no second factor yet, then the overview says the administration waits for it and offers no link to it', async ({
    page,
  }) => {
    await signIn(page, {
      ...administrator,
      roles: ['DONOR'],
      secondFactor: { enabled: false, neededForAdministration: true },
    });
    await openDonorSection(page, 'Údaje a zabezpečení');

    await expect(page.locator('.account-hint')).toContainText(
      'Správa se vám otevře, až se přihlásíte přístupovým klíčem nebo zapnete kód z aplikace',
    );
    await expect(page.getByRole('link', { name: 'Správa' })).toHaveCount(0);
  });
});

test.describe('Given a donor turning on the code from an authenticator app', () => {
  async function showKey(page: Page, width: number): Promise<void> {
    await mockDonorApi(page);
    await page.route('**/api/donors/me/second-factor/setup', (route) =>
      route.fulfill({ json: secondFactorEnrolment }),
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await page.setViewportSize({ width, height: 900 });
    await openDonorSection(page, 'Údaje a zabezpečení');
    await page.getByRole('button', { name: 'Zapnout dvoufaktorové ověření' }).click();
    await page.getByLabel('Současné heslo').fill('correct horse battery');
    await page.getByRole('button', { name: 'Pokračovat' }).click();
  }

  for (const width of [1280, 390]) {
    test(`when the key shows in a ${width} px window, then it breaks only between its two halves of four groups, so no group stands alone on a line`, async ({
      page,
    }) => {
      await showKey(page, width);
      const key = page.locator('.account-secret-value [aria-hidden="true"]');
      await expect(key).toHaveText('GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ');
      await page.evaluate(() => document.fonts.ready);

      const groupsPerLine = await key.evaluate((value) => {
        const lines = new Map<number, number>();
        const walker = document.createTreeWalker(value, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          for (const group of (node.textContent ?? '').matchAll(/\S+/g)) {
            const range = document.createRange();
            const start = group.index ?? 0;
            range.setStart(node, start);
            range.setEnd(node, start + group[0].length);
            const top = Math.round(range.getBoundingClientRect().top);
            lines.set(top, (lines.get(top) ?? 0) + 1);
          }
        }
        return [...lines.values()];
      });

      expect(groupsPerLine.length).toBeGreaterThan(0);
      expect(
        groupsPerLine.filter((count) => count % 4 !== 0),
        JSON.stringify(groupsPerLine),
      ).toEqual([]);
    });

    test(`when the key shows in a ${width} px window, then its spoken copy covers the visible key, so touching any of its lines finds the whole key`, async ({
      page,
    }) => {
      await showKey(page, width);
      const spoken = page.locator('.account-secret-spoken');
      await expect(spoken).toHaveText('GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ');
      await page.evaluate(() => document.fonts.ready);

      const spokenBox = (await spoken.boundingBox())!;
      const valueBox = (await page.locator('.account-secret-value').boundingBox())!;

      expect(Math.abs(spokenBox.x - valueBox.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(spokenBox.y - valueBox.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(spokenBox.width - valueBox.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(spokenBox.height - valueBox.height)).toBeLessThanOrEqual(1);
    });
  }
});
