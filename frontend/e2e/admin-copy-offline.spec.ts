import { Page } from '@playwright/test';
import { everyOfferedYear } from '../src/app/features/admin/device-copy/administration-overview';
import { rowsSha256 } from '../src/app/features/donations/sync/canonical-rows';
import { expect, test } from './fixtures';
import { administrator, adminSettings, mockDonorApi, signIn } from './donor-session';

const PAYMENTS = '/api/admin/donations/payments';
const OVERVIEW = '/api/admin/donations/overview';
const TODAY = '2026-10-18';

const payment = {
  id: '019a1c00-0000-7000-8000-000000001001',
  version: '3f2a9c4e1b7d6085',
  bankTransactionId: 1001,
  bookedOn: '2026-10-10',
  amountMinor: 50000,
  currency: 'CZK',
  variableSymbol: '1111111111',
  counterpartyAccount: '2900233333/2010',
  counterpartyName: 'Nováková Jana',
  messageForRecipient: 'Dar pro fond',
  importedAt: '2026-10-17T10:00:00Z',
  unpairedByAdminAt: null,
  accountVerification: false,
};

const record = {
  donorId: '01a18e56-bdb0-775a-bd0a-a60756831369',
  name: 'Jana Nováková',
  type: 'PERSON',
  variableSymbol: '4821937560',
  companyIdentifier: null,
  address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
  preferredLocale: 'cs',
  registeredAt: '2026-01-15T10:00:00Z',
  erasedAt: null,
};

const importState = {
  coveredFrom: '2026-07-20',
  coveredTo: '2026-10-17',
  lastAttemptedAt: '2026-10-18T10:00:00Z',
  lastSucceededAt: '2026-10-17T10:00:00Z',
  lastFailure: {
    kind: 'UNAUTHORIZED',
    message: 'Fio refused the token',
    attemptedAt: '2026-10-18T10:00:00Z',
  },
  consecutiveFailures: 1,
  reportedOutage: 'UNAUTHORIZED',
  balance: null,
};

const byYear = everyOfferedYear(
  { payments: [payment], donations: [], donorRecords: [record] },
  TODAY,
);

const account = {
  donorId: record.donorId,
  type: 'PERSON',
  name: record.name,
  companyIdentifier: null,
  address: record.address,
  email: 'jana@example.cz',
  variableSymbol: record.variableSymbol,
  preferredLocale: 'cs',
  registeredAt: record.registeredAt,
  emailVerified: true,
  administrator: false,
  secondFactorEnabled: false,
  passkeys: 0,
  erasedAt: null,
};

const article = {
  id: '0199f3e0-0000-7000-8000-00000000c001',
  slug: 'zahrada-pro-deti',
  title: 'Zahrada pro děti z kopie',
  tag: 'Projekt',
  perex: 'Stavíme zahradu, kde si děti budou hrát.',
  body: 'První odstavec.',
  coverImage: null,
  publishedOn: '2026-10-20',
  live: true,
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
  signer: null,
  lookBackYear: null,
  version: '4c9e1a7b20d3f856',
};

const story = {
  id: '0199f3e0-0000-7000-8000-00000000d001',
  slug: 'pomoc-elisce',
  title: 'Pomoc Elišce z kopie',
  year: 2024,
  category: 'CHILDREN',
  tag: null,
  perex: 'Elišce jsme pomohli s rehabilitací.',
  body: 'První odstavec.',
  coverImage: null,
  publishedOn: '2026-10-20',
  live: true,
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
  version: '5d0f2b8c31e4a967',
};

const people = {
  members: [
    {
      id: '0199f3e0-0000-7000-8000-00000000e001',
      name: 'Eva Vzorová z kopie',
      role: 'Zakladatelka',
      position: 0,
      onBoard: true,
      boardNote: null,
      featured: true,
      portrait: null,
      webSignature: null,
      personalEmail: null,
      fundEmail: null,
      linkedToAccount: false,
    },
  ],
  note: null,
  footnote: null,
  noteVersion: '6e1a3c9d42f5b078',
  footnoteVersion: '7f2b4d0e53a6c189',
};

