import {
  HttpClient,
  HttpHeaders,
  HttpRequest,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { mayComeFromServiceWorker, serviceWorkerBypassInterceptor } from './service-worker-bypass';

describe('Given the service worker bypass interceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([serviceWorkerBypassInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function bypassOf(method: 'GET' | 'POST', url: string): string | null {
    client.request(method, url).subscribe();
    const request = http.expectOne(url);
    request.flush({});
    return request.request.headers.get('ngsw-bypass');
  }

  describe('when the app reads an answer that is the same for everyone', () => {
    it.each([
      '/api/content/home',
      '/api/content/news',
      '/api/content/news?page=0&size=6',
      '/api/content/news/vanocni-sbirka',
      '/api/content/projects',
      '/api/content/projects?page=1&size=6',
      '/api/content/projects/novy-vozik',
      '/api/content/media/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
      '/api/content/media/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b?w=480',
      '/api/donations/payment-details',
      '/api/donations/bank-logos',
      '/api/donations/bank-logos/images/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
    ])('then %s may come from the service worker', (url) => {
      expect(bypassOf('GET', url)).toBeNull();
    });
  });

  describe('when the app reads anything else of the API', () => {
    it.each([
      '/api/donations/me/summary',
      '/api/donors/me',
      '/api/admin/content/news',
      '/api/admin/donors?query=/api/content/home',
      '/api/admin/operations/logs/backend.log/search?query=/api/content/news',
      '/api/content/news-drafts',
      '/api/content/news/vanocni-sbirka/preview',
      '/api/content/homepage',
      '/api/content/media/0190a1b2/original',
      '/api/donations/payment-details/qr',
      '/api/operations/setup/status',
      '/api/donations/bank-codes',
      '/api/donations/bank-logos?code=0800',
      '/api/donations/bank-logos/images/0190a1b2/original',
      '/api/admin/donations/bank-logos',
    ])('then %s goes past the service worker straight to the network', (url) => {
      expect(bypassOf('GET', url)).toBe('true');
    });
  });

  it('when the app writes to a public address, then the write goes past the service worker', () => {
    expect(bypassOf('POST', '/api/content/news')).toBe('true');
  });

  it('when the app asks for a file outside the API, then the service worker may answer it', () => {
    expect(bypassOf('GET', '/receipt-fonts/body.ttf')).toBeNull();
  });

  it('when the app asks a public answer past the service worker on purpose, then that answer comes from the network', () => {
    const pastTheWorker = new HttpRequest('GET', '/api/content/news', {
      headers: new HttpHeaders({ 'ngsw-bypass': 'true' }),
    });

    expect(mayComeFromServiceWorker(pastTheWorker)).toBe(false);
    expect(bypassOf('GET', '/api/content/news')).toBeNull();
  });
});
