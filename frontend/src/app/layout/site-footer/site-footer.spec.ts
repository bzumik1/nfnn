import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SiteFooter } from './site-footer';

describe('Given the site footer', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteFooter],
      providers: [provideRouter([{ path: '**', children: [] }])],
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
      ['/#uvod', 'Domů'],
      ['/#o-nas', 'O nás'],
      ['/#projekty', 'Projekty'],
      ['/#aktuality', 'Aktuality'],
      ['/#kontakt', 'Kontakt'],
      ['/#prispet', 'Přispět'],
    ]);
  });

  it('when it renders, then the logo is drawn light for the dark footer', () => {
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.detectChanges();

    const logo = (fixture.nativeElement as HTMLElement).querySelector('.footer-brand img');

    expect(logo?.classList).toContain('logo-on-dark');
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
});
