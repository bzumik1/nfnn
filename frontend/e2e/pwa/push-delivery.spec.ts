import { CDPSession, Page } from '@playwright/test';
import { alertMessage } from '../push-device';
import { expect, pwaTest as test } from './pwa-fixtures';

const REGISTRATION_TIMEOUT_MS = 10_000;

interface ShownNotification {
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly data: unknown;
}

async function workerRegistrationId(cdp: CDPSession, scope: string): Promise<string> {
  const found = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no service worker registration of ${scope} was reported`)),
      REGISTRATION_TIMEOUT_MS,
    );
    cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
      const registration = registrations.find(
        (candidate) => candidate.scopeURL === scope && !candidate.isDeleted,
      );
      if (registration !== undefined) {
        clearTimeout(timer);
        resolve(registration.registrationId);
      }
    });
  });
  await cdp.send('ServiceWorker.enable');
  return found;
}

function shownNotifications(page: Page): Promise<ShownNotification[]> {
  return page.evaluate(async () =>
    (await (await navigator.serviceWorker.ready).getNotifications()).map((notification) => ({
      title: notification.title,
      body: notification.body,
      tag: notification.tag,
      data: notification.data as unknown,
    })),
  );
}

function badges(page: Page): Promise<readonly (number | null)[]> {
  return page.evaluate(
    () => (window as unknown as { __nfnnBadges: (number | null)[] }).__nfnnBadges,
  );
}

test.describe('Given the app whose own service worker controls the page with notifications allowed', () => {
  test.beforeEach(async ({ page, context, site, swReady }) => {
    await context.grantPermissions(['notifications'], { origin: site.url });
    await page.addInitScript(() => {
      const shown: (number | null)[] = [];
      Object.defineProperty(window, '__nfnnBadges', { value: shown });
      Object.defineProperty(Navigator.prototype, 'setAppBadge', {
        configurable: true,
        value: (count: number) => {
          shown.push(count);
          return Promise.resolve();
        },
      });
      Object.defineProperty(Navigator.prototype, 'clearAppBadge', {
        configurable: true,
        value: () => {
          shown.push(null);
          return Promise.resolve();
        },
      });
    });
    await page.goto('/');
    await swReady();
  });

  test('when the push service delivers an alert, then the worker shows its notification and the open app sets the badge', async ({
    page,
    context,
    site,
  }) => {
    const cdp = await context.newCDPSession(page);
    const origin = new URL(site.url).origin;
    const registrationId = await workerRegistrationId(cdp, `${origin}/`);
    const outage = alertMessage('backups-outage', 1, '/sprava/zalohy');
    outage.notification.title = 'Zálohy nefungují';
    outage.notification.body = 'Poslední záloha se nepodařila.';

    await cdp.send('ServiceWorker.deliverPushMessage', {
      origin,
      registrationId,
      data: JSON.stringify(outage),
    });

    await expect
      .poll(() => shownNotifications(page))
      .toEqual([
        {
          title: 'Zálohy nefungují',
          body: 'Poslední záloha se nepodařila.',
          tag: 'nfnn-backups',
          data: outage.notification.data,
        },
      ]);
    await expect.poll(() => badges(page)).toEqual([1]);

    const recovered = alertMessage('backups-recovered', 0, '/sprava/zalohy');
    recovered.notification.title = 'Zálohy zase fungují';
    recovered.notification.body = 'Záloha se znovu podařila.';
    await cdp.send('ServiceWorker.deliverPushMessage', {
      origin,
      registrationId,
      data: JSON.stringify(recovered),
    });

    await expect
      .poll(() => shownNotifications(page))
      .toEqual([
        {
          title: 'Zálohy zase fungují',
          body: 'Záloha se znovu podařila.',
          tag: 'nfnn-backups',
          data: recovered.notification.data,
        },
      ]);
    await expect.poll(() => badges(page)).toEqual([1, null]);
    await cdp.detach();
  });
});
