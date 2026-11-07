import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { layoutChecks } from './layout-checks';

const VIEWPORT = { width: 400, height: 600 };

async function failingChecks(page: Page, body: string, pageErrors: string[] = []) {
  await page.setViewportSize(VIEWPORT);
  await page.setContent(
    `<!doctype html><html><head><style>body { margin: 0; font: 16px sans-serif; } button { width: 120px; height: 40px; }</style></head><body>${body}</body></html>`,
  );
  return (await layoutChecks(page, pageErrors))
    .filter((check) => !check.pass)
    .map((check) => check.name);
}

test.describe('Given a page checked as on a phone', () => {
  test('when nothing is wrong, then every check passes', async ({ page }) => {
    expect(await failingChecks(page, '<main><h1>Title</h1><button>One</button></main>')).toEqual(
      [],
    );
  });

  test('when the page threw, then the script check fails', async ({ page }) => {
    expect(await failingChecks(page, '<button>One</button>', ['boom'])).toEqual([
      'no script error',
    ]);
  });

  test('when a box is wider than the screen, then the page scrolls sideways', async ({ page }) => {
    expect(await failingChecks(page, '<div style="width: 460px; height: 10px"></div>')).toEqual([
      'no sideways scroll of the page',
    ]);
  });

  test('when a box scrolls inside its own scroller, then the page does not count as wide', async ({
    page,
  }) => {
    expect(
      await failingChecks(
        page,
        '<div style="overflow-x: auto"><div style="width: 900px; height: 10px"></div></div>',
      ),
    ).toEqual([]);
  });

  test('when a fixed bar puts a button past the right edge, then the button is cut off', async ({
    page,
  }) => {
    expect(
      await failingChecks(
        page,
        '<div style="position: fixed; top: 0; left: 300px"><button>Cut</button></div>',
      ),
    ).toEqual(['no control cut off by the screen edge']);
  });

  test('when two buttons lie on top of each other, then they count as stacked and one covered', async ({
    page,
  }) => {
    expect(
      await failingChecks(
        page,
        '<button style="position: absolute; top: 0; left: 0">A</button><button style="position: absolute; top: 10px; left: 20px">B</button>',
      ),
    ).toEqual(['no controls stacked on each other', 'no control covered by another element']);
  });

  test('when a button sits inside a text field, then they do not count as stacked', async ({
    page,
  }) => {
    expect(
      await failingChecks(
        page,
        '<div style="position: relative; width: 300px"><input style="width: 300px; height: 48px; box-sizing: border-box"><button style="position: absolute; right: 4px; top: 4px; width: 40px">Show</button></div>',
      ),
    ).toEqual([]);
  });

  test('when an element lies over a button, then the button is covered', async ({ page }) => {
    expect(
      await failingChecks(
        page,
        '<button>Hidden</button><div style="position: absolute; top: 0; left: 0; width: 200px; height: 60px; background: white"></div>',
      ),
    ).toEqual(['no control covered by another element']);
  });

  test('when the focused field lies under a fixed bar, then the focus check fails too', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await page.setContent(
      '<!doctype html><html><body style="margin: 0"><div style="position: fixed; top: 0; left: 0; right: 0; height: 80px; background: white"></div><input id="field" style="margin-top: 20px; width: 200px; height: 40px"></body></html>',
    );
    await page.locator('#field').focus();

    const failing = (await layoutChecks(page, [])).filter((check) => !check.pass);

    expect(failing.map((check) => check.name)).toEqual([
      'no control covered by another element',
      'the focused control is not under a fixed bar',
    ]);
  });

  test('when the focus rests on the main region behind a fixed bar, as Safari on a Mac leaves it after a pressed button, then the focus check passes', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await page.setContent(
      '<!doctype html><html><body style="margin: 0"><main id="content" tabindex="-1" style="display: block; height: 1200px; outline: none"><h1>Title</h1></main><div style="position: fixed; bottom: 0; left: 0; right: 0; height: 400px; background: white"><a href="#content">Tab</a></div></body></html>',
    );
    await page.locator('#content').focus();

    const failing = (await layoutChecks(page, [])).filter((check) => !check.pass);

    expect(failing.map((check) => check.name)).toEqual([]);
  });

  test('when the page has scrolled a button under a fixed bar at the top, then the button does not count as covered', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await page.setContent(
      '<!doctype html><html><body style="margin: 0"><div style="position: fixed; top: 0; left: 0; right: 0; height: 80px; background: white"></div><div style="height: 300px"></div><button style="width: 120px; height: 40px">Under</button><div style="height: 1200px"></div></body></html>',
    );
    await page.evaluate(() => window.scrollTo({ top: 280, behavior: 'instant' }));

    const failing = (await layoutChecks(page, [])).filter((check) => !check.pass);

    expect(failing.map((check) => check.name)).toEqual([]);
  });

  test('when a button further down lies under a fixed bar at the bottom while the page still scrolls, then the button does not count as covered', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await page.setContent(
      '<!doctype html><html><body style="margin: 0"><div style="height: 540px"></div><button style="width: 120px; height: 40px">Below</button><div style="height: 600px"></div><nav style="position: fixed; bottom: 0; left: 20px; right: 20px; height: 80px; background: white"></nav></body></html>',
    );

    const failing = (await layoutChecks(page, [])).filter((check) => !check.pass);

    expect(failing.map((check) => check.name)).toEqual([]);
  });

  test('when the page has reached its end and a button still lies under the fixed bar at the bottom, then the button is covered', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await page.setContent(
      '<!doctype html><html><body style="margin: 0"><div style="height: 1100px"></div><button style="width: 120px; height: 40px">Last</button><nav style="position: fixed; bottom: 0; left: 20px; right: 20px; height: 80px; background: white"></nav></body></html>',
    );
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
    );

    const failing = (await layoutChecks(page, [])).filter((check) => !check.pass);

    expect(failing.map((check) => check.name)).toEqual(['no control covered by another element']);
  });

  test('when small targets stand close together, then they are too small', async ({ page }) => {
    expect(
      await failingChecks(
        page,
        '<div style="display: flex; gap: 2px"><button style="width: 16px; height: 16px">a</button><button style="width: 16px; height: 16px">b</button></div>',
      ),
    ).toEqual(['every target at least 24 px']);
  });

  test('when a small target has room around it, then the spacing exception lets it pass', async ({
    page,
  }) => {
    expect(
      await failingChecks(
        page,
        '<div style="display: flex; gap: 40px"><button style="width: 16px; height: 16px">a</button><button style="width: 16px; height: 16px">b</button></div>',
      ),
    ).toEqual([]);
  });

  test('when a small target scrolls past a control of a fixed bar, then the spacing exception still lets it pass', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await page.setContent(
      '<!doctype html><html><body style="margin: 0"><div style="height: 540px"></div><button style="display: block; margin-left: 20px; width: 80px; height: 16px">Small</button><div style="height: 600px"></div><nav style="position: fixed; bottom: 0; left: 0; right: 0; height: 52px; background: white"><a href="#" style="display: block; width: 120px; height: 44px">Tab</a></nav></body></html>',
    );

    const failing = (await layoutChecks(page, [])).filter((check) => !check.pass);

    expect(failing.map((check) => check.name)).toEqual([]);
  });

  test('when a link stands inside a sentence, then its size does not count', async ({ page }) => {
    expect(
      await failingChecks(
        page,
        '<p style="font-size: 12px">Read <a href="#a">this</a> and <a href="#b">that</a> now.</p>',
      ),
    ).toEqual([]);
  });

  test('when a card that hides its overflow is narrower than its table, then the button at the end is cut off', async ({
    page,
  }) => {
    expect(
      await failingChecks(
        page,
        '<section style="width: 300px; overflow: hidden"><table style="width: 360px"><tr><td style="width: 240px">Row</td><td><button>Pair</button></td></tr></table></section>',
      ),
    ).toEqual(['no control cut off by a box that hides its overflow']);
  });

  test('when the table scrolls inside its own scroller, then its button is not cut off', async ({
    page,
  }) => {
    expect(
      await failingChecks(
        page,
        '<section style="width: 300px; overflow: hidden"><div style="overflow-x: auto"><table style="width: 360px"><tr><td style="width: 240px">Row</td><td><button>Pair</button></td></tr></table></div></section>',
      ),
    ).toEqual([]);
  });

  test('when a button stands absolutely beyond a box that hides its overflow but is not its containing block, then it is not cut off', async ({
    page,
  }) => {
    expect(
      await failingChecks(
        page,
        '<div style="position: relative; width: 300px; height: 80px"><div style="overflow: hidden; width: 200px; height: 80px"><button style="position: absolute; top: 0; right: 0">Close</button></div></div>',
      ),
    ).toEqual([]);
  });

  test('when a field is moved far off the screen out of a box that hides its overflow, then it is not counted as cut off', async ({
    page,
  }) => {
    expect(
      await failingChecks(
        page,
        '<form><div style="position: absolute; left: -10000px; width: 1px; overflow: hidden"><input aria-hidden="true" tabindex="-1"></div><button>Send</button></form>',
      ),
    ).toEqual([]);
  });

  test('when a button stands wholly beyond the edge of a box that hides its overflow, then it is cut off', async ({
    page,
  }) => {
    expect(
      await failingChecks(
        page,
        '<section style="width: 200px; overflow: hidden"><div style="width: 340px; display: flex; justify-content: flex-end"><button>Pair</button></div></section>',
      ),
    ).toEqual(['no control cut off by a box that hides its overflow']);
  });

  test('when a button lies beyond both its card that hides its overflow and the screen edge, then it is cut off', async ({
    page,
  }) => {
    expect(
      await failingChecks(
        page,
        '<section style="width: 300px; overflow: hidden"><table style="width: 900px"><tr><td style="width: 800px">Row</td><td><button>Pair</button></td></tr></table></section>',
      ),
    ).toEqual(['no control cut off by a box that hides its overflow']);
  });

  test('when a control sits in a visually hidden box of one pixel on the screen, then it is not counted as cut off', async ({
    page,
  }) => {
    expect(
      await failingChecks(
        page,
        '<form><div style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%)"><input aria-hidden="true" tabindex="-1"></div><button>Send</button></form>',
      ),
    ).not.toContain('no control cut off by a box that hides its overflow');
  });

  test('when a box hides text that does not fit, then the text is cut off', async ({ page }) => {
    expect(
      await failingChecks(
        page,
        '<p style="width: 80px; overflow: hidden; white-space: nowrap">A sentence far too long for it</p>',
      ),
    ).toEqual(['no text cut off by its box']);
  });

  test('when a QR code sits in the middle of its frame, then the centring check passes', async ({
    page,
  }) => {
    expect(
      await failingChecks(
        page,
        '<div style="width: 200px; padding: 10px; background: #123"><app-qr-code><svg role="img" style="display: block; width: 200px; height: 200px"></svg></app-qr-code></div>',
      ),
    ).toEqual([]);
  });

  test('when a QR code leans to one side of its frame, then it is off centre', async ({ page }) => {
    expect(
      await failingChecks(
        page,
        '<div style="width: 280px; padding: 10px; background: #123"><app-qr-code><svg role="img" style="display: block; width: 200px; height: 200px"></svg></app-qr-code></div>',
      ),
    ).toEqual(['every QR code in the middle of its frame']);
  });

  test('when a QR code stands on a bare page with no frame, then the centring check passes', async ({
    page,
  }) => {
    expect(
      await failingChecks(
        page,
        '<app-qr-code><svg role="img" style="display: block; width: 200px; height: 200px"></svg></app-qr-code>',
      ),
    ).toEqual([]);
  });

  test('when a modal dialog is open, then only its controls are checked', async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.setContent(
      '<!doctype html><html><body style="margin: 0"><button style="position: absolute; top: 0; left: 0; width: 120px; height: 40px">A</button><button style="position: absolute; top: 0; left: 10px; width: 120px; height: 40px">B</button><dialog><button style="width: 120px; height: 40px">Close</button></dialog></body></html>',
    );
    await page.locator('dialog').evaluate((dialog: HTMLDialogElement) => dialog.showModal());

    const failing = (await layoutChecks(page, [])).filter((check) => !check.pass);

    expect(failing.map((check) => check.name)).toEqual([]);
  });
});
