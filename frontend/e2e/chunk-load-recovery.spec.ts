import { expect, test } from './fixtures';
import { chunkLoadNotice, openHomeThenLoseNewChunks, openPolicyFromFooter } from './lost-chunks';

const policyPath = '/zasady-ochrany-osobnich-udaju';
const policyHeading = { level: 1, name: 'Zásady ochrany osobních údajů' } as const;

test.describe('Given a visitor whose open tab is older than the deployed version', () => {
  test('when the next page has lost its chunk, then the app loads that page from the server once and then offers a reload', async ({
    page,
  }) => {
    const chunks = await openHomeThenLoseNewChunks(page);

    await openPolicyFromFooter(page);

    await expect(chunkLoadNotice(page)).toBeVisible();
    expect(chunks.documents()).toEqual(['/', policyPath]);

    await chunks.restore();
    await chunkLoadNotice(page).getByRole('button', { name: 'Načíst znovu' }).click();

    await expect(page).toHaveURL(new RegExp(`${policyPath}$`));
    await expect(page.getByRole('heading', policyHeading)).toBeVisible();
    await expect(chunkLoadNotice(page)).toHaveCount(0);
    expect(chunks.documents()).toEqual(['/', policyPath, policyPath]);
  });
});

test.describe('Given a visitor whose browser keeps no session storage', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    });
  });

  test('when the next page has lost its chunk, then the app never reloads by itself and offers a reload', async ({
    page,
  }) => {
    const chunks = await openHomeThenLoseNewChunks(page);

    await openPolicyFromFooter(page);

    await expect(chunkLoadNotice(page)).toBeVisible();
    expect(chunks.documents()).toEqual(['/']);

    await chunks.restore();
    await chunkLoadNotice(page).getByRole('button', { name: 'Načíst znovu' }).click();

    await expect(page).toHaveURL(new RegExp(`${policyPath}$`));
    await expect(page.getByRole('heading', policyHeading)).toBeVisible();
    expect(chunks.documents()).toEqual(['/', policyPath]);
  });
});
