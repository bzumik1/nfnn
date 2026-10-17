import { expect, test } from '@playwright/test';

test.describe('Given a visitor on the home page', () => {
  test('when they send a contact message, then the site posts it to the API and thanks them', async ({ page }) => {
    const posted: unknown[] = [];
    await page.route('**/api/contact/messages', async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({ status: 202 });
    });

    await page.goto('/');
    await page.locator('#contact-name').fill('Jana Nováková');
    await page.locator('#contact-email').fill('jana@example.cz');
    await page.locator('#contact-message').fill('Mám dotaz k projektu.');
    await page.getByRole('button', { name: 'Odeslat zprávu' }).click();

    await expect(page.getByText('Zpráva odeslána!')).toBeVisible();
    expect(posted).toEqual([
      { fullName: 'Jana Nováková', email: 'jana@example.cz', message: 'Mám dotaz k projektu.', website: '' },
    ]);
  });

  test('when the API refuses the message, then the form stays with an explanation', async ({ page }) => {
    await page.route('**/api/contact/messages', (route) =>
      route.fulfill({ status: 429, contentType: 'application/problem+json', body: '{}' }),
    );

    await page.goto('/');
    await page.locator('#contact-name').fill('Jana Nováková');
    await page.locator('#contact-email').fill('jana@example.cz');
    await page.locator('#contact-message').fill('Ještě jedna.');
    await page.getByRole('button', { name: 'Odeslat zprávu' }).click();

    await expect(page.getByRole('alert')).toContainText('příliš mnoho zpráv');
    await expect(page.locator('#contact-message')).toHaveValue('Ještě jedna.');
  });
});
