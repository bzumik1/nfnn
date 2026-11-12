import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  NavigationEnd,
  NavigationStart,
  provideRouter,
  Router,
  RouterLink,
  withInMemoryScrolling,
} from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { Location } from '@angular/common';
import { CompactLayout } from '../../core/layout/compact-layout';
import { BackTarget } from '../../core/navigation/back-target';
import { KeptTabPages } from '../../core/navigation/kept-tab-pages';
import { PublicShell } from './public-shell';

describe('Given the public shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicShell],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function render(): ComponentFixture<PublicShell> {
    const fixture = TestBed.createComponent(PublicShell);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/operations/setup')
      .flush({ required: false, codeRequired: true });
    return fixture;
  }

  it('when it renders, then the skip link is the first thing a keyboard reaches', () => {
    const fixture = render();

    const first = (fixture.nativeElement as HTMLElement).querySelector('a, button');

    expect(first?.classList).toContain('skip-link');
    expect(first?.textContent?.trim()).toBe('Přeskočit na obsah');
  });

  it('when the skip link is activated, then the main content takes the focus and the URL stays', () => {
    const fixture = render();
    document.body.appendChild(fixture.nativeElement);
    const host = fixture.nativeElement as HTMLElement;
    const link = host.querySelector<HTMLAnchorElement>('.skip-link')!;

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(host.querySelector('main'));
    fixture.nativeElement.remove();
  });

  it('when it goes, on the way into the donor area, then the pages of the tabs it kept go with it', () => {
    const forget = vi.spyOn(TestBed.inject(KeptTabPages), 'forget');
    const fixture = render();

    fixture.destroy();

    expect(forget).toHaveBeenCalledOnce();
  });
});

@Component({
  imports: [RouterLink],
  template: `<section id="uvod">
      <h1>Úvod</h1>
      <a routerLink="/zasady">Zásady</a>
    </section>
    <section id="prispet">
      <h2>Přispět</h2>
      <button type="button">500 Kč</button>
    </section>`,
})
class Home {}

@Component({ template: '<h1>Zásady</h1><p>Text</p>' })
class Page {}

