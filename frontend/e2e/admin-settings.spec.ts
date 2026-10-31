import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, adminSettings, mockDonorApi, session } from './donor-session';
import { noSignatory, signatory, vectorSignature } from './signature-image';

const SETTINGS = '/api/admin/operations/settings';
const SIGNATORY = '/api/admin/donations/receipt-signatory';
const PEOPLE = '/api/admin/content/people';
const PERSON_ID = '0199f3e0-0000-7000-8000-00000000c001';
const PORTRAIT_ID = '0199f3e0-0000-7000-8000-00000000c101';
const eva = {
  id: PERSON_ID,
  name: 'Petr Vzorový',
  role: null,
  position: 0,
  onBoard: true,
  boardNote: null,
  featured: true,
  portrait: { id: PORTRAIT_ID, url: `/api/content/media/${PORTRAIT_ID}`, width: 640, height: 640 },
  webSignature: null,
  personalEmail: null,
  fundEmail: null,
};

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

test.describe('Given an administrator on the settings page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
  });

  test('when they change a value and a secret and confirm, then only the changes are sent and the page waits for the restart', async ({
    page,
  }) => {
    const saved: unknown[] = [];
    let restarted = false;
    await page.route(
      (url) => url.pathname === '/api/operations/setup',
      (route) => {
        if (saved.length > 0 && !restarted) {
          restarted = true;
          return route.fulfill({ status: 502, body: '' });
        }
        return route.fulfill({ json: { required: false, codeRequired: true } });
      },
    );
    await page.route(
      (url) => url.pathname === SETTINGS,
      (route) => {
        if (route.request().method() === 'PUT') {
          saved.push(route.request().postDataJSON());
          return route.fulfill({
            status: 202,
            json: { changed: ['RECEIPT_FIRST_YEAR', 'FIO_TOKEN'], restarting: true },
          });
        }
        return route.fulfill({ json: adminSettings });
      },
    );

    await page.goto('/sprava/nastaveni');
    await expect(page.getByRole('heading', { level: 1, name: 'Nastavení' })).toBeFocused();
    await expect(page.locator('.secret-state').first()).toHaveText(
      'Heslo nebo klíč SMTP: Nastaveno',
    );

    await page.locator('#setting-RECEIPT_FIRST_YEAR').fill('2025');
    await page.getByText('Adresa webu, server pro odesílání e-mailů a napojení na banku').click();
    await page.locator('#setting-FIO_TOKEN').fill('new-token');
    await page.getByRole('button', { name: 'Uložit nastavení' }).click();
    await expect(page.getByRole('group', { name: 'Uložit nastavení?' })).toContainText(
      'web restartuje',
    );
    await page.getByRole('button', { name: 'Uložit a restartovat' }).click();

    await expect(page.locator('.ui-notice--status')).toHaveText(
      'Nastavení je uložené a web po restartu běží s ním.',
      { timeout: 15_000 },
    );
    expect(saved).toEqual([
      {
        changes: [
          { name: 'FIO_TOKEN', value: 'new-token' },
          { name: 'RECEIPT_FIRST_YEAR', value: '2025' },
        ],
      },
    ]);
  });

  test('when they try a new sender with a test e-mail before saving, then it goes to their own address and the confirmation lists the change without a warning', async ({
    page,
  }) => {
    const tested: unknown[] = [];
    await page.route(
      (url) => url.pathname === SETTINGS,
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.route(
      (url) => url.pathname === `${SETTINGS}/test-email`,
      (route) => {
        tested.push(route.request().postDataJSON());
        return route.fulfill({
          json: { outcome: 'SENT', sent: true, recipient: administrator.email },
        });
      },
    );

    await page.goto('/sprava/nastaveni');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Potvrzení o daru',
      'Kdo potvrzení podepisuje',
      'Klíč k ověřovacím QR kódům',
      'Kontaktní formulář',
      'Odesílatel e-mailů',
      'Technické nastavení (pro správce serveru)',
    ]);
    await expect(page.locator('#setting-MAIL_HOST')).toBeHidden();

    await page.locator('#setting-MAIL_FROM').fill('novy@nfnn.cz');
    await page.getByText('Adresa webu, server pro odesílání e-mailů a napojení na banku').click();
    await page.getByRole('button', { name: 'Poslat zkušební e-mail na moji adresu' }).click();
    await expect(page.locator('.test-row').getByRole('status')).toHaveText(
      `Zkušební e-mail odešel na ${administrator.email}. Podívejte se prosím do schránky, i do nevyžádané pošty. Když do pár minut nedorazí, zkontrolujte adresu odesílatele a ověření její domény v Brevo.`,
    );
    expect(tested).toEqual([
      {
        host: 'smtp-relay.brevo.com',
        port: 587,
        username: 'abc@smtp-brevo.com',
        password: '',
        auth: true,
        startTls: true,
        sender: 'novy@nfnn.cz',
      },
    ]);

    await page.getByRole('button', { name: 'Uložit nastavení' }).click();
    const confirmation = page.getByRole('group', { name: 'Uložit nastavení?' });
    await expect(confirmation).toContainText('Mění se: Odesílatel e-mailů.');
    await expect(confirmation.locator('.ui-callout--warning')).toHaveCount(0);
  });

  test('when they follow the link to the mail settings from another page, then the technical settings open at the mail server', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === SETTINGS,
      (route) => route.fulfill({ json: adminSettings }),
    );

    await page.goto('/sprava/nastaveni#settings-MAIL');

    await expect(
      page.getByRole('heading', { level: 3, name: 'Server pro odesílání e-mailů' }),
    ).toBeFocused();
    await expect(page.locator('#setting-MAIL_HOST')).toBeVisible();
  });

  test('when a person signs the receipts, then the receipts card previews the signature block with the portrait, the signature, the name and the receipt role', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === SETTINGS,
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.route(
      (url) => url.pathname === SIGNATORY,
      (route) =>
        route.fulfill({
          json: signatory({ personId: PERSON_ID, portrait: true, signature: true }),
        }),
    );
    await page.route(
      (url) => url.pathname === PEOPLE,
      (route) => route.fulfill({ json: { members: [eva], note: null } }),
    );
    await page.route(
      (url) => url.pathname === `/api/admin/donations/receipt-signatures/${PERSON_ID}`,
      (route) => route.fulfill({ json: vectorSignature }),
    );

    await page.goto('/sprava/nastaveni');
    const card = page.getByRole('region', { name: 'Kdo potvrzení podepisuje' });
    const block = card.getByRole('figure', { name: 'Náhled podpisu na potvrzení' });
    await expect(block.locator('img.signature-block-portrait')).toHaveAttribute(
      'src',
      `/api/content/media/${PORTRAIT_ID}?w=240`,
    );
    await expect(
      block.getByRole('img', { name: 'Podpis na potvrzení' }).locator('path'),
    ).toHaveCount(2);
    await expect(block.locator('.signature-block-for')).toHaveText(
      'Za Nová naděje - nadační fond:',
    );
    await expect(block.locator('.signature-block-name')).toHaveText('Petr Vzorový');
    await expect(block.locator('.signature-block-role')).toHaveText('předseda správní rady');
    await card.getByRole('link', { name: 'Otevřít lidi fondu' }).click();
    await expect(page).toHaveURL(/\/sprava\/lide-fondu$/);
  });

  test('when nobody signs the receipts, then the receipts card warns that no receipt is issued', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === SETTINGS,
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.route(
      (url) => url.pathname === SIGNATORY,
      (route) => route.fulfill({ json: noSignatory }),
    );

    await page.goto('/sprava/nastaveni');
    const card = page.getByRole('region', { name: 'Kdo potvrzení podepisuje' });
    await expect(card.getByRole('alert')).toHaveCount(0);
    await expect(card.locator('.signatory-missing')).toHaveText(
      'Potvrzení o daru teď nikdo nepodepisuje, a tak je web dárcům nevystaví. Vyberte u lidí fondu, kdo je podepisuje, a jeho funkci na potvrzení.',
    );
    await expect(card.getByRole('figure')).toHaveCount(0);
  });

  test('when the signature block is previewed in a dark forced-colours mode, then it keeps the paper and the ink keeps its colour', async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' });
    await page.route(
      (url) => url.pathname === SETTINGS,
      (route) => route.fulfill({ json: adminSettings }),
    );
    await page.route(
      (url) => url.pathname === SIGNATORY,
      (route) => route.fulfill({ json: signatory({ signature: true }) }),
    );
    await page.route(
      (url) => url.pathname.startsWith('/api/admin/donations/receipt-signatures/'),
      (route) => route.fulfill({ json: vectorSignature }),
    );

    await page.goto('/sprava/nastaveni');
    const frame = page.locator('.signature-block');
    await expect(frame.locator('path')).toHaveCount(2);

    const colours = await frame.evaluate((element) => ({
      adjust: getComputedStyle(element).forcedColorAdjust,
      paper: getComputedStyle(element).backgroundColor,
      ink: getComputedStyle(element.querySelector('path') as Element).fill,
    }));
    expect(colours.adjust).toBe('none');
    expect(colours.paper).not.toBe('rgb(0, 0, 0)');
    expect(colours.ink).toBe('rgb(29, 42, 92)');
  });
});