const reportSettings = {
  recipients: ['kopie@nfnn.cz'],
  sendDay: 1,
  sendHour: 7,
  sections: { donors: true, donations: true, unpairedPayments: true, bankImport: true },
  changedAt: null,
  sentReports: [{ month: '2026-09', sentAt: '2026-10-01T05:00:12Z' }],
  nextReport: { month: '2026-10', dueOn: '2026-11-01' },
  lastEndedMonth: '2026-10',
  version: '8a3c5e1f64b7d29a',
};

const backups = {
  available: true,
  backups: [
    {
      fileName: 'nfnn-2026-10-17_0300.dump.age',
      kind: 'DAILY',
      sizeBytes: 1590,
      createdAt: '2026-10-17T01:00:03Z',
    },
  ],
  lastBackup: {
    outcome: 'OK',
    startedAt: '2026-10-17T01:00:00Z',
    finishedAt: '2026-10-17T01:00:03Z',
    fileName: 'nfnn-2026-10-17_0300.dump.age',
    sizeBytes: 1590,
    tables: null,
    requestId: null,
    error: null,
  },
  lastTestRestore: null,
  lastRestore: null,
  restoreFiles: [],
  pendingRequests: 0,
  restorePending: false,
  problems: [],
  schedule: {
    backupTime: '03:00',
    testRestoreDay: 7,
    testRestoreTime: '04:00',
    applied: { backupTime: '03:00', testRestoreDay: 7, testRestoreTime: '04:00' },
  },
  key: { available: true, confirmed: true, confirmedAt: '2026-10-17T08:00:00Z' },
};

const auditEntry = {
  id: '019a1c00-0000-7000-8000-00000000f001',
  adminId: administrator.id,
  action: 'PAIR_PAYMENT',
  subjectId: payment.id,
  donorId: record.donorId,
  summary: 'Platba 500 Kč přiřazena dárci Jana Nováková',
  performedAt: '2026-10-17T11:00:00Z',
  client: null,
};

const adminAccount = {
  ...account,
  donorId: administrator.id,
  name: 'Správce z kopie',
  email: administrator.email,
  administrator: true,
};

const COPY_READS = [
  '/api/admin/content/news',
  `/api/admin/content/news/${article.id}`,
  '/api/admin/content/projects',
  '/api/admin/content/project-order',
  '/api/admin/content/about',
  '/api/admin/content/donate-band',
  '/api/admin/content/people',
  '/api/admin/operations/settings',
  '/api/admin/operations/backups',
  '/api/admin/donations/report',
  '/api/admin/donors/actions',
];

interface Chunk {
  readonly id: string;
  readonly rowsSha256: string;
  readonly count: number;
  readonly rows: readonly unknown[];
}

async function chunk(id: string, rows: readonly unknown[]): Promise<Chunk> {
  return { id, rowsSha256: await rowsSha256(rows), count: rows.length, rows };
}

async function serveCopy(
  page: Page,
  part: 'donations' | 'donors' | 'content' | 'operations',
  chunks: Chunk[],
) {
  const summary =
    part === 'donations' ? { summary: { today: TODAY, receiptsAvailableFrom: 2026, byYear } } : {};
  const head = { subject: administrator.id, administrator: true, ...summary };
  await page.route(
    (url) => url.pathname === `/api/admin/${part}/sync`,
    (route) =>
      route.fulfill({
        json: {
          ...head,
          chunks: chunks.map(({ id, rowsSha256, count }) => ({ id, rowsSha256, count })),
        },
      }),
  );
  await page.route(
    (url) => url.pathname === `/api/admin/${part}/sync/chunks`,
    (route) => {
      const asked = (new URL(route.request().url()).searchParams.get('ids') ?? '').split(',');
      route.fulfill({
        json: {
          ...head,
          chunks: chunks.filter((held) => asked.includes(held.id)),
          missing: asked.filter((id) => !chunks.some((held) => held.id === id)),
        },
      });
    },
  );
}

