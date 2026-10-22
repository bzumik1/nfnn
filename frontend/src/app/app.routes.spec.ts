import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';
import { SESSION_HINT_KEY } from './core/auth/auth-store';
import { authResponse } from './core/auth/testing/donor-fixtures';

describe('Given a signed-in donor and the app routes', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(SESSION_HINT_KEY, '1');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  async function open(url: string): Promise<string> {
    const navigation = router.navigateByUrl(url);
    await vi.waitFor(() =>
      http.expectOne('/api/donors/auth/refresh').flush(authResponse('token-1')),
    );
    await navigation;
    return router.url;
  }

  it('when the donor opens the overview, then its address is in Czech', async () => {
    expect(await open('/darce/prehled')).toBe('/darce/prehled');
  });

  it('when the donor opens the donor area, then the overview opens', async () => {
    expect(await open('/darce')).toBe('/darce/prehled');
  });

  it('when the donor opens an old English address, then the Czech one opens', async () => {
    expect(await open('/donor/prehled')).toBe('/darce/prehled');
  });
});
