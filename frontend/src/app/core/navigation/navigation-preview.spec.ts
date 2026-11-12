import { Component, DestroyRef, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouteReuseStrategy, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BackTarget } from './back-target';
import { KeptTabPages } from './kept-tab-pages';
import { NavigationPreview } from './navigation-preview';
import { PreviewingReuse } from './previewing-reuse';
import { PageFocus } from './page-focus';
import { TabMemory } from './tab-memory';

const created: string[] = [];
const destroyed: string[] = [];

@Component({ template: '<h1 tabindex="-1">{{ name }}</h1>' })
class Page {
  readonly name = inject(Router).url;

  constructor() {
    created.push(this.name);
    inject(DestroyRef).onDestroy(() => destroyed.push(this.name));
  }
}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Shell {}

describe('Given the administration opened straight from the home screen, whose Zpět leads to the landing page never drawn', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  let preview: NavigationPreview;

  beforeEach(async () => {
    created.length = 0;
    destroyed.length = 0;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'sprava', component: Shell, children: [{ path: '', component: Page }] },
          {
            path: '',
            component: Shell,
            children: [
              { path: '', pathMatch: 'full', component: Page },
              { path: 'aktuality', component: Page },
            ],
          },
        ]),
        { provide: RouteReuseStrategy, useExisting: PreviewingReuse },
      ],
    });
    TestBed.inject(BackTarget);
    TestBed.inject(TabMemory);
    harness = await RouterTestingHarness.create('/sprava');
    router = TestBed.inject(Router);
    preview = TestBed.inject(NavigationPreview);
  });

  it('when the landing page is previewed, then it is drawn for the look taken of it while the administration stays the same live page at its address', async () => {
    const seen = await preview.visit('/', () => document.querySelector('h1')?.textContent ?? '');
    harness.detectChanges();

    expect(seen).toBe('/');
    expect(router.url).toBe('/sprava');
    expect(created).toEqual(['/sprava', '/']);
    expect(destroyed).toEqual([]);
    expect(harness.routeNativeElement?.textContent).toContain('/sprava');
  });

  it('when the swipe then goes back to the landing page, then the page drawn for the preview is the one shown, not a new one', async () => {
    await preview.visit('/', () => null);

    await harness.navigateByUrl('/');

    expect(created).toEqual(['/sprava', '/']);
    expect(destroyed).toEqual(['/sprava']);
  });

  it('when the swipe is called off, then the page drawn for the preview is let go', async () => {
    await preview.visit('/', () => null);

    preview.discard();

    expect(destroyed).toEqual(['/']);
  });

  it('when another page opens after a preview, then the page drawn for the preview is let go', async () => {
    await preview.visit('/', () => null);

    await harness.navigateByUrl('/aktuality');

    expect(destroyed).toContain('/');
  });

  it('when the landing page is previewed, then the depth of the history, the tab memory and the focus take no step', async () => {
    const depth = TestBed.inject(BackTarget).nextDepth();
    const focusMoves: boolean[] = [];

    await preview.visit('/', () =>
      focusMoves.push(TestBed.inject(PageFocus).movesOnLastNavigation()),
    );

    expect(TestBed.inject(BackTarget).nextDepth()).toBe(depth);
    expect(TestBed.inject(BackTarget).destination('/').kind).toBe('parent');
    expect(focusMoves).toEqual([false]);
    expect(TestBed.inject(TabMemory).currentTab()).toBeNull();
    expect(TestBed.inject(KeptTabPages)).toBeDefined();
  });

  it('when the administration had the focus, then it has it back once the preview is over', async () => {
    const heading = harness.routeNativeElement!.querySelector('h1')!;
    heading.focus();

    await preview.visit('/', () => null);

    expect(document.activeElement).toBe(heading);
  });

  it('when a preview runs, then it says so, and when it is over, then it no longer does', async () => {
    const during: boolean[] = [];

    await preview.visit('/', () => during.push(preview.active()));

    expect(during).toEqual([true]);
    expect(preview.active()).toBe(false);
  });
});
