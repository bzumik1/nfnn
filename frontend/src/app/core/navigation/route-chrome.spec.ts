import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
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
    });
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
