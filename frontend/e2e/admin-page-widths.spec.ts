import type { Locator, Page } from '@playwright/test';
import {
  donorWithDonations,
  mockAdministration,
  PETR_DETAIL_PATH,
  rememberedSession,
  serveEmptyAdministrationCopy,
} from './baseline/screen-mocks';
import { mockDonorApi, whenAdministrationCopied } from './donor-session';
import { ADMINISTRATION_LOCKED, expect, test } from './fixtures';

const HEIGHT = 900;
const WHERE_THE_FULL_WIDTH_REACHES_THE_AVATAR = 1280;
const WHERE_THE_FORM_WIDTH_STAYS_NARROWER = 1920;

const FULL_WIDTH_PAGES = [
  '/sprava',
  '/sprava/platby',
  '/sprava/darci',
  PETR_DETAIL_PATH,
  '/sprava/aktuality',
  '/sprava/projekty',
  '/sprava/hromadna-potvrzeni',
  '/sprava/spravci',
  '/sprava/starsi-symboly',
  '/sprava/loga-bank',
  '/sprava/lide-fondu',
  '/sprava/historie',
  '/sprava/zalohy/historie',
  '/sprava/logy/soubor?nazev=backend.log',
] as const;

const FORM_WIDTH_PAGES = [
  '/sprava/nastaveni',
  '/sprava/logy',
  '/sprava/logy/soubory',
  '/sprava/logy/urovne',
  '/sprava/logy/stav',
  '/sprava/logy/vlakna',
  '/sprava/aktuality/nova',
  '/sprava/projekty/nova',
  '/sprava/o-nas',
  '/sprava/pruh-prispet',
  '/sprava/prehledy',
  '/sprava/zalohy',
  '/sprava/upozorneni',
  '/sprava/overit',
] as const;

interface Edges {
  readonly left: number;
  readonly contentLeft: number;
  readonly contentRight: number;
  readonly widestCardRight: number;
  readonly avatarRight: number;
  readonly pansSideways: boolean;
}

async function openUnlocked(page: Page, path: string): Promise<void> {
  await mockDonorApi(page, donorWithDonations);
  await mockAdministration(page);
  await serveEmptyAdministrationCopy(page);
  await rememberedSession(page);
  const copied = whenAdministrationCopied(page);
  await page.goto(path);
  await expect(page.locator('h1').first()).not.toHaveText(ADMINISTRATION_LOCKED);
  await copied();
}

function pageBox(page: Page): Locator {
  return page.locator('.admin-page .container').first();
}

