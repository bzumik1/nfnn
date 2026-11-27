import type { Page } from '@playwright/test';
import { stepBack } from './app-history';
import {
  ACCOUNT_LIST_ROW,
  accountListShown,
  accountRows,
  accountScreens,
  accountSheet,
  activeHref,
  administrationScreensOf,
  backOnASectionLeftFromTheScrolledList,
  clickWithoutScrolling,
  DETAIL_LISTS,
  DETAILS_LEFT_TO_THE_SIMULATOR,
  detailScreens,
  donorScreens,
  expectArrived,
  expectBroughtIntoViewTheLeast,
  expectLeftAway,
  expectNoJump,
  expectSlidBack,
  expectTheListUnderTheSectionAt,
  expectWithinTheBudget,
  framesAwayFromTheKeptScroll,
  scrollWatchSettled,
  screencastMissedTheMotion,
  probeSawTheMotion,
  screenNotJudgedReason,
  type Frame,
  type FrameCost,
  HEIGHT,
  linksOut,
  LOOKS,
  aheadAtMostFrames,
  measuresFrames,
  movesWithinFramesOfThePlacing,
  plantedPastMs,
  plantedStartFramesBeforeThePlacing,
  PRODESK_STAMP_LAG_P99_FRAMES,
  STAMP_LAG_P99_FRAMES,
  MOTION_GATES,
  motionsEnded,
  onThePhone,
  openAccountSheetOverTheNews,
  openAdministrationAt,
  pageScroll,
  type Placing,
  longFrameProblems,
  placingKindProblems,
  placingProblems,
  frozenOnTheScreen,
  judgedOnTheScreen,
  type ScreenMotion,
  placementOf,
  plantedScreenProblemsOf,
  recordTheListScrollsUnderTheSection,
  recordTheSheetTops,
  type Row,
  type Screens,
  SCROLLED_BY_PX,
  sheetSettled,
  sheetTopsSeen,
  type StepProbe,
  stepSeen,
  swipeBack,
  walkRow,
  watchTheStep,
  WAY_NAMES,
  skipWhereNotJudged,
  WAYS,
  WIDTH,
} from './back-matrix';
import { expect, test, testWithoutBrowser } from './fixtures';
import { launchOptionsOf } from './launch-options';
import { runnerSpeedProblems, startMotionGate } from './runner-speed';

test.use({
  launchOptions: [
    async ({ browserName }, use, workerInfo) =>
      use(launchOptionsOf(browserName, workerInfo.project.name)),
    { scope: 'worker' },
  ],
});

test.beforeEach(({ page }, testInfo) => startMotionGate(page, testInfo.tags));

test.afterEach(async ({ page }, testInfo) => {
  expect(await runnerSpeedProblems(page), 'steps outside their budgets on this runner').toEqual([]);
  skipWhereNotJudged(testInfo);
});

