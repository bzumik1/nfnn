import { expect, test } from './fixtures';
import { mockDonorApi } from './donor-session';
import { untilAtRest } from './motion-frames';
import { donations, ISSUING, openReceiptsAfterSignIn } from './receipt-donations';
import { mockReceiptIssuing, RECEIPT_ISSUING_URL } from './receipt-issuing';

interface LineClosing {
  readonly rowsMove: boolean;
  readonly textShown: boolean;
  readonly textOutlastsLine: boolean;
}

test.describe('Given a signed-in donor whose yearly receipt is ready on Můj přehled', () => {
  for (const motion of [
    { name: '', reducedMotion: 'no-preference' as const, rowsMove: true },
    { name: ' with reduced motion', reducedMotion: 'reduce' as const, rowsMove: false },
  ]) {
    for (const { width, refusal } of [
      { width: 1280, refusal: { name: '', afterFirstStep: false } },
      { width: 390, refusal: { name: '', afterFirstStep: false } },
      { width: 390, refusal: { name: ' only once its first step shows', afterFirstStep: true } },
    ]) {
      test(`when the next download of the receipt is refused${refusal.name} in a ${width} px window${motion.name}, then the finished status keeps its last text for as long as its line closes`, async ({
        page,
      }) => {
        await page.emulateMedia({ reducedMotion: motion.reducedMotion });
        await mockDonorApi(page, donations);
        await mockReceiptIssuing(page, ISSUING);
        await page.setViewportSize({ width: 1280, height: 900 });
        await openReceiptsAfterSignIn(page);
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/darce/prehled');
        const button = page.locator('.receipt-ready-pdf');
        const wrapper = page.locator('.receipt-ready .receipt-status');
        await Promise.all([page.waitForEvent('download'), button.click()]);
        await expect(page.locator('.receipt-ready').getByRole('status')).toHaveText(/\S/);
        await expect(wrapper).not.toHaveClass(/receipt-status--closing/);
        await untilAtRest(wrapper);
        await page.route(
          (url) => url.pathname === RECEIPT_ISSUING_URL,
          async (route) => {
            if (refusal.afterFirstStep) {
              await page.waitForFunction(() =>
                document
                  .querySelector('.receipt-ready [role="status"]')
                  ?.textContent?.includes('Připravujeme údaje potvrzení'),
              );
            }
            await route.fulfill({
              status: 409,
              contentType: 'application/problem+json',
              json: {
                type: 'https://nfnn.cz/problems/donations/receipt-signing-paused',
                title: 'Vydávání potvrzení je pozastavené',
                status: 409,
              },
            });
          },
        );

        const closing = wrapper.evaluate(
          (element) =>
            new Promise<LineClosing>((resolve) => {
              new MutationObserver((_, observer) => {
                if (!element.classList.contains('receipt-status--closing')) {
                  return;
                }
                observer.disconnect();
                const endOf = (animation: Animation) =>
                  Number(animation.effect!.getComputedTiming().endTime);
                const lineMotions = element.getAnimations();
                const lineEnd = Math.max(0, ...lineMotions.map(endOf));
                const shown = Array.from(element.querySelector('[role="status"]')!.children).filter(
                  (part) => part.getBoundingClientRect().width > 0,
                );
                resolve({
                  rowsMove: lineMotions.some(
                    (motion) =>
                      (motion as CSSTransition).transitionProperty === 'grid-template-rows',
                  ),
                  textShown: shown.length > 0,
                  textOutlastsLine: shown.some((part) =>
                    part.getAnimations().some((leave) => endOf(leave) >= lineEnd),
                  ),
                });
              }).observe(element, { attributes: true, attributeFilter: ['class'] });
            }),
        );
        await button.click();

        expect(await closing).toEqual({
          rowsMove: motion.rowsMove,
          textShown: true,
          textOutlastsLine: true,
        });
      });
    }
  }
});
