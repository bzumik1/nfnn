import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  AdminActivitySinceResponse,
  AdminApi,
  ImportStateResponse,
  ReceiptSigningKeysResponse,
  YearlyReceiptCandidatesResponse,
  YearlyReceiptsIssueResponse,
} from './admin-api';
import {
  adminBankLogo,
  activitySince,
  adminPush,
  importState,
  pushSubscription,
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

  it('when the push alerts are read and changed, then each call goes to its endpoint of the contract', () => {
    const answers: unknown[] = [];
    api.push().subscribe((response) => answers.push(response));
    http.expectOne({ method: 'GET', url: '/api/admin/operations/push' }).flush(adminPush());

    api
      .subscribePush({
        endpoint: 'https://fcm.googleapis.com/x',
        keys: { p256dh: 'B1', auth: 'a1' },
      })
      .subscribe((response) => answers.push(response));
    const subscribe = http.expectOne({
      method: 'POST',
      url: '/api/admin/operations/push/subscriptions',
    });
    expect(subscribe.request.body).toEqual({
      endpoint: 'https://fcm.googleapis.com/x',
      keys: { p256dh: 'B1', auth: 'a1' },
    });
    subscribe.flush(pushSubscription(), { status: 201, statusText: 'Created' });

    api
      .changePushAlerts('push 1', { bankImport: false, backups: true, mail: true })
      .subscribe((response) => answers.push(response));
    const change = http.expectOne({
      method: 'PUT',
      url: '/api/admin/operations/push/subscriptions/push%201/alerts',
    });
    expect(change.request.body).toEqual({ bankImport: false, backups: true, mail: true });
    change.flush(pushSubscription());

    api.removePushSubscription('push 1').subscribe(() => answers.push('removed'));
    http
      .expectOne({ method: 'DELETE', url: '/api/admin/operations/push/subscriptions/push%201' })
      .flush(null, { status: 204, statusText: 'No Content' });

    api.testPush().subscribe((response) => answers.push(response));
    http
      .expectOne({ method: 'POST', url: '/api/admin/operations/push/test' })
      .flush({ delivered: 1, failed: 0, removed: 0 });

    expect(answers).toEqual([
      adminPush(),
      pushSubscription(),
      pushSubscription(),
      'removed',
      { delivered: 1, failed: 0, removed: 0 },
    ]);
  });

  it('when the bank logos are read, set, downloaded again and removed, then each call names its precondition', () => {
    const answers: unknown[] = [];
    api.bankLogos().subscribe((response) => answers.push(response));
    http
      .expectOne({ method: 'GET', url: '/api/admin/donations/bank-logos' })
      .flush({ items: [adminBankLogo()] });

    api
      .setBankLogoSource('0800', 'https://is1-ssl.mzstatic.com/a.jpg', '5e1c0a9f3b7d2486')
      .subscribe((response) => answers.push(response));
    const replace = http.expectOne({ method: 'PUT', url: '/api/admin/donations/bank-logos/0800' });
    expect(replace.request.body).toEqual({ sourceUrl: 'https://is1-ssl.mzstatic.com/a.jpg' });
    expect(replace.request.headers.get('If-Match')).toBe('"5e1c0a9f3b7d2486"');
    expect(replace.request.headers.has('If-None-Match')).toBe(false);
    replace.flush(adminBankLogo());

    api
      .setBankLogoSource('4000', 'https://is2-ssl.mzstatic.com/b.jpg', null)
      .subscribe((response) => answers.push(response));
    const create = http.expectOne({ method: 'PUT', url: '/api/admin/donations/bank-logos/4000' });
    expect(create.request.headers.get('If-None-Match')).toBe('*');
    expect(create.request.headers.has('If-Match')).toBe(false);
    create.flush(adminBankLogo({ code: '4000' }));

    api.refreshBankLogo('0800').subscribe((response) => answers.push(response));
    const refresh = http.expectOne({
      method: 'POST',
      url: '/api/admin/donations/bank-logos/0800/refresh',
    });
    expect(refresh.request.body).toBeNull();
    refresh.flush(adminBankLogo());

    api.removeBankLogo('0800', '5e1c0a9f3b7d2486').subscribe(() => answers.push('removed'));
    const remove = http.expectOne({
      method: 'DELETE',
      url: '/api/admin/donations/bank-logos/0800',
    });
    expect(remove.request.headers.get('If-Match')).toBe('"5e1c0a9f3b7d2486"');
    remove.flush(null, { status: 204, statusText: 'No Content' });

    expect(answers).toEqual([
      { items: [adminBankLogo()] },
      adminBankLogo(),
      adminBankLogo({ code: '4000' }),
      adminBankLogo(),
      'removed',
    ]);
  });
});
