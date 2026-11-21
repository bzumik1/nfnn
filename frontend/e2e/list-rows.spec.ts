import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

interface Part {
  readonly tag: string;
  readonly className?: string;
  readonly text?: string;
  readonly svg?: number;
  readonly children?: readonly Part[];
}

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
}

const DEFAULT_ROOT_PX = 16;
const SYSTEM_DEFAULT_ROOT_PX = 17;
const DOUBLE_ROOT_PX = 32;
const LARGEST_SYSTEM_ROOT_PX = 53;
const SUBPIXEL_PX = 1;
const PHONE_CARD_PX = 343;
const WIDE_PHONE_CARD_PX = 388;
const COMPUTER_CARD_PX = 640;
const LONG_TITLE =
  'Klíč k ověřovacím QR kódům se nepodařilo zkontrolovat a server to zkusí znovu za hodinu';
const LONG_META = 'Bez jména odesílatele · 2 dary · bez variabilního symbolu · poslední 20. 10.';

const tile = (svg: number): Part => ({
  tag: 'span',
  className: 'ui-list__lead ui-list__tile ui-list__tile--warning',
  children: [{ tag: 'svg', svg }],
});

const glyph = (svg: number): Part => ({
  tag: 'span',
  className: 'ui-list__lead ui-list__glyph',
  children: [{ tag: 'svg', svg }],
});

const avatar: Part = {
  tag: 'span',
  className: 'ui-list__lead',
  children: [{ tag: 'span', className: 'list-rows-avatar' }],
};

const listRow = (lead: Part | null, ...parts: Part[]): Part => ({
  tag: 'li',
  children: [
    {
      tag: 'div',
      className: 'ui-list__row',
      children: [...(lead ? [lead] : []), ...parts],
    },
  ],
});

const title = (text: string): Part => ({ tag: 'span', className: 'ui-list__title', text });
const meta = (text: string): Part => ({ tag: 'span', className: 'ui-list__meta', text });
const value = (text: string): Part => ({ tag: 'span', className: 'ui-list__value', text });
const state = (text: string): Part => ({ tag: 'span', className: 'ui-list__state', text });
const buttonValue = (text: string): Part => ({
  tag: 'span',
  className: 'ui-list__value',
  children: [{ tag: 'button', className: 'ui-button ui-button--small', text }],
});

const card = (...rows: Part[]): Part => ({
  tag: 'section',
  className: 'ui-card',
  children: [{ tag: 'ul', className: 'ui-list', children: rows }],
});

async function mount(page: Page, widthPx: number, root: Part, rootPx = DEFAULT_ROOT_PX) {
  await page.goto('/');
  await page.evaluate(
    ({ widthPx, root, rootPx }) => {
      const build = (part: Part): Element => {
        if (part.tag === 'svg') {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('width', String(part.svg));
          svg.setAttribute('height', String(part.svg));
          svg.setAttribute('viewBox', '0 0 24 24');
          svg.setAttribute('aria-hidden', 'true');
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', '12');
          circle.setAttribute('cy', '12');
          circle.setAttribute('r', '9');
          svg.append(circle);
          return svg;
        }
        const element = document.createElement(part.tag);
        if (part.className) {
          element.className = part.className;
        }
        if (part.text) {
          element.textContent = part.text;
        }
        for (const child of part.children ?? []) {
          element.append(build(child));
        }
        return element;
      };
      document.documentElement.style.fontSize = `${rootPx}px`;
      const host = document.createElement('div');
      host.id = 'list-rows-host';
      host.style.position = 'absolute';
      host.style.insetBlockStart = '0';
      host.style.insetInlineStart = '0';
      host.style.zIndex = '10000';
      host.style.inlineSize = `${widthPx}px`;
      host.append(build(root));
      for (const shown of host.querySelectorAll<HTMLElement>('.list-rows-avatar')) {
        shown.style.display = 'block';
        shown.style.inlineSize = '40px';
        shown.style.blockSize = '40px';
        shown.style.borderRadius = '50%';
      }
      document.body.append(host);
    },
    { widthPx, root, rootPx },
  );
}

