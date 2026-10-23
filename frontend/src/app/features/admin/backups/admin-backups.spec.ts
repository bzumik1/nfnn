import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { backupFile, backupRun, backupsView } from '../testing/admin-fixtures';
import { AdminBackups, JOB_POLL_MS } from './admin-backups';

const BACKUPS_URL = '/api/admin/operations/backups';
const REQUESTS_URL = '/api/admin/operations/backups/requests';

function problem(status: number, type: string, title: string, detail: string) {
  return {
    body: { type: `https://nfnn.cz/problems/${type}`, title, detail, status },
    options: {
      status,
      statusText: 'Error',
      headers: { 'Content-Type': 'application/problem+json' },
    },
  };
}

describe('Given an administrator on the backups page', () => {
  let fixture: ComponentFixture<AdminBackups>;
  let http: HttpTestingController;
  let store: AuthStore;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminBackups],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminBackups);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function texts(selector: string): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll(selector) as NodeListOf<HTMLElement>,
    ).map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim());
  }

  function button(name: string): HTMLButtonElement {
    const found = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((candidate) => candidate.textContent?.trim() === name);
    if (found === undefined) {
      throw new Error(`No button ${name}`);
    }
    return found;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function respond(body: object): Promise<void> {
    http.expectOne(BACKUPS_URL).flush(body);
    await settle();
  }

  it('when the page opens, then it asks for the backups with the token and says it is loading', () => {
    const request = http.expectOne(BACKUPS_URL);

    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(text('h1')).toBe('Zálohy');
    expect(text('[role="status"]')).toBe('Načítáme stav záloh…');
    request.flush(backupsView());
  });

  it('when everything is fine, then the status, the last runs and the dumps newest first are shown', async () => {
    await respond(backupsView());

    expect(text('.healthy')).toBe('Zálohování je v pořádku.');
    expect(texts('.run dd')).toEqual([
      'Poslední záloha: 23. 10. 2026 03:00, nfnn-2026-10-23_0300.dump (2 kB).',
      'Poslední zkušební obnova: 18. 10. 2026 04:00, 37 tabulek ze zálohy nfnn-2026-10-18_0300.dump.',
      'Prázdná. Dump, který do ní na serveru dáte, se při příštím startu kontejneru nfnn-backup obnoví do prázdné databáze (postup je v deploy/README.md, část Obnova).',
    ]);
    expect(texts('tbody tr')).toEqual([
      'nfnn-2026-10-23_0300.dump Noční 23. 10. 2026 03:00 2 kB Stáhnout',
      'nfnn-2026-10-22_0300.dump Noční 22. 10. 2026 03:00 1 kB Stáhnout',
    ]);
    expect(button('Zálohovat teď').disabled).toBe(false);
    expect(button('Ověřit obnovu teď').disabled).toBe(false);
  });

  it('when the backups have problems, then each is named in an alert, the failed runs say why and the restore folder is described', async () => {
    await respond(
      backupsView({
        lastBackup: backupRun({
          outcome: 'FAILED',
          finishedAt: '2026-10-23T01:00:01Z',
          sizeBytes: null,
          error: 'pg_dump: error: connection to server failed',
        }),
        lastTestRestore: null,
        lastRestore: backupRun({
          outcome: 'FAILED',
          fileName: 'zaloha.dump',
          error: 'the database is not empty; name the file .force.dump to replace it',
        }),
        restoreFiles: [
          { fileName: 'zaloha.dump.skipped', state: 'SKIPPED', changedAt: '2026-10-23T04:36:52Z' },
          { fileName: 'stara.dump.failed', state: 'FAILED', changedAt: '2026-10-22T04:36:52Z' },
        ],
        pendingRequests: 2,
        problems: ['BACKUP_FAILED', 'TEST_RESTORE_MISSING'],
      }),
    );

    expect(texts('.problems li')).toEqual([
      'Poslední záloha selhala.',
      'Zkušební obnova ještě neproběhla, i když zálohy jsou starší než týden.',
    ]);
    expect(fixture.nativeElement.querySelector('.problems')?.getAttribute('role')).toBe('alert');
    expect(texts('.run dd')[0]).toBe(
      'Poslední záloha selhala 23. 10. 2026 03:00: pg_dump: error: connection to server failed',
    );
    expect(texts('.run dd')[1]).toBe(
      'Poslední zkušební obnova: zatím žádná. Běží každou neděli ve 4:00.',
    );
    expect(texts('.restore-files li')).toEqual([
      'zaloha.dump.skipped byl 23. 10. 2026 06:36 přeskočen: databáze nebyla prázdná nebo ve složce leželo víc souborů.',
      'stara.dump.failed se 22. 10. 2026 06:36 obnovit nepodařilo; backend nenastartuje, dokud soubor ve složce leží.',
    ]);
    expect(text('.restore-error')).toBe(
      'Poslední obnova skončila chybou: the database is not empty; name the file .force.dump to replace it',
    );
    expect(text('.pending')).toBe('Na vyřízení čekají 2 požadavky.');
  });

  it('when the backup folder is not connected, then the page says so and the actions are disabled', async () => {
    await respond(
      backupsView({
        available: false,
        backups: [],
        lastBackup: null,
        lastTestRestore: null,
        problems: ['BACKUPS_UNAVAILABLE'],
      }),
    );

    expect(texts('.problems li')[0]).toContain('Backend nevidí složku záloh.');
    expect(button('Zálohovat teď').disabled).toBe(true);
    expect(button('Ověřit obnovu teď').disabled).toBe(true);
    expect(text('[aria-labelledby="backups-list-title"]')).toContain('Zatím žádná záloha.');
  });

  describe('when a backup is started', () => {
    beforeEach(async () => {
      await respond(backupsView());
      vi.useFakeTimers();
      button('Zálohovat teď').click();
      await settle();
    });

    it('then the request is posted, the button is busy and the page polls until the run with the request id appears', async () => {
      const request = http.expectOne(REQUESTS_URL);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ kind: 'BACKUP' });
      expect(button('Zálohujeme…').disabled).toBe(true);
      expect(button('Ověřit obnovu teď').disabled).toBe(true);
      request.flush({ requestId: 'req-1', kind: 'BACKUP', requestedAt: '2026-10-23T08:00:00Z' });
      await settle();

      await vi.advanceTimersByTimeAsync(JOB_POLL_MS);
      http.expectOne(BACKUPS_URL).flush(backupsView({ pendingRequests: 1 }));
      await settle();
      expect(button('Zálohujeme…').disabled).toBe(true);

      await vi.advanceTimersByTimeAsync(JOB_POLL_MS);
      http.expectOne(BACKUPS_URL).flush(
        backupsView({
          backups: [
            backupFile({
              fileName: 'nfnn-2026-10-23_1000-rucni.dump',
              kind: 'REQUESTED',
              createdAt: '2026-10-23T08:00:04Z',
            }),
            backupFile(),
          ],
          lastBackup: backupRun({
            fileName: 'nfnn-2026-10-23_1000-rucni.dump',
            finishedAt: '2026-10-23T08:00:04Z',
            requestId: 'req-1',
          }),
        }),
      );
      await settle();

      expect(text('.admin-notice--status')).toBe(
        'Záloha nfnn-2026-10-23_1000-rucni.dump je hotová (2 kB).',
      );
      expect(button('Zálohovat teď').disabled).toBe(false);
      expect(texts('tbody tr')[0]).toContain('nfnn-2026-10-23_1000-rucni.dump Na požádání');
    });

    it('then a failed run is reported in an alert with its error', async () => {
      http
        .expectOne(REQUESTS_URL)
        .flush({ requestId: 'req-1', kind: 'BACKUP', requestedAt: '2026-10-23T08:00:00Z' });
      await settle();
      await vi.advanceTimersByTimeAsync(JOB_POLL_MS);
      http.expectOne(BACKUPS_URL).flush(
        backupsView({
          lastBackup: backupRun({
            outcome: 'FAILED',
            requestId: 'req-1',
            error: 'pg_dump: error: out of memory',
          }),
          problems: ['BACKUP_FAILED'],
        }),
      );
      await settle();

      expect(text('.admin-notice--alert')).toBe('Záloha selhala: pg_dump: error: out of memory');
      expect(texts('.problems li')).toEqual(['Poslední záloha selhala.']);
    });

    it('then a request nobody picks up ends with the hint to check the container', async () => {
      http
        .expectOne(REQUESTS_URL)
        .flush({ requestId: 'req-1', kind: 'BACKUP', requestedAt: '2026-10-23T08:00:00Z' });
      await settle();
      for (let poll = 0; poll < 20; poll++) {
        await vi.advanceTimersByTimeAsync(JOB_POLL_MS);
        http.expectOne(BACKUPS_URL).flush(backupsView({ pendingRequests: 1 }));
        await settle();
      }

      expect(text('.admin-notice--alert')).toContain(
        'Kontejner nfnn-backup si požadavek do minuty nevzal.',
      );
      expect(button('Zálohovat teď').disabled).toBe(false);
    });

    it('then a refused request is reported with the problem title', async () => {
      http
        .expectOne(REQUESTS_URL)
        .flush(
          problem(
            409,
            'operations/backups-unavailable',
            'Zálohování není připojené',
            'Kontejner nfnn-backup neběží.',
          ).body,
          problem(409, 'operations/backups-unavailable', '', '').options,
        );
      await settle();

      expect(text('.admin-notice--alert')).toBe(
        'Zálohování není připojené. Kontejner nfnn-backup neběží.',
      );
      expect(button('Zálohovat teď').disabled).toBe(false);
    });
  });

  it('when a test restore is started and finishes, then the page reports the tables it counted', async () => {
    await respond(backupsView());
    vi.useFakeTimers();
    button('Ověřit obnovu teď').click();
    await settle();
    const request = http.expectOne(REQUESTS_URL);
    expect(request.request.body).toEqual({ kind: 'TEST_RESTORE' });
    expect(button('Ověřujeme obnovu…').disabled).toBe(true);
    request.flush({
      requestId: 'req-2',
      kind: 'TEST_RESTORE',
      requestedAt: '2026-10-23T08:00:00Z',
    });
    await settle();
    await vi.advanceTimersByTimeAsync(JOB_POLL_MS);
    http.expectOne(BACKUPS_URL).flush(
      backupsView({
        lastTestRestore: backupRun({
          fileName: 'nfnn-2026-10-23_0300.dump',
          finishedAt: '2026-10-23T08:00:20Z',
          tables: 41,
          requestId: 'req-2',
        }),
      }),
    );
    await settle();

    expect(text('.admin-notice--status')).toBe(
      'Zkušební obnova zálohy nfnn-2026-10-23_0300.dump proběhla: 41 tabulek.',
    );
  });

  it('when a dump is downloaded, then the file is fetched as a blob with the token and saved under its name', async () => {
    await respond(backupsView());
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:http://localhost/backup'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    (fixture.nativeElement.querySelector('tbody button') as HTMLButtonElement | null)?.click();
    await settle();

    const request = http.expectOne(`${BACKUPS_URL}/nfnn-2026-10-23_0300.dump`);
    expect(request.request.responseType).toBe('blob');
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(button('Stahujeme…').disabled).toBe(true);
    request.flush(new Blob([new Uint8Array(1590)], { type: 'application/octet-stream' }), {
      headers: { 'Content-Disposition': 'attachment; filename="nfnn-2026-10-23_0300.dump"' },
    });
    await settle();

    expect(clicked).toEqual(['nfnn-2026-10-23_0300.dump']);
    expect(texts('tbody button')).toEqual(['Stáhnout', 'Stáhnout']);
  });

  it('when the token is not accepted, then the administrator is sent home to sign in', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const dialog = TestBed.inject(LoginDialogService);
    const open = vi.spyOn(dialog, 'open');
    const refused = problem(401, 'auth/unauthenticated', 'Přihlaste se', 'Chybí token.');

    http.expectOne(BACKUPS_URL).flush(refused.body, refused.options);
    http.expectOne('/api/donors/auth/logout').flush(null);
    await settle();

    expect(navigate).toHaveBeenCalledWith('/');
    expect(open).toHaveBeenCalled();
  });

  it('when the server fails, then the page offers a retry that asks again', async () => {
    http.expectOne(BACKUPS_URL).flush('down', { status: 500, statusText: 'Error' });
    await settle();

    expect(text('.admin-error')).toContain('Stav záloh se nepodařilo načíst.');
    button('Zkusit znovu').click();
    await settle();
    await respond(backupsView());

    expect(text('.healthy')).toBe('Zálohování je v pořádku.');
  });
});