async function edgesAt(page: Page, width: number): Promise<Edges> {
  await page.setViewportSize({ width, height: HEIGHT });
  await expect(pageBox(page)).toBeVisible();
  const avatar = await page
    .getByRole('banner')
    .getByRole('button', { name: /^Účet/ })
    .boundingBox();
  expect(avatar).not.toBeNull();
  const edges = await pageBox(page).evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const paddingRight = parseFloat(style.paddingRight);
    const cards = Array.from(element.querySelectorAll('.ui-card')).map(
      (card) => card.getBoundingClientRect().right,
    );
    return {
      left: box.left,
      contentLeft: box.left + parseFloat(style.paddingLeft),
      contentRight: box.right - paddingRight,
      widestCardRight: Math.max(box.left, ...cards),
      pansSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  return { ...edges, avatarRight: avatar!.x + avatar!.width };
}

function expectWithinTheAvatar(edges: Edges): void {
  expect(edges.contentRight).toBeLessThanOrEqual(edges.avatarRight + 0.5);
  expect(edges.widestCardRight).toBeLessThanOrEqual(edges.avatarRight + 0.5);
  expect(edges.pansSideways).toBe(false);
}

test.describe('Given an administrator on a computer', () => {
  for (const path of FULL_WIDTH_PAGES) {
    test(`when ${path} opens at 1280 and 1920 px, then it takes the full width and ends on the avatar's axis`, async ({
      page,
    }) => {
      await openUnlocked(page, path);

      const narrow = await edgesAt(page, WHERE_THE_FULL_WIDTH_REACHES_THE_AVATAR);
      expectWithinTheAvatar(narrow);
      expect(narrow.contentRight).toBeCloseTo(narrow.avatarRight, 0);

      const wide = await edgesAt(page, WHERE_THE_FORM_WIDTH_STAYS_NARROWER);
      expectWithinTheAvatar(wide);
      expect(wide.contentRight).toBeCloseTo(wide.avatarRight, 0);
    });
  }

  for (const path of FORM_WIDTH_PAGES) {
    test(`when ${path} opens at 1280 and 1920 px, then it takes the form width and stays inside the avatar's axis`, async ({
      page,
    }) => {
      await openUnlocked(page, path);

      const narrow = await edgesAt(page, WHERE_THE_FULL_WIDTH_REACHES_THE_AVATAR);
      expectWithinTheAvatar(narrow);

      const wide = await edgesAt(page, WHERE_THE_FORM_WIDTH_STAYS_NARROWER);
      expectWithinTheAvatar(wide);
      expect(wide.contentRight).toBeLessThan(wide.avatarRight - 1);
      expect(wide.contentRight - wide.left).toBeCloseTo(narrow.contentRight - narrow.left, 0);
    });
  }
});

function contentWidth(edges: Edges): number {
  return edges.contentRight - edges.contentLeft;
}

async function textSize(page: Page, percent: number): Promise<void> {
  await page.addStyleTag({ content: `html { font-size: ${percent}%; }` });
}

async function rightOfCardContent(field: Locator): Promise<{ field: number; card: number }> {
  return field.evaluate((element) => {
    const card = element.closest('.ui-card');
    if (card === null) {
      throw new Error('the field is outside a card');
    }
    const cell = element.closest('.ui-card__body') ?? card;
    const style = getComputedStyle(cell);
    return {
      field: element.getBoundingClientRect().right,
      card:
        cell.getBoundingClientRect().right -
        parseFloat(style.paddingRight) -
        parseFloat(style.borderRightWidth),
    };
  });
}

test.describe('Given an administrator on a form page on a computer', () => {
  test('when the text grows, then the form width grows with it, measured on the content, until it reaches the avatar', async ({
    page,
  }) => {
    await openUnlocked(page, '/sprava/nastaveni');
    const atDefault = await edgesAt(page, WHERE_THE_FORM_WIDTH_STAYS_NARROWER);

    await textSize(page, 125);
    const larger = await edgesAt(page, WHERE_THE_FORM_WIDTH_STAYS_NARROWER);
    expect(contentWidth(larger)).toBeCloseTo(contentWidth(atDefault) * 1.25, 0);

    await textSize(page, 200);
    const largest = await edgesAt(page, WHERE_THE_FORM_WIDTH_STAYS_NARROWER);
    expectWithinTheAvatar(largest);
    expect(largest.contentRight).toBeCloseTo(largest.avatarRight, 0);
  });

  for (const [path, wide] of [
    ['/sprava/prehledy', '#report-recipients'],
    ['/sprava/aktuality/nova', '#news-title'],
    ['/sprava/projekty/nova', '#projects-title'],
  ] as const) {
    test(`when ${path} opens, then its wide field fills the card`, async ({ page }) => {
      await page.setViewportSize({
        width: WHERE_THE_FULL_WIDTH_REACHES_THE_AVATAR,
        height: HEIGHT,
      });
      await openUnlocked(page, path);
      const field = page.locator(wide);
      await expect(field).toBeVisible();

      const edges = await rightOfCardContent(field);
      expect(edges.field).toBeCloseTo(edges.card, 0);
    });
  }

  test('when Zálohy opens, then its times and day stay short, as the day and hour of Měsíční e-mail, with the day and time of the test restore side by side', async ({
    page,
  }) => {
    await page.setViewportSize({ width: WHERE_THE_FULL_WIDTH_REACHES_THE_AVATAR, height: HEIGHT });
    await openUnlocked(page, '/sprava/zalohy');
    const time = page.locator('#test-restore-time');
    await expect(time).toBeVisible();
    const card = await time.evaluate((element) => {
      const box = element.closest('.ui-card')!;
      const style = getComputedStyle(box);
      return (
        box.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight)
      );
    });

    for (const short of ['#backup-time', '#test-restore-day', '#test-restore-time']) {
      const box = await page.locator(short).boundingBox();
      expect(box!.width).toBeLessThan(card / 2);
    }
    const day = await page.locator('#test-restore-day').boundingBox();
    const restoreTime = await time.boundingBox();
    expect(restoreTime!.y).toBeCloseTo(day!.y, 0);
    expect(restoreTime!.x).toBeGreaterThan(day!.x + day!.width);
  });

  test('when Měsíční e-mail opens, then its day and hour stay short beside the recipients filling the card', async ({
    page,
  }) => {
    await page.setViewportSize({ width: WHERE_THE_FULL_WIDTH_REACHES_THE_AVATAR, height: HEIGHT });
    await openUnlocked(page, '/sprava/prehledy');
    const recipients = await page.locator('#report-recipients').boundingBox();

    for (const short of ['#report-send-day', '#report-send-hour']) {
      const box = await page.locator(short).boundingBox();
      expect(box!.width).toBeLessThan(recipients!.width / 2);
    }
  });
});