async function boxOf(page: Page, selector: string, index = 0): Promise<Box> {
  return page
    .locator(`#list-rows-host ${selector}`)
    .nth(index)
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      };
    });
}

async function firstLineOf(page: Page, selector: string, index = 0): Promise<Box> {
  return page
    .locator(`#list-rows-host ${selector}`)
    .nth(index)
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const rect = range.getClientRects()[0];
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      };
    });
}

async function lineCountOf(page: Page, selector: string, index = 0): Promise<number> {
  return page
    .locator(`#list-rows-host ${selector}`)
    .nth(index)
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    });
}

const middle = (box: Box) => box.top + box.height / 2;

test.describe('Given a list row whose text runs over several lines', () => {
  for (const rootPx of [DEFAULT_ROOT_PX, DOUBLE_ROOT_PX]) {
    test(`when a tile, an icon or nothing leads it at a root of ${rootPx} px, then the tile and the icon stand on the middle of the title's first line`, async ({
      page,
    }) => {
      await mount(
        page,
        COMPUTER_CARD_PX,
        card(
          listRow(tile(18), title(LONG_TITLE), meta(LONG_META)),
          listRow(glyph(20), title(LONG_TITLE), meta(LONG_META)),
          listRow(tile(18), title('Platby')),
        ),
        rootPx,
      );

      expect(await lineCountOf(page, '.ui-list__title', 0)).toBeGreaterThanOrEqual(2);
      for (const [index, mark] of [
        [0, '.ui-list__tile'],
        [1, '.ui-list__glyph svg'],
        [2, '.ui-list__tile'],
      ] as const) {
        const line = await firstLineOf(page, '.ui-list__title', index);
        const lead = await boxOf(page, mark, index === 2 ? 1 : 0);
        expect(Math.abs(middle(lead) - middle(line))).toBeLessThanOrEqual(SUBPIXEL_PX);
      }
    });
  }

  test('when an avatar taller than a line leads it, then the avatar stands on the middle of the first line too', async ({
    page,
  }) => {
    await mount(
      page,
      COMPUTER_CARD_PX,
      card(
        listRow(avatar, title(LONG_TITLE), meta(`${LONG_META} ${LONG_META}`)),
        listRow(avatar, title('Jana Nováková')),
      ),
    );

    const tall = await boxOf(page, '.list-rows-avatar', 0);
    const tallLine = await firstLineOf(page, '.ui-list__title', 0);
    expect(await lineCountOf(page, '.ui-list__title', 0)).toBeGreaterThanOrEqual(2);
    expect(Math.abs(middle(tall) - middle(tallLine))).toBeLessThanOrEqual(SUBPIXEL_PX);

    const short = await boxOf(page, '.list-rows-avatar', 1);
    const shortLine = await firstLineOf(page, '.ui-list__title', 1);
    expect(Math.abs(middle(short) - middle(shortLine))).toBeLessThanOrEqual(SUBPIXEL_PX);
  });
});

test.describe('Given list rows led by icons drawn at different sizes', () => {
  test('when they show at the default text and at a doubled root, then every icon and tile has one size that doubles with the text', async ({
    page,
  }) => {
    const rows = card(
      listRow(glyph(24), title('Stav serveru')),
      listRow(glyph(18), title('Chyba')),
      listRow(glyph(20), title('Soubory logů')),
      listRow(tile(18), title('Platby')),
    );
    await mount(page, COMPUTER_CARD_PX, rows);
    const icons = await Promise.all(
      [0, 1, 2].map((index) => boxOf(page, '.ui-list__glyph svg', index)),
    );
    const tileBox = await boxOf(page, '.ui-list__tile');
    expect(new Set(icons.map((icon) => Math.round(icon.width))).size).toBe(1);
    expect(new Set(icons.map((icon) => Math.round(icon.height))).size).toBe(1);

    await mount(page, COMPUTER_CARD_PX, rows, DOUBLE_ROOT_PX);
    const doubled = await boxOf(page, '.ui-list__glyph svg', 0);
    const doubledTile = await boxOf(page, '.ui-list__tile');
    expect(Math.abs(doubled.width - 2 * icons[0].width)).toBeLessThanOrEqual(SUBPIXEL_PX);
    expect(Math.abs(doubledTile.width - 2 * tileBox.width)).toBeLessThanOrEqual(SUBPIXEL_PX);
    expect(Math.abs(doubledTile.height - 2 * tileBox.height)).toBeLessThanOrEqual(SUBPIXEL_PX);
  });
});