for (const gate of MOTION_GATES) {
  for (const look of LOOKS) {
    for (const way of WAYS) {
      test.describe(`Given an administrator in the app on the home screen of a phone, in the ${look} appearance`, () => {
        test.use({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true });

        test.beforeEach(({ page }) => onThePhone(page, look));

        test(
          `when ${WAY_NAMES[way]} on every screen opened from the account sheet, then it travels back over the account sheet without a jump, over one still background, with the scroll and the focus kept, ${gate.placed}, ${gate.firstHalf}`,
          { tag: [...gate.tags] },
          async ({ page }) => {
            test.setTimeout(240_000);
            await openAccountSheetOverTheNews(page);
            const rows = await accountRows(page);
            expect(rows.map((row) => row.href)).toEqual(
              expect.arrayContaining([...donorScreens(), '/sprava']),
            );
            const screens = accountScreens(page);
            for (const row of rows) {
              for (const scrolled of [false, true]) {
                await test.step(`${row.name}${scrolled ? ', scrolled' : ''}`, () =>
                  walkRow(
                    page,
                    screens,
                    row,
                    way,
                    scrolled,
                    accountSheet(page).locator(`a[href="${row.href}"]`).first(),
                    () => {
                      screens.opening(row);
                      return clickWithoutScrolling(
                        accountSheet(page).locator(`a[href="${row.href}"]`).first(),
                      );
                    },
                  ));
              }
            }
          },
        );

        test(
          `when ${WAY_NAMES[way]} on Nastavení opened from Občas a pro technika, then it travels back over Občas a pro technika without a jump, one title of the head at a time, with the scroll and the focus kept, ${gate.placed}, ${gate.firstHalf}`,
          { tag: [...gate.tags] },
          async ({ page }) => {
            test.setTimeout(120_000);
            const screens = administrationScreensOf(page);
            const trail = ['/sprava', '/sprava/vice'];
            await openAdministrationAt(page, trail);
            const link = page.locator('.admin-frame a[href="/sprava/nastaveni"]').first();
            const row: Row = {
              name: (await link.innerText()).split('\n')[0].trim(),
              href: '/sprava/nastaveni',
              from: '/sprava/vice',
            };
            for (const scrolled of [false, true]) {
              await openAdministrationAt(page, trail);
              await test.step(`${row.href} from ${row.from}${scrolled ? ', scrolled' : ''}`, () =>
                walkRow(page, screens, row, way, scrolled, link));
            }
          },
        );

        test(
          `when ${WAY_NAMES[way]} on every detail, then it travels back over its list without a jump, with the scroll and the focus kept, ${gate.placed}, ${gate.firstHalf}`,
          { tag: [...gate.tags] },
          async ({ page }) => {
            test.setTimeout(240_000);
            const details = detailScreens();
            expect(
              details.filter(
                (path) => DETAIL_LISTS[path] === undefined && !DETAILS_LEFT_TO_THE_SIMULATOR[path],
              ),
              'a detail screen without a row in the matrix',
            ).toEqual([]);
            for (const [path, list] of Object.entries(DETAIL_LISTS)) {
              const administration = list.startsWith('/sprava');
              if (administration) {
                await openAdministrationAt(page, ['/sprava', list]);
              } else {
                await page.goto(list);
              }
              await expect(page.locator('main h1, .admin-page h1').first()).toBeVisible();
              const within = page.locator(administration ? '.admin-frame' : 'main').first();
              await expect(within.locator(`a[href^="${list}/"]`).first()).toBeVisible();
              const [detail] = await linksOut(list, within);
              expect(detail, `${list} offers no ${path}`).toBeDefined();
              const screens: Screens = {
                sheets: administration,
                ...pageScroll(page),
                shown: async () => {
                  await expect(page).toHaveURL((url) => url.pathname === detail.href);
                  await expect(page.locator('main h1, .admin-page h1').first()).toBeVisible();
                  await expect(page.locator('.page-transition')).toHaveCount(0);
                },
                backButton: () => page.getByRole('banner').getByRole('button', { name: 'Zpět' }),
                returned: async () => {
                  await expect(page).toHaveURL((url) => url.pathname === list);
                },
              };
              for (const scrolled of [false, true]) {
                await test.step(`${path}${scrolled ? ', scrolled' : ''}`, () =>
                  walkRow(
                    page,
                    screens,
                    detail,
                    way,
                    scrolled,
                    within.locator(`a[href="${detail.href}"]`).first(),
                  ));
              }
            }
          },
        );
      });
    }

    test.describe(`Given a donor in the app on the home screen of a phone with the account list scrolled, in the ${look} appearance`, () => {
      test.use({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true });

      test.beforeEach(({ page }) => onThePhone(page, look));

      test(
        `when a section opened from the list leads out of the sheet and ‹ steps back twice, then the section and then the list come back, the list at its scroll, without a jump, ${gate.firstHalf}`,
        { tag: [...gate.tags] },
        async ({ page }) => {
          const { screens, listTop } = await backOnASectionLeftFromTheScrolledList(page);
          await recordTheListScrollsUnderTheSection(page);
          await watchTheStep(page);
          await screens.backButton().click();
          const probe = await stepSeen(page);

          expect(probe.under ?? '', 'the list was not under the leaving section').toContain('Účet');
          expectLeftAway(probe, WIDTH, 0);
          await accountListShown(page);
          await expect
            .poll(() => activeHref(page), { message: 'the focus did not return' })
            .toBe('/darce/potvrzeni');
          expect(await screens.scrollTop(), 'the list did not stand at its scroll').toBe(listTop);
          await expectTheListUnderTheSectionAt(page, listTop);
        },
      );

      for (const completes of [true, false]) {
        test(
          `when a section opened from the list leads out of the sheet, ‹ brings it back and ${completes ? WAY_NAMES['swipe-completed'] : WAY_NAMES['swipe-cancelled']}, then the list follows the finger under it at its scroll, ${gate.placedAfterTheTap}${completes ? `, ${gate.firstHalf}` : ''}`,
          { tag: [...gate.tags] },
          async ({ page }) => {
            const { screens, listTop, section } = await backOnASectionLeftFromTheScrolledList(page);
            await recordTheListScrollsUnderTheSection(page);

            const { probe, letGoAt } = await swipeBack(page, ACCOUNT_LIST_ROW, completes, null);

            if (completes) {
              expectLeftAway(probe, WIDTH, letGoAt);
              await accountListShown(page);
              await expect
                .poll(() => screens.scrollTop(), {
                  message: 'the list did not stand at its scroll',
                })
                .toBe(listTop);
            } else {
              expectSlidBack(probe, WIDTH, letGoAt);
              await expect(section).toBeVisible();
            }
            await expect(page.locator('.page-transition')).toHaveCount(0);
            await expectTheListUnderTheSectionAt(page, listTop);
          },
        );
      }
    });

    test.describe(`Given an administrator in the app on the home screen of a phone that draws the first frame of a step late while its page waits, in the ${look} appearance`, () => {
      test.use({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true });
      test.skip(
        ({ browserName }) => browserName !== 'chromium',
        'only Chromium lets the probe hold back the frames after a step is placed and read every frame; the simulator measures WebKit on the phone',
      );

      test.beforeEach(({ page }) => onThePhone(page, look));

      const firstFrame = gate.timed
        ? ' and its first moved frame on the screen comes at most a fifth of the way (Prodesk/nightly only)'
        : '';
      const lateFrames: readonly (readonly [FrameCost, string, string])[] = [
        [
          'drawn-late',
          `it moves on the screen within 3 frames of the placing plus the ceiling of the p99 stamp lag of the runner's screencast${firstFrame}`,
          `the page moves on the screen within 3 frames of the placing plus the ceiling of the p99 stamp lag of the runner's screencast${firstFrame}`,
        ],
        [
          'drawn-late-then-long',
          `it moves on the screen even when the frame after the late one lasts long too${firstFrame}`,
          `the page moves on the screen even when the frame after the late one lasts long too${firstFrame}`,
        ],
      ];
      for (const [cost, opens, steps] of lateFrames) {
        const withinTheBudget = (probe: StepProbe): void => {
          if (cost === 'drawn-late') {
            expectWithinTheBudget(probe);
          }
        };

        test(
          `when each section of the account sheet opens for the first time, then ${opens}${cost === 'drawn-late' ? `, ${gate.firstOpeningPlaced}` : ''}, ${gate.firstHalf}`,
          { tag: [...gate.tags] },
          async ({ page }) => {
            test.setTimeout(120_000);
            await openAccountSheetOverTheNews(page);
            const screens = accountScreens(page);
            const rows = (await accountRows(page)).filter((row) => row.href !== '/sprava');
            expect(rows.map((row) => row.href)).toEqual(expect.arrayContaining(donorScreens()));
            for (const row of rows) {
              await test.step(row.name, async () => {
                await motionsEnded(page);
                await watchTheStep(page, cost);
                await clickWithoutScrolling(
                  accountSheet(page).locator(`a[href="${row.href}"]`).first(),
                );
                await screens.shown(row);
                const opening = await stepSeen(page);
                expectArrived(opening, WIDTH);
                withinTheBudget(opening);
                await screens.backButton().click();
                await screens.returned(row);
                await expect(page.locator('.page-transition')).toHaveCount(0);
              });
            }
          },
        );

        test(
          `when ‹ is pressed on Platby, Zálohy and Lidé fondu, then ${steps}${cost === 'drawn-late' ? `, ${gate.placedAfterTheTap}` : ''}, ${gate.firstHalf}`,
          { tag: [...gate.tags] },
          async ({ page }) => {
            test.setTimeout(120_000);
            const screens = administrationScreensOf(page);
            const sections: readonly (readonly [readonly string[], string])[] = [
              [['/sprava'], '/sprava/platby'],
              [['/sprava', '/sprava/vice'], '/sprava/zalohy'],
              [['/sprava', '/sprava/vice'], '/sprava/lide-fondu'],
            ];
            for (const [trail, href] of sections) {
              await openAdministrationAt(page, trail);
              const link = page.locator(`.admin-frame a[href="${href}"]`).first();
              const row: Row = {
                name: (await link.innerText()).split('\n')[0].trim(),
                href,
                from: trail.at(-1)!,
              };
              await test.step(href, async () => {
                await clickWithoutScrolling(link);
                await screens.shown(row);
                await motionsEnded(page);
                await watchTheStep(page, cost);
                await screens.backButton().click();
                const probe = await stepSeen(page);
                expectLeftAway(probe, WIDTH, 0);
                withinTheBudget(probe);
                await screens.returned(row);
                await expect(page.locator('.page-transition')).toHaveCount(0);
              });
            }
          },
        );
      }
    });

    if (!gate.timed) {
      test.describe(`Given a visitor on a wide screen, in the ${look} appearance`, () => {
        test.use({ viewport: { width: 1280, height: 800 } });

        test.beforeEach(({ page }) => onThePhone(page, look));

        test('when an article opens from the news and the app steps back, then no layer moves the pages or their titles', async ({
          page,
        }) => {
          await page.goto('/aktuality');
          const article = page.locator('main a[href="/aktuality/zprava-1"]').first();
          await expect(article).toBeVisible();
          await watchTheStep(page);
          await clickWithoutScrolling(article);
          await expect(page).toHaveURL('/aktuality/zprava-1');
          expect((await stepSeen(page)).frames.filter((frame) => frame.overlay)).toEqual([]);

          await watchTheStep(page);
          await stepBack(page);
          await expect(page).toHaveURL('/aktuality');
          expect((await stepSeen(page)).frames.filter((frame) => frame.overlay)).toEqual([]);
        });
      });

      test.describe(`Given a donor in the app on the home screen of a phone with the account sheet open over the scrolled news, in the ${look} appearance`, () => {
        test.use({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true });

        test.beforeEach(({ page }) => onThePhone(page, look));

        for (const away of [false, true]) {
          test(`when the step back closes the sheet ${away ? 'with Účet scrolled away with the news' : 'with Účet still on the screen'}, then the sheet goes down without a jump, the focus returns to Účet and ${away ? 'the news moves the least that brings Účet back on the screen' : 'the news stays where it was'}`, async ({
            page,
          }) => {
            await page.goto('/aktuality');
            await expect(page.getByRole('heading', { name: 'Zpráva 8' })).toBeVisible();
            const account = page.getByRole('banner').getByRole('button', { name: 'Účet' });
            const stillShown = await account.evaluate((button: HTMLElement) =>
              Math.max(
                0,
                Math.floor(
                  button.getBoundingClientRect().top +
                    window.scrollY -
                    (Number.parseFloat(getComputedStyle(button).scrollMarginTop) || 0),
                ) - 1,
              ),
            );
            const top = await pageScroll(page).scrollTo(away ? SCROLLED_BY_PX : stillShown);
            expect((await placementOf(account)).shown, 'Účet shows before the sheet opens').toBe(
              !away,
            );
            await account.evaluate((button: HTMLElement) => button.focus({ preventScroll: true }));
            expect(
              await pageScroll(page).scrollTop(),
              'the news moved before the sheet opened',
            ).toBe(top);
            await page.keyboard.press('Enter');
            await accountListShown(page);
            await sheetSettled(page);
            expect(await pageScroll(page).scrollTop(), 'the news moved as the sheet opened').toBe(
              top,
            );
            await recordTheSheetTops(page);

            await stepBack(page);

            await expect(accountSheet(page)).toHaveCount(0);
            const tops = await sheetTopsSeen(page);
            if (measuresFrames(page)) {
              expect(
                tops.filter((at) => at > tops[0] + 1 && at < HEIGHT - 1).length,
                'no frame showed the sheet on its way down',
              ).toBeGreaterThan(0);
            }
            for (let at = 1; at < tops.length; at++) {
              expect(tops[at]).toBeGreaterThanOrEqual(tops[at - 1] - 1);
            }
            await expect(account).toBeFocused();
            if (away) {
              await expectBroughtIntoViewTheLeast(page);
              expect(await pageScroll(page).scrollTop()).toBeLessThan(top);
            } else {
              await expect.poll(() => pageScroll(page).scrollTop()).toBe(top);
            }
          });
        }
      });
    }
  }
}

