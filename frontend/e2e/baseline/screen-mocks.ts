import { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { routeLogsApi } from '../admin-logs-api';
import {
  adminSettings,
  administrator,
  bankAccountItem,
  donationItem,
  DonorApiMock,
  noDonations,
  session,
} from '../donor-session';

export const FIXED_TIME = new Date('2026-10-28T09:00:00Z');

const IMAGE_ID = '0199f3e0-0000-7000-8000-00000000a001';
const PETR_ID = '019a1c00-0000-7000-8000-00000000a002';
const coverImage = { id: IMAGE_ID, url: `/api/content/media/${IMAGE_ID}`, alt: 'Děti na zahradě' };

export const article = {
  id: '0199f3e0-0000-7000-8000-00000000c001',
  slug: 'zahrada-pro-deti',
  title: 'Zahrada pro děti',
  tag: 'Projekt',
  perex: 'Stavíme zahradu, kde si děti budou hrát.',
  body: 'První odstavec o zahradě.\n\nDruhý odstavec o tom, kdo pomohl.',
  coverImage,
  publishedOn: '2026-10-20',
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-20T07:30:00Z',
};

const draft = {
  ...article,
  id: '0199f3e0-0000-7000-8000-00000000c002',
  slug: 'beneficni-koncert',
  title: 'Benefiční koncert',
  tag: null,
  perex: 'Zveme vás na koncert.',
  body: 'Text o koncertu.',
  coverImage: null,
  publishedOn: null,
  createdAt: '2026-10-22T09:00:00Z',
  updatedAt: '2026-10-22T09:00:00Z',
};

export const project = {
  id: '0199f3e0-0000-7000-8000-00000000c003',
  slug: 'dominik-7-let',
  title: 'Dominik, 7 let',
  year: 2024,
  tag: 'Kompenzační pomůcky',
  perex: 'Pomohli jsme mu získat speciální kočárek.',
  body: 'Dominik potřeboval speciální kočárek.\n\nDěkujeme všem dárcům.',
  coverImage,
  publishedOn: '2026-10-01',
  createdAt: '2026-09-19T09:00:00Z',
  updatedAt: '2026-10-01T07:30:00Z',
};

const tally = (count: number, totalMinor: number) => ({ count, totalMinor, currency: 'CZK' });

export const donorWithDonations: DonorApiMock = {
  summary: {
    totalAmountMinor: 175000,
    currency: 'CZK',
    count: 3,
    lastReceivedAt: '2026-10-15',
    byYear: [
      { year: 2026, count: 2, totalAmountMinor: 150000 },
      { year: 2025, count: 1, totalAmountMinor: 25000 },
    ],
    yearlyReceiptsAvailableThrough: 2025,
    receiptsAvailableFrom: 2025,
  },
  list: {
    items: [
      donationItem({
        id: '0192f0f1-0000-7000-8000-000000000004',
        receivedAt: '2026-10-15',
        amountMinor: 50000,
        receiptNumber: '2026-000002',
      }),
      donationItem({
        id: '0192f0f1-0000-7000-8000-000000000003',
        receivedAt: '2026-01-10',
        amountMinor: 100000,
        pairedBy: 'SENDER_ACCOUNT',
        senderAccount: '2900233333/2010',
      }),
      donationItem({
        id: '0192f0f1-0000-7000-8000-000000000002',
        receivedAt: '2025-11-05',
        amountMinor: 25000,
      }),
      donationItem({
        id: '0192f0f1-0000-7000-8000-000000000001',
        receivedAt: '2025-08-20',
        amountMinor: 200000,
        status: 'REFUNDED',
        receiptAvailable: false,
      }),
    ],
    totalAmountMinor: 175000,
    currency: 'CZK',
    count: 3,
  },
};

export { noDonations };

const unpairedPayment = {
  id: '019a1c00-0000-7000-8000-000000001001',
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
  donation: null,
};

const pairedPayment = {
  ...unpairedPayment,
  id: '019a1c00-0000-7000-8000-000000001002',
  bankTransactionId: 1002,
  bookedOn: '2026-10-08',
  amountMinor: 125050,
  variableSymbol: '7310945528',
  counterpartyName: 'Svoboda Petr',
  messageForRecipient: null,
  donation: {
    id: '0192f0f1-0000-7000-8000-000000000010',
    donorId: PETR_ID,
    donorName: 'Petr Svoboda',
    pairedBy: 'VARIABLE_SYMBOL',
    status: 'RECEIVED',
    recordedAt: '2026-10-08T09:00:00Z',
    receiptIssued: true,
  },
};

const janaAccount = {
  donorId: administrator.id,
  type: 'PERSON',
  name: 'Jana Nováková',
  companyIdentifier: null,
  address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
  email: 'jana@example.cz',
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
  donorId: PETR_ID,
  name: 'Petr Svoboda',
  email: 'petr@example.cz',
  variableSymbol: '7310945528',
  administrator: false,
  passkeys: 1,
};

const petrDetail = {
  donor: {
    donorId: PETR_ID,
    name: 'Petr Svoboda',
    type: 'PERSON',
    variableSymbol: '7310945528',
    companyIdentifier: null,
    address: { street: 'Krátká 3', city: 'Děčín', postalCode: '405 02' },
    preferredLocale: 'cs',
    registeredAt: '2026-10-17T10:00:00Z',
    erasedAt: null,
  },
  bankAccounts: [
    bankAccountItem({ donationCount: 1, totalAmountMinor: 125050, lastDonationOn: '2026-10-08' }),
  ],
  donations: {
    items: [
      donationItem({
        id: '0192f0f1-0000-7000-8000-000000000010',
        receivedAt: '2026-10-08',
        amountMinor: 125050,
        receiptNumber: '2026-000001',
      }),
    ],
    totalAmountMinor: 125050,
    currency: 'CZK',
    count: 1,
  },
  receipts: [
    {
      id: '019a1c00-0000-7000-8000-00000000f001',
      number: '2026-000001',
      kind: 'SINGLE',
      donationId: '0192f0f1-0000-7000-8000-000000000010',
      donationReceivedOn: '2026-10-08',
      year: null,
      issuedOn: '2026-10-17',
      issuedAt: '2026-10-17T09:00:00Z',
      locale: 'cs',
      active: true,
    },
  ],
};

const backupRun = {
  outcome: 'OK',
  startedAt: '2026-10-28T02:00:00Z',
  finishedAt: '2026-10-28T02:00:03Z',
  fileName: 'nfnn-2026-10-28_0300.dump',
  sizeBytes: 1590,
  tables: null,
  requestId: null,
  error: null,
};

const backups = {
  available: true,
  backups: [
    {
      fileName: 'nfnn-2026-10-28_0300.dump',
      kind: 'DAILY',
      sizeBytes: 1590,
      createdAt: '2026-10-28T02:00:03Z',
    },
    {
      fileName: 'nfnn-2026-10-27_0300.dump',
      kind: 'DAILY',
      sizeBytes: 1550,
      createdAt: '2026-10-27T02:00:03Z',
    },
  ],
  lastBackup: backupRun,
  lastTestRestore: {
    ...backupRun,
    startedAt: '2026-10-25T03:00:00Z',
    finishedAt: '2026-10-25T03:00:05Z',
    fileName: 'nfnn-2026-10-25_0300.dump',
    tables: 37,
  },
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
};

const overview = {
  year: 2026,
  availableYears: [2026, 2025],
  donorsRegistered: 3,
  newDonors: 3,
  received: tally(5, 288350),
  paired: tally(4, 273350),
  unpaired: tally(1, 15000),
  months: [
    {
      month: '2026-10',
      received: tally(1, 99900),
      newDonors: 1,
      paired: tally(1, 99900),
      unpaired: tally(0, 0),
    },
    {
      month: '2026-09',
      received: tally(3, 168450),
      newDonors: 1,
      paired: tally(2, 153450),
      unpaired: tally(1, 15000),
    },
    {
      month: '2026-08',
      received: tally(1, 20000),
      newDonors: 1,
      paired: tally(1, 20000),
      unpaired: tally(0, 0),
    },
  ],
};

const fictionalSettings = {
  ...adminSettings,
  settings: adminSettings.settings.map((setting) => {
    if (setting.name === 'RECEIPT_SIGNATORY_NAME') {
      return { ...setting, value: 'Petr Vzorový' };
    }
    if (setting.name === 'MAIL_USERNAME') {
      return { ...setting, value: 'mailer@example.cz' };
    }
    if (setting.name === 'MAIL_HOST') {
      return { ...setting, value: 'smtp.example.cz' };
    }
    return setting;
  }),
};

const adminAnswers: Record<string, unknown> = {
  '/api/admin/donations/import-state': {
    coveredFrom: '2026-07-30',
    coveredTo: '2026-10-28',
    lastAttemptedAt: '2026-10-28T08:00:00Z',
    lastSucceededAt: '2026-10-28T08:00:00Z',
    lastFailure: null,
    consecutiveFailures: 0,
    reportedOutage: null,
  },
  '/api/admin/donations/overview': overview,
  '/api/admin/operations/backups': backups,
  '/api/admin/donations/donors': {
    items: [
      {
        donorId: PETR_ID,
        name: 'Petr Svoboda',
        type: 'PERSON',
        variableSymbol: '7310945528',
        companyIdentifier: null,
      },
    ],
  },
  '/api/admin/donors/administrators': {
    items: [
      {
        donorId: administrator.id,
        name: 'Jana Nováková',
        email: 'jana@example.cz',
        secondFactorEnabled: true,
      },
      {
        donorId: PETR_ID,
        name: 'Petr Svoboda',
        email: 'petr@example.cz',
        secondFactorEnabled: true,
      },
    ],
  },
  '/api/admin/donations/symbol-claims': {
    items: [
      {
        id: '019a1c00-0000-7000-8000-00000000c001',
        donorId: administrator.id,
        donorName: 'Jana Nováková',
        account: '1234567/0800',
        variableSymbol: '6123456789',
        answer: 'CONFIRMED',
        answeredAt: '2026-10-20T09:00:00Z',
        donationCount: 3,
      },
      {
        id: '019a1c00-0000-7000-8000-00000000c002',
        donorId: PETR_ID,
        donorName: 'Petr Svoboda',
        account: '2900233333/2010',
        variableSymbol: '777',
        answer: 'DECLINED',
        answeredAt: '2026-10-19T08:30:00Z',
        donationCount: 0,
      },
    ],
  },
  '/api/admin/donors/actions': {
    items: [
      {
        id: '019a1c00-0000-7000-8000-00000000e001',
        adminId: administrator.id,
        adminName: 'Jana Nováková',
        adminEmail: 'jana@example.cz',
        action: 'PAIR_PAYMENT',
        subjectId: '019a1c00-0000-7000-8000-000000001001',
        details: 'Platba ručně přiřazena dárci',
        performedAt: '2026-10-22T10:00:00Z',
        client: null,
      },
      {
        id: '019a1c00-0000-7000-8000-00000000e002',
        adminId: administrator.id,
        adminName: 'Jana Nováková',
        adminEmail: 'jana@example.cz',
        action: 'SEND_MONTHLY_REPORT',
        subjectId: null,
        details: 'Měsíční přehled za 2026-09 ručně odeslán na info@nfnn.cz',
        performedAt: '2026-10-21T08:00:00Z',
        client: 'claude.ai',
      },
    ],
    hasMore: false,
  },
  '/api/admin/donors': { items: [janaAccount, petrAccount], hasMore: false },
  [`/api/admin/donors/${PETR_ID}`]: petrAccount,
  [`/api/admin/donations/donors/${PETR_ID}`]: petrDetail,
  '/api/admin/donations/report': {
    settings: {
      recipients: ['info@nfnn.cz'],
      sendDay: 1,
      sendHour: 7,
      sections: { donors: true, donations: true, unpairedPayments: true, bankImport: true },
      changedAt: null,
    },
    sentReports: [{ month: '2026-09', sentAt: '2026-10-01T05:00:12Z' }],
    nextReport: { month: '2026-10', dueOn: '2026-11-01' },
    lastEndedMonth: '2026-09',
  },
  '/api/admin/operations/settings': fictionalSettings,
  '/api/admin/content/news': { items: [article, draft] },
  '/api/admin/content/projects': { items: [project] },
  [`/api/admin/content/news/${article.id}`]: article,
  [`/api/admin/content/projects/${project.id}`]: project,
};

export const PETR_DETAIL_PATH = `/sprava/darci/${PETR_ID}`;

async function mockMedia(page: Page): Promise<void> {
  const cover = readFileSync(join(process.cwd(), 'public', 'images', 'news-1.webp'));
  await page.route(
    (url) => url.pathname.startsWith('/api/content/media/'),
    (route) => route.fulfill({ contentType: 'image/webp', body: cover }),
  );
}

export async function mockPublicContent(page: Page): Promise<void> {
  await mockMedia(page);
  await page.route(
    (url) => url.pathname === '/api/content/home',
    (route) => route.fulfill({ json: { news: [article], projects: [project] } }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) =>
      route.fulfill({ json: { items: [article], page: 0, size: 10, total: 1, hasMore: false } }),
  );
  await page.route(
    (url) => url.pathname === '/api/content/projects',
    (route) =>
      route.fulfill({ json: { items: [project], page: 0, size: 10, total: 1, hasMore: false } }),
  );
  await page.route(
    (url) => url.pathname === `/api/content/news/${article.slug}`,
    (route) => route.fulfill({ json: article }),
  );
  await page.route(
    (url) => url.pathname === `/api/content/projects/${project.slug}`,
    (route) => route.fulfill({ json: project }),
  );
}

export async function mockAdministration(page: Page): Promise<void> {
  await routeLogsApi(page);
  await mockMedia(page);
  await page.route(
    (url) => url.pathname in adminAnswers,
    (route) => route.fulfill({ json: adminAnswers[new URL(route.request().url()).pathname] }),
  );
  await page.route(
    (url) => url.pathname === '/api/admin/donations/payments',
    (route) => {
      const paired = new URL(route.request().url()).searchParams.get('pairing') === 'paired';
      return route.fulfill({
        json: {
          year: null,
          availableYears: [2026],
          items: [paired ? pairedPayment : unpairedPayment],
          total: 1,
        },
      });
    },
  );
}

export async function rememberedSession(page: Page, user = administrator): Promise<void> {
  await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200, user)));
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nfnn.donor-session', '1'));
}
