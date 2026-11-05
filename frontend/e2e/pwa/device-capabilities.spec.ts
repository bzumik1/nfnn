import { Request } from '@playwright/test';
import { expect, pwaTest as test } from './pwa-fixtures';

const POLICY = '/zasady-ochrany-osobnich-udaju';

test.describe('Given a page with a virtual platform authenticator that supports PRF', () => {
  test('when a passkey is created and used with a PRF salt, then the browser returns the same 32 secret bytes for that salt and others for another', async ({
    page,
    virtualAuthenticator,
  }) => {
    await page.goto(POLICY);

    const result = await page.evaluate(async () => {
      const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
      const hex = (buffer: ArrayBuffer | undefined): string =>
        Array.from(new Uint8Array(buffer ?? new ArrayBuffer(0)))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
      const created = (await navigator.credentials.create({
        publicKey: {
          challenge: bytes('a challenge of the e2e test'),
          rp: { id: location.hostname, name: 'NFNN e2e' },
          user: { id: bytes('donor-1'), name: 'donor@example.cz', displayName: 'Dárce' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
          extensions: { prf: {} },
        },
      })) as PublicKeyCredential;
      const evaluate = async (salt: string): Promise<string> => {
        const asserted = (await navigator.credentials.get({
          publicKey: {
            challenge: bytes(`a challenge for ${salt}`),
            rpId: location.hostname,
            allowCredentials: [{ type: 'public-key', id: created.rawId }],
            userVerification: 'required',
            extensions: { prf: { eval: { first: bytes(salt) } } },
          },
        })) as PublicKeyCredential;
        const prf = asserted.getClientExtensionResults().prf as
          { results?: { first?: ArrayBuffer } } | undefined;
        return hex(prf?.results?.first);
      };
      const enabled = (created.getClientExtensionResults().prf as { enabled?: boolean } | undefined)
        ?.enabled;
      return {
        enabled,
        first: await evaluate('salt one'),
        again: await evaluate('salt one'),
        other: await evaluate('salt two'),
      };
    });

    expect(result.enabled).toBe(true);
    expect(result.first).toMatch(/^[0-9a-f]{64}$/);
    expect(result.again).toBe(result.first);
    expect(result.other).toMatch(/^[0-9a-f]{64}$/);
    expect(result.other).not.toBe(result.first);
    expect(await virtualAuthenticator.credentialCount()).toBe(1);
  });
});

const displayAnswers = (): Record<string, unknown> => ({
  standalone: window.matchMedia('(display-mode: standalone)').matches,
  browser: window.matchMedia('(display-mode: browser)').matches,
  combined: window.matchMedia('(display-mode: standalone) and (max-width: 1px)').matches,
  negated: window.matchMedia('not (display-mode: standalone)').matches,
  wide: window.matchMedia('(min-width: 1px)').matches,
  narrow: window.matchMedia('(max-width: 1px)').matches,
  installed: (navigator as Navigator & { standalone?: boolean }).standalone,
});

test.describe('Given the web app opened from the home screen of an iPhone', () => {
  test.use({ displayMode: 'ios-home-screen' });

  test('when the page asks for the display mode, then it reads standalone from the media query and the iOS flag', async ({
    page,
  }) => {
    await page.goto(POLICY);

    expect(await page.evaluate(displayAnswers)).toEqual(
      expect.objectContaining({ standalone: true, browser: false, installed: true }),
    );
  });
});

test.describe('Given the web app installed from Chrome', () => {
  test.use({ displayMode: 'standalone' });

  test('when the page asks for the display mode, then only the exact display-mode queries change and every other query keeps its real answer', async ({
    page,
  }) => {
    await page.goto(POLICY);

    expect(await page.evaluate(displayAnswers)).toEqual({
      standalone: true,
      browser: false,
      combined: false,
      negated: true,
      wide: true,
      narrow: false,
      installed: undefined,
    });
  });

  test.describe('when an error escapes the app', () => {
    test.use({ allowedConsoleErrors: [/^ERROR Error: planted for the display mode/] });

    test('then its report names the standalone display, read from the media query', async ({
      page,
      context,
    }) => {
      const reports: Request[] = [];
      await context.route('/api/operations/client-errors', (route) => {
        reports.push(route.request());
        return route.fulfill({ status: 204 });
      });
      await page.goto(POLICY);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await page.evaluate(() => {
        setTimeout(() => {
          throw new Error('planted for the display mode');
        });
      });

      await expect.poll(() => reports.length).toBe(1);
      expect(reports[0].postDataJSON()).toEqual(expect.objectContaining({ display: 'standalone' }));
    });
  });
});

test.describe('Given the web app opened in a browser tab', () => {
  test('when the page asks for the display mode, then it does not read standalone', async ({
    page,
  }) => {
    await page.goto(POLICY);

    expect(await page.evaluate(() => window.matchMedia('(display-mode: standalone)').matches)).toBe(
      false,
    );
  });
});