type Planted =
  | 'start-moved-later'
  | 'start-in-the-past'
  | 'start-before-the-placing'
  | 'still-page'
  | 'shown-late';

const SHOWN_LATE_SHARE = 0.9;
const SHOWN_LATE_STEP_MS = 1600;

const PLANTED_STEP_MS = 1000;

test.describe(`Given an administrator in the app on the home screen of a phone whose page moves its own step wrongly, a regression planted to prove the judge on the screen, its step stretched to ${PLANTED_STEP_MS} ms so the runner's screencast, which misses up to 200 ms, catches at least 4 frames between rest and end`, () => {
  test.use({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true });

  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'only Chromium gives a screencast; WebKit keeps every other check of the matrix',
  );

  test.beforeEach(({ page }) => onThePhone(page, 'light'));

  const plant = (page: Page, planted: Planted): Promise<void> =>
    page.evaluate(
      ({ how, framesBefore, pastMs, shownLateShare }) => {
        const motionsOf = (): Animation[] =>
          document.querySelector('.page-transition')?.getAnimations({ subtree: true }) ?? [];
        const started = (): boolean => {
          const moving =
            document.querySelector('.page-transition__page--over')?.getAnimations() ?? [];
          return (
            moving.length > 0 && moving.every((motion) => typeof motion.startTime === 'number')
          );
        };
        const shift = (ms: number): void =>
          motionsOf().forEach((motion) => {
            if (typeof motion.startTime === 'number') {
              motion.startTime += ms;
            }
          });
        if (how === 'shown-late') {
          const hidden = new MutationObserver(() => {
            const overlay = document.querySelector<HTMLElement>('.page-transition--moving');
            if (overlay === null) {
              return;
            }
            hidden.disconnect();
            overlay.style.visibility = 'hidden';
            const ticker = document.createElement('div');
            ticker.style.cssText =
              'position:fixed;left:0;bottom:0;width:2px;height:2px;z-index:2147483647;pointer-events:none';
            document.body.append(ticker);
            let frames = 0;
            const showOnceFar = (): void => {
              const over = document.querySelector('.page-transition__page--over');
              const transform = over === null ? 'none' : getComputedStyle(over).transform;
              const offset = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41;
              if (offset >= shownLateShare * innerWidth || !overlay.isConnected) {
                overlay.style.visibility = '';
                ticker.remove();
              } else {
                ticker.style.background = ++frames % 2 === 0 ? '#000' : '#fff';
                requestAnimationFrame(showOnceFar);
              }
            };
            requestAnimationFrame(showOnceFar);
          });
          hidden.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class'],
          });
          return;
        }
        if (how === 'still-page') {
          const stopped = new MutationObserver(() => {
            const overlay = document.querySelector('.page-transition--moving');
            if (overlay === null || overlay.classList.contains('page-transition--held')) {
              return;
            }
            stopped.disconnect();
            motionsOf().forEach((motion) => {
              motion.pause();
              motion.currentTime = 0;
            });
          });
          stopped.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class'],
          });
          return;
        }
        if (how.startsWith('start-before-the-placing')) {
          const letGo = new MutationObserver(() => {
            const overlay = document.querySelector('.page-transition--moving');
            if (overlay === null || overlay.classList.contains('page-transition--held')) {
              return;
            }
            letGo.disconnect();
            const placedAt = window.nfnnStepProbe?.placedAt ?? performance.now();
            motionsOf().forEach(
              (motion) => (motion.startTime = placedAt - (framesBefore * 1000) / 60),
            );
          });
          letGo.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class'],
          });
          return;
        }
        const watch = (): void => {
          if (!started()) {
            requestAnimationFrame(watch);
            return;
          }
          if (how === 'start-in-the-past') {
            shift(-pastMs);
            return;
          }

          let frames = 0;
          const later = (): void => {
            if (++frames < 4) {
              requestAnimationFrame(later);
            } else {
              shift(150);
            }
          };
          requestAnimationFrame(later);
        };
        requestAnimationFrame(watch);
      },
      {
        how: planted,
        framesBefore: plantedStartFramesBeforeThePlacing(STAMP_LAG_P99_FRAMES),
        pastMs: plantedPastMs(STAMP_LAG_P99_FRAMES),
        shownLateShare: SHOWN_LATE_SHARE,
      },
    );

  const steppedBackFromPayments = async (page: Page, planted: Planted): Promise<string[]> =>
    plantedScreenProblemsOf(await stepProbeBackFromPayments(page, planted), 0, WIDTH, planted);

  const stepProbeBackFromPayments = async (page: Page, planted: Planted): Promise<StepProbe> => {
    const screens = administrationScreensOf(page);
    await openAdministrationAt(page, ['/sprava']);
    const link = page.locator('.admin-frame a[href="/sprava/platby"]').first();
    const row: Row = {
      name: (await link.innerText()).split('\n')[0].trim(),
      href: '/sprava/platby',
      from: '/sprava',
    };
    await clickWithoutScrolling(link);
    await screens.shown(row);
    await motionsEnded(page);
    await page.evaluate(
      (stepMs) => document.documentElement.style.setProperty('--duration-page', `${stepMs}ms`),
      planted === 'shown-late' ? SHOWN_LATE_STEP_MS : PLANTED_STEP_MS,
    );
    await watchTheStep(page);
    await plant(page, planted);
    await screens.backButton().click();
    const probe = await stepSeen(page);
    await screens.returned(row);
    return probe;
  };

  test('when the page’s step back loses its motion and stands still until the time bound swaps it, then the runner judges it, since the screencast drew frames all the while, and the judge on the screen reports too few frames on its way', async ({
    page,
  }) => {
    const probe = await stepProbeBackFromPayments(page, 'still-page');

    expect(screenNotJudgedReason(probe), 'the still page was excused as not judged').toBeNull();
    expect(plantedScreenProblemsOf(probe, 0, WIDTH, 'still-page')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^the screencast showed [01] frames? of the page between its rest and its end/,
        ),
      ]),
    );
  });

  test('when the page moves the start of its step back 150 ms later after the screen drew it, as before round 16 (0 → 0.87 → 0.45), then the judge on the screen reports the page going back', async ({
    page,
  }) => {
    expect(await steppedBackFromPayments(page, 'start-moved-later')).toEqual(
      expect.arrayContaining([expect.stringMatching(/^the page went back on the screen/)]),
    );
  });

  test('when the page starts its step back 240 ms into the motion, or more where twice the judge’s tolerance of 1.5 steady frames plus the p99 stamp lag of the runner’s screencast asks for it, then the judge on the screen reports the jump at the start', async ({
    page,
  }) => {
    expect(await steppedBackFromPayments(page, 'start-in-the-past')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^the motion on the screen started \d+ ms before both copies were placed|^the page ran ahead of its curve on the screen/,
        ),
      ]),
    );
  });

  test(`when the screen first shows the page's ${SHOWN_LATE_STEP_MS} ms step back already ${SHOWN_LATE_SHARE * 100} % of its way, as an iPhone showed a step in round 29 while it still painted the copies after the motion's clock had started, then the judge on the screen reports the jump at the start, as long as the screencast's gap before that frame stays under 440 ms at 30 frames a second and the p99 lag of 3 frames, about three times its p90 gap`, async ({
    page,
  }) => {
    expect(await steppedBackFromPayments(page, 'shown-late')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^the first frame the screen showed of the step was already/),
      ]),
    );
  });

  test(`when the page sets the start of its step back one steady frame more than 1 plus the p99 stamp lag of the runner’s screencast before both copies were placed, then the judge’s start check from the first moved frame reports the jump at the start`, async ({
    page,
  }) => {
    expect(await steppedBackFromPayments(page, 'start-before-the-placing')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^the motion on the screen started \d+ ms before both copies were placed/,
        ),
      ]),
    );
  });
});

