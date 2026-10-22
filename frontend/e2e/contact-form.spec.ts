import { expect, test } from '@playwright/test';

test.describe('Given a visitor on the home page', () => {
  test('when they send a contact message, then the site posts it to the API and thanks them', async ({
    page,
  }) => {
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
      {
        fullName: 'Jana Nováková',
        email: 'jana@example.cz',
        message: 'Mám dotaz k projektu.',
        website: '',
      },
    ]);
  });

  test('when the API refuses the message, then the form stays with an explanation', async ({
    page,
  }) => {
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

  test('when they send the form empty, then each field says what is missing and the first one takes the focus', async ({
    page,
  }) => {
    const posted: unknown[] = [];
    await page.route('**/api/contact/messages', async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({ status: 202 });
    });

    await page.goto('/');
    await page.locator('#contact-email').fill('jana@');
    await page.getByRole('button', { name: 'Odeslat zprávu' }).click();

    await expect(page.locator('#contact-name')).toBeFocused();
    await expect(page.locator('#contact-name')).toHaveAccessibleDescription(
      'Napište nám prosím své jméno.',
    );
    await expect(page.locator('#contact-email')).toHaveAccessibleDescription(
      'Zadejte e-mail ve tvaru jan@example.com.',
    );
    await expect(page.locator('#contact-message')).toHaveAttribute('aria-invalid', 'true');
    expect(posted).toEqual([]);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('when they reach the contact section, then the heading, the e-mail address and the address are there to read', async ({
      page,
    }) => {
      await page.goto('/');

      await expect(page.getByRole('heading', { name: 'Kontaktujte nás' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'info@nfnn.cz' })).toHaveAttribute(
        'href',
        'mailto:info@nfnn.cz',
      );
      await expect(page.getByText('Jiráskova 436, 473 01 Nový Bor')).toBeVisible();
    });
  });
});
