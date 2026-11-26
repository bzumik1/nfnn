import { Locator } from '@playwright/test';
import { BREAKPOINTS } from '../src/app/core/layout/breakpoints';
import { expect, test } from './fixtures';
import { openSignInDialog } from './donor-session';

const FOCUS_RING_REACH_PX = 3;
const PHONE_SIZE_ONLY = 'the iphone project runs the phone sizes, a computer is Chromium only';

for (const [width, height] of [
  [1280, 640],
  [900, 640],
  [390, 640],
  [390, 844],
]) {
  test.describe(`Given a visitor on a window ${width} × ${height} px who sends the empty registration form from its end`, () => {
    test.use({ viewport: { width, height } });

    test.beforeEach(async ({ page, isMobile }) => {
      test.skip(isMobile && width > BREAKPOINTS.phone, PHONE_SIZE_ONLY);
      await openSignInDialog(page);
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Registrace', exact: true }).click();
      await dialog.getByRole('button', { name: 'Vytvořit účet' }).click();
      await expect(dialog.getByLabel('Jméno a příjmení')).toBeFocused();
    });

    test('when the focus jumps to the first field to fill in, then its label, the room of its focus ring and the close button stand in view', async ({
      page,
    }) => {
      await expect.poll(() => cutOff(page.getByRole('dialog'))).toEqual([]);
    });
  });
}

function cutOff(dialog: Locator): Promise<string[]> {
  return dialog.evaluate((element, ringReach) => {
    const parts: [string, Element | null, number][] = [
      ['label', element.querySelector('label[for="register-name"]'), 0],
      ['focus ring', element.querySelector('#register-name'), ringReach],
      ['close button', element.querySelector('button[aria-label="Zavřít"]'), 0],
    ];
    return parts.flatMap(([name, part, reach]) => {
      if (part === null) {
        return [`${name}: missing`];
      }
      const box = part.getBoundingClientRect();
      const rooms: { top: number; bottom: number }[] = [{ top: 0, bottom: innerHeight }];
      for (let parent = part.parentElement; parent !== null; parent = parent.parentElement) {
        const overflow = getComputedStyle(parent).overflowY;
        if (overflow === 'auto' || overflow === 'scroll') {
          const top = parent.getBoundingClientRect().top + parent.clientTop;
          rooms.push({ top, bottom: top + parent.clientHeight });
        }
      }
      return rooms.some((room) => box.top - reach < room.top || box.bottom + reach > room.bottom)
        ? [`${name}: ${Math.round(box.top)}–${Math.round(box.bottom)}`]
        : [];
    });
  }, FOCUS_RING_REACH_PX);
}
