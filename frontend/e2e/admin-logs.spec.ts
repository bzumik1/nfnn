import { expect, test } from './fixtures';
import {
  DIAGNOSTICS,
  LOGGERS,
  LOGS,
  logsApi,
  RELEASE_HISTORY,
  rememberedAdministrator,
  routeLogsApi,
  routeReleaseApi,
} from './admin-logs-api';
import { stepBack } from './app-history';
import { mockDonorApi } from './donor-session';

test.describe('Given an administrator on the logs hub', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await routeLogsApi(page);
    await rememberedAdministrator(page);
  });

  test('when they open backend.log from the hub, then its newest entries come first, older ones load below and an error opens its surroundings', async ({
    page,
  }) => {
    await page.goto('/sprava/logy');

    await expect(page).toHaveTitle('Logy a diagnostika | Správa | Nová naděje – nadační fond');
    await expect(page.getByRole('heading', { level: 1, name: 'Logy a diagnostika' })).toBeFocused();
    await expect(page.getByRole('link', { name: /Bez poruchy/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Starší soubory/ })).toContainText('1');

    await page.getByRole('link', { name: /backend\.log Aplikace/ }).click();
    await expect(page).toHaveURL('/sprava/logy/soubor?nazev=backend.log');
    await expect(page.getByRole('heading', { level: 1, name: 'backend.log' })).toBeFocused();
    await expect(page.getByRole('main').locator('.entry').first()).toContainText('line 39');
    await expect(page.getByRole('main').locator('.entry')).toHaveCount(40);

    await page
      .getByRole('main')
      .locator('.list-end')
      .getByRole('button', { name: 'Načíst starší řádky' })
      .click();
    await expect(page.getByRole('main').locator('.entry')).toHaveCount(80);

    await page.getByRole('radio', { name: 'Chyby', exact: true }).click();
    await expect(page.getByRole('main').locator('.entry')).toHaveCount(2);
    await page.getByRole('main').locator('.entry').first().click();
    const sheet = page.getByRole('dialog', { name: 'Chyba v 10:00:38' });
    await expect(sheet).toContainText('c.n.a.d.i.fio.FioBankStatementSource');
    const opened = page.waitForRequest(
      (request) => new URL(request.url()).searchParams.get('from') === '41000',
    );
    await sheet.getByRole('button', { name: 'Zobrazit okolí' }).click();
    await opened;
    await expect(page.getByRole('radio', { name: 'Vše', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('main').locator('.entry.is-focused')).toBeFocused();

    await stepBack(page);
    await expect(page).toHaveURL('/sprava/logy');
  });

  test('when they load older lines from the top of backend.log, then the same older window joins as from the bottom', async ({
    page,
  }) => {
    const entries = page.getByRole('main').locator('.entry');
    const loadOlderFrom = async (place: '.load-more-row' | '.list-end') => {
      await page.goto('/sprava/logy/soubor?nazev=backend.log');
      await expect(entries).toHaveCount(40);
      const asked = page.waitForRequest((request) =>
        new URL(request.url()).searchParams.has('from'),
      );
      await page
        .getByRole('main')
        .locator(place)
        .getByRole('button', { name: 'Načíst starší řádky' })
        .click();
      const from = new URL((await asked).url()).searchParams.get('from');
      await expect(entries).toHaveCount(80);
      return { from, texts: await entries.allTextContents() };
    };

    const fromTop = await loadOlderFrom('.load-more-row');
    const fromBottom = await loadOlderFrom('.list-end');

    expect(fromTop).toEqual(fromBottom);
  });

  test('when errors were written today, then the hub counts them and a row opens the reader at that line', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sprava/logy');

    const today = page.getByRole('region', { name: 'Varování a chyby dnes' });
    const row = today.getByRole('link', { name: /^Chyba Fio refused the request \(409\)/ });
    await expect(row).toContainText('2×');
    const opened = page.waitForRequest(
      (request) => new URL(request.url()).searchParams.get('from') === '41000',
    );
    await row.click();
    await opened;
    await expect(page).toHaveURL('/sprava/logy/soubor?nazev=backend.log&od=51000');
    await expect(page.getByRole('main').locator('.entry.is-focused')).toBeFocused();
  });

  test('when they open the older files on a phone, then the archive of each series leads to its reader', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sprava/logy');

    await page.getByRole('link', { name: /Starší soubory/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Starší soubory' })).toBeFocused();
    await expect(page.getByRole('heading', { level: 2, name: 'Aplikace' })).toBeVisible();

    await page.getByRole('link', { name: /backend\.log\.2026-10-22\.0\.gz/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'backend.log.2026-10-22.0.gz' }),
    ).toBeVisible();
    await expect(page.getByRole('main').locator('.entry').first()).toContainText('line 39');
  });

  test('when they raise a logger for half an hour, then the level is put and the list shows it until it is reset', async ({
    page,
  }) => {
    let override: Record<string, unknown> | null = null;
    await page.route(
      (url) => url.pathname === `${LOGGERS}/cz.novanadeje.app`,
      async (route) => {
        if (route.request().method() === 'PUT') {
          override = {
            logger: 'cz.novanadeje.app',
            level: 'DEBUG',
            configuredBefore: 'INFO',
            since: '2026-10-23T10:00:00Z',
            until: '2026-10-23T10:30:00Z',
            adminId: '019a1c00-0000-7000-8000-000000000001',
          };
          return route.fulfill({ json: override });
        }
        override = null;
        return route.fulfill({ status: 204 });
      },
    );
    await page.route(
      (url) => url.pathname === LOGGERS,
      (route) =>
        route.fulfill({
          json: {
            loggers: [
              { logger: 'ROOT', configuredLevel: 'INFO', effectiveLevel: 'INFO', override: null },
              {
                logger: 'cz.novanadeje.app',
                configuredLevel: 'INFO',
                effectiveLevel: override === null ? 'INFO' : 'DEBUG',
                override,
              },
            ],
          },
        }),
    );

    await page.goto('/sprava/logy');
    await page.getByRole('link', { name: 'Úrovně logování' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Úrovně logování' })).toBeFocused();
    await page.getByRole('button', { name: /^Aplikace cz\.novanadeje\.app/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Úroveň loggeru cz.novanadeje.app' });
    await expect(sheet.getByRole('radio', { name: 'DEBUG' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await sheet.getByRole('button', { name: 'Nastavit na 30 min' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'má úroveň DEBUG' })).toHaveText(
      'Logger cz.novanadeje.app má úroveň DEBUG do 23. 10. 2026 12:30.',
    );
    await expect(page.getByRole('main').locator('.overrides .ui-list__row')).toContainText(
      'INFO → DEBUG',
    );

    await page.getByRole('button', { name: 'Vrátit úroveň loggeru cz.novanadeje.app' }).click();
    await expect(page.getByRole('main').locator('.overrides')).toHaveCount(0);
    await expect(page.getByText('Logger cz.novanadeje.app má zase původní úroveň.')).toBeVisible();
  });

  test('when they open the server state and the thread dump on a phone, then each reads as its own page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sprava/logy');

    await page.getByRole('link', { name: /Bez poruchy/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Stav serveru' })).toBeFocused();
    await expect(page.getByRole('heading', { level: 2, name: 'Bez poruchy' })).toBeVisible();
    await expect(page.getByRole('main').locator('.database')).toContainText('za 2 ms');

    await stepBack(page);
    await page.getByRole('link', { name: 'Výpis vláken' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Výpis vláken' })).toBeFocused();
    await expect(page.getByRole('main').locator('.states')).toContainText('Běží');
    await expect(page.getByRole('main').locator('.dump')).toContainText('"main" #1 state=RUNNABLE');
  });

  test('when they open Historie vydání on a phone, then the releases the server ran read newest first and closing it folds them away', async ({
    page,
  }) => {
    await routeReleaseApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sprava/logy/stav');
    await expect(page.getByRole('heading', { level: 1, name: 'Stav serveru' })).toBeFocused();

    const toggle = page.getByRole('button', { name: 'Historie vydání' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const asked = page.waitForRequest(
      (request) => new URL(request.url()).pathname === RELEASE_HISTORY,
    );
    await toggle.click();
    await asked;

    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const history = page.locator('#historie-vydani');
    await expect(history.locator('.ui-list__row')).toHaveCount(3);
    await expect(history.locator('.ui-list__row').first()).toContainText('2026.11.109');
    await expect(history.locator('.ui-list__row').first()).toContainText('běží od');
    await expect(history.getByRole('link', { name: 'Co je nového v 2026.11.98' })).toHaveAttribute(
      'href',
      'https://github.com/bzumik1/nfnn/releases/tag/2026.11.98',
    );

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(history).toHaveCount(0);
  });
});

test.describe('Given an administrator on the server state with a long Java version and a missing folder', () => {
  const LONG_JAVA_VERSION =
    '25.0.1+8-LTS (Eclipse Adoptium OpenJDK 64-Bit Server VM 25.0.1+8-LTS, mixed mode, sharing)';

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await routeLogsApi(page);
    const diagnostics = logsApi()['diagnostics'] as {
      jvm: Record<string, unknown>;
      disks: Record<string, unknown>[];
    };
    await page.route(
      (url) => url.pathname === DIAGNOSTICS,
      (route) =>
        route.fulfill({
          json: {
            ...diagnostics,
            jvm: { ...diagnostics.jvm, javaVersion: LONG_JAVA_VERSION },
            disks: [
              ...diagnostics.disks,
              { path: '/data', mounted: false, freeBytes: 0, totalBytes: 0 },
            ],
          },
        }),
    );
    await rememberedAdministrator(page);
  });

  for (const width of [1280, 1000]) {
    test(`when they read it at ${width} px with 200 % text, then the Java row keeps its title on one line and its version inside the card`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/sprava/logy/stav');
      await page.addStyleTag({ content: 'html { font-size: 200% }' });
      const card = page.getByRole('main').locator('.application');
      const row = card.locator('.ui-list__row').filter({ hasText: 'Java' });
      await expect(row).toContainText(LONG_JAVA_VERSION);

      const box = await row.evaluate((element) => {
        const title = element.querySelector('.ui-list__title') as HTMLElement;
        const version = [...element.children].find((child) => child !== title) as HTMLElement;
        const cardBox = element.closest('.ui-card')!.getBoundingClientRect();
        const titleBox = title.getBoundingClientRect();
        const versionBox = version.getBoundingClientRect();
        return {
          titleWidth: titleBox.width,
          characterWidth: parseFloat(getComputedStyle(title).fontSize),
          versionLeft: versionBox.left,
          versionRight: versionBox.right,
          versionOverflows: version.scrollWidth > version.clientWidth,
          cardLeft: cardBox.left,
          cardRight: cardBox.right,
        };
      });
      expect(box.titleWidth).toBeGreaterThan(box.characterWidth);
      expect(box.versionLeft).toBeGreaterThanOrEqual(box.cardLeft);
      expect(box.versionRight).toBeLessThanOrEqual(box.cardRight);
      expect(box.versionOverflows).toBe(false);
    });
  }

  test('when they read the verdict, then its findings carry no list markers, it is inset alike at the top and bottom and only identifiers are monospace', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/sprava/logy/stav');
    const verdict = page.getByRole('main').locator('.verdict');
    await expect(verdict.locator('.findings li')).toHaveText(['Složka /data není připojená.']);

    const markers = await verdict
      .locator('.findings li')
      .evaluateAll((items) => items.map((item) => getComputedStyle(item).listStyleType));
    expect(markers).toEqual(['none']);

    const insets = await verdict.evaluate((card) => {
      const cardBox = card.getBoundingClientRect();
      const row = card.querySelector('.ui-list__row') as HTMLElement;
      const refresh = card.querySelector('.refresh') as HTMLElement;
      const border = parseFloat(getComputedStyle(card).borderTopWidth);
      return {
        top:
          row.getBoundingClientRect().top -
          cardBox.top -
          border +
          parseFloat(getComputedStyle(row).paddingTop),
        bottom:
          cardBox.bottom -
          refresh.getBoundingClientRect().bottom -
          border +
          parseFloat(getComputedStyle(refresh).paddingBottom),
      };
    });
    expect(Math.abs(insets.top - insets.bottom)).toBeLessThanOrEqual(1);

    const application = page.getByRole('main').locator('.application');
    const faces = await application.evaluate((card) =>
      Object.fromEntries(
        [...card.querySelectorAll('.ui-list__row')].map((row) => [
          row.querySelector('.ui-list__title')!.textContent!.trim(),
          [...row.querySelectorAll('.ui-list__meta, .ui-list__value')].map((part) =>
            getComputedStyle(part).fontFamily.includes('monospace'),
          ),
        ]),
      ),
    );
    expect(faces['Paměť']).toEqual([false, false]);
    expect(faces['Úklid paměti']).toEqual([false, false]);
    expect(faces['Java']).toEqual([true]);
  });
});

test.describe('Given an administrator reading backend.log on a phone', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await routeLogsApi(page);
    await rememberedAdministrator(page);
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test('when they reach the end of the entries, then Načíst starší řádky and Kopírovat stand alike in one height and look like Načíst novější řádky and Hledat', async ({
    page,
  }) => {
    await page.goto('/sprava/logy/soubor?nazev=backend.log');
    const main = page.getByRole('main');
    await expect(main.locator('.entry')).toHaveCount(40);

    const looks = await Promise.all(
      [
        main.getByRole('button', { name: 'Hledat' }),
        main.locator('.load-more'),
        main.locator('.list-end').getByRole('button', { name: 'Načíst starší řádky' }),
        main.locator('.list-end').getByRole('button', { name: /^Kopírovat/ }),
      ].map((button) =>
        button.evaluate((element) => ({
          height: element.getBoundingClientRect().height,
          background: getComputedStyle(element).backgroundColor,
        })),
      ),
    );
    const [search, newer, older, copy] = looks;
    expect(new Set([newer.background, older.background, copy.background])).toEqual(
      new Set([search.background]),
    );
    expect(Math.abs(older.height - copy.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(newer.height - older.height)).toBeLessThanOrEqual(1);
  });

  test('when they turn on Chyby z prohlížečů, then the filter is drawn apart from the load button and says it is on', async ({
    page,
  }) => {
    await page.goto('/sprava/logy/soubor?nazev=backend.log');
    const main = page.getByRole('main');
    const filter = main.getByRole('button', { name: 'Chyby z prohlížečů' });
    await expect(filter).toHaveAttribute('aria-pressed', 'false');

    const backgroundOf = (button: typeof filter) =>
      button.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(await backgroundOf(filter)).not.toBe(await backgroundOf(main.locator('.load-more')));

    const resting = await backgroundOf(filter);
    await filter.click();
    await expect(filter).toHaveAttribute('aria-pressed', 'true');
    expect(await backgroundOf(filter)).not.toBe(resting);
  });

  for (const { text, rootSize } of [
    { text: 'the default text', rootSize: null },
    { text: 'the largest text', rootSize: '53px' },
  ]) {
    test(`when they read the entries with ${text}, then every class name is shown whole and starts right after its icon`, async ({
      page,
    }) => {
      await page.goto('/sprava/logy/soubor?nazev=backend.log');
      if (rootSize !== null) {
        await page.addStyleTag({ content: `html { font-size: ${rootSize} }` });
      }
      const entries = page.getByRole('main').locator('.entry');
      await expect(entries).toHaveCount(40);

      const rows = await entries.evaluateAll((elements) =>
        elements.slice(0, 3).map((entry) => {
          const title = entry.querySelector('.entry-title') as HTMLElement;
          const icon = entry.querySelector('.entry-icon') as HTMLElement;
          const meta = entry.querySelector('.entry-meta') as HTMLElement;
          return {
            title: title.textContent,
            clipped: title.scrollWidth > title.clientWidth + 1,
            titleRight: title.getBoundingClientRect().right,
            metaRight: meta.getBoundingClientRect().right,
            leadGap: meta.getBoundingClientRect().left - icon.getBoundingClientRect().right,
            columnGap: parseFloat(getComputedStyle(entry).columnGap),
          };
        }),
      );
      for (const row of rows) {
        expect(row.title).toBe('ImportBankPaymentsService');
        expect(row.clipped).toBe(false);
        expect(row.titleRight).toBeLessThanOrEqual(row.metaRight + 1);
        expect(row.leadGap).toBeLessThanOrEqual(row.columnGap + 1);
      }
    });
  }

  test('when they read an entry whose class name has a part longer than the column with the largest text, then the name breaks inside that part and never runs past its row', async ({
    page,
  }) => {
    const longName = 'AuthorizationServerConfigurationRegistration';
    await page.route(
      (url) => url.pathname === `${LOGS}/backend.log`,
      (route) =>
        route.fulfill({
          json: {
            name: 'backend.log',
            sizeBytes: 200,
            from: 0,
            to: 200,
            hasOlder: false,
            hasNewer: false,
            text: `2026-10-23T10:00:00.000+02:00  INFO 1 --- [nova-nadeje] [main] c.n.a.d.a.${longName}    : started\n`,
          },
        }),
    );
    await page.goto('/sprava/logy/soubor?nazev=backend.log');
    await page.addStyleTag({ content: 'html { font-size: 53px }' });
    const entry = page.getByRole('main').locator('.entry').first();
    await expect(entry.locator('.entry-title')).toHaveText(longName);

    const placed = await entry.evaluate((element) => {
      const title = element.querySelector('.entry-title') as HTMLElement;
      return {
        clipped: title.scrollWidth > title.clientWidth + 1,
        titleRight: title.getBoundingClientRect().right,
        rowRight: element.getBoundingClientRect().right,
      };
    });
    expect(placed.clipped).toBe(false);
    expect(placed.titleRight).toBeLessThanOrEqual(placed.rowRight + 1);
  });
});

test.describe('Given an administrator on the server state on a phone', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await routeLogsApi(page);
    await routeReleaseApi(page);
    await rememberedAdministrator(page);
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('when they read the verdict, then it is set at least as large as the titles of the rows under it and as on Logy a diagnostika', async ({
    page,
  }) => {
    const sizeOf = (element: Element) => parseFloat(getComputedStyle(element).fontSize);

    await page.goto('/sprava/logy');
    const hub = await page
      .getByRole('main')
      .locator('.health .ui-list__title')
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));

    await page.goto('/sprava/logy/stav');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 2, name: 'Bez poruchy' })).toBeVisible();
    const verdict = await main
      .getByRole('heading', { level: 2, name: 'Bez poruchy' })
      .evaluate(sizeOf);
    const rowTitles = await main
      .locator('.application .ui-list__title')
      .evaluateAll((titles) => titles.map((title) => parseFloat(getComputedStyle(title).fontSize)));

    expect(verdict).toBe(hub);
    expect(verdict).toBeGreaterThanOrEqual(Math.max(...rowTitles));
  });

  test('when they read the release with the largest text, then its number stays inside the row', async ({
    page,
  }) => {
    await page.goto('/sprava/logy/stav');
    await page.addStyleTag({ content: 'html { font-size: 53px }' });
    const row = page.getByRole('main').locator('.release .ui-list__row');
    await expect(row.locator('.ui-list__value')).toHaveText('2026.11.109');

    const box = await row.evaluate((element) => {
      const value = element.querySelector('.ui-list__value') as HTMLElement;
      const style = getComputedStyle(element);
      return {
        valueRight: value.getBoundingClientRect().right,
        contentRight: element.getBoundingClientRect().right - parseFloat(style.paddingRight),
        overflows: value.scrollWidth > value.clientWidth + 1,
      };
    });
    expect(box.valueRight).toBeLessThanOrEqual(box.contentRight + 1);
    expect(box.overflows).toBe(false);
  });
});