test.describe('Given an administrator who opens Občas a pro technika', () => {
  test('when a computer opens its address, then the overview opens in its place and the side navigation does not list it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: HEIGHT });
    await openUnlocked(page, '/sprava/vice');

    await expect(page).toHaveURL(/\/sprava$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Správa', exact: true }),
    ).toBeVisible();
    const sideNav = page.getByRole('navigation', { name: 'Správa' });
    await expect(sideNav.getByRole('link', { name: 'Přehled' })).toBeVisible();
    await expect(sideNav.locator('a[href="/sprava/vice"]')).toHaveCount(0);
  });

  test('when a phone opens it and the window then widens to a computer, then the overview takes its place', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openUnlocked(page, '/sprava/vice');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Občas a pro technika' }),
    ).toBeVisible();

    await page.setViewportSize({ width: 1280, height: HEIGHT });

    await expect(page).toHaveURL(/\/sprava$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Správa', exact: true }),
    ).toBeVisible();
  });
});

interface FileNameLines {
  readonly found: number;
  readonly brokenInside: number;
  readonly overflowing: number;
}

function backupFileNameLines(page: Page, name: string): Promise<FileNameLines> {
  return page.locator('.admin-page').evaluate((root, fileName) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const ranges: Range[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(fileName) ?? -1;
      if (at >= 0) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + fileName.length);
        ranges.push(range);
      }
    }
    const lines = (range: Range): number =>
      new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
    const overflows = (range: Range): boolean => {
      const card = range.startContainer.parentElement?.closest('.ui-card');
      if (!card) {
        return false;
      }
      const cardBox = card.getBoundingClientRect();
      return range.getBoundingClientRect().right > cardBox.right + 0.5;
    };
    return {
      found: ranges.length,
      brokenInside: ranges.filter((range) => lines(range) > 1).length,
      overflowing: ranges.filter(overflows).length,
    };
  }, name);
}

test.describe('Given an administrator on Zálohy on a computer', () => {
  for (const percent of [100, 200]) {
    test(`when the page opens at 1280 px with ${percent} % text, then a backup's file name stays whole on its line and never runs out of its card`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: WHERE_THE_FULL_WIDTH_REACHES_THE_AVATAR,
        height: HEIGHT,
      });
      await openUnlocked(page, '/sprava/zalohy');
      if (percent !== 100) {
        await textSize(page, percent);
      }
      await expect(page.getByText('nfnn-2026-10-25_0300.dump').first()).toBeVisible();

      const lines = await backupFileNameLines(page, 'nfnn-2026-10-25_0300.dump');
      expect(lines.found).toBeGreaterThan(0);
      expect(lines.brokenInside).toBe(0);
      expect(lines.overflowing).toBe(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    });
  }
});

const TEXT_COLUMN_MINIMUM_EM = 12;

interface AdministratorRowLayout {
  readonly textColumnEm: number;
  readonly emailLines: number;
  readonly badgeOverButton: boolean;
}

async function administratorRows(page: Page): Promise<AdministratorRowLayout[]> {
  return page.locator('.administrator-row').evaluateAll((rows) =>
    rows.map((row) => {
      const text = row.querySelector('.administrator-text') as HTMLElement;
      const email = row.querySelector('.ui-person-row__meta') as HTMLElement;
      const linesOf = (element: Element) => {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(element);
        return new Set(Array.from(range.getClientRects(), (box) => Math.round(box.bottom))).size;
      };
      const overlaps = (a: DOMRect, b: DOMRect) =>
        a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const badges = Array.from(row.querySelectorAll('.ui-badge')).map((badge) =>
        badge.getBoundingClientRect(),
      );
      const buttons = Array.from(row.querySelectorAll('button')).map((button) =>
        button.getBoundingClientRect(),
      );
      return {
        textColumnEm:
          text.getBoundingClientRect().width / parseFloat(getComputedStyle(text).fontSize),
        emailLines: linesOf(email),
        badgeOverButton: badges.some((badge) => buttons.some((button) => overlaps(badge, button))),
      };
    }),
  );
}