test.describe('Given list rows with a wide amount, a date or a small button', () => {
  for (const [widthPx, rootPx] of [
    [PHONE_CARD_PX, SYSTEM_DEFAULT_ROOT_PX],
    [WIDE_PHONE_CARD_PX, SYSTEM_DEFAULT_ROOT_PX],
    [PHONE_CARD_PX, LARGEST_SYSTEM_ROOT_PX],
  ] as const) {
    test(`when the card is ${widthPx} px wide at a root of ${rootPx} px, then the value and the button stand under the text, which takes the row's width, and the date follows the amount or goes under it at the largest text`, async ({
      page,
    }) => {
      await mount(
        page,
        widthPx,
        card(
          listRow(tile(18), title('6 plateb čeká na přiřazení'), value('1 253 311,50 Kč')),
          listRow(
            glyph(20),
            title('Bez jména odesílatele'),
            meta('2 dary · bez VS'),
            value('1 253 311,50 Kč'),
            state('20. 10. 2026'),
          ),
          listRow(tile(18), title(LONG_TITLE), buttonValue('Zkusit znovu')),
        ),
        rootPx,
      );

      for (const index of [0, 1, 2]) {
        const text = await boxOf(page, '.ui-list__title', index);
        const shown = await boxOf(page, '.ui-list__value', index);
        const row = await boxOf(page, '.ui-list__row', index);
        expect(shown.top).toBeGreaterThanOrEqual(text.bottom - SUBPIXEL_PX);
        expect(Math.abs(shown.left - text.left)).toBeLessThanOrEqual(SUBPIXEL_PX);
        if (rootPx !== LARGEST_SYSTEM_ROOT_PX) {
          expect(text.width).toBeGreaterThan(0.6 * row.width);
        }
      }
      const text = await boxOf(page, '.ui-list__title', 1);
      const amount = await boxOf(page, '.ui-list__value', 1);
      const day = await boxOf(page, '.ui-list__state');
      const note = await boxOf(page, '.ui-list__meta');
      expect(amount.top).toBeGreaterThanOrEqual(note.bottom - SUBPIXEL_PX);
      if (rootPx === LARGEST_SYSTEM_ROOT_PX) {
        expect(day.top).toBeGreaterThanOrEqual(amount.bottom - SUBPIXEL_PX);
        expect(Math.abs(day.left - text.left)).toBeLessThanOrEqual(SUBPIXEL_PX);
      } else {
        expect(day.top).toBeLessThan(amount.bottom);
        expect(day.left).toBeGreaterThanOrEqual(amount.right);
      }
    });
  }

  test('when the card is as wide as on a computer, then the value stays beside the title', async ({
    page,
  }) => {
    await mount(
      page,
      COMPUTER_CARD_PX,
      card(listRow(tile(18), title('6 plateb čeká na přiřazení'), value('1 253 311,50 Kč'))),
    );

    const text = await boxOf(page, '.ui-list__title');
    const shown = await boxOf(page, '.ui-list__value');
    expect(shown.top).toBeLessThan(text.bottom);
    expect(shown.left).toBeGreaterThanOrEqual(text.right);
  });
});

