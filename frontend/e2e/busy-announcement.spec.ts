import { Locator, Page } from '@playwright/test';
import {
  administrator,
  claudeConnection,
  donor,
  mockDonorApi,
  noDonations,
  openDonorSection,
  problem,
  signedInDevices,
  signIn,
} from './donor-session';
import { expect, test } from './fixtures';

const SIGNED_OUT =
  'Zařízení jsme odhlásili: iPhone · Safari. Pokud jste se na něm nepřihlásili vy, změňte si heslo.';

async function lengthenLoadingDelay(page: Page): Promise<void> {
  await page.evaluate(() => document.documentElement.style.setProperty('--delay-loading', '10s'));
}

async function listenTo(status: Locator): Promise<() => Promise<string[]>> {
  await status.evaluate((line) => {
    const heard: string[] = [];
    (window as unknown as { heard: string[] }).heard = heard;
    new MutationObserver(() => {
      const text = (line.textContent ?? '').trim();
      if (text !== '' && heard.at(-1) !== text) {
        heard.push(text);
      }
    }).observe(line, { subtree: true, childList: true, characterData: true });
  });
  return () => status.page().evaluate(() => (window as unknown as { heard: string[] }).heard);
}

async function signOutTheIPhone(page: Page, answers: Promise<void>): Promise<Locator> {
  await page.clock.install();
  await mockDonorApi(page);
  await page.route(
    (url) => url.pathname === '/api/donors/me/devices',
    (route) => route.fulfill({ json: { items: signedInDevices } }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/donors/me/devices/'),
    async (route) => {
      await answers;
      await route.fulfill({ status: 204 });
    },
  );
  await signIn(page);
  await openDonorSection(page, 'Údaje a zabezpečení');
  const devices = page.locator('.devices');
  await devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' }).click();
  const question = devices.getByRole('group', { name: 'Odhlásit iPhone · Safari?' });
  await expect(question).toBeVisible();
  await question.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
  return devices;
}

test.describe('Given a donor signing out another device on Údaje a zabezpečení', () => {
  test('when the server takes longer than the loading delay, then the button is busy under its resting name, the card keeps its height and its status line says first Odhlašujeme… and then only the result', async ({
    page,
  }) => {
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    const devices = await signOutTheIPhone(page, answered);
    const status = devices.locator('.devices-status');
    const heard = await listenTo(status);
    await lengthenLoadingDelay(page);
    const restingHeight = (await devices.boundingBox())?.height;
    const yes = devices.getByRole('button', { name: 'Odhlásit', exact: true });

    await yes.click();

    await expect(yes).toHaveAttribute('aria-busy', 'true');
    await expect(yes).toHaveAccessibleName('Odhlásit');
    await expect(status).toHaveText('');

    await page.clock.fastForward(10_000);

    await expect(status).toHaveText('Odhlašujeme…');
    await expect(yes.locator('.busy-label__face--shown')).toHaveText('Odhlašujeme…');
    await expect(yes).toHaveAccessibleName('Odhlásit');
    await expect(yes).not.toHaveAttribute('aria-live');
    expect((await devices.boundingBox())?.height).toBe(restingHeight);

    answer();

    await expect(status).toHaveText(SIGNED_OUT);
    expect(await heard()).toEqual(['Odhlašujeme…', SIGNED_OUT]);
  });

  test('when the server answers before the loading delay is over, then the status line says only the result', async ({
    page,
  }) => {
    const devices = await signOutTheIPhone(page, Promise.resolve());
    const status = devices.locator('.devices-status');
    const heard = await listenTo(status);
    await lengthenLoadingDelay(page);

    await devices.getByRole('button', { name: 'Odhlásit', exact: true }).click();

    await expect(status).toHaveText(SIGNED_OUT);
    expect(await heard()).toEqual([SIGNED_OUT]);
  });
});

test.describe('Given a donor sending the e-mail change link again on Údaje a zabezpečení', () => {
  test('when the server refuses after the loading delay, then the button is busy under its resting name meanwhile and afterwards no longer busy, its name again its visible label', async ({
    page,
  }) => {
    await page.clock.install();
    await mockDonorApi(page, noDonations);
    const pending = { newEmail: 'jana.nova@example.cz', expiresAt: '2026-10-21T10:00:00Z' };
    await page.route(
      (url) => url.pathname === '/api/donors/me',
      (route) => route.fulfill({ json: { ...donor, pendingEmailChange: pending } }),
    );
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await page.route('**/api/donors/me/email-change/resend', async (route) => {
      await answered;
      await route.fulfill(
        problem(429, 'donors/rate-limited', 'Příliš mnoho požadavků', 'Zkuste to za hodinu.'),
      );
    });
    await signIn(page, { ...donor, pendingEmailChange: pending });
    await openDonorSection(page, 'Údaje a zabezpečení');
    const row = page.locator('.account-row').filter({ hasText: 'Čeká na potvrzení' });
    const resend = row.locator('.account-resend');
    await expect(resend).toHaveAccessibleName('Poslat znovu potvrzovací odkaz');
    const status = page.locator('.account-status');
    await lengthenLoadingDelay(page);

    await resend.click();
    await page.clock.fastForward(10_000);

    await expect(resend.locator('.busy-label__face--shown')).toHaveText('Posíláme…');
    await expect(status).toHaveText('Posíláme…');
    await expect(resend).toHaveAccessibleName('Poslat znovu potvrzovací odkaz');
    await expect(resend).toHaveAttribute('aria-busy', 'true');

    answer();

    await expect(row.getByRole('alert')).toContainText('Příliš mnoho požadavků');
    await expect(status).toHaveText('');
    await expect(resend).not.toHaveAttribute('aria-busy');
    await expect(resend.locator('.busy-label__face--shown')).toHaveText(
      'Poslat znovu potvrzovací odkaz',
    );
    await expect(resend).toHaveAccessibleName('Poslat znovu potvrzovací odkaz');
  });
});

const PENDING_EMAIL_CHANGE = {
  newEmail: 'jana.nova@example.cz',
  expiresAt: '2026-10-21T10:00:00Z',
};
const IPHONE_PASSKEY = {
  id: '019a1b2c-3d4e-7f00-8000-000000000001',
  name: 'iPhone',
  createdAt: '2026-10-17T10:00:00Z',
  lastUsedAt: '2026-10-22T09:00:00Z',
};
const REFUSED = problem(
  429,
  'donors/rate-limited',
  'Příliš mnoho požadavků',
  'Zkuste to za hodinu.',
);

interface DetailsBusyButton {
  readonly name: string;
  readonly busy: string;
  readonly method: string;
  readonly path: (pathname: string) => boolean;
  readonly reach: (page: Page) => Promise<Locator>;
}

async function settledOpening(region: Locator): Promise<void> {
  await expect(region).toBeVisible();
  await region.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
}

async function passkeysRegion(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Spravovat přístupové klíče' }).click();
  const passkeys = page.getByRole('region', { name: 'Přístupové klíče' });
  await settledOpening(passkeys);
  return passkeys;
}

const DETAILS_BUSY_BUTTONS: readonly DetailsBusyButton[] = [
  {
    name: 'Odhlásit of the iPhone',
    busy: 'Odhlašujeme…',
    method: 'DELETE',
    path: (pathname) => pathname.startsWith('/api/donors/me/devices/'),
    reach: async (page) => {
      const devices = page.locator('.devices');
      await devices.getByRole('button', { name: 'Odhlásit iPhone · Safari' }).click();
      await settledOpening(devices.getByRole('group', { name: 'Odhlásit iPhone · Safari?' }));
      return devices.locator('.devices-confirm-yes');
    },
  },
  {
    name: 'Odhlásit of every other device',
    busy: 'Odhlašujeme…',
    method: 'DELETE',
    path: (pathname) => pathname === '/api/donors/me/devices',
    reach: async (page) => {
      const devices = page.locator('.devices');
      await devices.getByRole('button', { name: 'Odhlásit všechna ostatní zařízení' }).click();
      await settledOpening(
        devices.getByRole('group', { name: 'Odhlásit všechna ostatní zařízení?' }),
      );
      return devices.locator('.devices-confirm-yes');
    },
  },
  {
    name: 'Odpojit',
    busy: 'Odpojujeme…',
    method: 'DELETE',
    path: (pathname) => pathname.startsWith('/api/donors/me/connections/'),
    reach: async (page) => page.locator('.connection-disconnect'),
  },
  {
    name: 'Ano, odebrat',
    busy: 'Odebíráme…',
    method: 'DELETE',
    path: (pathname) => pathname.startsWith('/api/donors/me/passkeys/'),
    reach: async (page) => {
      const passkeys = await passkeysRegion(page);
      await passkeys.getByRole('button', { name: 'Odebrat', exact: true }).click();
      await settledOpening(passkeys.locator('.passkey-confirm'));
      return passkeys.locator('.passkey-confirm .ui-button--danger-soft');
    },
  },
  {
    name: 'Uložit název',
    busy: 'Ukládáme…',
    method: 'PATCH',
    path: (pathname) => pathname.startsWith('/api/donors/me/passkeys/'),
    reach: async (page) => {
      const passkeys = await passkeysRegion(page);
      await passkeys.getByRole('button', { name: 'Přejmenovat', exact: true }).click();
      await page.locator('#passkey-rename').fill('iPhone 16');
      return passkeys.locator('.passkey-rename .passkeys-save');
    },
  },
  {
    name: 'Poslat znovu',
    busy: 'Posíláme…',
    method: 'POST',
    path: (pathname) => pathname === '/api/donors/me/email-change/resend',
    reach: async (page) => page.locator('.account-resend'),
  },
  {
    name: 'Zrušit of the e-mail change',
    busy: 'Rušíme…',
    method: 'DELETE',
    path: (pathname) => pathname === '/api/donors/me/email-change',
    reach: async (page) => page.locator('.account-cancel-change'),
  },
  {
    name: 'Poslat potvrzovací odkaz',
    busy: 'Odesíláme…',
    method: 'POST',
    path: (pathname) => pathname === '/api/donors/me/email-change',
    reach: async (page) => {
      await page.locator('app-account-card').getByRole('button', { name: 'Změnit e-mail' }).click();
      await page.locator('#account-new-email').fill('jana.jina@example.cz');
      await page.locator('#account-email-password').fill('correct horse battery');
      return page.locator('.account-form .account-save');
    },
  },
  {
    name: 'Změnit heslo',
    busy: 'Ukládáme…',
    method: 'PUT',
    path: (pathname) => pathname === '/api/donors/me/password',
    reach: async (page) => {
      await page.locator('app-account-card').getByRole('button', { name: 'Změnit heslo' }).click();
      await page.locator('#account-current-password').fill('correct horse battery');
      await page.locator('#account-new-password').fill('a brand new passphrase');
      await page.locator('#account-new-password-confirm').fill('a brand new passphrase');
      return page.locator('.account-form .account-save');
    },
  },
];

async function openDetailsWithEveryBusyButton(page: Page): Promise<void> {
  await mockDonorApi(page);
  const signedIn = { ...administrator, pendingEmailChange: PENDING_EMAIL_CHANGE };
  await page.route(
    (url) => url.pathname === '/api/donors/me',
    (route) => route.fulfill({ json: signedIn }),
  );
  await page.route(
    (url) => url.pathname === '/api/donors/me/connections',
    (route) => route.fulfill({ json: { items: [claudeConnection] } }),
  );
  await page.route(
    (url) => url.pathname === '/api/donors/me/passkeys',
    (route) => route.fulfill({ json: { items: [IPHONE_PASSKEY] } }),
  );
  await signIn(page, signedIn);
  await openDonorSection(page, 'Údaje a zabezpečení');
}

async function holdTheAnswer(page: Page, step: DetailsBusyButton): Promise<() => void> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) => step.path(url.pathname),
    async (route) => {
      if (route.request().method() !== step.method) {
        await route.fallback();
        return;
      }
      await released;
      await route.fulfill(REFUSED);
    },
  );
  return release;
}

