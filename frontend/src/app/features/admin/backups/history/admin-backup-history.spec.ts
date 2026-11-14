import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../../core/auth/testing/donor-fixtures';
import { backupFile, backupsView } from '../../testing/admin-fixtures';
import { AdminBackupHistory } from './admin-backup-history';
import {
  copyOf,
  openOfflineFromCopy,
  textOf,
  waitsForConnection,
} from '../../device-copy/testing/opened-copy';

const BACKUPS_URL = '/api/admin/operations/backups';

const BACKUPS = [
  backupFile({ fileName: 'nfnn-2026-11-07_0037.dump.age', createdAt: '2026-11-06T23:37:52Z' }),
  backupFile({
    fileName: 'nfnn-2026-11-06_1948-rucni.dump.age',
    kind: 'REQUESTED',
    sizeBytes: 8_664_786,
    createdAt: '2026-11-06T18:48:10Z',
  }),
  backupFile({ fileName: 'nfnn-2026-11-06_0300.dump.age', createdAt: '2026-11-06T02:00:19Z' }),
];

describe('Given an administrator on the history of backups', () => {
  let fixture: ComponentFixture<AdminBackupHistory>;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminBackupHistory],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminBackupHistory);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

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

  async function open(row: number): Promise<void> {
    (
      fixture.nativeElement.querySelectorAll('button.ui-list__row')[row] as HTMLButtonElement
    ).click();
    await settle();
  }

  it('when the page opens, then it asks for the backups with the token and says it is loading', () => {
    const request = http.expectOne(BACKUPS_URL);

    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(text('h1')).toBe('Všechny zálohy');
    expect(text('[role="status"]:not(:empty)')).toBe('Načítáme zálohy…');
    request.flush(backupsView({ backups: BACKUPS }));
  });

  it('when the backups arrive, then they are grouped by Prague day with a count, each row its time, kind and size', async () => {
    await respond(backupsView({ backups: BACKUPS }));

    expect(texts('.day-title')).toEqual(['sobota 7. 11. 2026', 'pátek 6. 11. 2026']);
    expect(texts('.day-count')).toEqual(['1 záloha', '2 zálohy']);
    expect(texts('button.ui-list__row .ui-list__title')).toEqual(['0:37', '19:48', '3:00']);
    expect(texts('button.ui-list__row .ui-list__meta')).toEqual([
      'Plánovaná',
      'Na požádání',
      'Plánovaná',
    ]);
    expect(texts('button.ui-list__row .ui-list__value')).toEqual(['2 kB', '8,3 MB', '2 kB']);
  });

  it('when the backups arrive, then each day is a card that holds its heading over plain rows of its backups', async () => {
    await respond(backupsView({ backups: BACKUPS }));

    const days: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('section[aria-labelledby]'),
    );
    expect(days.map((day) => day.querySelectorAll('button.ui-list__row').length)).toEqual([1, 2]);
    for (const day of days) {
      const heading = day.querySelector(`#${day.getAttribute('aria-labelledby')}`);
      expect(day.classList).toContain('ui-card');
      expect(heading?.tagName).toBe('H2');
      expect(heading?.classList).toContain('ui-card__title');
      expect(day.querySelector('.ui-list--inset')).toBeNull();
    }
  });

  it('when there is no backup yet, then the page says so', async () => {
    await respond(backupsView({ backups: [] }));

    expect(text('.empty')).toBe('Zatím žádná záloha.');
  });

  it('when a backup is opened, then a sheet names it and offers to download it or restore the site from it', async () => {
    await respond(backupsView({ backups: BACKUPS }));
    await open(1);

    expect(text('dialog h2')).toBe('6. 11. 2026 19:48');
    expect(text('dialog .backup-meta')).toBe('Na požádání · 8,3 MB');
    expect(text('dialog .backup-file')).toBe('nfnn-2026-11-06_1948-rucni.dump.age');
    expect(texts('dialog button.ui-button')).toEqual(['Stáhnout', 'Obnovit web z této zálohy…']);
  });

  it('when a backup is downloaded from its sheet, then the file is fetched as a blob with the token', async () => {
    await respond(backupsView({ backups: BACKUPS }));
    await open(0);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
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
    button('Stáhnout').click();
    await settle();

    const request = http.expectOne(`${BACKUPS_URL}/nfnn-2026-11-07_0037.dump.age`);
    expect(request.request.responseType).toBe('blob');
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(button('Stahujeme…').disabled).toBe(true);
    request.flush(new Blob([new Uint8Array(10)]), {
      headers: { 'Content-Disposition': 'attachment; filename="nfnn-2026-11-07_0037.dump.age"' },
    });
    await settle();

    expect(button('Stáhnout').disabled).toBe(false);
  });

  it('when the restore is chosen in a sheet, then the backups page opens to confirm the restore of that backup', async () => {
    await respond(backupsView({ backups: BACKUPS }));
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    await open(2);

    button('Obnovit web z této zálohy…').click();
    await settle();

    expect(navigate).toHaveBeenCalledWith('/sprava/zalohy', {
      state: { restore: 'nfnn-2026-11-06_0300.dump.age' },
    });
  });

  it('when a restore is already pending, then a sheet does not offer another one', async () => {
    await respond(backupsView({ backups: BACKUPS, restorePending: true }));
    await open(0);

    expect(button('Obnovit web z této zálohy…').disabled).toBe(true);
  });

  it('when the server fails, then the page offers a retry that asks again', async () => {
    http.expectOne(BACKUPS_URL).flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(text('[role="alert"] p')).toBe('Zálohy se nepodařilo načíst.');
    button('Zkusit znovu').click();
    await respond(backupsView({ backups: BACKUPS }));

    expect(texts('button.ui-list__row')).toHaveLength(3);
  });
});

describe('Given an administrator offline whose device keeps the administration copy', () => {
  it('when the backup history opens, then it lists the backups of the copy and downloading one needs a connection', async () => {
    const { page, http, settle } = await openOfflineFromCopy(
      AdminBackupHistory,
      copyOf({
        'operations/settings': [{}],
        'operations/backups': [backupsView({ backups: [backupFile()] })],
      }),
    );

    expect(textOf(page.querySelector('.ui-list__row'))).toContain('3:00');
    (page.querySelector('.ui-list__row') as HTMLButtonElement).click();
    await settle();

    waitsForConnection(page, 'Stáhnout');
    http.verify();
  });
});
