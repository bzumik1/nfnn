import type { Locator } from '@playwright/test';
import { mockAdministration, rememberedSession } from './baseline/screen-mocks';
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
  readonly height: number;
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
      height: Math.round(element.getBoundingClientRect().height),
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
      expect(choiceLook.height).toBe(textFieldLook.height);
    });
  }
});

test.describe('Given an administrator on the overview', () => {
  for (const width of WIDTHS) {
    test(`when the year choice of Dary a dárci shows ${width} px wide, then it draws the theme's arrow with room for it, not the system's`, async ({
      page,
    }) => {
      await rememberedSession(page);
      await mockAdministration(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/sprava');
      const choice = page.getByRole('main').getByLabel('Rok');
      await expect(choice).toBeVisible();

      const look = await lookOf(choice);

      expect(look.appearance).toBe('none');
      expect(look.endInset).toBeGreaterThan(look.textInset);
    });
  }
});
