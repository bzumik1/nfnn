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
});
