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

  test('when a link stands inside a sentence, then its size does not count', async ({ page }) => {
    expect(
      await failingChecks(
        page,
        '<p style="font-size: 12px">Read <a href="#a">this</a> and <a href="#b">that</a> now.</p>',
      ),
    ).toEqual([]);
  });

  test('when a box hides text that does not fit, then the text is cut off', async ({ page }) => {
    expect(
      await failingChecks(
        page,
        '<p style="width: 80px; overflow: hidden; white-space: nowrap">A sentence far too long for it</p>',
      ),
    ).toEqual(['no text cut off by its box']);
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
