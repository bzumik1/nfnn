import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RESTART_POLL_MS, RestartOutcome, SetupApi } from './setup-api';

const STATUS_URL = '/api/operations/setup';

describe('Given the setup API', () => {
  let api: SetupApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(SetupApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('when the first setup is completed, then the code, the settings and the end of the backup key are posted', () => {
    api
      .complete({
        code: 'K7QM-2XPA-9TRD',
        settings: [{ name: 'MAIL_PORT', value: '587' }],
        backupKeyCheck: '6GWH',
      })
      .subscribe();

    const request = http.expectOne(STATUS_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      code: 'K7QM-2XPA-9TRD',
      settings: [{ name: 'MAIL_PORT', value: '587' }],
      backupKeyCheck: '6GWH',
    });
    request.flush({ changed: ['MAIL_PORT'], restarting: true });
  });

  it('when a backup is uploaded with a code, then the file goes as the raw body with the code in a header', () => {
    const file = new Blob(['PGDMP']);
    api.uploadBackup('K7QM-2XPA-9TRD', file).subscribe();

    const request = http.expectOne('/api/operations/setup/restore');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toBe(file);
    expect(request.request.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(request.request.headers.get('X-Nfnn-Setup-Code')).toBe('K7QM-2XPA-9TRD');
    expect(request.request.reportUploadProgress).toBe(true);
    request.flush({
      requestId: 'r-1',
      fileName: 'r-1.upload',
      requestedAt: '2026-10-23T19:30:00Z',
    });
  });

  it('when the backup key is asked for with a code, then the code goes in a header', () => {
    api.backupKey('K7QM-2XPA-9TRD').subscribe();

    const request = http.expectOne('/api/operations/setup/backup-key');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('X-Nfnn-Setup-Code')).toBe('K7QM-2XPA-9TRD');
    request.flush({ key: 'AGE-SECRET-KEY-1' });
  });

  it('when the backup key is asked for from the home network, then no code header is sent', () => {
    api.backupKey(null).subscribe();

    const request = http.expectOne('/api/operations/setup/backup-key');
    expect(request.request.headers.has('X-Nfnn-Setup-Code')).toBe(false);
    request.flush({ key: 'AGE-SECRET-KEY-1' });
  });

  it('when an encrypted backup is uploaded with its key, then the key goes in a header', () => {
    api.uploadBackup(null, new Blob(['age-encryption.org/v1']), 'AGE-SECRET-KEY-1ABC').subscribe();

    const request = http.expectOne('/api/operations/setup/restore');
    expect(request.request.headers.get('X-Nfnn-Backup-Key')).toBe('AGE-SECRET-KEY-1ABC');
    request.flush({
      requestId: 'r-1',
      fileName: 'r-1.upload',
      requestedAt: '2026-10-23T19:30:00Z',
    });
  });

  it('when a backup is uploaded from the home network, then no code header is sent', () => {
    api.uploadBackup(null, new Blob(['PGDMP'])).subscribe();

    const request = http.expectOne('/api/operations/setup/restore');
    expect(request.request.headers.has('X-Nfnn-Setup-Code')).toBe(false);
    expect(request.request.headers.has('X-Nfnn-Backup-Key')).toBe(false);
    request.flush({
      requestId: 'r-1',
      fileName: 'r-1.upload',
      requestedAt: '2026-10-23T19:30:00Z',
    });
  });

  describe('when it watches a restart', () => {
    let outcome: RestartOutcome | null;

    beforeEach(() => {
      vi.useFakeTimers();
      outcome = null;
      api.watchRestart().subscribe((result) => (outcome = result));
    });

    async function poll(answer: 'up' | 'down'): Promise<void> {
      await vi.advanceTimersByTimeAsync(RESTART_POLL_MS);
      const request = http.expectOne(STATUS_URL);
      if (answer === 'up') {
        request.flush({ required: false, codeRequired: true });
      } else {
        request.flush('', { status: 502, statusText: 'Bad Gateway' });
      }
    }

    it('then it waits until the backend went away and answers again', async () => {
      await poll('up');
      await poll('down');
      await poll('down');
      expect(outcome).toBeNull();

      await poll('up');

      expect(outcome).toBe('restarted');
    });

    it('then a backend that never seemed to go away counts as restarted after ten answers', async () => {
      for (let index = 0; index < 10; index++) {
        await poll('up');
      }
      expect(outcome).toBeNull();

      await poll('up');

      expect(outcome).toBe('restarted');
    });

    it('then a backend that does not come back within a hundred checks is reported as slow', async () => {
      for (let index = 0; index < 100; index++) {
        await poll('down');
      }

      expect(outcome).toBe('slow');
    });
  });
});