test.describe('Given an administrator on the log files on a 375 pt phone', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await routeLogsApi(page);
    await rememberedAdministrator(page);
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test('when they read an older file name on Starší soubory, then every line of it ends after a dot or at its end, never at a hyphen of the date', async ({
    page,
  }) => {
    await page.goto('/sprava/logy/soubory');
    const name = page
      .getByRole('link', { name: /backend\.log\.2026-10-22\.0\.gz/ })
      .locator('.file-name');
    await expect(name).toHaveText('backend.log.2026-10-22.0.gz');

    const lines = await name.evaluate((element) => {
      const parts = Array.from(element.querySelectorAll('.file-name-part'), (part) => ({
        text: part.textContent ?? '',
        boxes: part.getClientRects().length,
        top: Math.round(part.getBoundingClientRect().top),
      }));
      const byLine = new Map<number, string[]>();
      for (const part of parts) {
        byLine.set(part.top, [...(byLine.get(part.top) ?? []), part.text]);
      }
      return {
        boxes: parts.map((part) => part.boxes),
        lines: [...byLine.values()].map((line) => line.join('')),
      };
    });

    expect(lines.boxes.every((boxes) => boxes === 1)).toBe(true);
    expect(lines.lines.join('')).toBe('backend.log.2026-10-22.0.gz');
    for (const line of lines.lines.slice(0, -1)) {
      expect(line.endsWith('.')).toBe(true);
    }
  });

  test('when they read an older file name on Starší soubory with the largest text, then a part wider than the column wraps inside it and nothing runs past the name or under the chevron', async ({
    page,
  }) => {
    await page.goto('/sprava/logy/soubory');
    await page.addStyleTag({ content: 'html { font-size: 53px }' });
    const row = page.getByRole('link', { name: /backend\.log\.2026-10-22\.0\.gz/ });
    await expect(row.locator('.file-name')).toHaveText('backend.log.2026-10-22.0.gz');

    const placed = await row.evaluate((element) => {
      const name = element.querySelector('.file-name') as HTMLElement;
      const chevron = element.querySelector('.ui-list__chevron') as SVGElement;
      const nameBox = name.getBoundingClientRect();
      return {
        clipped: name.scrollWidth > name.clientWidth + 1,
        nameRight: nameBox.right,
        chevronLeft: chevron.getBoundingClientRect().left,
        partsRight: Array.from(
          name.querySelectorAll('.file-name-part'),
          (part) => part.getBoundingClientRect().right - nameBox.right,
        ),
      };
    });
    expect(placed.clipped).toBe(false);
    expect(placed.nameRight).toBeLessThanOrEqual(placed.chevronLeft + 1);
    expect(placed.partsRight.every((past) => past <= 1)).toBe(true);
  });

  test('when they go from Logy a diagnostika to Starší soubory, then a log file is the same row with its file icon at the same place', async ({
    page,
  }) => {
    const placeOf = async () => {
      const row = page
        .getByRole('main')
        .locator('a.ui-list__row', { has: page.locator('.file-name') });
      await expect(row.first().locator('.ui-list__glyph svg')).toBeVisible();
      return row.first().evaluate((element) => {
        const icon = element.querySelector('.ui-list__glyph svg') as SVGElement;
        const name = element.querySelector('.file-name') as HTMLElement;
        return {
          iconLeft: Math.round(icon.getBoundingClientRect().left),
          iconWidth: Math.round(icon.getBoundingClientRect().width),
          nameLeft: Math.round(name.getBoundingClientRect().left),
        };
      });
    };

    await page.goto('/sprava/logy');
    const hub = await placeOf();
    await page.getByRole('link', { name: /Starší soubory/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Starší soubory' })).toBeFocused();
    const older = await placeOf();

    expect(older).toEqual(hub);
    expect(hub.iconWidth).toBe(20);
  });
});
