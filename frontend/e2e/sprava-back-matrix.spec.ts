import type { Page } from '@playwright/test';
import {
  administrationScreens,
  administrationScreensOf,
  HEIGHT,
  LOOKS,
  MOTION_GATES,
  onThePhone,
  openAdministrationAt,
  plannedAdministrationWalk,
  type Row,
  rowLink,
  SCREENS_SHOWN_ONLY_WITH_THEIR_DATA,
  walkRow,
  WAY_NAMES,
  skipWhereNotJudged,
  WAYS,
  WIDTH,
} from './back-matrix';
import { expect, test } from './fixtures';
import { runnerSpeedProblems, startMotionGate } from './runner-speed';

const PARTS = 4;
const PART_LONGEST_MS = 240_000;
const DONOR = '/sprava/darci/019a1c00-0000-7000-8000-00000000b001';
const HOME = ['/sprava'];
const MORE = ['/sprava', '/sprava/vice'];

const RECORDED_WALK: readonly WalkedRow[] = [
  ...['lide-fondu', 'platby', 'darci', 'aktuality', 'projekty', 'vice', 'zalohy'].map((page) => ({
    trail: HOME,
    href: `/sprava/${page}`,
  })),
  { trail: ['/sprava', '/sprava/darci'], href: DONOR },
  { trail: ['/sprava', '/sprava/aktuality'], href: '/sprava/aktuality/nova' },
  { trail: ['/sprava', '/sprava/projekty'], href: '/sprava/projekty/nova' },
  ...[
    'hromadna-potvrzeni',
    'overit',
    'o-nas',
    'pruh-prispet',
    'spravci',
    'prehledy',
    'upozorneni',
    'historie',
    'nastaveni',
    'logy',
    'starsi-symboly',
    'loga-bank',
  ].map((page) => ({ trail: MORE, href: `/sprava/${page}` })),
  ...['udaje', 'prihlaseni', 'bankovni-ucty', 'dary', 'potvrzeni', 'vymaz'].map((section) => ({
    trail: ['/sprava', '/sprava/darci', DONOR],
    href: `${DONOR}/${section}`,
  })),
  ...['urovne', 'vlakna'].map((page) => ({
    trail: [...MORE, '/sprava/logy'],
    href: `/sprava/logy/${page}`,
  })),
];

interface WalkedRow {
  readonly trail: readonly string[];
  readonly href: string;
}

async function rowOf(page: Page, { trail, href }: WalkedRow): Promise<Row> {
  const name = (await page.locator(`.admin-frame a[href="${href}"]`).first().innerText())
    .split('\n')[0]
    .trim();
  return { name, href, from: trail.at(-1)! };
}

test.beforeEach(({ page }, testInfo) => startMotionGate(page, testInfo.tags));

test.afterEach(async ({ page }, testInfo) => {
  expect(await runnerSpeedProblems(page), 'steps outside their budgets on this runner').toEqual([]);
  skipWhereNotJudged(testInfo);
});

test.describe('Given an administrator in the app on the home screen of a phone, whose walk of Správa is planned from its links', () => {
  test.use({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true });

  test.beforeEach(({ page }) => onThePhone(page, 'light'));

  test('when the walk is planned from the links of Správa, then it is the walk its parts take, and it reaches every screen of Správa but those shown only with their data', async ({
    page,
  }) => {
    test.setTimeout(PART_LONGEST_MS);
    const planned = await plannedAdministrationWalk(page, administrationScreensOf(page));

    expect(
      planned.map(({ trail, row }) => ({ trail, href: row.href })),
      'the walk the links of Správa give, which the parts take as recorded',
    ).toEqual(RECORDED_WALK);
    const seen = new Set(planned.map(({ row }) => row.href));
    expect(
      administrationScreens().filter((path) => !seen.has(path)),
      'a screen of Správa the walk did not reach',
    ).toEqual(Object.keys(SCREENS_SHOWN_ONLY_WITH_THEIR_DATA));
  });
});

for (const gate of MOTION_GATES) {
  for (const look of LOOKS) {
    for (const way of WAYS) {
      test.describe(`Given an administrator in the app on the home screen of a phone, in the ${look} appearance`, () => {
        test.use({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true });

        test.beforeEach(({ page }) => onThePhone(page, look));

        for (let part = 0; part < PARTS; part++) {
          test(
            `when ${WAY_NAMES[way]} on the sections and subpages of Správa in part ${part + 1} of ${PARTS} of its walk, then it travels back over the screen it came from without a jump, over one still background, with the scroll and the focus kept, ${gate.placed}, ${gate.firstHalf}`,
            { tag: [...gate.tags] },
            async ({ page }) => {
              test.setTimeout(PART_LONGEST_MS);
              const screens = administrationScreensOf(page);
              const mine = RECORDED_WALK.filter((_, index) => index % PARTS === part);
              for (const walked of mine) {
                for (const scrolled of [false, true]) {
                  await openAdministrationAt(page, walked.trail);
                  const row = await rowOf(page, walked);
                  await test.step(`${row.href}${scrolled ? ', scrolled' : ''}`, () =>
                    walkRow(page, screens, row, way, scrolled, rowLink(page, row)));
                }
              }
            },
          );
        }
      });
    }
  }
}
