import { Component, DestroyRef, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouteReuseStrategy, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { KEPT_PAGES_OWNER, KeptTabPages, whenLeft, whenShownAgain } from './kept-tab-pages';

const created: string[] = [];
const destroyed: string[] = [];
const returns: string[] = [];
const leaves: string[] = [];
const donor = signal<string | null>(null);

@Component({ template: '<p>{{ name }}</p>' })
class Page {
  readonly name = inject(Router).url;

  constructor() {
    created.push(this.name);
    inject(DestroyRef).onDestroy(() => destroyed.push(this.name));
    whenShownAgain(() => returns.push(this.name));
    whenLeft(() => leaves.push(this.name));
  }
}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Shell {}

describe('Given the pages of the tabs kept while another tab is shown', () => {
  let harness: RouterTestingHarness;
  let kept: KeptTabPages;

  beforeEach(async () => {
    created.length = 0;
    destroyed.length = 0;
    returns.length = 0;
    leaves.length = 0;
    donor.set(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'darce',
            canActivate: [() => donor() !== null || inject(Router).createUrlTree(['/o-nas'])],
            component: Page,
          },
          {
            path: 'sprava',
            component: Shell,
            children: [{ path: 'aktuality', component: Page }],
          },
          {
            path: '',
            component: Shell,
            children: [
              { path: 'o-nas', component: Page },
              { path: 'aktuality', component: Page },
              { path: 'aktuality/:slug', component: Page },
              { path: 'zasady-ochrany-osobnich-udaju', component: Page },
              { path: '**', component: Page },
            ],
          },
        ]),
        { provide: RouteReuseStrategy, useExisting: KeptTabPages },
        { provide: KEPT_PAGES_OWNER, useValue: () => donor() },
      ],
    });
    kept = TestBed.inject(KeptTabPages);
    harness = await RouterTestingHarness.create();
  });

  it('when the visitor returns to a tab, then its page is the one they left, not a new one', async () => {
    await harness.navigateByUrl('/o-nas');
    await harness.navigateByUrl('/aktuality');
    await harness.navigateByUrl('/o-nas');

    expect(created).toEqual(['/o-nas', '/aktuality']);
    expect(destroyed).toEqual([]);
    expect(harness.routeNativeElement?.textContent).toContain('/o-nas');
  });

  it('when the visitor returns to a tab, then its page hears that it is shown again, once', async () => {
    await harness.navigateByUrl('/o-nas');
    await harness.navigateByUrl('/aktuality');
    await harness.navigateByUrl('/o-nas');
    await harness.navigateByUrl('/o-nas?x=1');

    expect(returns).toEqual(['/o-nas']);
  });

  it('when the visitor leaves a kept page, then it hears that it is left, once', async () => {
    await harness.navigateByUrl('/o-nas');
    await harness.navigateByUrl('/aktuality');
    await harness.navigateByUrl('/zasady-ochrany-osobnich-udaju');

    expect(leaves).toEqual(['/o-nas', '/aktuality']);
  });

  it('when the visitor opens an article from a tab and comes back, then the list is the one they left', async () => {
    await harness.navigateByUrl('/aktuality');
    await harness.navigateByUrl('/aktuality/zahrada');
    await harness.navigateByUrl('/aktuality');

    expect(created).toEqual(['/aktuality', '/aktuality/zahrada']);
    expect(destroyed).toEqual(['/aktuality/zahrada']);
  });

  it('when the visitor leaves a tab from an article and returns to the tab, then the article is the one they left', async () => {
    await harness.navigateByUrl('/aktuality');
    await harness.navigateByUrl('/aktuality/zahrada');
    await harness.navigateByUrl('/o-nas');
    await harness.navigateByUrl('/aktuality/zahrada');

    expect(created).toEqual(['/aktuality', '/aktuality/zahrada', '/o-nas']);
    expect(returns).toEqual(['/aktuality/zahrada']);
  });

  it('when the visitor comes back to the tab elsewhere than the article they left, then that article is let go', async () => {
    await harness.navigateByUrl('/aktuality');
    await harness.navigateByUrl('/aktuality/zahrada');
    await harness.navigateByUrl('/o-nas');
    await harness.navigateByUrl('/aktuality');

    expect(destroyed).toEqual(['/aktuality/zahrada']);
  });

  it('when the donor signs out, then no page shown while they were signed in is kept, so the next visitor sees none of it', async () => {
    donor.set('jana');
    await harness.navigateByUrl('/o-nas');
    await harness.navigateByUrl('/aktuality');

    donor.set(null);
    await harness.navigateByUrl('/zasady-ochrany-osobnich-udaju');
    await harness.navigateByUrl('/o-nas');

    expect(destroyed).toEqual(['/o-nas', '/aktuality', '/zasady-ochrany-osobnich-udaju']);
    expect(created.filter((page) => page === '/o-nas')).toHaveLength(2);
  });

  it('when the donor signs out and the first navigation is turned away by a guard, then the next one still keeps none of their pages', async () => {
    donor.set('jana');
    await harness.navigateByUrl('/o-nas');
    await harness.navigateByUrl('/aktuality');

    donor.set(null);
    await harness.navigateByUrl('/darce');
    await harness.navigateByUrl('/zasady-ochrany-osobnich-udaju');
    await harness.navigateByUrl('/aktuality');

    expect(created.filter((page) => page === '/aktuality')).toHaveLength(2);
    expect(created.filter((page) => page === '/o-nas')).toHaveLength(2);
  });

  it('when another donor signs in, then the pages kept before are not shown to them', async () => {
    await harness.navigateByUrl('/o-nas');
    await harness.navigateByUrl('/aktuality');

    donor.set('petr');
    await harness.navigateByUrl('/o-nas');

    expect(destroyed).toEqual(['/o-nas', '/aktuality']);
    expect(created).toEqual(['/o-nas', '/aktuality', '/o-nas']);
  });

  it('when the visitor leaves an article for a page outside the tabs and returns to the tab, then the article is the one they left', async () => {
    await harness.navigateByUrl('/aktuality/zahrada');
    await harness.navigateByUrl('/zasady-ochrany-osobnich-udaju');
    await harness.navigateByUrl('/aktuality/zahrada');

    expect(created).toEqual(['/aktuality/zahrada', '/zasady-ochrany-osobnich-udaju']);
  });

  it('when an address under a tab is unknown, then its page is not kept as the last page of the tab', async () => {
    await harness.navigateByUrl('/aktuality/zahrada/neexistuje');
    await harness.navigateByUrl('/o-nas');
    await harness.navigateByUrl('/aktuality/zahrada/neexistuje');

    expect(destroyed).toEqual(['/aktuality/zahrada/neexistuje']);
  });

  it('when a page that is no tab root is left, then it is not kept', async () => {
    await harness.navigateByUrl('/zasady-ochrany-osobnich-udaju');
    await harness.navigateByUrl('/o-nas');
    await harness.navigateByUrl('/zasady-ochrany-osobnich-udaju');

    expect(created).toEqual([
      '/zasady-ochrany-osobnich-udaju',
      '/o-nas',
      '/zasady-ochrany-osobnich-udaju',
    ]);
  });

  it('when a page elsewhere shares the name of a tab, then it is not kept', async () => {
    await harness.navigateByUrl('/sprava/aktuality');
    await harness.navigateByUrl('/o-nas');
    await harness.navigateByUrl('/sprava/aktuality');

    expect(created).toEqual(['/sprava/aktuality', '/o-nas', '/sprava/aktuality']);
  });

  it('when the kept pages are forgotten, then each is destroyed and the tab opens a new page', async () => {
    await harness.navigateByUrl('/o-nas');
    await harness.navigateByUrl('/aktuality');

    kept.forget();
    await harness.navigateByUrl('/o-nas');

    expect(destroyed).toEqual(['/o-nas']);
    expect(created).toEqual(['/o-nas', '/aktuality', '/o-nas']);
  });
});
