import { paymentSpayd } from '../qr-matrices';
import { expect, pwaTest as test } from './pwa-fixtures';

const PAYMENT = paymentSpayd('500 Kč without a variable symbol');
const REFUSED_BY_WORKER =
  /^console error: Failed to load resource: the server responded with a status of 400 \(\) \(http:\/\/localhost:\d+\/platba\.spayd\?data=%3Chtml%3E/;

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Given the app registered its own service worker on a phone that cannot share the payment file', () => {
  test.beforeEach(async ({ page, context, swReady }) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
    });
    await page.goto('/');
    await swReady();
  });

  test('when the page asks for the payment route, then the worker answers it on the device and nothing reaches the server', async ({
    page,
    context,
  }) => {
    const reachedNetwork: string[] = [];
    await context.route('**/platba.spayd*', (route) => {
      reachedNetwork.push(route.request().url());
      return route.abort();
    });

    const answers = await page.evaluate(async (payment) => {
      const probe = await fetch('/platba.spayd', { method: 'HEAD' });
      const file = await fetch(`/platba.spayd?${new URLSearchParams({ data: payment })}`);
      return {
        probe: { status: probe.status, type: probe.headers.get('content-type') },
        file: {
          status: file.status,
          type: file.headers.get('content-type'),
          disposition: file.headers.get('content-disposition'),
          cache: file.headers.get('cache-control'),
          policy: file.headers.get('content-security-policy'),
          body: await file.text(),
        },
      };
    }, PAYMENT);

    expect(answers).toEqual({
      probe: { status: 200, type: 'application/x-shortpaymentdescriptor; charset=utf-8' },
      file: {
        status: 200,
        type: 'application/x-shortpaymentdescriptor; charset=utf-8',
        disposition: 'inline; filename="platba.spayd"',
        cache: 'no-store',
        policy: "default-src 'none'; sandbox allow-downloads",
        body: PAYMENT,
      },
    });
    expect(reachedNetwork).toEqual([]);
  });

  test('when the page asks for a payment file of a text that is no payment, then the worker refuses it with 400', async ({
    page,
    browserProblems,
  }) => {
    browserProblems.expectOne(REFUSED_BY_WORKER);

    const refused = await page.evaluate(async () => {
      const answer = await fetch(
        `/platba.spayd?${new URLSearchParams({ data: '<html><script>alert(1)</script>' })}`,
      );
      return { status: answer.status, type: answer.headers.get('content-type') };
    });

    expect(refused).toEqual({ status: 400, type: 'text/plain; charset=utf-8' });
  });

  test('when the visitor taps Otevřít v aplikaci banky, then the phone opens platba.spayd from the worker with the payment of the chosen amount and nothing reaches the server', async ({
    page,
    context,
  }) => {
    const reachedNetwork: string[] = [];
    await context.route('**/platba.spayd*', (route) => {
      reachedNetwork.push(route.request().url());
      return route.abort();
    });
    await page.goto('/#prispet');

    const opened = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Otevřít v aplikaci banky' }).click();

    const file = await opened;
    expect(file.suggestedFilename()).toBe('platba.spayd');
    expect(new URL(file.url()).pathname).toBe('/platba.spayd');
    const chunks: Buffer[] = [];
    for await (const chunk of await file.createReadStream()) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).toString('utf8')).toBe(PAYMENT);
    await expect(
      page.locator('#prispet').getByRole('status').filter({ hasText: /\S/ }),
    ).toContainText('Neotevřela se vám banka?');
    expect(reachedNetwork).toEqual([]);
  });
});
