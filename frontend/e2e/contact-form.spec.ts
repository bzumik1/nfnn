import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mockDonorApi, openSection, signIn } from './donor-session';

test.describe('Given a visitor on the About page', () => {
  test('when they send a contact message, then the site posts it to the API and thanks them', async ({
    page,
  }) => {
    const posted: unknown[] = [];
    await page.route('**/api/contact/messages', async (route) => {
      posted.push(route.request().postDataJSON());
      await route.fulfill({ status: 202 });
    });

    await page.goto('/o-nas');
    await page.locator('#contact-name').fill('Jana Nováková');
    await page.locator('#contact-email').fill('jana@example.cz');
    await page.locator('#contact-message').fill('Mám dotaz k projektu.');
    await page.getByRole('button', { name: 'Odeslat zprávu' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Zpráva je odeslaná' })).toContainText(
      'Odpovíme vám e\u2011mailem na jana@example.cz.',
    );
    await expect(page.getByRole('heading', { name: 'Zpráva je odeslaná' })).toBeFocused();
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

    await page.goto('/o-nas');
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

    await page.goto('/o-nas');
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

    await page.goto('/o-nas');
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

  test('when they tab through the contact section on a computer, then the details for accountants in the left column come before the first form field', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/o-nas');
    await expect(
      page
        .locator('#kontakt')
        .getByRole('button', { name: /Kopírovat/ })
        .first(),
    ).toBeVisible();

    expect(await tabOrderFromContactEmail(page)).toEqual(['copy', 'form']);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('when they tab through the contact section, then the form comes before the details for accountants, as it does on the screen', async ({
      page,
    }) => {
      await page.goto('/o-nas');
      await expect(page.locator('#contact-name')).toBeAttached();

      expect(await tabOrderFromContactEmail(page)).toEqual(['form', 'copy']);
    });

    test('when they read the form, then the privacy line shows once, under the button, and the grey note under the details comes back after sending', async ({
      page,
    }) => {
      await page.route('**/api/contact/messages', (route) => route.fulfill({ status: 202 }));
      await page.goto('/o-nas');
      const note = page.locator('.contact-legal');
      await expect(page.locator('.form-privacy')).toBeVisible();
      await expect(note).toBeHidden();

      await page.locator('#contact-name').fill('Jana Nováková');
      await page.locator('#contact-email').fill('jana@example.cz');
      await page.locator('#contact-message').fill('Mám dotaz k projektu.');
      await page.getByRole('button', { name: 'Odeslat zprávu' }).click();

      await expect(page.getByRole('heading', { name: 'Zpráva je odeslaná' })).toBeFocused();
      await expect(note).toBeVisible();
    });

    test('when they reach the contact section, then the heading, the e-mail address and the address are there to read', async ({
      page,
    }) => {
      await page.goto('/o-nas');

      await expect(page.getByRole('heading', { name: 'Napište nám' })).toBeVisible();
      await expect(
        page.locator('#kontakt').getByRole('link', { name: 'info@nfnn.cz' }),
      ).toHaveAttribute('href', 'mailto:info@nfnn.cz');
      await expect(page.getByText('Jiráskova 436, 473 01 Nový Bor')).toBeVisible();
    });
  });
});

test.describe('Given a signed-in donor who goes back to the About page', () => {
  test('when they reach the contact form, then their name and e-mail are filled in and can be changed', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await signIn(page);

    await page
      .getByRole('banner')
      .getByRole('link', { name: 'Nová naděje – nadační fond' })
      .click();
    await openSection(page, 'O nás');
    await page.locator('#kontakt').scrollIntoViewIfNeeded();

    await expect(page.locator('#contact-name')).toHaveValue('Jana Nováková');
    await expect(page.locator('#contact-email')).toHaveValue('jana@example.cz');
    await page.locator('#contact-email').fill('jana.jinak@example.cz');
    await expect(page.locator('#contact-email')).toHaveValue('jana.jinak@example.cz');
  });
});

test.describe('Given an accountant on the About page', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('when they copy the IČO and the IBAN from Údaje pro účetní, then the clipboard holds each as typed into accounting', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.goto('/o-nas');
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

test.describe('Given an accountant on a phone 390 px wide', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('when they read Údaje pro účetní on O nás, then every value starts the same distance under its label, with or without a copy button', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.goto('/o-nas');
    const card = page.locator('app-accounting-details .accounting');
    await expect(card).toContainText('CZ26 2010 0000 0055 4433 2217');

    const distances = await card.locator('.accounting-item').evaluateAll((items) =>
      items.map((item) => {
        const label = item.querySelector('dt')!.getBoundingClientRect();
        const value = item.querySelector('dd > :first-child')!.getBoundingClientRect();
        return { label: item.querySelector('dt')!.textContent!.trim(), gap: value.top - label.top };
      }),
    );
    const gaps = distances.map(({ gap }) => gap);

    expect(Math.max(...gaps) - Math.min(...gaps), JSON.stringify(distances)).toBeLessThanOrEqual(1);
  });
});

test.describe('Given an accountant on a computer 1280 px wide', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('when they read Údaje pro účetní on O nás, then every one-line row takes the same height, with or without a copy button, and a wrapped value keeps its own line spacing', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await page.goto('/o-nas');
    const card = page.locator('app-accounting-details .accounting');
    await expect(card).toContainText('CZ26 2010 0000 0055 4433 2217');

    const rows = await card.locator('.accounting-item').evaluateAll((items) =>
      items.map((item) => {
        const value = item.querySelector('dd > :first-child')!;
        const text = document.createRange();
        text.selectNodeContents(value);
        const lines = [
          ...new Set(Array.from(text.getClientRects(), (box) => Math.round(box.top))),
        ].sort((a, b) => a - b);
        return {
          label: item.querySelector('dt')!.textContent!.trim(),
          top: value.getBoundingClientRect().top,
          lines: lines.length,
          lineGap: lines.length > 1 ? lines[1] - lines[0] : 0,
          fontSize: parseFloat(getComputedStyle(value).fontSize),
        };
      }),
    );
    const steps = rows
      .slice(0, -1)
      .filter((row) => row.lines === 1)
      .map((row) => ({ label: row.label, step: rows[rows.indexOf(row) + 1].top - row.top }));
    const sizes = steps.map(({ step }) => step);

    expect(steps.length).toBeGreaterThan(2);
    expect(Math.max(...sizes) - Math.min(...sizes), JSON.stringify(steps)).toBeLessThanOrEqual(1);
    const wrapped = rows.filter((row) => row.lines > 1);
    expect(wrapped.length).toBeGreaterThan(0);
    for (const row of wrapped) {
      expect(row.lineGap, row.label).toBeLessThanOrEqual(row.fontSize * 1.6);
    }
  });
});

async function tabOrderFromContactEmail(page: Page): Promise<string[]> {
  await page.locator('#kontakt').getByRole('link', { name: 'info@nfnn.cz' }).focus();
  const reached: string[] = [];
  for (let step = 0; step < 30 && reached.length < 2; step++) {
    await page.keyboard.press('Tab');
    const kind = await page.evaluate(() => {
      const focused = document.activeElement;
      if (focused?.id === 'contact-name') {
        return 'form';
      }
      return focused?.closest('app-accounting-details') &&
        /Kopírovat/.test(focused.textContent ?? '')
        ? 'copy'
        : null;
    });
    if (kind && !reached.includes(kind)) {
      reached.push(kind);
    }
  }
  return reached;
}
