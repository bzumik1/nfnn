import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse } from '../../../core/auth/testing/donor-fixtures';
import { ReceiptKeysApi } from './receipt-keys-api';
import { ReceiptStatusApi, type ReceiptStatusResponse } from './receipt-status-api';

describe('Given a donor signed in on the verification page', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('when the key list is asked for, then the browser revalidates it and the call carries no token', () => {
    TestBed.inject(ReceiptKeysApi).list().subscribe();

    const request = http.expectOne('/api/donations/receipt-keys');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Cache-Control')).toBe('no-cache');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ foundation: { name: 'x', companyIdentifier: '27278794' }, keys: [] });
  });

  it('when the status of a receipt is asked for, then only the digest is sent, without a token', () => {
    let answer: ReceiptStatusResponse | undefined;
    const digest = '74dde61bd1eb4c77f2225bf67ac650ef442cff656c114ec6d639fcdb05397036';

    TestBed.inject(ReceiptStatusApi)
      .status(digest)
      .subscribe((response) => (answer = response));

    const request = http.expectOne('/api/donations/receipts/status');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ digest });
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ status: 'replaced' });
    expect(answer).toEqual({ status: 'replaced' });
  });
});
