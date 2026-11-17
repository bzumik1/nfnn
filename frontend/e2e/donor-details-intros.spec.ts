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
