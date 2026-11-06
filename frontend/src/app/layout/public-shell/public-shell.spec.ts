import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router, withInMemoryScrolling } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { Location } from '@angular/common';
import { CompactLayout } from '../../core/layout/compact-layout';
import { HomeScreenApp } from '../../core/layout/home-screen-app';
import { BackTarget } from '../../core/navigation/back-target';
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
});

@Component({
  template: `<section id="uvod"><h1>Úvod</h1></section>
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

@Component({ template: '<h1>Stránka</h1>' })
class TabPage {}

describe('Given the public shell around the pages of the tabs', () => {
  const compact = signal(false);
  const homeScreen = { onTouchScreen: false };

  beforeEach(async () => {
    compact.set(false);
    homeScreen.onTouchScreen = false;
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
          { path: 'o-nas', component: TabPage, data: { head: 'light', phoneFooter: true } },
          { path: 'aktuality', component: TabPage },
          { path: 'pripojeni', component: TabPage, data: { tabBar: false } },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CompactLayout, useValue: { isCompact: compact.asReadonly() } },
        { provide: HomeScreenApp, useValue: homeScreen },
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

  it('when a page of a tab opens, then the header, the tab bar and the footer frame it', async () => {
    const shell = await openAt('/aktuality');

    expect(shell.querySelector('header')).not.toBeNull();
    expect(shell.querySelector('nav[aria-label="Hlavní sekce"]')).not.toBeNull();
    expect(shell.querySelector('app-site-footer')).not.toBeNull();
  });

  it('when the landing page opens, then it shows no footer under the photo, which keeps the room for the bar itself', async () => {
    const shell = await openAt('/');

    expect(shell.querySelector('app-site-footer')).toBeNull();
    expect(shell.querySelector('main')?.classList).not.toContain('with-tab-bar');
    expect(shell.querySelector('nav[aria-label="Hlavní sekce"]')).not.toBeNull();
  });

  it('when a page of a tab opens on a phone, then only the About page ends with the footer', async () => {
    compact.set(true);

    expect((await openAt('/aktuality')).querySelector('app-site-footer')).toBeNull();
    expect((await openAt('/o-nas')).querySelector('app-site-footer')).not.toBeNull();
  });

  it('when the app opened from the home screen of an iPhone or iPad shows a page, then no web footer ends it, on a phone or a tablet', async () => {
    homeScreen.onTouchScreen = true;

    expect((await openAt('/aktuality')).querySelector('app-site-footer')).toBeNull();
    compact.set(true);
    const about = await openAt('/o-nas');
    expect(about.querySelector('app-site-footer')).toBeNull();
    expect(about.querySelector('main')?.classList).toContain('with-tab-bar');
  });

  it('when a page asks for no tab bar, then the shell leaves it out', async () => {
    const shell = await openAt('/pripojeni');

    expect(shell.querySelector('nav[aria-label="Hlavní sekce"]')).toBeNull();
  });
});