test.describe('Given a list of people', () => {
  test('when several people with a role and badges are listed, then each avatar centres on the lines beside it and no divider follows the last person', async ({
    page,
  }) => {
    const person = (name: string): Part => ({
      tag: 'li',
      className: 'ui-person-row',
      children: [
        { tag: 'span', className: 'ui-person-row__avatar list-rows-avatar' },
        {
          tag: 'div',
          children: [
            { tag: 'p', className: 'ui-person-row__name', text: name },
            { tag: 'p', className: 'ui-person-row__meta', text: LONG_META },
            { tag: 'p', className: 'ui-person-row__meta', text: LONG_META },
          ],
        },
      ],
    });
    await mount(page, COMPUTER_CARD_PX, {
      tag: 'section',
      className: 'ui-card',
      children: [
        {
          tag: 'ol',
          className: 'ui-person-list',
          children: [person('Jana Nováková'), person('Petr Svoboda')],
        },
      ],
    });

    for (const index of [0, 1]) {
      const face = await boxOf(page, '.ui-person-row__avatar', index);
      const lines = await boxOf(page, '.ui-person-row > div', index);
      expect(Math.abs(middle(face) - middle(lines))).toBeLessThanOrEqual(SUBPIXEL_PX);
    }
    const dividers = await page
      .locator('#list-rows-host .ui-person-row')
      .evaluateAll((rows) => rows.map((row) => getComputedStyle(row).borderBottomStyle));
    expect(dividers.at(-1)).toBe('none');
    const between = await page
      .locator('#list-rows-host .ui-person-row')
      .evaluateAll((rows) =>
        rows.map(
          (row) => getComputedStyle(row).borderTopStyle + getComputedStyle(row).borderBottomStyle,
        ),
      );
    expect(between.filter((sides) => sides.includes('solid'))).toHaveLength(1);
  });
});

test.describe('Given a choice whose detail runs over several lines', () => {
  test('when it shows, then its radio stands on the middle of the title line', async ({ page }) => {
    await mount(page, PHONE_CARD_PX, {
      tag: 'label',
      className: 'ui-choice',
      children: [
        { tag: 'input', className: 'list-rows-radio' },
        { tag: 'span', className: 'ui-choice__title', text: 'Nejnovější nahoře' },
        { tag: 'span', className: 'ui-choice__detail', text: `${LONG_META} ${LONG_META}` },
      ],
    });
    await page.locator('#list-rows-host .list-rows-radio').evaluate((radio) => {
      (radio as HTMLInputElement).type = 'radio';
    });

    const radio = await boxOf(page, '.list-rows-radio');
    const line = await firstLineOf(page, '.ui-choice__title');
    expect(await lineCountOf(page, '.ui-choice__detail')).toBeGreaterThanOrEqual(2);
    expect(Math.abs(middle(radio) - middle(line))).toBeLessThanOrEqual(SUBPIXEL_PX);
  });
});

test.describe('Given a status sign with a mark in it', () => {
  test('when the text doubles, then the disc and the tile double with it', async ({ page }) => {
    const signs: Part = {
      tag: 'div',
      children: [
        { tag: 'div', className: 'ui-status__icon ui-status__icon--warning', text: '!' },
        { tag: 'span', className: 'ui-list__tile ui-list__tile--success', text: '✓' },
      ],
    };
    await mount(page, COMPUTER_CARD_PX, signs);
    const disc = await boxOf(page, '.ui-status__icon');
    const sign = await boxOf(page, '.ui-list__tile');

    await mount(page, COMPUTER_CARD_PX, signs, DOUBLE_ROOT_PX);
    const doubledDisc = await boxOf(page, '.ui-status__icon');
    const doubledSign = await boxOf(page, '.ui-list__tile');
    expect(Math.abs(doubledDisc.width - 2 * disc.width)).toBeLessThanOrEqual(SUBPIXEL_PX);
    expect(Math.abs(doubledSign.height - 2 * sign.height)).toBeLessThanOrEqual(SUBPIXEL_PX);
  });
});
