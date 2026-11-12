import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../core/auth/auth-interceptor';
import { AuthStore } from '../../core/auth/auth-store';
import { authResponse } from '../../core/auth/testing/donor-fixtures';
import { bankLogoImageUrl, BankLogosApi, BankLogosResponse } from './bank-logos-api';

const IMAGE_ID = '019a7c00-0000-7000-8000-0000000000aa';

describe('Given a donor signed in while the bank logos are asked for', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: BankLogosApi, useClass: BankLogosApi },
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

  it('when the list is asked for, then the public list is read without a token', () => {
    let answer: BankLogosResponse | undefined;

    TestBed.inject(BankLogosApi)
      .list()
      .subscribe((response) => (answer = response));

    const request = http.expectOne('/api/donations/bank-logos');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ items: [{ code: '0800', imageId: IMAGE_ID }] });
    expect(answer).toEqual({ items: [{ code: '0800', imageId: IMAGE_ID }] });
  });

  it('when the address of a logo is made, then it points at the image the server keeps', () => {
    expect(bankLogoImageUrl(IMAGE_ID)).toBe(`/api/donations/bank-logos/images/${IMAGE_ID}`);
  });
});
