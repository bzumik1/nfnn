import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { administrator, mockDonorApi, session } from './donor-session';

const DONORS = '/api/admin/donors';
const SEARCH_LABEL = 'Jméno, e-mail nebo variabilní symbol';
const NAMES = ['Jana Nováková', 'Petr Svoboda'] as const;

const janaAccount = {
  donorId: administrator.id,
  type: 'PERSON',
  name: 'Jana Nováková',
  companyIdentifier: null,
  address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
  email: 'kontakt@firma-dobro.cz',
  variableSymbol: '1234567890',
  preferredLocale: 'cs',
  registeredAt: '2026-10-17T10:00:00Z',
  emailVerified: true,
  administrator: true,
  secondFactorEnabled: true,
  passkeys: 0,
  erasedAt: null,
};

const petrAccount = {
  ...janaAccount,
  donorId: '019a1c00-0000-7000-8000-00000000a002',
  name: 'Petr Svoboda',
  email: 'petr@example.cz',
  variableSymbol: '7310945528',
  administrator: false,
};

async function rememberedSession(page: Page): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}

async function timesNamed(scope: Locator, name: string): Promise<number> {
  return scope.evaluate((root, wanted) => {
    let times = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent?.includes(wanted) && !node.parentElement?.closest('[aria-hidden]')) {
        times += 1;
      }
    }
    for (const element of root.querySelectorAll('[alt], [aria-label], [title]')) {
      for (const attribute of ['alt', 'aria-label', 'title']) {
        if (element.getAttribute(attribute)?.includes(wanted)) {
          times += 1;
        }
      }
    }
    return times;
  }, name);
}

test.describe('Given an administrator who searches the donors', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await rememberedSession(page);
    await page.route(
      (url) => url.pathname === DONORS,
      (route) => route.fulfill({ json: { items: [janaAccount, petrAccount] } }),
    );
  });

  test('when they search on a phone, then each row is one link that names the donor once, its list item has no name of its own and one status line changes once to the count', async ({
    page,
  }) => {
    await page.goto('/sprava/darci');
    await page.setViewportSize({ width: 390, height: 844 });
    const search = page.locator('section[aria-labelledby="search-title"]');
    const status = search.getByRole('status');
    await expect(status).toHaveCount(1);
    await expect(status).toContainText('Začněte psát');
    await status.evaluate((region) => {
      const changes: string[] = [];
      Object.assign(window, { donorStatusChanges: changes });
      new MutationObserver((records) => {
        for (const record of records) {
          changes.push(
            record.type === 'characterData' ? (record.target.textContent ?? '').trim() : 'node',
          );
        }
      }).observe(region, { childList: true, characterData: true, subtree: true });
    });

    await search.getByLabel(SEARCH_LABEL).fill('nov');

    const rows = search.getByRole('list').getByRole('listitem');
    await expect(rows).toHaveCount(2);
    await expect(status).toHaveText('Nalezení dárci: 2');
    const changes = await page.evaluate(
      () => (window as unknown as { donorStatusChanges: string[] }).donorStatusChanges,
    );
    expect(changes).not.toContain('node');
    expect(changes.length).toBeLessThanOrEqual(2);
    expect(changes.at(-1)).toBe('Nalezení dárci: 2');
    for (const change of changes) {
      expect(['Hledáme dárce…', 'Nalezení dárci: 2']).toContain(change);
    }

    const list = await search.getByRole('list').ariaSnapshot();
    expect(list).not.toMatch(/- listitem "/);
    for (const name of NAMES) {
      expect(list.match(new RegExp(name, 'g'))).toHaveLength(1);
    }
    await expect(rows.first().getByRole('link')).toHaveCount(1);
    await expect(rows.first().getByRole('link')).toHaveAccessibleName(
      /^Jana Nováková VS 1234567890 · kontakt@firma-dobro\.cz/,
    );
    const card = await search.ariaSnapshot();
    expect(card.match(/Nalezení dárci: 2/g)).toHaveLength(1);
    expect(card.match(/- status/g)).toHaveLength(1);
    await expect(page.getByText('Nalezení dárci: 2')).toHaveCount(1);
  });

  test('when they search on a computer, then each table row has no name of its own and names the donor once, in its one link', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/sprava/darci');
    const search = page.locator('section[aria-labelledby="search-title"]');

    await search.getByLabel(SEARCH_LABEL).fill('nov');

    const table = search.getByRole('table');
    await expect(table.getByRole('row')).toHaveCount(NAMES.length + 1);
    await expect(search.getByRole('listitem')).toHaveCount(0);
    expect(
      await table
        .locator('tbody tr')
        .evaluateAll((rows) =>
          rows.map((row) =>
            ['aria-label', 'aria-labelledby', 'title'].filter((name) => row.hasAttribute(name)),
          ),
        ),
    ).toEqual(NAMES.map(() => []));
    for (const name of NAMES) {
      await expect(table.getByRole('link', { name, exact: true })).toHaveCount(1);
      expect(await timesNamed(table, name)).toBe(1);
    }
    await expect(search.getByRole('status')).toHaveText('Nalezení dárci: 2');
  });
});