test.describe('Given the probe that watches a step of the back matrix', () => {
  const steepestPerMs = 0.004;
  const frameAt = (at: number, readAt: number, offset: number): Frame =>
    ({ at, readAt, offset }) as Frame;
  const probeOf = (liveClock: boolean): StepProbe => ({ steepestPerMs, liveClock }) as StepProbe;
  const width = 390;
  const offsetIn = (ms: number): number => width * steepestPerMs * ms;
  const readLater = [frameAt(1000, 1000, 100), frameAt(1022, 1025, 100 + offsetIn(25))];
  const placedAfter = (gapsMs: number[], probeMs: number[]): Placing => ({
    frames: gapsMs.length - 1,
    gapsMs,
    probeMs,
    steadyMs: 16.7,
    ms: gapsMs.reduce((all, gap) => all + gap, 0),
    loadedCode: false,
  });

  const linear = [0, 0, 1, 1];
  const onTheCurve = (times: readonly number[]): { at: number; offset: number }[] =>
    times.map((at) => ({ at: 1000 + at, offset: Math.min(300, at) }));
  const motionOf = (
    shots: readonly { at: number; offset: number }[],
    more: Partial<ScreenMotion> = {},
  ): ScreenMotion => ({
    shots,
    from: 0,
    to: 300,
    curve: linear,
    durationMs: 300,
    steadyMs: 16.7,
    placedAt: 1000,
    startTime: 1000,
    anchor: 'start',
    lagFrames: 0,
    measurePx: 0,
    ...more,
  });
  const stampedLate = (startAt: number, lagMs: number, times: readonly number[]) =>
    times.map((at) => ({ at: at + lagMs, offset: Math.min(300, Math.max(0, at - startAt)) }));

  testWithoutBrowser(
    'when the probe’s own frames show the page standing still through the motion’s time, as a still page does, then the screencast’s silence excuses nothing, since a screencast draws no frame of a page that does not change (the Prodesk, still page 1 of 3), and fewer than two probe frames in the motion’s time prove no motion either, so they excuse nothing',
    () => {
      const still = [0, 100, 300, 600, 900, 1100].map((at) => frameAt(1000 + at, 1000 + at, 0));
      const moving = [0, 100, 300, 600, 900, 1100].map((at) =>
        frameAt(1000 + at, 1000 + at, Math.min(390, at * 0.39)),
      );

      expect(probeSawTheMotion(still, 1000, 1000)).toBe(false);
      expect(probeSawTheMotion(moving, 1000, 1000)).toBe(true);
      expect(probeSawTheMotion(still.slice(0, 1), 1000, 1000)).toBe(false);
      expect(probeSawTheMotion([], 1000, 1000)).toBe(false);
    },
  );

  testWithoutBrowser(
    'when the screencast drew no frame for at least the motion’s length less one frame while the page moved, then the step is not judged on this runner, naming the gap',
    () => {
      expect(screencastMissedTheMotion([900, 1000, 1340, 1500], 1000, 350, 16.7)).toMatch(
        /^the screencast drew no frame for 340 ms of a 350 ms motion/,
      );
      expect(screencastMissedTheMotion([900, 950], 1000, 350, 16.7)).toMatch(
        /^the screencast drew no frame/,
      );
    },
  );

  testWithoutBrowser(
    'when the screencast drew frames during the motion more often than its length less one frame, as it does for a page that stands still and is swapped at the end, then the step is judged and nothing excuses it',
    () => {
      const dense = Array.from({ length: 30 }, (_, index) => 900 + index * 50);

      expect(screencastMissedTheMotion(dense, 1000, 350, 16.7)).toBeNull();
      expect(screencastMissedTheMotion([900, 1000, 1320, 1500], 1000, 350, 16.7)).toBeNull();
    },
  );

  testWithoutBrowser(
    'when the screencast started just before a finger let go first gave the frame the page drew before its rest, stamped seconds earlier, and then frames during the release, then only the part of each gap within the motion counts and the step is judged',
    () => {
      const release = [-2575, 20, 55, 90, 125, 160].map((at) => 10_000 + at);

      expect(screencastMissedTheMotion(release, 10_000, 150, 16.7)).toBeNull();
      expect(screencastMissedTheMotion([10_000 - 2575, 10_400], 10_000, 150, 16.7)).toMatch(
        /^the screencast drew no frame for 150 ms of a 150 ms motion/,
      );
    },
  );

  testWithoutBrowser(
    'when the scroll watch saw a scroll and a frame after the focus returned in which the page stood 31 px from its kept scroll, as WebKit drew in run 45550415459, then both are reported even though the page stood back at the kept scroll by the end',
    () => {
      const href = '/sprava/darci/d1/vymaz';
      const notes = [
        { at: 0, what: 'frame', scrollY: 0, detail: 'focus h1.ui-page-title' },
        { at: 456, what: 'frame', scrollY: 0, detail: 'focus h1.ui-page-title' },
        { at: 468, what: 'focus', scrollY: 0, detail: `a.ui-list__row[href=${href}], row at 670` },
        { at: 1384, what: 'scroll', scrollY: 31, detail: 'document, row at 639' },
        { at: 1386, what: 'frame', scrollY: 31, detail: 'focus a.ui-list__row' },
        { at: 1403, what: 'frame', scrollY: 0, detail: 'focus a.ui-list__row' },
      ];

      expect(framesAwayFromTheKeptScroll(notes, href, 0)).toEqual([
        'the page stood at 31 px instead of 0 px in a scroll 916 ms after the focus returned',
        'the page stood at 31 px instead of 0 px in the frame 918 ms after the focus returned',
      ]);
      expect(framesAwayFromTheKeptScroll(notes, href, 31)).toEqual([
        'the page stood at 0 px instead of 31 px in the frame 935 ms after the focus returned',
      ]);
    },
  );

  testWithoutBrowser(
    'when the screen keeps its scroll in a panel of its own, as the account sheet does, then each frame is judged by the panel’s scroll it recorded, not the page’s (run 45556782486: the page at 0 px, the panel kept at 92 px)',
    () => {
      const href = '/darce/udaje';
      const notes = [
        {
          at: 0,
          what: 'focus',
          scrollY: 0,
          held: 92,
          detail: `a.account-profile[href=${href}], row at 85`,
        },
        { at: 16, what: 'frame', scrollY: 0, held: 92, detail: 'focus a.account-profile' },
        { at: 33, what: 'frame', scrollY: 0, held: 60, detail: 'focus a.account-profile' },
      ];

      expect(framesAwayFromTheKeptScroll(notes, href, 92)).toEqual([
        'the page stood at 60 px instead of 92 px in the frame 33 ms after the focus returned',
      ]);
    },
  );

  testWithoutBrowser(
    'when no frame after the focus returned stood away from the kept scroll, then nothing is reported',
    () => {
      const notes = [
        { at: 0, what: 'frame', scrollY: 31, detail: 'focus h1' },
        { at: 10, what: 'focus', scrollY: 0, detail: 'a[href=/sprava/platby], row at 300' },
        { at: 20, what: 'frame', scrollY: 0, detail: 'focus a' },
      ];

      expect(framesAwayFromTheKeptScroll(notes, '/sprava/platby', 0)).toEqual([]);
    },
  );

  testWithoutBrowser(
    'when no frame was sampled after the focus returned, or the focus never returned to the row while the scroll was watched, then the check fails instead of passing on nothing',
    () => {
      const notes = [
        { at: 0, what: 'frame', scrollY: 0, detail: 'focus h1' },
        { at: 10, what: 'focus', scrollY: 0, detail: 'a[href=/sprava/platby], row at 300' },
      ];

      expect(framesAwayFromTheKeptScroll(notes, '/sprava/platby', 0)).toEqual([
        'no frame was sampled after the focus returned, so no frame of the kept scroll was judged',
      ]);
      expect(framesAwayFromTheKeptScroll(notes, '/sprava/darci', 0)).toEqual([
        'the focus never returned to the row while the scroll was watched',
      ]);
    },
  );

  testWithoutBrowser(
    'when the page scrolled away after the focus returned and was put back before the next frame was sampled, then the scroll is reported though every frame stood at the kept scroll',
    () => {
      const href = '/sprava/darci/d1/vymaz';
      const notes = [
        { at: 0, what: 'focus', scrollY: 0, detail: `a.ui-list__row[href=${href}], row at 670` },
        { at: 900, what: 'scroll', scrollY: 2, detail: 'document, row at 668' },
        { at: 901, what: 'scroll', scrollY: 0, detail: 'document, row at 670' },
        { at: 902, what: 'frame', scrollY: 0, detail: 'focus a.ui-list__row' },
      ];

      expect(framesAwayFromTheKeptScroll(notes, href, 0)).toEqual([
        'the page stood at 2 px instead of 0 px in a scroll 900 ms after the focus returned',
      ]);
    },
  );

  testWithoutBrowser(
    'when the watch has sampled a frame after the band lifted for the returned focus was given back, then the scroll has settled to be judged, and not before',
    () => {
      const href = '/sprava/platby';
      const focus = { at: 10, what: 'focus', scrollY: 0, detail: `a[href=${href}], row at 300` };
      const lifted = { at: 30, what: 'frame', scrollY: 0, lifted: true, detail: 'focus a' };
      const given = { at: 60, what: 'frame', scrollY: 0, lifted: false, detail: 'focus a' };

      expect(scrollWatchSettled([focus], href)).toBe(false);
      expect(scrollWatchSettled([focus, lifted], href)).toBe(false);
      expect(scrollWatchSettled([focus, lifted, given], href)).toBe(true);
      expect(scrollWatchSettled([focus, given], href)).toBe(true);
    },
  );

  testWithoutBrowser(
    'when the first moved frame of an opening is stamped 6 frames late, past the p99 lag, and every later frame lies on the curve from the start the browser set, as run 45566463009 drew it, then the judge finds nothing, since the anchor lies at most the p99 lag after that start and the spring covers the jump between them at its steepest',
    () => {
      const shots = [
        { at: 27383.4, offset: 390 },
        { at: 27533.4, offset: 345 },
        { at: 27583.4, offset: 27 },
        { at: 27616.8, offset: 15 },
        { at: 27650.1, offset: 9 },
        { at: 27683.4, offset: 4 },
        { at: 27716.8, offset: 2 },
        { at: 27750.1, offset: 1 },
        { at: 27783.4, offset: 0 },
      ];

      expect(
        judgedOnTheScreen(
          motionOf(shots, {
            from: 390,
            to: 0,
            curve: [0.32, 0.72, 0, 1],
            durationMs: 350,
            placedAt: 27267.3,
            startTime: 27416.8,
            anchor: 'first-moved',
            lagFrames: 3,
            measurePx: 2,
          }),
        ),
      ).toEqual([]);
    },
  );

  const shownLate = (firstShare: number, shownBeforeAt: number | null, lagFrames = 0) =>
    motionOf(
      [firstShare, 0.72, 0.8, 0.86, 0.98, 1].map((share, index) => ({
        at: 1017 + index * 17,
        offset: Math.round(share * 390),
      })),
      {
        to: 390,
        curve: [0.32, 0.72, 0, 1],
        durationMs: 350,
        placedAt: 900,
        startTime: 950,
        anchor: 'first-moved',
        lagFrames,
        shownBeforeAt,
      },
    );
  const firstShownJump = /^the first frame the screen showed of the step was already/;

  testWithoutBrowser(
    'when the first frame the screen shows of a step is already 60 % of its way one frame after the frame before it, as the iPhone SE’s recording showed the step back from an article in round 29 (219 to 240 of 375 px) with its frames at their own times, then the judge reports the jump at the start, though every frame lies on the curve from the start the browser set',
    () => {
      expect(judgedOnTheScreen(shownLate(0.6, 1000))).toEqual(
        expect.arrayContaining([expect.stringMatching(firstShownJump)]),
      );
    },
  );

  testWithoutBrowser(
    'when the same first frame at 60 % comes from a screencast stamped up to CI’s p99 lag of 3 frames late, then the judge cannot tell it from a step whose first frames were stamped late and reports nothing, so on CI it judges a jump at the start only on a long step, as the planted one, and the iPhone’s case is the simulator’s to decide',
    () => {
      expect(judgedOnTheScreen(shownLate(0.6, 1000, 3))).not.toEqual(
        expect.arrayContaining([expect.stringMatching(firstShownJump)]),
      );
    },
  );

  testWithoutBrowser(
    'when the first frame the screen shows of a step lies within the travel of its curve’s first 2 steady frames, as main showed the same step (48 of 375 px), then the judge reports no jump at the start',
    () => {
      expect(judgedOnTheScreen(shownLate(0.13, 1000))).not.toEqual(
        expect.arrayContaining([expect.stringMatching(firstShownJump)]),
      );
    },
  );

  testWithoutBrowser(
    'when the screencast drew nothing for 200 ms before the first frame it shows of a step, then the curve may have covered that far meanwhile and the judge reports no jump at the start, nor when no frame came before it at all',
    () => {
      expect(judgedOnTheScreen(shownLate(0.6, 1017 - 200))).not.toEqual(
        expect.arrayContaining([expect.stringMatching(firstShownJump)]),
      );
      expect(judgedOnTheScreen(shownLate(0.6, null))).not.toEqual(
        expect.arrayContaining([expect.stringMatching(firstShownJump)]),
      );
    },
  );

  testWithoutBrowser(
    'when the page runs ahead of the curve from the start the browser set, by more than the tolerance, then the judge still reports it with the anchor capped at that start and the lag',
    () => {
      const shots = [
        { at: 1000, offset: 0 },
        { at: 1050, offset: 170 },
        { at: 1100, offset: 220 },
        { at: 1300, offset: 300 },
      ];

      expect(
        judgedOnTheScreen(
          motionOf(shots, { anchor: 'first-moved', startTime: 1000, lagFrames: 3 }),
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /^the motion on the screen started \d+ ms before both copies were placed|^the page ran ahead of its curve on the screen/,
          ),
        ]),
      );
    },
  );

  testWithoutBrowser(
    'when the page leaves its rest already 240 ms into its motion while the browser’s start lies late after the placing, as the planted start in the past did on CI, then the judge reports the jump from rest, whatever start the browser reports',
    () => {
      const shots = [
        { at: 1300, offset: 0 },
        { at: 1317, offset: 0 },
        { at: 1334, offset: 264 },
        { at: 1351, offset: 270 },
        { at: 1600, offset: 300 },
      ];

      expect(
        judgedOnTheScreen(
          motionOf(shots, {
            anchor: 'first-moved',
            startTime: 1317 - 240,
            placedAt: 1000,
            durationMs: 300,
            lagFrames: 3,
          }),
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /^the page ran ahead of its curve on the screen: it went from 0\.0 % to 88\.0 % of its way in 17 ms/,
          ),
        ]),
      );
    },
  );

  for (const lateMs of [0, 150, 300]) {
    testWithoutBrowser(
      `when the planted start in the past shifts a ${PLANTED_STEP_MS} ms spring step 240 ms ahead and the browser starts it ${lateMs} ms after the placing, then the judge reports it`,
      () => {
        const spring = [0.32, 0.72, 0, 1];
        const startTime = 1000 + lateMs;
        const offsetAt = (elapsedMs: number): number => {
          let low = 0;
          let high = 1;
          const bezier = (one: number, two: number, t: number): number =>
            3 * (1 - t) * (1 - t) * t * one + 3 * (1 - t) * t * t * two + t * t * t;
          for (let step = 0; step < 50; step++) {
            const middle = (low + high) / 2;
            if (bezier(0.32, 0, middle) < Math.min(1, elapsedMs / PLANTED_STEP_MS)) {
              low = middle;
            } else {
              high = middle;
            }
          }
          return Math.round(300 * bezier(0.72, 1, low));
        };
        const shots = [
          { at: startTime - 16.7, offset: 0 },
          ...Array.from({ length: 50 }, (_, frame) => ({
            at: startTime + (frame + 1) * 16.7 + 16.7,
            offset: offsetAt((frame + 1) * 16.7 + 240),
          })),
        ];

        expect(
          judgedOnTheScreen(
            motionOf(shots, {
              anchor: 'first-moved',
              curve: spring,
              durationMs: PLANTED_STEP_MS,
              placedAt: 1000,
              startTime: startTime - 240,
              lagFrames: STAMP_LAG_P99_FRAMES,
            }),
          ),
        ).not.toEqual([]);
      },
    );
  }

  for (const placedAt of [2212.2, 2240]) {
    testWithoutBrowser(
      `when the planted start in the past shows on the screen as run 45575669991 drew it, its first moved frame still unshifted at 15 px and the next 17 ms later at 318 px, with both copies placed at ${placedAt} ms, then the judge reports the jump between those frames`,
      () => {
        const lines = [0, 15, 318, 326, 333, 339, 344, 349, 353, 356, 359, 362, 365, 367, 369, 371];
        const shots = lines.map((offset, frame) => ({ at: 2392 + frame * 16.7, offset }));

        expect(
          judgedOnTheScreen(
            motionOf(shots, {
              from: 0,
              to: 390,
              curve: [0.32, 0.72, 0, 1],
              durationMs: 1000,
              placedAt,
              startTime: 2134.9,
              anchor: 'first-moved',
              lagFrames: 3,
              measurePx: 2,
            }),
          ),
        ).toEqual(
          expect.arrayContaining([
            expect.stringMatching(
              /^the page ran ahead of its curve on the screen: it went from 3\.8 % to 81\.5 % of its way in 17 ms/,
            ),
          ]),
        );
      },
    );
  }

  for (const { run, placedAt, startTime, screen } of [
    {
      run: 'slow #4',
      placedAt: 2672.4,
      startTime: 2603.5,
      screen: [
        [2860.2, 0],
        [2876.9, 15],
        [2893.6, 31],
        [2910.2, 326],
        [2926.9, 333],
        [2943.6, 339],
        [2960.2, 344],
        [2976.9, 349],
      ],
    },
    {
      run: 'slow #7',
      placedAt: 2640.1,
      startTime: 2563.8,
      screen: [
        [2820.5, 0],
        [2853.8, 15],
        [2870.5, 31],
        [2887.1, 48],
        [2903.8, 333],
        [2920.5, 339],
        [2937.1, 344],
        [2953.8, 349],
      ],
    },
  ]) {
    testWithoutBrowser(
      `when the planted start in the past shows on the Prodesk’s screencast at CPU 2× (${run}, the browser starting the step late after the placing, the plant leaving the start under 100 ms before it), then the judge reports the jump from the unshifted frames to the shifted ones with room to spare`,
      () => {
        expect(
          judgedOnTheScreen(
            motionOf(
              screen.map(([at, offset]) => ({ at, offset })),
              {
                from: 0,
                to: 390,
                curve: [0.32, 0.72, 0, 1],
                durationMs: 1000,
                placedAt: placedAt + 200,
                startTime,
                anchor: 'first-moved',
                lagFrames: 3,
                measurePx: 2,
              },
            ),
          ),
        ).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/^the page ran ahead of its curve on the screen: it went from/),
          ]),
        );
      },
    );
  }

  testWithoutBrowser(
    'when the screencast delivers a frame after a later one, as run 45538927322 did (6849.7 ms before 6833.0 ms), then the judge reads the frames in the order of their time and finds nothing on a motion that lies on its curve',
    () => {
      const inTime = onTheCurve([0, 17, 33, 50, 67, 150, 300, 317]);
      const delivered = [inTime[0], inTime[2], inTime[1], ...inTime.slice(3)];

      expect(judgedOnTheScreen(motionOf(delivered))).toEqual([]);
    },
  );

  testWithoutBrowser(
    'when frames delivered out of order show the page going back in the order of their time, then the judge still reports it',
    () => {
      const shots = [
        { at: 1000, offset: 0 },
        { at: 1050, offset: 120 },
        { at: 1033, offset: 150 },
        { at: 1067, offset: 140 },
        { at: 1300, offset: 300 },
      ];

      expect(judgedOnTheScreen(motionOf(shots))).toEqual(
        expect.arrayContaining([expect.stringMatching(/^the page went back on the screen/)]),
      );
    },
  );

  testWithoutBrowser(
    'when the back matrix judges on the PR gate, then it takes the larger of the Prodesk’s p99 stamp lag and the reviewed CI p99 of real step frames, 3.00: the first move within 3 + 3 = 6 frames of the placing and ahead only beyond 1.5 + 3.00 = 4.50 steady frames',
    () => {
      expect(PRODESK_STAMP_LAG_P99_FRAMES).toBe(2.03);
      expect(STAMP_LAG_P99_FRAMES).toBe(3);
      expect(movesWithinFramesOfThePlacing(STAMP_LAG_P99_FRAMES)).toBe(6);
      expect(aheadAtMostFrames(STAMP_LAG_P99_FRAMES)).toBeCloseTo(4.5);
    },
  );

  for (const lag of [2.03, 3, 3.4, 6]) {
    testWithoutBrowser(
      `when a worker judges with a stamp lag of ${lag} frames, then the planted start in the past lies at least twice the judge’s tolerance before its time, 240 ms where that is enough, and the planted start before the placing one frame more than 1 plus the lag, and the judge reports both`,
      () => {
        const toleranceMs = aheadAtMostFrames(lag) * 16.7;
        const pastMs = plantedPastMs(lag);
        const framesBefore = plantedStartFramesBeforeThePlacing(lag);

        expect(pastMs).toBeGreaterThanOrEqual(2 * toleranceMs);
        expect(pastMs).toBe(Math.max(240, pastMs));
        expect(framesBefore).toBe(Math.ceil(1 + lag) + 1);
        const fromThePast = stampedLate(1000 - pastMs, lag * 16.7, [1017, 1033, 1050, 1300]);
        expect(judgedOnTheScreen(motionOf(fromThePast, { lagFrames: lag }))).toEqual(
          expect.arrayContaining([
            expect.stringMatching(
              /^the motion on the screen started \d+ ms before both copies were placed|^the page ran ahead of its curve on the screen/,
            ),
          ]),
        );
        const beforeThePlacing = stampedLate(
          1000 - framesBefore * 16.7,
          lag * 16.7,
          [1017, 1033, 1050, 1300],
        );
        expect(
          judgedOnTheScreen(motionOf(beforeThePlacing, { anchor: 'first-moved', lagFrames: lag })),
        ).toEqual(
          expect.arrayContaining([
            expect.stringMatching(
              /^the motion on the screen started \d+ ms before both copies were placed/,
            ),
          ]),
        );
      },
    );
  }

  testWithoutBrowser(
    'when every frame on the screen lies on the motion’s curve at its time, then the judge finds nothing',
    () => {
      expect(judgedOnTheScreen(motionOf(onTheCurve([0, 17, 33, 50, 67, 150, 300, 317])))).toEqual(
        [],
      );
    },
  );

  testWithoutBrowser(
    'when the screencast misses frames for 150 ms but the frames around the gap lie on the curve, then the gap is no failure',
    () => {
      expect(judgedOnTheScreen(motionOf(onTheCurve([0, 17, 167, 183, 300])))).toEqual([]);
    },
  );

  testWithoutBrowser(
    'when the page goes from rest to 87 % of its way, back to 45 % and on again, as a start the page moved later after the compositor drew it, then the judge reports the step back',
    () => {
      const shots = [
        { at: 1000, offset: 0 },
        { at: 1261, offset: 261 },
        { at: 1278, offset: 135 },
        { at: 1295, offset: 204 },
        { at: 1312, offset: 300 },
      ];

      expect(judgedOnTheScreen(motionOf(shots))).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /^the page went back on the screen from 87\.0 % to 45\.0 % of its way/,
          ),
        ]),
      );
    },
  );

  testWithoutBrowser(
    'when the first moved frame on the screen is half way already, then the judge reports it running ahead of the curve',
    () => {
      const shots = [
        { at: 1000, offset: 0 },
        { at: 1017, offset: 150 },
        { at: 1033, offset: 165 },
        { at: 1300, offset: 300 },
      ];

      expect(judgedOnTheScreen(motionOf(shots))).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^the page ran ahead of its curve on the screen/),
        ]),
      );
    },
  );

  testWithoutBrowser(
    'when the first moved frame on the screen gives a start well before both copies were placed, then the judge reports the jump at the start',
    () => {
      const shots = [
        { at: 1000, offset: 0 },
        { at: 1017, offset: 150 },
        { at: 1033, offset: 166 },
        { at: 1300, offset: 300 },
      ];

      expect(judgedOnTheScreen(motionOf(shots, { anchor: 'first-moved' }))).toEqual([
        expect.stringMatching(
          /^the motion on the screen started 133 ms before both copies were placed/,
        ),
        expect.stringMatching(
          /^the page ran ahead of its curve on the screen: it went from 0\.0 % to 50\.0 % of its way in 17 ms/,
        ),
      ]);
    },
  );

  testWithoutBrowser(
    'when a frame on the screen lies 3 steady frames ahead of its curve and the screencast stamps frames up to 2.03 frames late, then it lies within the tolerance of 1.5 + 2.03 steady frames',
    () => {
      const shots = [
        { at: 1000, offset: 0 },
        ...onTheCurve([17, 33]).map((shot) => ({ ...shot, offset: shot.offset + 50 })),
        { at: 1400, offset: 300 },
      ];

      expect(judgedOnTheScreen(motionOf(shots, { lagFrames: 2.03 }))).toEqual([]);
    },
  );

  testWithoutBrowser(
    'when a frame on the screen lies 4 steady frames ahead of its curve and the screencast stamps frames up to 2.03 frames late, then the page ran ahead of its curve',
    () => {
      const shots = [
        { at: 1000, offset: 0 },
        ...onTheCurve([17, 33]).map((shot) => ({ ...shot, offset: shot.offset + 67 })),
        { at: 1400, offset: 300 },
      ];

      expect(judgedOnTheScreen(motionOf(shots, { lagFrames: 2.03 }))).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^the page ran ahead of its curve on the screen/),
        ]),
      );
    },
  );

  testWithoutBrowser(
    'when the motion started 5 steady frames before both copies were placed and the screencast stamps its frames 2.94 frames late, the p99 stamp lag, then the start the first moved frame gives still lies more than one steady frame before the placing and the jump at the start is reported',
    () => {
      const shots = stampedLate(1000 - 5 * 16.7, 2.94 * 16.7, [1017, 1033, 1050, 1300]);

      expect(
        judgedOnTheScreen(motionOf(shots, { anchor: 'first-moved', lagFrames: 2.03 })),
      ).toEqual([
        expect.stringMatching(
          /^the motion on the screen started \d+ ms before both copies were placed/,
        ),
      ]);
    },
  );

  testWithoutBrowser(
    'when the browser started the motion 1 steady frame after both copies were placed and the screencast stamps its frames 1 frame late, its fastest, then the start the first moved frame gives is no jump',
    () => {
      const shots = stampedLate(1016.7, 16.7, [1033, 1050, 1067, 1400]);

      expect(
        judgedOnTheScreen(motionOf(shots, { anchor: 'first-moved', lagFrames: 2.03 })),
      ).toEqual([]);
    },
  );

  testWithoutBrowser(
    'when two reads of the probe’s line on the screen differ by 2 device pixels against the page’s way, as the screencast’s whole pixels allow, then it is no step back, while 3 pixels are one',
    () => {
      const rounded = [
        { at: 1000, offset: 0 },
        { at: 1200, offset: 200 },
        { at: 1217, offset: 198 },
        { at: 1300, offset: 300 },
      ];
      const further = [...rounded.slice(0, 2), { at: 1217, offset: 197 }, rounded[3]];

      expect(judgedOnTheScreen(motionOf(rounded, { measurePx: 2 }))).toEqual([]);
      expect(judgedOnTheScreen(motionOf(further, { measurePx: 2 }))).toEqual([
        expect.stringMatching(/^the page went back on the screen/),
      ]);
    },
  );

  testWithoutBrowser(
    'when the screen shows the page only at rest and at its end, then the step has too few frames to be judged and fails',
    () => {
      expect(
        judgedOnTheScreen(
          motionOf([
            { at: 1000, offset: 0 },
            { at: 1400, offset: 300 },
          ]),
        ),
      ).toEqual([
        'the screencast showed 0 frames of the page between its rest and its end, too few to judge it on the screen',
      ]);
    },
  );

  testWithoutBrowser(
    'when two frames 120 ms apart show the page at the same place while its curve went on, then the page froze on the screen',
    () => {
      const shots = [
        ...onTheCurve([0, 17, 33]),
        { at: 1153, offset: 33 },
        ...onTheCurve([170, 300]),
      ];

      expect(frozenOnTheScreen(motionOf(shots))).toEqual([
        expect.stringMatching(
          /^the page stood still on the screen for 120 ms at 11\.0 % of its way/,
        ),
      ]);
    },
  );

  testWithoutBrowser(
    'when a frame between the tap and the placing lasts 80 ms of the app’s own work, then the placing on every PR judges only the frames drawn since the tap, and the long frame is left to the nightly of #1982',
    () => {
      expect(placingProblems(placedAfter([16.7, 80], [0.4, 0]))).toEqual([]);
      expect(longFrameProblems(placedAfter([16.7, 80], [0.4, 0]))).not.toEqual([]);
    },
  );

  test('when the app marks a placing as made inside a frame, by its frame callback or a resize observer, and the probe’s own wrappers saw it outside any, then the judge reports the mark, since the app would let the motion go in the frame that first paints the copies', () => {
    for (const kind of ['raf', 'resize-observer']) {
      expect(placingKindProblems({ placingKind: kind, placedInFrame: false } as StepProbe)).toEqual(
        [
          `the app marked its placing as ${kind}, inside a frame, but the probe saw it made outside any frame callback or resize observer`,
        ],
      );
    }
  });

  test('when the app’s mark of the placing agrees with where the probe saw it made, or the app marks a placing made inside a frame as made in a task and so holds it one frame longer, then the judge reports nothing, and the first move counts from the frame the probe saw', () => {
    expect(placingKindProblems({ placingKind: 'raf', placedInFrame: true } as StepProbe)).toEqual(
      [],
    );
    expect(
      placingKindProblems({ placingKind: 'resize-observer', placedInFrame: true } as StepProbe),
    ).toEqual([]);
    expect(placingKindProblems({ placingKind: 'task', placedInFrame: false } as StepProbe)).toEqual(
      [],
    );
    expect(placingKindProblems({ placingKind: 'task', placedInFrame: true } as StepProbe)).toEqual(
      [],
    );
    expect(placingKindProblems({ placingKind: null, placedInFrame: null } as StepProbe)).toEqual(
      [],
    );
  });

  test('when a frame between the tap and the placing lasts 80 ms, 35 ms of them the probe’s own reads, then the app’s 45 ms lie within three steady frames', () => {
    expect(longFrameProblems(placedAfter([16.7, 80], [0.4, 35]))).toEqual([]);
  });

  test('when a frame between the tap and the placing lasts 80 ms, only 10 ms of them the probe’s own reads, then the app’s 70 ms are a long frame', () => {
    expect(longFrameProblems(placedAfter([16.7, 80], [0.4, 10]))).toEqual([
      expect.stringMatching(
        /^the app's own work in a frame between the tap and the placing lasted 70\.0 ms \(80\.0 ms less the probe's own reads of 10\.0 ms\), longer than 3 steady frames of 16\.7 ms/,
      ),
    ]);
  });

  test('when a browser that reads a transform by its live clock reads a frame 3 ms after its time, then the page moved by the time of the reads is no jump', () => {
    expect(() => expectNoJump(probeOf(true), readLater, width)).not.toThrow();
  });

  test('when a browser that reads a transform at the time of its frame reads it later, then the same frames are still a jump', () => {
    expect(() => expectNoJump(probeOf(false), readLater, width)).toThrow(/the page jumped/);
  });

  const slideFrame = (at: number, offset: number): Frame =>
    ({
      ...frameAt(at, at, offset),
      motion: { durationMs: 50, curve: [0, 0, 1, 1], startTime: 1000, name: 'script', toPx: 390 },
    }) as Frame;

  test('when a finger lets go with a flick and the page slides on by its own running animation, steeper than the page’s curve, then frames on that slide’s own curve are no jump', () => {
    const slide = [slideFrame(1000, 200), slideFrame(1010, 238), slideFrame(1020, 276)];

    expect(() => expectNoJump(probeOf(false), slide, width)).not.toThrow();
  });

  test('when a page’s slide after a lift outruns the curve of its own running animation, a regression planted to prove the judge, then the judge reports the jump', () => {
    const outrunning = [slideFrame(1000, 200), slideFrame(1010, 260), slideFrame(1020, 320)];

    expect(() => expectNoJump(probeOf(false), outrunning, width)).toThrow(
      /the page jumped 60 px in 10 ms, faster than its own slide/,
    );
  });

  test('when a browser whose clock counts whole milliseconds reads two frames in the same millisecond, then a page moved by what one millisecond allows is no jump', () => {
    const sameMillisecond = [frameAt(1000, 1000, 100), frameAt(1001, 1000, 100 + offsetIn(1) + 1)];

    expect(() => expectNoJump(probeOf(true), sameMillisecond, width)).not.toThrow();
  });

  test('when a browser whose clock counts whole milliseconds reads two frames in the same millisecond, then a page moved further than one millisecond allows is still a jump', () => {
    const sameMillisecond = [frameAt(1000, 1000, 100), frameAt(1001, 1000, 100 + offsetIn(3) + 2)];

    expect(() => expectNoJump(probeOf(true), sameMillisecond, width)).toThrow(/the page jumped/);
  });

  test('when the moving layer is there as the probe starts and gone before its first frame, then the probe ends within a second', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const layer = document.createElement('div');
      layer.className = 'page-transition';
      document.body.append(layer);
      const removeOnceWatched = (): void => {
        if (window.nfnnStepProbe === undefined) {
          requestAnimationFrame(removeOnceWatched);
        } else {
          layer.remove();
        }
      };
      requestAnimationFrame(removeOnceWatched);
    });

    await watchTheStep(page);

    await expect
      .poll(() => page.evaluate(() => window.nfnnStepProbe?.done ?? false), { timeout: 1000 })
      .toBe(true);
  });
});
