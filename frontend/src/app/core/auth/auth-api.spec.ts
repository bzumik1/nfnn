import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthApi } from './auth-api';

describe('Given the donor account API', () => {
  let api: AuthApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AuthApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when a connection or a device is named by an id with a slash, a backslash or dots, then the request keeps it in one encoded segment of its own path', () => {
    const planted = '..\\../me/passkeys';
    const encoded = encodeURIComponent(planted);
    api.disconnect(planted).subscribe();
    api.signOutDevice(planted).subscribe();

    const urls = http
      .match(() => true)
      .map((request) => {
        request.flush(null);
        return `${request.request.method} ${request.request.url}`;
      });
    expect(urls).toEqual([
      `DELETE /api/donors/me/connections/${encoded}`,
      `DELETE /api/donors/me/devices/${encoded}`,
    ]);
  });
});
