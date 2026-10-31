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
