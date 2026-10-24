import { expect, test } from './fixtures';
import {
  administrator,
  claudeConnection,
  connectionRequest,
  mockConnectApi,
  mockDonorApi,
  openDonorSection,
  session,
  signIn,
} from './donor-session';

test.describe('Given Claude sent an administrator to the site to connect the administration', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await mockConnectApi(page);
  });

  test('when they sign in on the page and allow it, then the page stays, names claude.ai and its permissions, and the browser returns to Claude with the code', async ({
    page,
  }) => {
    const decisions: unknown[] = [];
    await page.route('**/api/donors/oauth/authorize', async (route) => {
      decisions.push(route.request().postDataJSON());
      await route.fulfill({
        json: {
          redirectTo:
            'https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz&iss=http%3A%2F%2Flocalhost%3A4200',
        },
      });
    });
    await page.route('**/api/donors/auth/login', (route) =>
      route.fulfill(session(200, administrator)),
    );

    await page.goto(connectionRequest);
    await expect(page).toHaveTitle('Připojení aplikace | Nová naděje – nadační fond');
    await expect(
      page.getByRole('heading', { name: 'Aplikace žádá o přístup ke správě' }),
    ).toBeVisible();

    await page.locator('.ui-panel-page').getByRole('button', { name: 'Přihlásit se' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#login-email').fill('jana@example.cz');
    await dialog.locator('#login-password').fill('correct horse battery');
    await dialog.locator('.ui-button--block').click();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/pripojeni\?client_id=/);
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toContainText('Povolit přístup ke správě aplikaci claude.ai?');
    await expect(heading).toBeFocused();
    await expect(page.locator('.scopes:not(.write-scopes) li')).toHaveCount(5);
    await expect(page.locator('.scopes li').first()).toContainText('vidět dárce');
    await expect(page.locator('.never')).toContainText('Nikdy nebude smět');
    const changes = page.getByRole('checkbox', { name: 'Povolit i změny' });
    await expect(changes).not.toBeChecked();
    await expect(changes).toHaveAccessibleDescription(/jen čtení/);

    await changes.check();
    await expect(page.getByText('Povolení potvrďte kódem z ověřovací aplikace.')).toBeVisible();
    await page.getByRole('button', { name: 'Povolit', exact: true }).click();
    await expect(page.locator('#connect-app-code')).toBeFocused();
    expect(decisions).toEqual([]);
    await page.getByLabel('Kód z aplikace').fill('123456');
    await page.getByRole('button', { name: 'Povolit', exact: true }).click();

    await expect(page).toHaveURL(
      'https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz&iss=http%3A%2F%2Flocalhost%3A4200',
    );
    expect(decisions).toEqual([
      {
        clientId: 'https://claude.ai/.well-known/oauth-client',
        redirectUri: 'https://claude.ai/api/mcp/auth_callback',
        responseType: 'code',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
        scope: 'admin:read admin:write',
        resource: 'http://localhost:4200/mcp',
        state: 'xyz',
        approved: true,
        secondFactorCode: '123456',
      },
    ]);
  });

  test('when the code was already used, then the consent stays, says why and takes a new code', async ({
    page,
  }) => {
    const codes: string[] = [];
    await page.route('**/api/donors/oauth/authorize', async (route) => {
      const body = route.request().postDataJSON() as { secondFactorCode: string };
      codes.push(body.secondFactorCode);
      if (codes.length === 1) {
        await route.fulfill({
          status: 400,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'https://nfnn.cz/problems/donors/second-factor-code-rejected',
            title: 'Nesprávný kód',
            detail: 'Zadejte prosím aktuální kód z ověřovací aplikace; každý kód platí jen jednou.',
            status: 400,
          }),
        });
        return;
      }
      await route.fulfill({
        json: { redirectTo: 'https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz' },
      });
    });
    await page.route('**/api/donors/auth/refresh', (route) =>
      route.fulfill(session(200, administrator)),
    );
    await signIn(page, administrator);

    await page.goto(connectionRequest);
    await page.getByLabel('Kód z aplikace').fill('111111');
    await page.getByRole('button', { name: 'Povolit', exact: true }).click();

    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText('Nesprávný kód');
    await expect(page.getByLabel('Kód z aplikace')).toBeFocused();
    await expect(page.getByText('Opište prosím kód z aplikace.')).toHaveCount(0);

    await page.keyboard.type('222222');
    await expect(page.getByLabel('Kód z aplikace')).toHaveValue('222222');
    await page.getByRole('button', { name: 'Povolit', exact: true }).click();

    await expect(page).toHaveURL('https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz');
    expect(codes).toEqual(['111111', '222222']);
  });

  test('when a plain donor is signed in, then the page says only an administrator can connect and declining returns them to Claude with the error', async ({
    page,
  }) => {
    await page.route('**/api/donors/oauth/authorize', (route) =>
      route.fulfill({
        json: {
          redirectTo: 'https://claude.ai/api/mcp/auth_callback?error=access_denied&state=xyz',
        },
      }),
    );
    await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200)));
    await signIn(page);

    await page.goto(connectionRequest);

    await expect(
      page.getByRole('heading', { name: 'Připojit aplikaci může jen správce' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Povolit' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Odmítnout a vrátit se do aplikace' }).click();

    await expect(page).toHaveURL(
      'https://claude.ai/api/mcp/auth_callback?error=access_denied&state=xyz',
    );
  });

  test('when a plain donor signs in with another account, then the page continues to the consent for the administrator', async ({
    page,
  }) => {
    await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200)));
    await signIn(page);
    await page.route('**/api/donors/auth/logout', (route) =>
      route.fulfill({ status: 204, body: '' }),
    );
    await page.route('**/api/donors/auth/login', (route) =>
      route.fulfill(session(200, administrator)),
    );

    await page.goto(connectionRequest);
    await page.getByRole('button', { name: 'Přihlásit se jiným účtem' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('#login-email')).toBeFocused();
    await dialog.locator('#login-email').fill('spravce@example.cz');
    await dialog.locator('#login-password').fill('correct horse battery');
    await dialog.locator('.ui-button--block').click();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/pripojeni\?client_id=/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Povolit přístup ke správě aplikaci claude.ai?',
    );
  });

  test('when the address lacks the application, then the page says the request is incomplete', async ({
    page,
  }) => {
    await page.goto('/pripojeni');

    await expect(
      page.getByRole('heading', { name: 'Žádost o připojení je neúplná' }),
    ).toBeVisible();
  });
});

