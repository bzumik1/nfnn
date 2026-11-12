import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Connectivity } from '../../../core/connectivity/connectivity';
import type {
  AccountStore,
  CopyContents,
  StoredChunk,
} from '../../../core/device/store/account-store';
import {
  COPY_CHANNELS,
  type CopyChannel,
  DeviceVault,
  type OpenedCopy,
} from '../../../core/device/store/device-vault';
import { ErrorReporter } from '../../../core/errors/error-reporter';
import {
  AdministrationCopyDownload,
  type AdministrationDownloadOutcome,
} from './administration-copy-download';
import { AdministrationPageReads } from './administration-page-reads';

const ADMIN_ID = '0190c3a2-7b1e-7cc1-8a52-3f1e2d4c5b6a';
const DONOR_ID = '01a18e56-bdb0-775a-bd0a-a60756831369';
const SERVER_ACTOR = '00000000-0000-0000-0000-000000000000';

const ARTICLE = { id: 'news-1', title: 'Letní tábor', version: 'a1' };
const DRAFT = { id: 'news-2', title: 'Koncept', version: 'a2' };
const PROJECT = { id: 'project-1', title: 'Pomoc Elišce', version: 'p1' };
const PEOPLE = {
  members: [],
  note: 'Slovo zakladatelů',
  footnote: null,
  noteVersion: 'n1',
  footnoteVersion: 'f1',
};
const BAND = { photo: { id: 'photo-1', url: '/api/content/media/photo-1', alt: 'Děti' } };
const ABOUT = { photo: { id: 'photo-2', url: '/api/content/media/photo-2', alt: 'Zakladatelé' } };
const SETTINGS = { settings: [], secretsCanBeStored: true, version: 's1' };
const BACKUPS = { available: true, backups: [], pendingRequests: 0, lastBackup: null };
const FAILED_BACKUP = {
  outcome: 'FAILED',
  startedAt: '2026-11-12T02:00:00Z',
  finishedAt: '2026-11-12T02:00:03Z',
  fileName: null,
  sizeBytes: null,
  tables: null,
  requestId: null,
  error: 'pg_dump: error: out of memory',
};
const SERVER_ACTION = {
  id: '00000000-0000-7000-8000-000000000004',
  adminId: SERVER_ACTOR,
  adminName: null,
  adminEmail: null,
  action: 'PAIR_PAYMENT',
  subjectId: 'payment-1',
  donorId: null,
  summary: 'Souhrn ze serveru',
  details: 'paymentId=payment-1',
  performedAt: '2026-11-02T08:00:00.123456Z',
  client: null,
};
const REPORT_ROW = {
  recipients: ['info@nfnn.cz'],
  sendDay: 2,
  sendHour: 8,
  sections: { donors: true, donations: true, unpairedPayments: true, bankImport: false },
  changedAt: '2026-09-01T10:00:00Z',
  sentReports: [{ month: '2026-10', sentAt: '2026-11-02T08:00:00Z' }],
  version: 'r1',
  nextReport: { month: '2026-11', dueOn: '2026-12-02' },
  lastEndedMonth: '2026-10',
};
const ADMIN_ACCOUNT = { donorId: ADMIN_ID, name: 'Petr Správce', email: 'petr@example.cz' };

function audit(
  id: string,
  performedAt: string,
  extra: { adminId?: string; summary?: string | null; donorId?: string | null } = {},
) {
  return {
    id,
    adminId: extra.adminId ?? ADMIN_ID,
    action: 'PAIR_PAYMENT',
    subjectId: 'payment-1',
    performedAt,
    client: null,
    summary: extra.summary === undefined ? `Souhrn ${id}` : extra.summary,
    donorId: extra.donorId ?? null,
  };
}

function chunk(id: string, rows: readonly unknown[]): StoredChunk {
  return { id, rowsSha256: 'x', rows };
}