describe('Given the public shell while the visitor moves around the site', () => {
  let host: HTMLElement;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicShell],
      providers: [
        provideRouter(
          [
            { path: '', component: Home },
            { path: 'zasady', component: Page },
          ],
          withInMemoryScrolling({ anchorScrolling: 'enabled' }),
        ),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PublicShell);
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    router = TestBed.inject(Router);
    await go('/');
  });

  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    http
      .match('/api/operations/setup')
      .forEach((request) => request.flush({ required: false, codeRequired: true }));
    http.verify();
    host.remove();
  });

  async function go(url: string): Promise<void> {
    await router.navigateByUrl(url);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  it('when the site first loads, then the focus stays where the browser put it', () => {
    expect(host.contains(document.activeElement)).toBe(false);
  });

  it('when they open another page, then its heading takes the focus quietly, so a screen reader reads the new page', async () => {
    await go('/zasady');

    const heading = host.querySelector('main h1');
    expect(heading?.textContent).toBe('Zásady');
    expect(document.activeElement).toBe(heading);
    expect(heading?.getAttribute('tabindex')).toBe('-1');
  });

  it('when they follow a link to a section of the page, then the section takes the focus, so Tab continues inside it', async () => {
    await go('/#prispet');

    const section = host.querySelector('#prispet');
    expect(document.activeElement).toBe(section);
    expect(section?.getAttribute('tabindex')).toBe('-1');
  });

  it('when they return with the browser, then the focus stays where the browser put it', async () => {
    router.setUpLocationChangeListener();
    await go('/zasady');
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    const returned = firstValueFrom(router.events.pipe(filter((e) => e instanceof NavigationEnd)));
    TestBed.inject(Location).back();
    await returned;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('when they return with the back button of the app, then the heading of the page takes the focus', async () => {
    router.setUpLocationChangeListener();
    const back = TestBed.inject(BackTarget);
    await go('/zasady');
    await go('/');

    const returned = firstValueFrom(router.events.pipe(filter((e) => e instanceof NavigationEnd)));
    back.back('/zasady');
    await returned;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(router.url).toBe('/zasady');
    expect(document.activeElement).toBe(host.querySelector('main h1'));
  });

  it('when they return with the back button of the app to a page that links to the one they left, then that link takes the focus, where the restored scroll shows it', async () => {
    router.setUpLocationChangeListener();
    const back = TestBed.inject(BackTarget);
    await go('/zasady');

    const returned = firstValueFrom(router.events.pipe(filter((e) => e instanceof NavigationEnd)));
    back.back('/');
    await returned;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(router.url).toBe('/');
    expect(document.activeElement).toBe(host.querySelector('main a[href="/zasady"]'));
  });

  it('when the link to the page they left lies in a strip scrolled sideways, then the strip brings it into view as it takes the focus', async () => {
    router.setUpLocationChangeListener();
    const back = TestBed.inject(BackTarget);
    const original = HTMLElement.prototype.scrollIntoView;
    const shown: [Element, ScrollIntoViewOptions | boolean | undefined][] = [];
    HTMLElement.prototype.scrollIntoView = function (
      this: Element,
      options?: ScrollIntoViewOptions | boolean,
    ) {
      shown.push([this, options]);
    };
    try {
      await go('/zasady');
      const returned = firstValueFrom(
        router.events.pipe(filter((e) => e instanceof NavigationEnd)),
      );
      back.back('/');
      await returned;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }

    const link = host.querySelector('main a[href="/zasady"]');
    expect(document.activeElement).toBe(link);
    expect(shown).toEqual([[link, { block: 'nearest', inline: 'nearest' }]]);
  });

  it('when a dialog is open during a navigation, then the focus stays in the dialog', async () => {
    const dialog = document.createElement('dialog');
    const field = document.createElement('input');
    dialog.appendChild(field);
    document.body.appendChild(dialog);
    dialog.setAttribute('open', '');
    field.focus();

    await go('/zasady');

    expect(document.activeElement).toBe(field);
    dialog.remove();
  });
});

describe('Given the public shell created by the navigation itself', () => {
  let router: Router;
  let host: HTMLElement | null = null;

  @Component({ template: '<h1>Jinde</h1>' })
  class Elsewhere {}

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicShell],
      providers: [
        provideRouter([
          { path: 'jinde', component: Elsewhere },
          { path: 'stary', canActivate: [() => router.parseUrl('/zasady')], children: [] },
          { path: 'zasady', component: Page },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    router.setUpLocationChangeListener();
  });

  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    http
      .match('/api/operations/setup')
      .forEach((request) => request.flush({ required: false, codeRequired: true }));
    http.verify();
    host?.remove();
    host = null;
  });

  function createShellOnNextNavigation(): void {
    const started = router.events.pipe(filter((e) => e instanceof NavigationStart));
    const subscription = started.subscribe(() => {
      subscription.unsubscribe();
      const fixture = TestBed.createComponent(PublicShell);
      host = fixture.nativeElement as HTMLElement;
      document.body.appendChild(host);
    });
  }

  it('when the browser returns from another area into the public pages, then the focus stays where the browser put it', async () => {
    await router.navigateByUrl('/zasady');
    await router.navigateByUrl('/jinde');
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    createShellOnNextNavigation();
    const returned = firstValueFrom(router.events.pipe(filter((e) => e instanceof NavigationEnd)));
    TestBed.inject(Location).back();
    await returned;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(router.url).toBe('/zasady');
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('when the first load is redirected by a guard, then the focus stays where the browser put it', async () => {
    createShellOnNextNavigation();
    await router.navigateByUrl('/stary');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(router.url).toBe('/zasady');
    expect(host?.contains(document.activeElement)).toBe(false);
  });
});

@Component({ template: '<h1>Stránka</h1>' })
class TabPage {}

describe('Given the public shell around the pages of the tabs', () => {
  const compact = signal(false);

  beforeEach(async () => {
    compact.set(false);
    await TestBed.configureTestingModule({
      imports: [PublicShell],
      providers: [
        provideRouter([
          {
            path: '',
            pathMatch: 'full',
            component: TabPage,
            data: { landing: true, head: 'photo' },
          },
          { path: 'o-nas', component: TabPage, data: { head: 'light' } },
          { path: 'aktuality', component: TabPage },
          { path: 'pripojeni', component: TabPage, data: { tabBar: false } },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CompactLayout, useValue: { isCompact: compact.asReadonly() } },
      ],
    }).compileComponents();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  let fixture: ComponentFixture<PublicShell> | null = null;

  afterEach(() => {
    fixture = null;
  });

  async function openAt(url: string): Promise<HTMLElement> {
    if (fixture === null) {
      fixture = TestBed.createComponent(PublicShell);
      fixture.detectChanges();
      TestBed.inject(HttpTestingController)
        .expectOne('/api/operations/setup')
        .flush({ required: false, codeRequired: true });
    }
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('when a page of a tab opens on a phone or a wider screen, then the header and the tab bar frame it, with no footer under it and room for the bar at its end', async () => {
    for (const phone of [false, true]) {
      compact.set(phone);
      const shell = await openAt(phone ? '/o-nas' : '/aktuality');

      expect(shell.querySelector('header')).not.toBeNull();
      expect(shell.querySelector('nav[aria-label="Hlavní sekce"]')).not.toBeNull();
      expect(shell.querySelector('footer, [role="contentinfo"]')).toBeNull();
      expect(shell.querySelector('main')?.classList).toContain('with-tab-bar');
    }
  });

  it('when the landing page opens, then the photo keeps the room for the bar itself', async () => {
    const shell = await openAt('/');

    expect(shell.querySelector('main')?.classList).not.toContain('with-tab-bar');
    expect(shell.querySelector('nav[aria-label="Hlavní sekce"]')).not.toBeNull();
  });

  it('when a page asks for no tab bar, then the shell leaves it out', async () => {
    const shell = await openAt('/pripojeni');

    expect(shell.querySelector('nav[aria-label="Hlavní sekce"]')).toBeNull();
  });
});
