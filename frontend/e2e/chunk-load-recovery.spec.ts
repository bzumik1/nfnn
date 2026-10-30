import {
  article,
  donorWithDonations,
  mockAdministration,
  rememberedSession,
} from './baseline/screen-mocks';
import { mockDonorApi } from './donor-session';
import { expect, test } from './fixtures';
import {
  chunkLoadMessage,
  chunkLoadNotice,
  chunkLoadPageHeading,
  LostChunks,
  openHomeThenLoseNewChunks,
  openPolicyFromFooter,
  policyHeading,
  policyPath,
  withoutSessionStorage,
} from './lost-chunks';

test.describe('Given a visitor whose open tab is older than the deployed version', () => {
  test('when they open a page whose chunk is gone, then the app loads it from the server once and shows it', async ({
    page,
  }) => {
    const chunks = await openHomeThenLoseNewChunks(page);
    chunks.bringBackAtDocument(1);

    await openPolicyFromFooter(page);

    await expect(page.getByRole('heading', policyHeading)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${policyPath}$`));
    await expect(chunkLoadNotice(page)).toHaveCount(0);
    expect(chunks.documents).toEqual([policyPath]);
  });

  test('when the page is still missing after that load, then a page of its own offers to load it again or to go home', async ({
    page,
  }) => {
    const chunks = await openHomeThenLoseNewChunks(page);

    await openPolicyFromFooter(page);

    const heading = page.getByRole('main').getByRole('heading', chunkLoadPageHeading);
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(page.getByRole('link', { name: 'Přejít na úvod' })).toHaveAttribute('href', '/');
    expect(chunks.documents).toEqual([policyPath]);

    chunks.bringBack();
    await page.getByRole('button', { name: 'Načíst znovu' }).click();

    await expect(page.getByRole('heading', policyHeading)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${policyPath}$`));
    expect(chunks.documents).toEqual([policyPath, policyPath]);
  });

  test('when they open an address with a fragment whose page is gone, then the app loads that address from the server', async ({
    page,
  }) => {
    const chunks = await LostChunks.watch(page);
    await chunks.open(policyPath);
    chunks.loseEveryChunkNotLoadedYet();
    chunks.bringBackAtDocument(2);

    await page.goto('/#prispet');

    await expect(
      page.getByRole('heading', { level: 2, name: 'Přispějte na pomůcky pro děti' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/#prispet$/);
    expect(chunks.documents).toEqual(['/', '/']);
  });
});

test.describe('Given a visitor whose browser keeps no session storage', () => {
  test.beforeEach(async ({ page }) => {
    await withoutSessionStorage(page);
  });

  test('when they open a page whose chunk is gone, then the app never reloads by itself and offers a reload that takes the focus', async ({
    page,
  }) => {
    const chunks = await openHomeThenLoseNewChunks(page);

    await openPolicyFromFooter(page);

    await expect(chunkLoadNotice(page)).toBeVisible();
    await expect(chunkLoadNotice(page).getByRole('button', { name: 'Načíst znovu' })).toBeFocused();
    await expect(
      chunkLoadNotice(page).getByRole('button', { name: 'Načíst znovu' }),
    ).toHaveAccessibleDescription(chunkLoadMessage);
    expect(chunks.documents).toEqual([]);

    chunks.bringBack();
    await chunkLoadNotice(page).getByRole('button', { name: 'Načíst znovu' }).click();

    await expect(page.getByRole('heading', policyHeading)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${policyPath}$`));
    expect(chunks.documents).toEqual([policyPath]);
  });

  test('when the first page they open has an address with a fragment and its chunk is gone, then the reload loads that address', async ({
    page,
  }) => {
    const chunks = await LostChunks.watch(page);
    await chunks.open(policyPath);
    chunks.loseEveryChunkNotLoadedYet();

    await page.goto('/#prispet');
    await expect(page.getByRole('heading', chunkLoadPageHeading)).toBeVisible();
    expect(chunks.documents).toEqual(['/']);

    chunks.bringBack();
    await page.getByRole('button', { name: 'Načíst znovu' }).click();

    await expect(
      page.getByRole('heading', { level: 2, name: 'Přispějte na pomůcky pro děti' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/#prispet$/);
    expect(chunks.documents).toEqual(['/', '/']);
  });
});

test.describe('Given a visitor with the sign-in dialog open and no session storage', () => {
  test.beforeEach(async ({ page }) => {
    await withoutSessionStorage(page);
  });

  test('when a page they opened before the dialog cannot be loaded, then the dialog announces the message in its own status region, since the focus stays in the dialog', async ({
    page,
  }) => {
    const chunks = await openHomeThenLoseNewChunks(page);
    const release = chunks.hold();

    await openPolicyFromFooter(page);
    await page.locator('.nav-login').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    release();

    await expect(chunkLoadNotice(page)).toBeVisible();
    await expect(
      chunkLoadNotice(page).getByRole('button', { name: 'Načíst znovu' }),
    ).not.toBeFocused();
    await expect(dialog.getByRole('status').filter({ hasText: chunkLoadMessage })).toHaveText(
      chunkLoadMessage,
    );
    expect(chunks.documents).toEqual([]);
  });
});

test.describe('Given a visitor who lost the connection', () => {
  test('when they open a page that was not loaded yet, then the app does not reload into an error page and offers a reload', async ({
    page,
    context,
  }) => {
    const chunks = await openHomeThenLoseNewChunks(page);
    chunks.bringBack();
    await context.setOffline(true);

    await openPolicyFromFooter(page);

    await expect(chunkLoadNotice(page)).toBeVisible();
    expect(chunks.documents).toEqual([]);

    await context.setOffline(false);
    await chunkLoadNotice(page).getByRole('button', { name: 'Načíst znovu' }).click();

    await expect(page.getByRole('heading', policyHeading)).toBeVisible();
    expect(chunks.documents).toEqual([policyPath]);
  });
});

test.describe('Given a visitor whose connection fails while the browser still says it is online', () => {
  test('when they open a page whose chunk cannot be fetched, then the app does not reload into an error page of the browser and offers a reload', async ({
    page,
  }) => {
    const chunks = await LostChunks.watch(page);
    await chunks.open('/');
    chunks.cutOffEveryChunkNotLoadedYet();

    await openPolicyFromFooter(page);

    await expect(chunkLoadNotice(page)).toBeVisible();
    await expect(chunkLoadNotice(page).getByRole('button', { name: 'Načíst znovu' })).toBeFocused();
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
    expect(chunks.documents).toEqual([]);

    chunks.bringBack();
    await chunkLoadNotice(page).getByRole('button', { name: 'Načíst znovu' }).click();

    await expect(page.getByRole('heading', policyHeading)).toBeVisible();
    expect(chunks.documents).toEqual([policyPath]);
  });
});

test.describe('Given an administrator with unsaved changes in the news editor', () => {
  test('when they leave for a page whose chunk is gone, then only the page asks them and the new page loads from the server', async ({
    page,
  }) => {
    const browserQuestions: string[] = [];
    page.on('dialog', (dialog) => {
      browserQuestions.push(dialog.type());
      void dialog.accept();
    });
    await mockDonorApi(page, donorWithDonations);
    await mockAdministration(page);
    const chunks = await LostChunks.watch(page);
    await rememberedSession(page);
    await page.goto(`/sprava/aktuality/${article.id}`);
    await expect(page.getByLabel('Titulek')).toHaveValue(article.title);
    chunks.loseEveryChunkNotLoadedYet();
    chunks.bringBackAtDocument(1);

    await page.getByLabel('Titulek').fill('Zahrada pro děti a rodiče');
    await page.getByRole('link', { name: '← Aktuality' }).click();
    await page
      .getByRole('dialog', { name: 'Máte neuložené změny' })
      .getByRole('button', { name: 'Odejít bez uložení' })
      .click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Aktuality', exact: true }),
    ).toBeVisible();
    expect(chunks.documents).toEqual(['/sprava/aktuality']);
    expect(browserQuestions).toEqual([]);
  });
});