test.describe('Given an administrator with Claude connected', () => {
  test('when they open the overview, then the account card lists claude.ai and Odpojit removes it', async ({
    page,
  }) => {
    await mockDonorApi(page);
    let connected = true;
    await page.route(
      (url) => url.pathname === '/api/donors/me/connections',
      (route) => route.fulfill({ json: { items: connected ? [claudeConnection] : [] } }),
    );
    const deleted: string[] = [];
    await page.route(
      (url) => url.pathname.startsWith('/api/donors/me/connections/'),
      async (route) => {
        deleted.push(new URL(route.request().url()).pathname);
        connected = false;
        await route.fulfill({ status: 204 });
      },
    );
    await signIn(page, administrator);
    await openDonorSection(page, 'Údaje a zabezpečení');

    const connections = page.locator('.connections');
    await expect(connections.getByRole('heading', { name: 'Připojené aplikace' })).toBeVisible();
    await expect(connections.locator('.connection-client')).toHaveText('claude.ai');
    await expect(connections.locator('.connection-dates')).toContainText('23. 10. 2026');
    await expect(connections.locator('.connection-scopes li')).toHaveCount(2);

    await connections.getByRole('button', { name: 'Odpojit' }).click();

    await expect(connections.locator('.connection')).toHaveCount(0);
    await expect(page.locator('.account-status')).toContainText('Aplikace claude.ai je odpojená');
    expect(deleted).toEqual([`/api/donors/me/connections/${claudeConnection.id}`]);
  });
});
