import { expect, test } from './fixtures';
import {
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
