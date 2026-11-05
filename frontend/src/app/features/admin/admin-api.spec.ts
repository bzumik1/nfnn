import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  AdminActivitySinceResponse,
  AdminApi,
  HistoryImportResponse,
  ImportStateResponse,
  ReceiptSigningKeysResponse,
  YearlyReceiptCandidatesResponse,
  YearlyReceiptsIssueResponse,
} from './admin-api';
import {
  activitySince,
  historyImport,
  importState,
  receiptSigningKeys,
  yearlyReceiptCandidates,
  yearlyReceiptsIssued,
} from './testing/admin-fixtures';

describe('Given the administration API', () => {
  let api: AdminApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AdminApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when the import state is requested, then it asks the admin endpoint and hands the answer on', () => {
    let received: ImportStateResponse | undefined;
    api.importState().subscribe((response) => (received = response));

    const request = http.expectOne('/api/admin/donations/import-state');
    expect(request.request.method).toBe('GET');
    request.flush(importState());

    expect(received).toEqual(importState());
  });

  it('when older bank payments are requested, then the day is posted to the history import and the queued run is handed on', () => {
    let received: HistoryImportResponse | undefined;
    api.requestHistoryImport('2026-01-01').subscribe((response) => (received = response));

    const request = http.expectOne('/api/admin/donations/import/history');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ from: '2026-01-01' });
    request.flush(historyImport(), { status: 202, statusText: 'Accepted' });

    expect(received).toEqual(historyImport());
  });

  it('when the receipt signing keys are requested, then it asks the admin endpoint and hands the answer on', () => {
    let received: ReceiptSigningKeysResponse | undefined;
    api.receiptSigningKeys().subscribe((response) => (received = response));

    const request = http.expectOne('/api/admin/donations/receipt-signing-keys');
    expect(request.request.method).toBe('GET');
    request.flush(receiptSigningKeys());

    expect(received).toEqual(receiptSigningKeys());
  });

  it('when a receipt signing key is withdrawn, then the fresh second factor is posted to the withdrawal of that key and the answer says whether the backend restarts', () => {
    let received: boolean | undefined;
    api
      .withdrawReceiptSigningKey('21fe31df', { secondFactorCode: '123456' })
      .subscribe((response) => (received = response.restarting));

    const request = http.expectOne('/api/admin/donations/receipt-signing-keys/21fe31df/withdrawal');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ secondFactorCode: '123456' });
    request.flush({ ...receiptSigningKeys(), restarting: true });

    expect(received).toBe(true);
  });

  it('when the yearly receipt candidates of a year are requested, then the year travels as a parameter', () => {
    let received: YearlyReceiptCandidatesResponse | undefined;
    api.yearlyReceiptCandidates(2026).subscribe((response) => (received = response));

    const request = http.expectOne('/api/admin/donations/receipts/yearly?year=2026');
    expect(request.request.method).toBe('GET');
    request.flush(yearlyReceiptCandidates());

    expect(received).toEqual(yearlyReceiptCandidates());
  });

  it('when the yearly receipt candidates are requested without a year, then no year is sent and the server picks the last completed one', () => {
    api.yearlyReceiptCandidates(null).subscribe();

    const request = http.expectOne('/api/admin/donations/receipts/yearly');
    expect(request.request.params.keys()).toEqual([]);
    request.flush(yearlyReceiptCandidates());
  });

  it('when yearly receipts are issued, then the year and the donors are posted and the outcomes handed on', () => {
    let received: YearlyReceiptsIssueResponse | undefined;
    api.issueYearlyReceipts(2026, ['d-1', 'd-2']).subscribe((response) => (received = response));

    const request = http.expectOne('/api/admin/donations/receipts/yearly');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ year: 2026, donorIds: ['d-1', 'd-2'] });
    request.flush(yearlyReceiptsIssued());

    expect(received).toEqual(yearlyReceiptsIssued());
  });

  it('when the previous sign-in is requested, then it asks the endpoint of the signed-in administrator', () => {
    let received: string | null | undefined;
    api.previousSignIn().subscribe((response) => (received = response.previousSignInAt));

    const request = http.expectOne('/api/admin/donors/me/previous-sign-in');
    expect(request.request.method).toBe('GET');
    request.flush({ previousSignInAt: '2026-10-28T20:14:00Z' });

    expect(received).toBe('2026-10-28T20:14:00Z');
  });

  it('when what came in since a moment is requested, then the moment travels as the from parameter', () => {
    let received: AdminActivitySinceResponse | undefined;
    api.overviewSince('2026-10-28T20:14:00Z').subscribe((response) => (received = response));

    const request = http.expectOne(
      (candidate) =>
        candidate.url === '/api/admin/donations/overview/since' &&
        candidate.params.get('from') === '2026-10-28T20:14:00Z',
    );
    request.flush(activitySince());

    expect(received).toEqual(activitySince());
  });
});
