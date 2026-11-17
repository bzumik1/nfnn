import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { adminRoutes } from '../admin.routes';

const MORE_ROUTE = (adminRoutes[0].children ?? []).find((route) => route.path === 'vice')!;

@Component({ template: '' })
class Blank {}

describe('Given the address of Občas a pro technika', () => {
  function routerOn(compact: boolean): Router {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'sprava',
            children: [
              { path: '', component: Blank },
              { ...MORE_ROUTE, loadComponent: undefined, component: Blank },
            ],
          },
        ]),
        { provide: CompactLayout, useValue: { isCompact: signal(compact).asReadonly() } },
      ],
    });
    return TestBed.inject(Router);
  }

  it('when a phone opens it, then the page opens', async () => {
    const router = routerOn(true);

    await router.navigateByUrl('/sprava/vice');

    expect(router.url).toBe('/sprava/vice');
  });

  it('when a computer opens it, then the overview opens in its place without a step of its own', async () => {
    const router = routerOn(false);

    await router.navigateByUrl('/sprava/vice');

    expect(router.url).toBe('/sprava');
    expect(router.lastSuccessfulNavigation()?.extras.replaceUrl).toBe(true);
  });
});