test.describe('Given an administrator on Správci on a narrow computer', () => {
  for (const [width, percent] of [
    [900, 100],
    [1000, 200],
  ] as const) {
    test(`when the page opens at ${width} px with ${percent} % text, then the text column keeps its minimum width and no badge lies over a button`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: HEIGHT });
      await openUnlocked(page, '/sprava/spravci');
      if (percent !== 100) {
        await textSize(page, percent);
      }
      await expect(page.getByRole('button', { name: 'Odebrat roli správce' })).toBeVisible();

      const rows = await administratorRows(page);
      expect(rows.length).toBeGreaterThan(1);
      for (const row of rows) {
        expect(row.textColumnEm).toBeGreaterThanOrEqual(TEXT_COLUMN_MINIMUM_EM);
        expect(row.emailLines).toBe(1);
        expect(row.badgeOverButton).toBe(false);
      }
    });
  }
});

const TABLET = { width: 820, height: 1180 } as const;
const PHONE = { width: 390, height: 844 } as const;
const INSTALLED_APP_ROOT_PX = 17;

interface ColumnEdges {
  readonly contentLeft: number;
  readonly contentRight: number;
  readonly cardLeft: number;
  readonly cardRight: number;
  readonly backLeft: number;
  readonly accountRight: number;
}

async function columnAgainstTheHeader(page: Page): Promise<ColumnEdges> {
  const banner = page.getByRole('banner');
  const back = await banner.getByRole('button', { name: 'Zpět' }).boundingBox();
  const account = await banner.getByRole('button', { name: /^Účet/ }).boundingBox();
  const column = await pageBox(page).evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const card = element.querySelector('form .ui-card')!.getBoundingClientRect();
    return {
      contentLeft: box.left + parseFloat(style.paddingLeft),
      contentRight: box.right - parseFloat(style.paddingRight),
      cardLeft: card.left,
      cardRight: card.right,
    };
  });
  return { ...column, backLeft: back!.x, accountRight: account!.x + account!.width };
}

function expectOnTheHeaderButtons(edges: ColumnEdges): void {
  for (const left of [edges.contentLeft, edges.cardLeft]) {
    expect(Math.abs(left - edges.backLeft)).toBeLessThanOrEqual(1);
  }
  for (const right of [edges.contentRight, edges.cardRight]) {
    expect(Math.abs(right - edges.accountRight)).toBeLessThanOrEqual(1);
  }
}

test.describe('Given an administrator in an editor on an upright tablet', () => {
  for (const path of ['/sprava/aktuality/nova', '/sprava/projekty/nova'] as const) {
    test(`when ${path} opens in a browser tab and in the home-screen app's ${INSTALLED_APP_ROOT_PX} px text, then the form's column runs from the back button's left edge to the account button's right edge`, async ({
      page,
    }) => {
      await page.setViewportSize(TABLET);
      await openUnlocked(page, path);
      await expect(
        page.locator('.admin-frame:not(.admin-sheet) .admin-page form .ui-card').first(),
      ).toBeVisible();

      expectOnTheHeaderButtons(await columnAgainstTheHeader(page));

      await page.addStyleTag({ content: `html { font-size: ${INSTALLED_APP_ROOT_PX}px; }` });
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
        .toBe(`${INSTALLED_APP_ROOT_PX}px`);
      expectOnTheHeaderButtons(await columnAgainstTheHeader(page));
    });
  }

  test('when a story opens, then its year stays a short field narrower than half its title', async ({
    page,
  }) => {
    await page.setViewportSize(TABLET);
    await openUnlocked(page, '/sprava/projekty/nova');
    const year = await page.locator('#projects-year').boundingBox();
    const title = await page.locator('#projects-title').boundingBox();

    expect(year!.width).toBeLessThan(title!.width / 2);
  });
});

async function gapsAroundTheIntro(page: Page): Promise<{ above: number; below: number }> {
  return page.locator('.admin-page .ui-page-intro').evaluate((intro) => {
    const head = intro.previousElementSibling!.getBoundingClientRect();
    const box = intro.getBoundingClientRect();
    const next = intro.parentElement!.querySelector('.ui-card')!.getBoundingClientRect();
    return { above: box.top - head.bottom, below: next.top - box.bottom };
  });
}

test.describe('Given an administrator on a content list in the sheet', () => {
  for (const viewport of [PHONE, TABLET]) {
    for (const [path, action] of [
      ['/sprava/aktuality', 'Nová aktualita'],
      ['/sprava/projekty', 'Nový příběh'],
    ] as const) {
      test(`when ${path} opens at ${viewport.width} px, then ${action} keeps the page's gap above the intro`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await openUnlocked(page, path);
        await expect(page.locator('.admin-sheet .ui-card').first()).toBeVisible();

        const gaps = await gapsAroundTheIntro(page);
        expect(gaps.above).toBeCloseTo(gaps.below, 0);
      });
    }
  }
});
