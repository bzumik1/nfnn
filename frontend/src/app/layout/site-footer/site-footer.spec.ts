import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SiteFooter } from './site-footer';

describe('Given the site footer', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteFooter],
      providers: [provideRouter([])],
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

  it('when it renders, then the foundation e-mail address is there to write to', () => {
    const fixture = TestBed.createComponent(SiteFooter);
    fixture.detectChanges();

    const mail = (fixture.nativeElement as HTMLElement).querySelector('a[href^="mailto:"]');
    expect(mail?.getAttribute('href')).toBe('mailto:info@nfnn.cz');
    expect(mail?.textContent?.trim()).toBe('info@nfnn.cz');
  });
});
