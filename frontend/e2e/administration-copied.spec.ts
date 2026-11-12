import { mockAdministration, rememberedSession } from './baseline/screen-mocks';
import { mockDonorApi, whenAdministrationCopied } from './donor-session';
import { ADMINISTRATION_LOCKED, expect, test } from './fixtures';

test.describe("Given an administrator's remembered session that finds the administration locked", () => {
  test('when a test waits for the copy right after opening a page and acts on nothing, then the administration still unlocks and the copy downloads', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await mockAdministration(page);
    await rememberedSession(page);
    const copied = whenAdministrationCopied(page);

    await page.goto('/sprava');
    await copied();

    await expect(page.getByRole('heading', { level: 1, name: ADMINISTRATION_LOCKED })).toHaveCount(
      0,
    );
  });
});
