import { expect, test } from './fixtures';
import { mockDonorApi, signIn } from './donor-session';

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

    await expect(page.getByRole('status').filter({ hasText: 'Zpráva odeslána!' })).toContainText(
      'Odpovíme vám e-mailem na jana@example.cz.',
    );
    await expect(page.getByRole('heading', { name: 'Zpráva odeslána!' })).toBeFocused();
    expect(posted).toEqual([
      {
        fullName: 'Jana Nováková',
        email: 'jana@example.cz',
        message: 'Mám dotaz k projektu.',
        website: '',
      },
    ]);
  });

  test('when the API refuses the e-mail address, then the e-mail field says so and takes the focus', async ({
    page,
  }) => {
    await page.route('**/api/contact/messages', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'https://nfnn.cz/problems/validation',
          title: 'Neplatný požadavek',
          status: 400,
          errors: [{ field: 'email', message: 'musí odpovídat tvaru e-mailové adresy' }],
        }),
      }),
    );

    await page.goto('/');
    await page.locator('#contact-name').fill('Jana Nováková');
    await page.locator('#contact-email').fill('jana@example.c');
    await page.locator('#contact-message').fill('Dobrý den.');
    await page.getByRole('button', { name: 'Odeslat zprávu' }).click();

    await expect(page.locator('#contact-email-error')).toHaveText(
      'Zadejte e-mail ve tvaru jan@example.com.',
    );
    await expect(page.locator('#contact-email')).toBeFocused();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
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

    const alert = page.getByRole('alert').filter({ hasText: /\S/ });
    await expect(alert).toContainText('příliš mnoho zpráv');
    await expect(alert.getByRole('link', { name: 'info@nfnn.cz' })).toHaveAttribute(
      'href',
      'mailto:info@nfnn.cz',
    );
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
      'Odpovíme vám na zadaný e-mail. Zadejte e-mail ve tvaru jan@example.com.',
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
      await expect(
        page.locator('#kontakt').getByRole('link', { name: 'info@nfnn.cz' }),
      ).toHaveAttribute('href', 'mailto:info@nfnn.cz');
      await expect(page.getByText('Jiráskova 436, 473 01 Nový Bor')).toBeVisible();
    });
  });
});

test.describe('Given a signed-in donor who goes back to the home page', () => {
  test('when they reach the contact form, then their name and e-mail are filled in and can be changed', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await signIn(page);

    await page.getByRole('link', { name: 'Hlavní stránka' }).click();
    await page.locator('#kontakt').scrollIntoViewIfNeeded();

    await expect(page.locator('#contact-name')).toHaveValue('Jana Nováková');
    await expect(page.locator('#contact-email')).toHaveValue('jana@example.cz');
    await page.locator('#contact-email').fill('jana.jinak@example.cz');
    await expect(page.locator('#contact-email')).toHaveValue('jana.jinak@example.cz');
  });
});

test.describe('Given an accountant on the home page', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('when they copy the IČO and the IBAN from Údaje pro účetní, then the clipboard holds each as typed into accounting', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.goto('/');
    const details = page.locator('#kontakt').getByRole('definition');
    await expect(page.locator('#kontakt')).toContainText('CZ26 2010 0000 0055 4433 2217');

    await details.filter({ hasText: '27278794' }).getByRole('button').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('27278794');
    await details.filter({ hasText: 'CZ26 2010' }).getByRole('button').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'CZ2620100000005544332217',
    );
  });
});