test.describe('Given an administrator on Údaje a zabezpečení pressing a busy button whose answer is slower than the loading delay', () => {
  for (const step of DETAILS_BUSY_BUTTONS) {
    test(`when they press ${step.name}, then exactly one status region says ${step.busy} while the button keeps the focus, takes no second press and looks as a disabled button did, and none says it after the answer`, async ({
      page,
    }) => {
      await page.clock.install();
      await openDetailsWithEveryBusyButton(page);
      const release = await holdTheAnswer(page, step);
      let requests = 0;
      page.on('request', (request) => {
        if (request.method() === step.method && step.path(new URL(request.url()).pathname)) {
          requests += 1;
        }
      });
      const button = await step.reach(page);
      await lengthenLoadingDelay(page);
      const starting = page.locator('[role="status"]').filter({ hasText: step.busy });
      await button.focus();

      await button.press('Enter');

      await expect(button).toHaveAttribute('aria-busy', 'true');
      await expect(button).toBeFocused();
      await page.clock.fastForward(10_000);
      await expect(button.locator('.busy-label__face--shown')).toHaveText(step.busy);
      await expect(starting).toHaveCount(1);
      await expect(starting).toHaveText(step.busy);
      await expect(button).toBeFocused();
      const looks = await lockedAndDisabledLooks(button);
      expect(looks.locked).toEqual(looks.disabled);

      await button.press('Enter');
      await button.press(' ');

      await expect(button).toBeFocused();
      release();

      await expect(starting).toHaveCount(0);
      expect(requests).toBe(1);
    });
  }
});

interface ButtonLook {
  readonly backgroundColor: string;
  readonly backgroundImage: string;
  readonly color: string;
  readonly opacity: string;
  readonly borderColor: string;
  readonly boxShadow: string;
}

async function lockedAndDisabledLooks(
  button: Locator,
): Promise<{ locked: ButtonLook; disabled: ButtonLook }> {
  return button.evaluate((locked: HTMLButtonElement) => {
    const disabled = locked.cloneNode(true) as HTMLButtonElement;
    disabled.removeAttribute('aria-disabled');
    disabled.removeAttribute('aria-busy');
    disabled.disabled = true;
    locked.after(disabled);
    const look = (element: HTMLElement): ButtonLook => {
      element.style.transition = 'none';
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        color: style.color,
        opacity: style.opacity,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
      };
    };
    const looks = { locked: look(locked), disabled: look(disabled) };
    locked.style.transition = '';
    disabled.remove();
    return looks;
  });
}