function fullCopy(): CopyContents {
  return {
    chunks: [
      chunk('content/news', [ARTICLE, DRAFT]),
      chunk('content/projects', [PROJECT]),
      chunk('content/project-order', [{ order: 'YEAR' }]),
      chunk('content/about', [ABOUT]),
      chunk('content/donate-band', [BAND]),
      chunk('content/people', [PEOPLE]),
      chunk('operations/settings', [SETTINGS]),
      chunk('operations/backups', [BACKUPS]),
      chunk('donations/report-settings', [REPORT_ROW]),
      chunk('donors/accounts:2026-01', [ADMIN_ACCOUNT]),
      chunk('donors/audit:2026-10', [
        audit('00000000-0000-7000-8000-000000000003', '2026-10-30T10:00:00Z', {
          donorId: DONOR_ID,
        }),
        audit('00000000-0000-7000-8000-000000000005', '2026-10-05T10:00:00Z'),
        audit('00000000-0000-7000-8000-000000000002', '2026-10-05T10:00:00.4Z'),
        audit('00000000-0000-7000-8000-000000000001', '2026-10-05T10:00:00.400000Z', {
          summary: null,
        }),
      ]),
      chunk('donors/audit:2026-11', [
        audit('00000000-0000-7000-8000-000000000004', '2026-11-02T08:00:00.123456Z', {
          adminId: SERVER_ACTOR,
        }),
      ]),
      chunk('donors/audit:2026-09', [
        audit('00000000-0000-7000-8000-000000000000', '2026-09-30T23:59:59Z'),
      ]),
    ],
    summary: { donations: { today: '2026-11-12', byYear: [] } },
    storedAt: '2026-11-12T08:00:00.000Z',
  };
}

function copyFromBefore(): CopyContents {
  const olderReport = Object.fromEntries(
    Object.entries(REPORT_ROW).filter(
      ([field]) => !['nextReport', 'lastEndedMonth'].includes(field),
    ),
  );
  return {
    chunks: [
      chunk('donations/report-settings', [olderReport]),
      chunk('donors/accounts:2026-01', [ADMIN_ACCOUNT]),
    ],
    summary: { donations: { today: '2026-11-12', byYear: [] } },
    storedAt: '2026-11-12T08:00:00.000Z',
  };
}

