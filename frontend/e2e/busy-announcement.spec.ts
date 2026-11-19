import { Locator, Page } from '@playwright/test';
import {
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
