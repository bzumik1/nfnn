import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { contentRoutes } from '../content.routes';

const LANDING_ROUTE = contentRoutes.find((route) => route.path === '')!;

@Component({ template: '' })
class Blank {}

describe('Given an address of a section of the old one-page home', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { ...LANDING_ROUTE, loadComponent: undefined, component: Blank },
          { path: '**', component: Blank },
        ]),
      ],
    });
    router = TestBed.inject(Router);
  });

  for (const [old, now] of [
    ['/#prispet', '/prispet'],
    ['/#o-nas', '/o-nas'],
    ['/#projekty', '/projekty'],
    ['/#aktuality', '/aktuality'],
    ['/#kontakt', '/o-nas#kontakt'],
    ['/#uvod', '/'],
  ] as const) {
    it(`when ${old} is opened, then it lands on ${now}`, async () => {
      await router.navigateByUrl(old);

      expect(router.url).toBe(now);
    });
  }

  it('when the landing page is opened with another fragment, then it stays there', async () => {
    await router.navigateByUrl('/#jinde');

    expect(router.url).toBe('/#jinde');
  });

  it('when a link inside the landing page leads to an old address, then it lands on the new page too', async () => {
    await router.navigateByUrl('/');

    await router.navigateByUrl('/#prispet');

    expect(router.url).toBe('/prispet');
  });

  for (const name of ['constructor', '__proto__', 'toString']) {
    it(`when the fragment is ${name}, then the landing page stays and nothing breaks`, async () => {
      await router.navigateByUrl(`/#${name}`);

      expect(router.url).toBe(`/#${name}`);
    });
  }

  it('when an old address redirects, then it replaces the old entry instead of adding one', async () => {
    await router.navigateByUrl('/#prispet');

    expect(router.lastSuccessfulNavigation()?.extras.replaceUrl).toBe(true);
  });
});