describe('Given the content, settings, history and backups pages reading through the copy on this device', () => {
  let http: HttpTestingController;
  let reads: AdministrationPageReads;
  let opened: ReturnType<typeof signal<OpenedCopy | null>>;
  let offline: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-12T09:00:00Z') });
    opened = signal<OpenedCopy | null>(null);
    offline = signal(false);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: DeviceVault, useValue: { administration: opened.asReadonly() } },
        { provide: Connectivity, useValue: { offline: offline.asReadonly() } },
        {
          provide: AdministrationCopyDownload,
          useValue: {
            refresh: vi
              .fn<() => Promise<AdministrationDownloadOutcome>>()
              .mockResolvedValue('unchanged'),
            checkedAt: signal<string | null>(null).asReadonly(),
            writesAtStart: () => null,
          },
        },
        {
          provide: COPY_CHANNELS,
          useValue: () =>
            ({
              postMessage: () => undefined,
              addEventListener: () => undefined,
              close: () => undefined,
            }) as unknown as CopyChannel,
        },
        { provide: ErrorReporter, useValue: { report: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    reads = TestBed.inject(AdministrationPageReads);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function open(held: CopyContents): void {
    opened.set({
      store: { copyId: 'copy-1', contents: signal(held).asReadonly() } as unknown as AccountStore,
      reason: 'unlocked',
      account: { email: 'petr@example.cz', userHandle: 'h', administrator: true },
    });
  }

  async function fromServer<T>(answer: Promise<T>, url: string, body: object): Promise<T> {
    await vi.waitFor(() => http.expectOne((request) => request.url === url).flush(body));
    return answer;
  }

  describe('when no copy is open', () => {
    it('then the news, the settings and the history come from the server as today', async () => {
      expect(
        await fromServer(firstValueFrom(reads.newsList()), '/api/admin/content/news', {
          items: [ARTICLE],
        }),
      ).toEqual({ items: [ARTICLE] });
      expect(
        await fromServer(
          firstValueFrom(reads.settings()),
          '/api/admin/operations/settings',
          SETTINGS,
        ),
      ).toEqual(SETTINGS);
      const page = firstValueFrom(reads.adminActions(null, 50));
      await vi.waitFor(() => {
        const request = http.expectOne((asked) => asked.url === '/api/admin/donors/actions');
        expect(request.request.params.get('limit')).toBe('50');
        request.flush({ items: [], hasMore: false });
      });
      expect(await page).toEqual({ items: [], hasMore: false, fromCopy: false });
    });
  });

  describe('when a copy that holds every part is open', () => {
    beforeEach(() => open(fullCopy()));

    it('then the news list and an article come from the copy, and an article it does not hold from the server', async () => {
      expect(await firstValueFrom(reads.newsList())).toEqual({ items: [ARTICLE, DRAFT] });
      expect(await firstValueFrom(reads.newsArticle('news-2'))).toEqual(DRAFT);

      const missing = firstValueFrom(reads.newsArticle('news-9'));
      expect(
        await fromServer(missing, '/api/admin/content/news/news-9', { ...ARTICLE, id: 'news-9' }),
      ).toEqual({ ...ARTICLE, id: 'news-9' });
    });

    it('then the stories, the About section, the band, the people and the settings come from the copy', async () => {
      expect(await firstValueFrom(reads.projectList())).toEqual({ items: [PROJECT] });
      expect(await firstValueFrom(reads.project('project-1'))).toEqual(PROJECT);
      expect(await firstValueFrom(reads.projectOrder())).toEqual({ order: 'YEAR' });
      expect(await firstValueFrom(reads.about())).toEqual(ABOUT);
      expect(await firstValueFrom(reads.donateBand())).toEqual(BAND);
      expect(await firstValueFrom(reads.people())).toEqual(PEOPLE);
      expect(await firstValueFrom(reads.settings())).toEqual(SETTINGS);
    });

    it('then the backups without their run errors come from the copy for the overview', async () => {
      expect(await firstValueFrom(reads.backupsWithoutRunErrors())).toEqual(BACKUPS);
    });

    it('then the backups come from the server while online, with a failed run and its error text', async () => {
      const answer = { ...BACKUPS, lastBackup: FAILED_BACKUP };

      expect(
        await fromServer(firstValueFrom(reads.backups()), '/api/admin/operations/backups', answer),
      ).toEqual({ ...answer, fromCopy: false });
    });

    it('then the history comes from the server while online, with the details of each entry', async () => {
      const page = firstValueFrom(reads.adminActions(null, 50));

      expect(
        await fromServer(page, '/api/admin/donors/actions', {
          items: [SERVER_ACTION],
          hasMore: false,
        }),
      ).toEqual({ items: [SERVER_ACTION], hasMore: false, fromCopy: false });
    });

    it('then the backups and the history come from the copy when the server cannot be reached', async () => {
      const backups = firstValueFrom(reads.backups());
      await vi.waitFor(() =>
        http
          .expectOne('/api/admin/operations/backups')
          .error(new ProgressEvent('error'), { status: 0 }),
      );
      expect(await backups).toEqual({ ...BACKUPS, fromCopy: true });

      const page = firstValueFrom(reads.adminActions(null, 2));
      await vi.waitFor(() =>
        http
          .expectOne((request) => request.url === '/api/admin/donors/actions')
          .flush(null, { status: 502, statusText: 'Bad Gateway' }),
      );
      expect((await page).fromCopy).toBe(true);
    });

    it('then a refusal of the history by the server reaches the page', async () => {
      const page = firstValueFrom(reads.adminActions(null, 50));
      await vi.waitFor(() =>
        http
          .expectOne((request) => request.url === '/api/admin/donors/actions')
          .flush(
            { type: 'https://nfnn.cz/problems/auth/forbidden', status: 403 },
            { status: 403, statusText: 'Forbidden' },
          ),
      );
      await expect(page).rejects.toMatchObject({ status: 403 });
    });

    describe('and the device is offline', () => {
      beforeEach(() => offline.set(true));

      it('then the pages still read the copy', async () => {
        expect(await firstValueFrom(reads.people())).toEqual(PEOPLE);
        expect(await firstValueFrom(reads.backups())).toEqual({ ...BACKUPS, fromCopy: true });
        expect((await firstValueFrom(reads.adminActions(null, 50))).items).toHaveLength(6);
      });

      it('then the history lists every month newest first, a tie by the larger id first and a whole second before its fractions, with the names from the accounts and no details', async () => {
        const page = await firstValueFrom(reads.adminActions(null, 4));

        expect(page.fromCopy).toBe(true);
        expect(page.hasMore).toBe(true);
        expect(page.items.map((item) => item.id)).toEqual([
          '00000000-0000-7000-8000-000000000004',
          '00000000-0000-7000-8000-000000000003',
          '00000000-0000-7000-8000-000000000002',
          '00000000-0000-7000-8000-000000000001',
        ]);
        expect(page.items[0]).toEqual(
          expect.objectContaining({ adminId: SERVER_ACTOR, adminName: null, adminEmail: null }),
        );
        expect(page.items[1]).toEqual({
          id: '00000000-0000-7000-8000-000000000003',
          adminId: ADMIN_ID,
          adminName: 'Petr Správce',
          adminEmail: 'petr@example.cz',
          action: 'PAIR_PAYMENT',
          subjectId: 'payment-1',
          donorId: DONOR_ID,
          summary: 'Souhrn 00000000-0000-7000-8000-000000000003',
          details: '',
          performedAt: '2026-10-30T10:00:00Z',
          client: null,
        });
      });

      it('then the next page holds what is strictly older than the last listed entry, and an entry without a summary has an empty one', async () => {
        const first = await firstValueFrom(reads.adminActions(null, 3));
        const next = await firstValueFrom(reads.adminActions(first.items[2], 3));

        expect(next.hasMore).toBe(false);
        expect(next.items.map((item) => [item.id, item.summary])).toEqual([
          ['00000000-0000-7000-8000-000000000001', ''],
          ['00000000-0000-7000-8000-000000000005', 'Souhrn 00000000-0000-7000-8000-000000000005'],
          ['00000000-0000-7000-8000-000000000000', 'Souhrn 00000000-0000-7000-8000-000000000000'],
        ]);
      });

      it('then a cursor from a server page the copy does not hold pages on from its time and id', async () => {
        const next = await firstValueFrom(
          reads.adminActions(
            { id: '00000000-0000-7000-8000-0000000000ff', performedAt: '2026-10-05T10:00:00.4Z' },
            50,
          ),
        );

        expect(next.items.map((item) => item.id)).toEqual([
          '00000000-0000-7000-8000-000000000002',
          '00000000-0000-7000-8000-000000000001',
          '00000000-0000-7000-8000-000000000005',
          '00000000-0000-7000-8000-000000000000',
        ]);
        expect(next.hasMore).toBe(false);
      });
    });
  });

  describe('when a copy that holds the people but not the About section and the band is open', () => {
    beforeEach(() =>
      open({
        ...fullCopy(),
        chunks: fullCopy().chunks.filter(
          (held) => held.id !== 'content/about' && held.id !== 'content/donate-band',
        ),
      }),
    );

    it('then the About section and the band come from the server, as the people do without theirs', async () => {
      expect(
        await fromServer(firstValueFrom(reads.about()), '/api/admin/content/about', ABOUT),
      ).toEqual(ABOUT);
      expect(
        await fromServer(firstValueFrom(reads.donateBand()), '/api/admin/content/donate-band', {
          photo: null,
        }),
      ).toEqual({ photo: null });
    });
  });

  describe('when a copy stored before the content and the operations were kept is open', () => {
    beforeEach(() => open(copyFromBefore()));

    it('then the content and the operations come from the server', async () => {
      expect(
        await fromServer(firstValueFrom(reads.newsList()), '/api/admin/content/news', {
          items: [],
        }),
      ).toEqual({ items: [] });
      expect(
        await fromServer(firstValueFrom(reads.about()), '/api/admin/content/about', {
          photo: null,
        }),
      ).toEqual({ photo: null });
      expect(
        await fromServer(firstValueFrom(reads.backups()), '/api/admin/operations/backups', BACKUPS),
      ).toEqual({ ...BACKUPS, fromCopy: false });
    });

    it('then the monthly e-mail without the next report the server named comes from the server', async () => {
      const answer = { settings: {}, sentReports: [], nextReport: null, lastEndedMonth: '2026-10' };
      expect(
        await fromServer(firstValueFrom(reads.report()), '/api/admin/donations/report', answer),
      ).toEqual({ ...answer, heldAt: null });
    });
  });
});
