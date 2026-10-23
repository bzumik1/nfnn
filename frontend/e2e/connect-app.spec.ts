import { expect, test } from '@playwright/test';
import {
  administrator,
  claudeConnection,
  connectionRequest,
  mockConnectApi,
  mockDonorApi,
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

    await page.locator('.connect-app').getByRole('button', { name: 'Přihlásit se' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#login-email').fill('jana@example.cz');
    await dialog.locator('#login-password').fill('correct horse battery');
    await dialog.locator('.form-submit').click();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/pripojeni\?client_id=/);
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toContainText('Povolit přístup ke správě aplikaci claude.ai?');
    await expect(heading).toBeFocused();
    await expect(page.locator('.scopes li')).toHaveCount(1);
    await expect(page.locator('.scopes li').first()).toContainText('Čtení');
    const changes = page.getByRole('checkbox', { name: /Změny/ });
    await expect(changes).not.toBeChecked();
    await expect(changes).toHaveAccessibleDescription(/jen čtení/);

    await changes.check();
    await page.getByRole('button', { name: 'Povolit' }).click();

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
      },
    ]);
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
