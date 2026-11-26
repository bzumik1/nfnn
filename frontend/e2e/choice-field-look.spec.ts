import type { Locator } from '@playwright/test';
import { mockDonorApi, rememberedDonorSession } from './donor-session';
import { expect, test } from './fixtures';

const WIDTHS = [390, 1280] as const;

interface FieldLook {
  readonly appearance: string;
  readonly frame: string;
  readonly ground: string;
  readonly text: string;
  readonly textInset: number;
  readonly endInset: number;
}

function lookOf(field: Locator): Promise<FieldLook> {
  return field.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      appearance: style.appearance,
      frame: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor} ${style.borderRadius}`,
      ground: style.backgroundColor,
      text: `${style.fontFamily} ${style.fontSize} ${style.color}`,
      textInset: parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
      endInset: parseFloat(style.borderRightWidth) + parseFloat(style.paddingRight),
    };
  });
}

test.describe('Given a signed-in donor editing their details', () => {
  for (const width of WIDTHS) {
    test(`when the receipt language choice shows ${width} px wide, then it has the look of the text fields above it and room for its own arrow`, async ({
      page,
    }) => {
      await mockDonorApi(page);
      await rememberedDonorSession(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/darce/udaje');
      await page.getByRole('button', { name: 'Upravit údaje' }).click();
      const choice = page.getByLabel('Jazyk potvrzení');
      const textField = page.getByLabel('Ulice a číslo');
      await expect(choice).toBeVisible();
      await expect(textField).toBeVisible();

      const [choiceLook, textFieldLook] = await Promise.all([lookOf(choice), lookOf(textField)]);

      expect(choiceLook.appearance).toBe('none');
      expect(choiceLook.frame).toBe(textFieldLook.frame);
      expect(choiceLook.ground).toBe(textFieldLook.ground);
      expect(choiceLook.text).toBe(textFieldLook.text);
      expect(choiceLook.textInset).toBe(textFieldLook.textInset);
      expect(choiceLook.endInset).toBeGreaterThan(textFieldLook.endInset);
    });
  }
});
