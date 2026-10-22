import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  BankAccountListResponse,
  BankAccountsApi,
  SymbolClaimConfirmation,
} from './bank-accounts-api';
import { bankAccount } from './testing/bank-account-fixtures';

describe('Given the bank accounts API', () => {
  let api: BankAccountsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(BankAccountsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("when the list is requested, then it asks for the donor's bank accounts", () => {
    const accounts: BankAccountListResponse = { items: [bankAccount()] };
    let received: BankAccountListResponse | undefined;
    api.list().subscribe((response) => (received = response));

    const request = http.expectOne('/api/donations/me/bank-accounts');
    expect(request.request.method).toBe('GET');
    request.flush(accounts);

    expect(received).toEqual(accounts);
  });

  it('when an account is disconnected, then it posts an empty body to that account', () => {
    let done = false;
    api.disconnect('0192f0c4-0000-7000-8000-000000000001').subscribe(() => (done = true));

    const request = http.expectOne(
      '/api/donations/me/bank-accounts/0192f0c4-0000-7000-8000-000000000001/disconnect',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(done).toBe(true);
  });

  it('when an account is reconnected, then it posts an empty body to that account', () => {
    let done = false;
    api.reconnect('a/b').subscribe(() => (done = true));

    const request = http.expectOne('/api/donations/me/bank-accounts/a%2Fb/reconnect');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(done).toBe(true);
  });

  it('when an older symbol is confirmed, then it posts the symbol to that account and maps the answer', () => {
    const confirmation: SymbolClaimConfirmation = {
      pairedCount: 14,
      changedYearlyReceipts: [2026],
    };
    let received: SymbolClaimConfirmation | undefined;
    api.confirmSymbol('a/b', '6123456789').subscribe((response) => (received = response));

    const request = http.expectOne('/api/donations/me/bank-accounts/a%2Fb/symbol-claim/confirm');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ variableSymbol: '6123456789' });
    request.flush(confirmation);

    expect(received).toEqual(confirmation);
  });

  it('when an older symbol is declined, then it posts the symbol to that account and completes on 204', () => {
    let done = false;
    api
      .declineSymbol('0192f0c4-0000-7000-8000-000000000001', '6123456789')
      .subscribe(() => (done = true));

    const request = http.expectOne(
      '/api/donations/me/bank-accounts/0192f0c4-0000-7000-8000-000000000001/symbol-claim/decline',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ variableSymbol: '6123456789' });
    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(done).toBe(true);
  });
});
