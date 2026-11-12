import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CompactLayout } from '../../core/layout/compact-layout';
import { SiteFooter } from './site-footer';

describe('Given the site footer', () => {
  const compact = signal(false);

  beforeEach(async () => {
    compact.set(false);
    await TestBed.configureTestingModule({
      imports: [SiteFooter],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: CompactLayout, useValue: { isCompact: compact.asReadonly() } },
      ],
    }).compileComponents();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('when it renders in 2031, then the copyright carries the current year', () => {
    vi.setSystemTime(new Date(2031, 2, 1));
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.detectChanges();

    const copyright = (fixture.nativeElement as HTMLElement).querySelector('.footer-bottom p');

    expect(copyright?.textContent).toContain('© 2031 Nová naděje');
  });

  it('when it renders, then its links sit in a named navigation that also offers Přispět', () => {
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.detectChanges();

    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Odkazy v patičce');
    const links = Array.from(nav?.querySelectorAll('a') ?? []).map((link) => [
      link.getAttribute('href'),
      link.textContent?.trim(),
    ]);
    expect(links).toEqual([
      ['/o-nas', 'O nás'],
      ['/aktuality', 'Aktuality'],
      ['/projekty', 'Pomáháme'],
      ['/prispet', 'Přispět'],
      ['/o-nas#kontakt', 'Kontakt'],
    ]);
  });

  it('when it renders on a phone, then it links only to the contact, because the tab bar holds the sections', () => {
    compact.set(true);
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.detectChanges();

    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('nav a')).map(
      (link) => link.textContent?.trim(),
    );
    expect(links).toEqual(['Kontakt']);
  });

  it('when it renders, then the logo is its variant for the dark footer, whose star keeps its face', () => {
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.detectChanges();

    const logo = (fixture.nativeElement as HTMLElement).querySelector('.footer-brand img');

    expect(logo?.getAttribute('src')).toBe('/images/logo-on-dark.svg');
  });

  it('when it renders, then the foundation e-mail address is there to write to', () => {
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.detectChanges();

    const mail = (fixture.nativeElement as HTMLElement).querySelector('a[href^="mailto:"]');
    expect(mail?.getAttribute('href')).toBe('mailto:info@nfnn.cz');
    expect(mail?.textContent?.trim()).toBe('info@nfnn.cz');
  });

  it('when the list of news is open, then the footer item Aktuality leads to it and is marked as the current place', async () => {
    vi.useRealTimers();
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.detectChanges();

    await TestBed.inject(Router).navigateByUrl('/aktuality');
    fixture.detectChanges();
    await fixture.whenStable();

    const news = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('nav a')).find(
      (link) => link.textContent?.trim() === 'Aktuality',
    );
    expect(news?.getAttribute('href')).toBe('/aktuality');
    expect(news?.getAttribute('aria-current')).toBe('page');
  });

  describe('when the page scrolls it into view', () => {
    type Watch = (entries: { isIntersecting: boolean }[]) => void;
    let watch: Watch | null;
    let watched: Element | null;
    let disconnected: boolean;

    beforeEach(() => {
      watch = null;
      watched = null;
      disconnected = false;
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor(callback: Watch) {
            watch = callback;
          }

          observe(element: Element): void {
            watched = element;
          }

          disconnect(): void {
            disconnected = true;
          }
        },
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      document.documentElement.classList.remove('footer-in-view');
    });

    it('then the page says so, for Safari to paint the strip under its toolbar in the footer colour, and stops saying it once the footer leaves the screen', async () => {
      const fixture = TestBed.createComponent(SiteFooter);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(watched).toBe(fixture.nativeElement);
      watch!([{ isIntersecting: true }]);
      const inView = document.documentElement.classList.contains('footer-in-view');
      watch!([{ isIntersecting: false }]);

      expect(inView).toBe(true);
      expect(document.documentElement.classList.contains('footer-in-view')).toBe(false);
    });

    it('then a page without the footer forgets it, and the footer stops watching', async () => {
      const fixture = TestBed.createComponent(SiteFooter);
      fixture.detectChanges();
      await fixture.whenStable();
      watch!([{ isIntersecting: true }]);

      fixture.destroy();

      expect(document.documentElement.classList.contains('footer-in-view')).toBe(false);
      expect(disconnected).toBe(true);
    });
  });
});