test.describe('Given an administrator whose device keeps the administration copy', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page);
    await serveCopy(page, 'donations', [
      await chunk('payments:2026-10', [payment]),
      await chunk('donor-records:2026-01', [record]),
      await chunk('import-state', [importState]),
      await chunk('report-settings', [reportSettings]),
    ]);
    await serveCopy(page, 'donors', [
      await chunk('accounts:2026-01', [account, adminAccount]),
      await chunk('audit:2026-10', [auditEntry]),
    ]);
    await serveCopy(page, 'content', [
      await chunk('news', [article]),
      await chunk('projects', [story]),
      await chunk('project-order', [{ order: 'YEAR_THEN_CATEGORY' }]),
      await chunk('about', [{ photo: null }]),
      await chunk('donate-band', [{ photo: null }]),
      await chunk('people', [people]),
    ]);
    await serveCopy(page, 'operations', [
      await chunk('settings', [adminSettings]),
      await chunk('backups', [backups]),
    ]);
  });

  test('when the content, settings, history and backups pages open and the device goes offline, then they come from the copy and every change waits for a connection', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    const stored = Promise.all(
      ['donations', 'donors', 'content', 'operations'].map((part) =>
        page.waitForResponse(
          (response) => new URL(response.url()).pathname === `/api/admin/${part}/sync/chunks`,
        ),
      ),
    );
    await signIn(page, administrator);
    await stored;
    const serverReads: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (COPY_READS.some((read) => path === read)) {
        serverReads.push(path);
      }
    });
    await page.getByRole('link', { name: 'Správa' }).click();
    const nav = page.getByRole('navigation', { name: 'Správa' });
    const pages: [string, string, (main: ReturnType<Page['locator']>) => Promise<void>][] = [
      ['Aktuality', 'Aktuality', (main) => expect(main).toContainText(article.title)],
      ['Pomáháme', 'Pomáháme', (main) => expect(main).toContainText(story.title)],
      [
        'Fotka v sekci O nás',
        'Fotka v sekci O nás',
        (main) => expect(main.locator('.ui-load-state--error')).toHaveCount(0),
      ],
      [
        'Fotka v pruhu Přispět',
        'Fotka v pruhu Přispět',
        (main) => expect(main.locator('.ui-load-state--error')).toHaveCount(0),
      ],
      ['Lidé fondu', 'Lidé fondu', (main) => expect(main).toContainText('Eva Vzorová z kopie')],
      ['Měsíční e-mail', 'Měsíční e-mail', (main) => expect(main).toContainText('kopie@nfnn.cz')],
      [
        'Historie změn',
        'Historie změn',
        async (main) => {
          await expect(main).toContainText('Platba 500 Kč přiřazena dárci Jana Nováková');
          await expect(main).toContainText('Správce z kopie');
        },
      ],
      ['Zálohy', 'Zálohy', (main) => expect(main.locator('.ui-load-state--error')).toHaveCount(0)],
      [
        'Nastavení',
        'Nastavení',
        (main) => expect(main.locator('.ui-load-state--error')).toHaveCount(0),
      ],
    ];
    const main = page.locator('main');
    for (const [link, heading, shows] of pages) {
      await nav.getByRole('link', { name: link, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await shows(main);
    }
    await nav.getByRole('link', { name: 'Aktuality', exact: true }).click();
    await page.getByRole('link', { name: article.title }).click();
    await expect(page.getByRole('textbox', { name: 'Titulek' })).toHaveValue(article.title);
    expect(serverReads).toEqual([]);

    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      (route) => route.abort('internetdisconnected'),
    );
    await context.setOffline(true);
    await expect(
      page.getByRole('button', { name: /^Offline · údaje z \d{1,2}:\d{2}$/ }),
    ).toBeVisible();
    for (const [link, heading, shows] of pages) {
      await nav.getByRole('link', { name: link, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await shows(main);
    }
    await expect(main).toContainText('Klíč ukážeme, až se spojení se serverem obnoví.');
    await nav.getByRole('link', { name: 'Zálohy', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Zálohovat teď' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await nav.getByRole('link', { name: 'Aktuality', exact: true }).click();
    await page.getByRole('link', { name: article.title }).click();
    await expect(page.getByRole('textbox', { name: 'Titulek' })).toHaveValue(article.title);
    expect(serverReads).toEqual([]);
    await context.setOffline(false);
  });

  test('when the payments open and the device goes offline, then they come from the copy, say how old it is and pairing waits for a connection', async ({
    page,
    context,
  }) => {
    const stored = Promise.all(
      ['donations', 'donors'].map((part) =>
        page.waitForResponse(
          (response) => new URL(response.url()).pathname === `/api/admin/${part}/sync/chunks`,
        ),
      ),
    );
    await signIn(page, administrator);
    await stored;
    await page.getByRole('link', { name: 'Správa' }).click();
    const paymentsLink = page.getByRole('link', { name: 'Platby z banky' });
    await expect(paymentsLink).toBeVisible();
    const serverReads: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === PAYMENTS) {
        serverReads.push(request.url());
      }
    });
    await paymentsLink.click();

    await expect(page.getByRole('row').filter({ hasText: 'Nováková Jana' })).toBeVisible();
    expect(serverReads).toEqual([]);

    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      (route) => route.abort('internetdisconnected'),
    );
    await context.setOffline(true);
    await expect(
      page.getByRole('button', { name: /^Offline · údaje z \d{1,2}:\d{2}$/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Přiřadit dárci' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.pair-result')).toHaveText(
      /Jana Nováková\s*VS 4821937560 · jana@example.cz/,
    );
    await dialog.getByRole('radio', { name: /Jana Nováková/ }).check();
    await expect(
      dialog.getByRole('button', { name: 'Přiřadit dárci Jana Nováková' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(serverReads).toEqual([]);
    await context.setOffline(false);
  });

  test('when the administration home opens and the device goes offline, then the year overview and the waiting payments come from the copy and the import state shows the failure without its text', async ({
    page,
    context,
  }) => {
    const stored = Promise.all(
      ['donations', 'donors'].map((part) =>
        page.waitForResponse(
          (response) => new URL(response.url()).pathname === `/api/admin/${part}/sync/chunks`,
        ),
      ),
    );
    await signIn(page, administrator);
    await stored;
    const serverReads: string[] = [];
    page.on('request', (request) => {
      if ([OVERVIEW, PAYMENTS].includes(new URL(request.url()).pathname)) {
        serverReads.push(request.url());
      }
    });
    await page.getByRole('link', { name: 'Správa' }).click();

    await expect(page.getByRole('row').filter({ hasText: 'říjen 2026' })).toContainText(/500\sKč/);
    await expect(page.getByText('1 platba čeká na přiřazení')).toBeVisible();
    expect(serverReads).toEqual([]);

    await page.getByRole('link', { name: 'Platby z banky' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Nováková Jana' })).toBeVisible();
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      (route) => route.abort('internetdisconnected'),
    );
    await context.setOffline(true);
    await page.getByRole('link', { name: 'Přehled', exact: true }).click();

    const importCard = page.locator('.ui-card[aria-labelledby="admin-import-title"]');
    await expect(importCard).toContainText('Fio odmítlo token');
    await expect(importCard).not.toContainText('Fio refused');
    await expect(page.getByRole('row').filter({ hasText: 'říjen 2026' })).toContainText(/500\sKč/);
    await expect(page.getByText('1 platba čeká na přiřazení')).toBeVisible();
    expect(serverReads).toEqual([]);
    await context.setOffline(false);
  });
});
