import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { inject } from 'vitest';
import { appRoutePaths } from '../testing/server-routes';
import { routes } from './app.routes';
import { SESSION_HINT_KEY } from './core/auth/auth-store';
import { RouteChrome } from './core/navigation/route-chrome';
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

describe('Given a visitor and the app routes', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    });
  });

  it('when a receipt code opens the verification page, then its address and title are its own', async () => {
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/overit#1234');

    expect(router.url).toBe('/overit#1234');
    expect(document.title).toBe('Ověření potvrzení o daru | Nová naděje – nadační fond');
  });

  it('when the verification page opens, then it has Zpět, which returns to the step before or else home', async () => {
    const router = TestBed.inject(Router);
    const chrome = TestBed.inject(RouteChrome);

    await router.navigateByUrl('/overit');

    expect(chrome.current().parent).toBe('/');
  });

  it('when a page is dark or a photo all the way down, then it says so for the tab bar, and a story under a dark head does not', async () => {
    const router = TestBed.inject(Router);
    const chrome = TestBed.inject(RouteChrome);
    const darkThroughout = async (url: string) => {
      await router.navigateByUrl(url);
      return chrome.current().darkThroughout;
    };

    expect(await darkThroughout('/')).toBe(true);
    expect(await darkThroughout('/overit')).toBe(true);
    expect(await darkThroughout('/neexistuje')).toBe(false);
    expect(await darkThroughout('/obnova-hesla')).toBe(true);
    expect(await darkThroughout('/potvrzeni-emailu')).toBe(true);
    expect(await darkThroughout('/aktuality/zahrada-pro-deti')).toBe(false);
    expect(await darkThroughout('/o-nas')).toBe(false);
  });
});

describe('Given the app routes and the addresses nginx answers with the app', () => {
  it('when both are listed, then nginx answers exactly the addresses the app has a page for', async () => {
    expect(inject('serverAppRoutes')).toEqual(await appRoutePaths(routes));
  });

  it('when the app routes are listed, then lazy areas, redirects and detail pages are among them', async () => {
    const paths = await appRoutePaths(routes);

    expect(paths).toEqual(
      expect.arrayContaining([
        '/',
        '/aplikace',
        '/darce',
        '/darce/prehled',
        '/donor/prehled',
        '/sprava/darci/:param',
        '/aktuality/:param',
      ]),
    );
    expect(paths).not.toContain('/**');
  });

  it('when the app gains a page nginx does not list, then the lists differ', async () => {
    const withNewPage: Routes = [...routes, { path: 'nova-stranka', children: [] }];

    expect(inject('serverAppRoutes')).not.toEqual(await appRoutePaths(withNewPage));
  });
});
