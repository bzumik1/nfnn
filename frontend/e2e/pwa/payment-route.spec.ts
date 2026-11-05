import { Page } from '@playwright/test';
import { paymentSpayd } from '../qr-matrices';
import { expect, pwaTest as test } from './pwa-fixtures';

const PAYMENT = paymentSpayd('500 Kč without a variable symbol');
const PAYMENT_OF_1000 = paymentSpayd('1 000 Kč without a variable symbol');
const REFUSED_BY_WORKER =
  /^console error: Failed to load resource: the server responded with a status of 404 \(\) \(http:\/\/localhost:\d+\/platba\.spayd\?/;

function reserved(page: Page, payment: string): Promise<string | null> {
  return page.evaluate(
    (text) =>
      new Promise<string | null>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event: MessageEvent<{ id: string | null }>) =>
          resolve(event.data.id);
        navigator.serviceWorker.controller?.postMessage(
          { type: 'nfnn-payment-file', payment: text },
          [channel.port2],
        );
      }),
    payment,
  );
}

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Given the app registered its own service worker on a phone that cannot share the payment file', () => {
  test.beforeEach(async ({ page, context, swReady }) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
    });
    await page.goto('/');
    await swReady();
  });

  test('when the page reserves a payment and opens its id, then the worker answers it on the device once and nothing reaches the server', async ({
    page,
    context,
    browserProblems,
  }) => {
    browserProblems.expectOne(REFUSED_BY_WORKER);
    const reachedNetwork: string[] = [];
    await context.route('**/platba.spayd*', (route) => {
      reachedNetwork.push(route.request().url());
      return route.abort();
    });

    const id = await reserved(page, PAYMENT);
    const answers = await page.evaluate(async (address) => {
      const file = await fetch(address);
      const again = await fetch(address);
      return {
        file: {
          status: file.status,
          type: file.headers.get('content-type'),
          disposition: file.headers.get('content-disposition'),
          cache: file.headers.get('cache-control'),
          policy: file.headers.get('content-security-policy'),
          body: await file.text(),
        },
        again: again.status,
      };
    }, `/platba.spayd?id=${id}`);

    expect(answers).toEqual({
      file: {
        status: 200,
        type: 'application/x-shortpaymentdescriptor; charset=utf-8',
        disposition: 'inline; filename="platba.spayd"',
        cache: 'no-store',
        policy: "default-src 'none'; sandbox allow-downloads; frame-ancestors 'none'",
        body: PAYMENT,
      },
      again: 404,
    });
    expect(reachedNetwork).toEqual([]);
  });

  test('when a link writes a payment into the address, as another site could, then the worker refuses it and serves no payment file', async ({
    page,
    browserProblems,
  }) => {
    browserProblems.expectOne(REFUSED_BY_WORKER);

    const refused = await page.evaluate(async (payment) => {
      const answer = await fetch(`/platba.spayd?${new URLSearchParams({ data: payment })}`);
      return {
        status: answer.status,
        type: answer.headers.get('content-type'),
        disposition: answer.headers.get('content-disposition'),
      };
    }, PAYMENT);

    expect(refused).toEqual({ status: 404, type: 'text/plain; charset=utf-8', disposition: null });
  });

  test('when the tab navigates to a payment file the worker no longer holds, then the tab stays on the page', async ({
    page,
  }) => {
    const id = await reserved(page, PAYMENT);
    await page.evaluate(async (address) => {
      await fetch(address);
    }, `/platba.spayd?id=${id}`);
    await page.evaluate(() => document.documentElement.setAttribute('data-stayed', 'yes'));

    const answer = page.waitForResponse((response) => response.url().includes('/platba.spayd?id='));
    await page.evaluate((address) => location.assign(address), `/platba.spayd?id=${id}`);

    expect((await answer).status()).toBe(204);
    expect(
      await page.evaluate(() => ({
        path: location.pathname,
        stayed: document.documentElement.getAttribute('data-stayed'),
      })),
    ).toEqual({ path: '/', stayed: 'yes' });
  });

  test('when the page asks to reserve a text that is no payment, then the worker gives no id', async ({
    page,
  }) => {
    expect(await reserved(page, 'SPD*1.0*0;function SPD(){};alert(document.domain)')).toBeNull();
  });

  test('when the visitor taps Otevřít v aplikaci banky, then the phone opens platba.spayd from the worker with the payment of the chosen amount, its address names no payment and nothing reaches the server', async ({
    page,
    context,
  }) => {
    const reachedNetwork: string[] = [];
    await context.route('**/platba.spayd*', (route) => {
      reachedNetwork.push(route.request().url());
      return route.abort();
    });
    await page.goto('/#prispet');
    await page.getByRole('button', { name: '1 000 Kč' }).click();

    const opened = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Otevřít v aplikaci banky' }).click();

    const file = await opened;
    expect(file.suggestedFilename()).toBe('platba.spayd');
    const address = new URL(file.url());
    expect(address.pathname).toBe('/platba.spayd');
    expect([...address.searchParams.keys()]).toEqual(['id']);
    const chunks: Buffer[] = [];
    for await (const chunk of await file.createReadStream()) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).toString('utf8')).toBe(PAYMENT_OF_1000);
    await expect(
      page.locator('#prispet .bank-app').getByRole('status').filter({ hasText: /\S/ }),
    ).toContainText('Neotevřela se vám banka?');
    expect(reachedNetwork).toEqual([]);
  });
});
