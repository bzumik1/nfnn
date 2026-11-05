import { HttpHeaders, HttpResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  BankCheckResponse,
  DonationListResponse,
  DonationsApi,
  DonationSummaryResponse,
  downloadedFile,
} from './donations-api';
import { twoYearDonations, twoYearSummary } from './testing/donation-fixtures';
import { LiveUpdates } from '../../core/live/live-updates';
import { FakeLiveUpdates } from '../../core/live/testing/live-fixtures';

describe('Given the donations API', () => {
  let api: DonationsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(DonationsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("when the list is requested, then it asks for all of the donor's donations without a year", () => {
    let received: DonationListResponse | undefined;
    api.list().subscribe((response) => (received = response));

    const request = http.expectOne('/api/donations/me');
    expect(request.request.method).toBe('GET');
    expect(request.request.urlWithParams).toBe('/api/donations/me');
    request.flush(twoYearDonations());

    expect(received).toEqual(twoYearDonations());
  });

  it("when the summary is requested, then it asks for the donor's summary", () => {
    let received: DonationSummaryResponse | undefined;
    api.summary().subscribe((response) => (received = response));

    const request = http.expectOne('/api/donations/me/summary');
    expect(request.request.method).toBe('GET');
    request.flush(twoYearSummary());

    expect(received).toEqual(twoYearSummary());
  });

  it('when a bank check is requested, then it posts an empty body and reads when the bank data was last updated', () => {
    let received: BankCheckResponse | undefined;
    api.requestBankCheck().subscribe((response) => (received = response));

    const request = http.expectOne('/api/donations/me/bank-check');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush(
      { bankDataAsOf: '2026-10-18T08:05:30Z', checking: true },
      { status: 202, statusText: 'Accepted' },
    );

    expect(received).toEqual({ bankDataAsOf: '2026-10-18T08:05:30Z', checking: true });
  });

  it('when the bank check is read, then it asks whether the bank is still being checked', () => {
    let received: BankCheckResponse | undefined;
    api.bankCheck().subscribe((response) => (received = response));

    const request = http.expectOne('/api/donations/me/bank-check');
    expect(request.request.method).toBe('GET');
    request.flush({ bankDataAsOf: null, checking: false });

    expect(received).toEqual({ bankDataAsOf: null, checking: false });
  });

  describe('when the bank is checked until it is done', () => {
    const URL = '/api/donations/me/bank-check';
    let live: FakeLiveUpdates;
    let seen: BankCheckResponse[];
    let completed: boolean;

    beforeEach(() => {
      vi.useFakeTimers();
      live = TestBed.inject(LiveUpdates) as unknown as FakeLiveUpdates;
      seen = [];
      completed = false;
    });

    afterEach(() => vi.useRealTimers());

    function start(): void {
      api.checkBankUntilDone().subscribe({
        next: (check) => seen.push(check),
        complete: () => (completed = true),
      });
      http
        .expectOne({ method: 'POST', url: URL })
        .flush({ bankDataAsOf: null, checking: true }, { status: 202, statusText: 'Accepted' });
    }

    it('and no live stream is open, then it reads the check every 2 seconds', () => {
      start();

      vi.advanceTimersByTime(1999);
      http.expectNone(URL);
      vi.advanceTimersByTime(1);
      http.expectOne({ method: 'GET', url: URL }).flush({ bankDataAsOf: null, checking: true });
      vi.advanceTimersByTime(2000);
      http
        .expectOne({ method: 'GET', url: URL })
        .flush({ bankDataAsOf: '2026-10-18T08:05:30Z', checking: false });

      expect(seen.map((check) => check.checking)).toEqual([true, true, false]);
      expect(completed).toBe(true);
    });

    it('and the live stream is open, then it reads the check as soon as the import ends and not before', () => {
      live.connected.set(true);
      start();

      vi.advanceTimersByTime(10_000);
      http.expectNone(URL);
      live.hint('donations');
      http.expectNone(URL);
      live.hint('bank-import');
      http
        .expectOne({ method: 'GET', url: URL })
        .flush({ bankDataAsOf: '2026-10-18T08:05:30Z', checking: false });

      expect(completed).toBe(true);
      expect(live.listeners()).toBe(0);
    });

    it('and the live stream is open but no hint comes, then it still reads the check every 15 seconds', () => {
      live.connected.set(true);
      start();

      vi.advanceTimersByTime(14_999);
      http.expectNone(URL);
      vi.advanceTimersByTime(1);
      http.expectOne({ method: 'GET', url: URL }).flush({ bankDataAsOf: null, checking: true });
    });

    it('and the bank never finishes, then it gives up after 90 seconds with the last answer', () => {
      start();

      for (let elapsed = 2000; elapsed <= 90_000; elapsed += 2000) {
        vi.advanceTimersByTime(2000);
        http.expectOne({ method: 'GET', url: URL }).flush({ bankDataAsOf: null, checking: true });
      }
      vi.advanceTimersByTime(60_000);
      http.expectNone(URL);

      expect(completed).toBe(true);
      expect(seen.at(-1)?.checking).toBe(true);
    });
  });
});

function pdf(): Blob {
  return new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' });
}

describe('Given a file the server sends for download', () => {
  function response(contentDisposition: string | null): HttpResponse<Blob> {
    return new HttpResponse({
      body: pdf(),
      headers:
        contentDisposition === null
          ? new HttpHeaders()
          : new HttpHeaders({ 'Content-Disposition': contentDisposition }),
    });
  }

  it('when the server names the file in both forms, then the UTF-8 form wins', () => {
    const file = downloadedFile(
      response(
        'attachment; filename="potvrzeni.pdf"; filename*=UTF-8\'\'potvrzen%C3%AD%20o%20darech.pdf',
      ),
      'zaloha.pdf',
    );

    expect(file.fileName).toBe('potvrzení o darech.pdf');
  });

  it('when the server names the file only in the UTF-8 form, then that name is used', () => {
    const file = downloadedFile(
      response("attachment; filename*=utf-8''donation-receipt-2027-000002.pdf"),
      'zaloha.pdf',
    );

    expect(file.fileName).toBe('donation-receipt-2027-000002.pdf');
  });

  it('when the server sends no file name, then the name the caller gives is used', async () => {
    const file = downloadedFile(response('attachment'), 'zaloha-2026.pdf');

    expect(file.fileName).toBe('zaloha-2026.pdf');
    expect(await file.blob.text()).toBe('%PDF-1.4\n%%EOF');
    expect(downloadedFile(response(null), 'zaloha.pdf').fileName).toBe('zaloha.pdf');
  });
});
