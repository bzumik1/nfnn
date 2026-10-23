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

  it('when the first setup is completed, then the code and the settings are posted', () => {
    api
      .complete({ code: 'K7QM-2XPA-9TRD', settings: [{ name: 'MAIL_PORT', value: '587' }] })
      .subscribe();

    const request = http.expectOne(STATUS_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      code: 'K7QM-2XPA-9TRD',
      settings: [{ name: 'MAIL_PORT', value: '587' }],
    });
    request.flush({ changed: ['MAIL_PORT'], restarting: true });
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
