import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router } from '@angular/router';
import { RouteChrome } from './route-chrome';

@Component({ template: '' })
class Blank {}

describe('Given the chrome a route asks for', () => {
  let router: Router;
  let chrome: RouteChrome;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            pathMatch: 'full',
            component: Blank,
            data: { landing: true, head: 'photo', darkThroughout: true },
          },
          {
            path: 'overit',
            data: { darkThroughout: true },
            children: [{ path: 'detail', component: Blank, data: { parent: '/overit' } }],
          },
          {
            path: 'darce',
            data: { head: 'light', parent: '/', backOnWide: false },
            children: [{ path: 'prehled', component: Blank }],
          },
          { path: 'aktuality/:slug', component: Blank, data: { parent: '/aktuality' } },
          { path: 'darci/:id/:section', component: Blank, data: { parent: '/darci/:id' } },
          {
            path: 'sprava',
            data: { headTitle: 'Správa' },
            children: [
              { path: '', component: Blank },
              { path: 'platby', component: Blank, data: { headTitle: 'Platby' } },
              {
                path: 'prehledy/:month',
                component: Blank,
                data: {
                  headTitle: (route: ActivatedRouteSnapshot) =>
                    `Přehled za ${route.params['month']}`,
                },
              },
              {
                path: 'logy/soubor',
                component: Blank,
                data: {
                  headTitle: (route: ActivatedRouteSnapshot) => route.queryParams['nazev'] ?? '',
                },
              },
              {
                path: 'darci/:id',
                component: Blank,
                data: { headTitle: 'Dárce', headTitleFollowsHeading: true },
              },
            ],
          },
          { path: '**', component: Blank },
        ]),
      ],
    });
    router = TestBed.inject(Router);
    chrome = TestBed.inject(RouteChrome);
  });

  it('when a page names nothing, then it has a dark head, the tab bar and no way back', async () => {
    await router.navigateByUrl('/aktuality');

    expect(chrome.current()).toEqual({
      parent: null,
      head: 'dark',
      tabBar: true,
      landing: false,
      backOnWide: true,
      darkThroughout: false,
      headTitle: null,
      headTitleFollowsHeading: false,
    });
  });

  it('when a page names the title of its head, then the head shows it from the first pass', async () => {
    await router.navigateByUrl('/sprava/platby');

    expect(chrome.current().headTitle).toBe('Platby');
    expect(chrome.current().headTitleFollowsHeading).toBe(false);
  });

  it('when a page names the title of its head from its parameters, then the head shows it composed from them', async () => {
    await router.navigateByUrl('/sprava/prehledy/2026-10');
    expect(chrome.current().headTitle).toBe('Přehled za 2026-10');

    await router.navigateByUrl('/sprava/logy/soubor?nazev=backend.log');
    expect(chrome.current().headTitle).toBe('backend.log');
  });

  it('when a page of an area names no title of its own, then it takes the title of its area', async () => {
    await router.navigateByUrl('/sprava');

    expect(chrome.current().headTitle).toBe('Správa');
  });

  it('when a page says its heading arrives later, then its head starts with the title it names and follows its heading', async () => {
    await router.navigateByUrl('/sprava/darci/0192f0a1');

    expect(chrome.current()).toEqual(
      expect.objectContaining({ headTitle: 'Dárce', headTitleFollowsHeading: true }),
    );
  });

  it('when a page names its parent, then the back button leads there', async () => {
    await router.navigateByUrl('/aktuality/clanek');

    expect(chrome.current().parent).toBe('/aktuality');
  });

  it('when a page names its parent by its own parameters, then the back button leads to that page', async () => {
    await router.navigateByUrl('/darci/0192f0a1-7b2c-7c3d-9e4f-5a6b7c8d9e0f/dary');

    expect(chrome.current().parent).toBe('/darci/0192f0a1-7b2c-7c3d-9e4f-5a6b7c8d9e0f');
  });

  it('when an area names its chrome, then its pages inherit it', async () => {
    await router.navigateByUrl('/darce/prehled');

    expect(chrome.current()).toEqual(
      expect.objectContaining({
        head: 'light',
        parent: '/',
        backOnWide: false,
      }),
    );
  });

  it('when the landing page opens, then it lies over the photo as the landing', async () => {
    await router.navigateByUrl('/');

    expect(chrome.current()).toEqual(expect.objectContaining({ head: 'photo', landing: true }));
  });

  it('when a page is dark all the way down, then its pages say so, and the landing page too', async () => {
    await router.navigateByUrl('/overit/detail');
    expect(chrome.current().darkThroughout).toBe(true);

    await router.navigateByUrl('/');
    expect(chrome.current().darkThroughout).toBe(true);

    await router.navigateByUrl('/aktuality/clanek');
    expect(chrome.current().darkThroughout).toBe(false);
  });
});
