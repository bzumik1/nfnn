import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  DEVICE_STATUS_SOURCE,
  DEVICE_STATUS_TIMEOUT_MS,
  statusAnswer,
} from './device-status-source';

const SECRET = 'ZGV2aWNlLXNlY3JldC1vZi10aGlzLXNpZ24taW4tMDE';

describe('Given the status source of the device copies', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('when it asks, then it posts only the secret, without the access token, and gives the answer', async () => {
    const asked = TestBed.inject(DEVICE_STATUS_SOURCE)(SECRET);

    const request = http.expectOne('/api/donors/devices/status');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ deviceSecret: SECRET });
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ status: 'wipe-all', administrator: false });

    expect(await asked).toEqual({ status: 'wipe-all', administrator: false });
  });

  it('when the server refuses, then it gives no answer', async () => {
    const asked = TestBed.inject(DEVICE_STATUS_SOURCE)(SECRET);

    http
      .expectOne('/api/donors/devices/status')
      .flush({ status: 429 }, { status: 429, statusText: 'Too Many Requests' });

    expect(await asked).toBeNull();
  });

  for (const status of [0, 403, 404, 500]) {
    it(`when the request fails with ${status}, then it gives no answer`, async () => {
      const asked = TestBed.inject(DEVICE_STATUS_SOURCE)(SECRET);

      http.expectOne('/api/donors/devices/status').flush(null, { status, statusText: 'Refused' });

      expect(await asked).toBeNull();
    });
  }

  it('when the server answers 200 with a word outside the closed list, then it gives no answer', async () => {
    const asked = TestBed.inject(DEVICE_STATUS_SOURCE)(SECRET);

    http.expectOne('/api/donors/devices/status').flush({ status: 'erase', administrator: false });

    expect(await asked).toBeNull();
  });

  it('when the server does not answer in time, then it gives no answer', async () => {
    vi.useFakeTimers();
    const asked = TestBed.inject(DEVICE_STATUS_SOURCE)(SECRET);
    const request = http.expectOne('/api/donors/devices/status');

    await vi.advanceTimersByTimeAsync(DEVICE_STATUS_TIMEOUT_MS);

    expect(await asked).toBeNull();
    expect(request.cancelled).toBe(true);
  });
});

describe('Given an answer of the status endpoint', () => {
  for (const status of ['signed-in', 'signed-out', 'wipe-admin', 'wipe-all', 'unknown']) {
    it(`when it says ${status}, then it is taken as it is`, () => {
      expect(statusAnswer({ status, administrator: true })).toEqual({
        status,
        administrator: true,
      });
    });
  }

  for (const [name, answer] of [
    ['nothing', null],
    ['a text', 'wipe-all'],
    ['an unknown word', { status: 'erase', administrator: false }],
    ['no administrator flag', { status: 'wipe-all' }],
    ['an administrator flag that is not a boolean', { status: 'signed-in', administrator: 'no' }],
  ] as const) {
    it(`when it holds ${name}, then it is no answer and nothing is deleted`, () => {
      expect(statusAnswer(answer)).toBeNull();
    });
  }
});
