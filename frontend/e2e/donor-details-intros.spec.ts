import { mockDonorApi, rememberedDonorSession } from './donor-session';
import { expect, test } from './fixtures';

const EXPLANATIONS = [
  '.device-data-about',
  '.diagnostics-card .diagnostics-download-about',
  '.account-deletion p',
];

test.describe('Given a signed-in donor on Údaje a zabezpečení', () => {
  test('when the cards are shown, then every card intro and explanation has the one style of the card intro', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await rememberedDonorSession(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/darce/udaje');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Údaje a zabezpečení' }),
    ).toBeVisible();
    for (const selector of EXPLANATIONS) {
      await expect(page.locator(selector).first()).toBeVisible();
    }

    const styles = await page.evaluate((explanations) => {
      const paragraphs = [
        ...document.querySelectorAll<HTMLElement>(
          ['main .ui-card .ui-card__intro', ...explanations].join(', '),
        ),
      ];
      return paragraphs.map((paragraph) => {
        const style = getComputedStyle(paragraph);
        return {
          text: (paragraph.textContent ?? '').trim().slice(0, 40),
          look: `${style.fontSize} / ${style.lineHeight} ${style.color}`,
        };
      });
    }, EXPLANATIONS);

    expect(styles.length).toBeGreaterThan(EXPLANATIONS.length);
    const looks = new Set(styles.map((style) => style.look));
    expect(looks.size, JSON.stringify(styles, null, 1)).toBe(1);
  });
});

test.describe('Given a signed-in donor on Údaje a zabezpečení on a computer', () => {
  test('when the cards Upozornění and Přihlášená zařízení are shown, then their intros wrap at the full prose measure like the other card intros, though the cards indent them', async ({
    page,
  }) => {
    await mockDonorApi(page);
    await rememberedDonorSession(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/darce/udaje');
    const intros = page.locator('.notifications > p.ui-card__intro:first-of-type, .devices-intro');
    await expect(intros).toHaveCount(2);
    for (const intro of await intros.all()) {
      await expect(intro).toBeVisible();
    }

    const measures = await intros.evaluateAll((paragraphs) =>
      paragraphs.map((paragraph) => {
        const style = getComputedStyle(paragraph);
        const text =
          paragraph.getBoundingClientRect().width -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight);
        return {
          intro: (paragraph.textContent ?? '').trim().slice(0, 40),
          text: Math.round(text),
          measure: Math.round(parseFloat(style.maxInlineSize)),
        };
      }),
    );

    for (const { intro, text, measure } of measures) {
      expect(text, intro).toBe(measure);
    }
  });
});

for (const width of [390, 1180]) {
  test.describe(`Given a signed-in donor on Údaje a zabezpečení in a ${width} px window`, () => {
    test('when Přihlášení a zabezpečení lists its rows, then their dividers run from edge to edge of the card like the rows of the other cards, and the labels start on the title’s edge', async ({
      page,
    }) => {
      await mockDonorApi(page);
      await rememberedDonorSession(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/darce/udaje');
      const card = page.locator('section.ui-card', {
        has: page.getByRole('heading', { name: 'Přihlášení a zabezpečení' }),
      });
      await expect(card.locator('.account-row').nth(1)).toBeVisible();

      const layout = await card.evaluate((section) => {
        const style = getComputedStyle(section);
        const box = section.getBoundingClientRect();
        return {
          inner: {
            left: box.left + parseFloat(style.borderLeftWidth),
            right: box.right - parseFloat(style.borderRightWidth),
          },
          titleLeft: section.querySelector('.ui-card__title')!.getBoundingClientRect().left,
          rows: [...section.querySelectorAll('.account-row')].map((row) => ({
            left: row.getBoundingClientRect().left,
            right: row.getBoundingClientRect().right,
            labelLeft: row.querySelector('dt')!.getBoundingClientRect().left,
          })),
        };
      });

      for (const row of layout.rows) {
        expect(Math.abs(row.left - layout.inner.left), JSON.stringify(layout)).toBeLessThanOrEqual(
          1,
        );
        expect(
          Math.abs(row.right - layout.inner.right),
          JSON.stringify(layout),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(row.labelLeft - layout.titleLeft),
          JSON.stringify(layout),
        ).toBeLessThanOrEqual(1);
      }
    });
  });
}
