import { Locator, Page, Route } from '@playwright/test';
import {
  administrator,
  claudeConnection,
  donor,
  mockDonorApi,
  noDonations,
  openDonorSection,
  openSignInDialog,
  problem,
  secondFactorRequired,
  signedInDevices,
  signIn,
} from './donor-session';
import { expect, test } from './fixtures';

const SIGNED_OUT =
  'Zařízení jsme odhlásili: iPhone · Safari. Pokud jste se na něm nepřihlásili vy, změňte si heslo.';

async function lengthenLoadingDelay(page: Page): Promise<void> {
  await page.evaluate(() => document.documentElement.style.setProperty('--delay-loading', '10s'));
}

async function openSignInDialogUnderLongLoadingDelay(page: Page): Promise<void> {
  await page.goto('/');
  await lengthenLoadingDelay(page);
  await page.getByRole('banner').getByRole('button', { name: 'Přihlásit se' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
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
  await lengthenLoadingDelay(page);
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
    await lengthenLoadingDelay(page);
    await openDonorSection(page, 'Údaje a zabezpečení');
    const row = page.locator('.account-row').filter({ hasText: 'Čeká na potvrzení' });
    const resend = row.locator('.account-resend');
    await expect(resend).toHaveAccessibleName('Poslat znovu potvrzovací odkaz');
    const status = page.locator('.account-status');

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
  await lengthenLoadingDelay(page);
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
    test(`when they press ${step.name}, then exactly one status region says ${step.busy} while the button keeps the focus, takes no second press and looks as a disabled button did, light and dark, drawn in GrayText when the system forces its colours, and none says it after the answer`, async ({
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
      await page.emulateMedia({ colorScheme: 'dark' });
      const darkLooks = await lockedAndDisabledLooks(button);
      expect(darkLooks.locked).toEqual(darkLooks.disabled);
      await page.emulateMedia({ colorScheme: 'light', forcedColors: 'active' });
      const forcedLook = await lockedAndDisabledLooks(button);
      const grayText = await systemColour(button, 'GrayText');
      expect([forcedLook.locked.color, forcedLook.locked.borderColor]).toEqual([
        grayText,
        grayText,
      ]);
      await page.emulateMedia({ forcedColors: 'none' });

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

function systemColour(near: Locator, keyword: string): Promise<string> {
  return near.evaluate((element, colour) => {
    const probe = element.ownerDocument.createElement('span');
    probe.style.forcedColorAdjust = 'none';
    probe.style.color = colour;
    element.ownerDocument.body.append(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    return computed;
  }, keyword);
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

test.describe('Given a visitor signing in from the sign-in dialog', () => {
  test('when the server takes longer than the loading delay, then the pressed Přihlásit se keeps the focus, takes no second press and the dialog says first Přihlašujeme… and then only the result', async ({
    page,
  }) => {
    await page.clock.install();
    await mockDonorApi(page);
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    let requests = 0;
    await page.route('**/api/donors/auth/login', async (route) => {
      requests += 1;
      await answered;
      await route.fulfill(
        problem(
          401,
          'auth/invalid-credentials',
          'Nesprávný e-mail nebo heslo',
          'Zkontrolujte prosím e-mail a heslo.',
        ),
      );
    });
    await openSignInDialogUnderLongLoadingDelay(page);
    const dialog = page.getByRole('dialog');
    await page.locator('#login-email').fill('jana@example.cz');
    await page.locator('#login-password').fill('wrong horse battery');
    const submit = dialog.locator('.login-form .ui-button--primary');
    const status = dialog.locator('.login-form [role="status"]');
    const heard = await listenTo(status);
    await submit.focus();

    await submit.press('Enter');

    await expect(submit).toHaveAttribute('aria-busy', 'true');
    await expect(submit).toBeFocused();
    await expect(status).toHaveText('');

    await page.clock.fastForward(10_000);

    await expect(status).toHaveText('Přihlašujeme…');
    await expect(submit.locator('.busy-label__face--shown')).toHaveText('Přihlašujeme…');
    await expect(submit).toHaveAccessibleName('Přihlásit se');
    await expect(submit).toBeFocused();

    await submit.press('Enter');

    answer();

    await expect(dialog.getByRole('alert')).toContainText('Nesprávný e-mail nebo heslo');
    await expect(status).toHaveText('');
    await expect(submit).not.toHaveAttribute('aria-busy');
    await expect(submit).toBeFocused();
    expect(requests).toBe(1);
    expect(await heard()).toEqual(['Přihlašujeme…']);
  });

  test('when the visitor presses Přihlásit se and the browser moves the focus onto the dialog itself, then the focus goes back to that button without a focus ring and stays there while the answer is slow', async ({
    page,
    hasTouch,
  }) => {
    await mockDonorApi(page);
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await page.route('**/api/donors/auth/login', async (route) => {
      await answered;
      await route.fulfill(WRONG_PASSWORD);
    });
    await openSignInDialog(page);
    const dialog = page.getByRole('dialog');
    await fillInSignIn(page);
    const submit = dialog.locator('.login-form .ui-button--primary');
    await pressWithPointer(page.locator('#login-password'), hasTouch);

    await pressWhileFocusFallsOntoDialog(page, submit);

    await expect(submit).toHaveAttribute('aria-busy', 'true');
    await expect.poll(() => holdsFocus(submit)).toBe(true);
    expect(await showsFocusRing(submit)).toBe(false);

    answer();

    await expect(dialog.getByRole('alert')).toContainText('Nesprávný e-mail nebo heslo');
    await expect.poll(() => holdsFocus(submit)).toBe(true);
    expect(await showsFocusRing(submit)).toBe(false);
  });

  test('when the visitor tabs from Heslo to Přihlásit se, then that button shows its focus ring', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await openSignInDialog(page);
    await fillInSignIn(page);
    const submit = page.getByRole('dialog').locator('.login-form .ui-button--primary');
    await page.locator('#login-password').focus();

    await tabUntilFocused(page, submit);

    expect(await showsFocusRing(submit)).toBe(true);
  });
});

function holdsFocus(control: Locator): Promise<boolean> {
  return control.evaluate((element) => document.activeElement === element);
}

function showsFocusRing(control: Locator): Promise<boolean> {
  return control.evaluate((element) => element.matches(':focus-visible'));
}

async function pressWithPointer(control: Locator, hasTouch: boolean): Promise<void> {
  if (hasTouch) {
    await control.tap();
  } else {
    await control.click();
  }
}

async function pressWhileFocusFallsOntoDialog(page: Page, control: Locator): Promise<void> {
  const box = await control.boundingBox();
  if (box === null) {
    throw new Error('The pressed control is not on the screen');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => holdsFocus(control)).toBe(true);
  await page.locator('dialog[open]').evaluate((dialog: HTMLDialogElement) => dialog.focus());
  await page.mouse.up();
}

async function tabUntilFocused(page: Page, control: Locator): Promise<void> {
  for (let presses = 0; presses < 10 && !(await holdsFocus(control)); presses += 1) {
    await page.keyboard.press('Tab');
  }
  expect(await holdsFocus(control)).toBe(true);
}

interface BusyStep {
  readonly name: string;
  readonly busy: string;
  readonly path: string;
  readonly answersBeforeHeld: number;
  readonly answer?: Parameters<Route['fulfill']>[0];
  readonly reach: (page: Page) => Promise<Locator>;
}

const ACCEPTED = { status: 202 };
const WRONG_PASSWORD = problem(
  401,
  'auth/invalid-credentials',
  'Nesprávný e-mail nebo heslo',
  'Zkontrolujte prosím e-mail a heslo.',
);
const WRONG_CODE = problem(
  401,
  'auth/invalid-second-factor-code',
  'Nesprávný kód',
  'Zadejte kód, který ukazuje aplikace.',
);

async function fillInSignIn(page: Page): Promise<void> {
  await page.locator('#login-email').fill('jana@example.cz');
  await page.locator('#login-password').fill('correct horse battery');
}

async function fillInRegistration(page: Page): Promise<void> {
  await page.getByRole('dialog').getByRole('button', { name: 'Registrace', exact: true }).click();
  await page.locator('#register-name').fill('Jana Nováková');
  await page.locator('#register-street').fill('Dlouhá 12');
  await page.locator('#register-city').fill('Ústí nad Labem');
  await page.locator('#register-postal-code').fill('400 01');
  await page.locator('#register-email').fill('jana@example.cz');
  await page.locator('#register-password').fill('correct horse battery');
}

async function fillInReset(page: Page): Promise<void> {
  await page.getByRole('dialog').locator('.forgot-link').click();
  await page.locator('#reset-email').fill('jana@example.cz');
}

const BUSY_STEPS: readonly BusyStep[] = [
  {
    name: 'Přihlásit se',
    busy: 'Přihlašujeme…',
    path: '/api/donors/auth/login',
    answersBeforeHeld: 0,
    answer: WRONG_PASSWORD,
    reach: async (page) => {
      await fillInSignIn(page);
      return page.locator('.login-form .ui-button--primary');
    },
  },
  {
    name: 'Přihlásit se with the code from the app',
    busy: 'Ověřujeme kód…',
    path: '/api/donors/auth/login/second-factor',
    answersBeforeHeld: 0,
    answer: WRONG_CODE,
    reach: async (page) => {
      await page.route('**/api/donors/auth/login', (route) =>
        route.fulfill(secondFactorRequired()),
      );
      await fillInSignIn(page);
      await page.locator('.login-form .ui-button--primary').click();
      await page.getByLabel('Kód z aplikace').fill('287082');
      return page.locator('.code-form .ui-button--primary');
    },
  },
  {
    name: 'Vytvořit účet',
    busy: 'Vytváříme účet…',
    path: '/api/donors/auth/register',
    answersBeforeHeld: 0,
    reach: async (page) => {
      await fillInRegistration(page);
      return page.locator('.register-form .ui-button--primary');
    },
  },
  {
    name: 'Poslat odkaz znovu',
    busy: 'Odesíláme…',
    path: '/api/donors/auth/email-verification/request',
    answersBeforeHeld: 0,
    reach: async (page) => {
      await page.route('**/api/donors/auth/register', (route) => route.fulfill(ACCEPTED));
      await fillInRegistration(page);
      await page.locator('.register-form .ui-button--primary').click();
      return page.locator('.registration-resend');
    },
  },
  {
    name: 'Odeslat odkaz',
    busy: 'Odesíláme…',
    path: '/api/donors/auth/password-reset/request',
    answersBeforeHeld: 0,
    reach: async (page) => {
      await fillInReset(page);
      return page.locator('.reset-form .ui-button--primary');
    },
  },
  {
    name: 'Poslat znovu',
    busy: 'Odesíláme…',
    path: '/api/donors/auth/password-reset/request',
    answersBeforeHeld: 1,
    reach: async (page) => {
      await fillInReset(page);
      await page.locator('.reset-form .ui-button--primary').click();
      return page.locator('.reset-resend');
    },
  },
];

async function holdAnswers(page: Page, step: BusyStep): Promise<() => void> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  let answered = 0;
  await page.route(
    (url) => url.pathname === step.path,
    async (route) => {
      answered += 1;
      if (answered > step.answersBeforeHeld) {
        await released;
      }
      await route.fulfill(step.answer ?? ACCEPTED);
    },
  );
  return release;
}

test.describe('Given a visitor in a step of the sign-in dialog whose answer is slower than the loading delay', () => {
  for (const step of BUSY_STEPS) {
    test(`when they press ${step.name}, then exactly one status region says ${step.busy} while the button keeps the focus and looks as a disabled button did, and none says it after the answer`, async ({
      page,
    }) => {
      await page.clock.install();
      await mockDonorApi(page);
      const release = await holdAnswers(page, step);
      await openSignInDialogUnderLongLoadingDelay(page);
      const button = await step.reach(page);
      const starting = page.locator('[role="status"]').filter({ hasText: step.busy });
      await button.focus();

      await button.press('Enter');

      await expect(button).toHaveAttribute('aria-busy', 'true');
      await page.clock.fastForward(10_000);
      await expect(button.locator('.busy-label__face--shown')).toHaveText(step.busy);
      await expect(starting).toHaveCount(1);
      await expect(starting).toHaveText(step.busy);
      await expect(button).toBeFocused();
      const looks = await lockedAndDisabledLooks(button);
      expect(looks.locked).toEqual(looks.disabled);

      release();

      await expect(starting).toHaveCount(0);
    });
  }
});
