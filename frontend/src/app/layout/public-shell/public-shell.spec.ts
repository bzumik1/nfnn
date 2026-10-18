import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PublicShell } from './public-shell';

describe('Given the public shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicShell],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('when it renders, then the skip link is the first thing a keyboard reaches', () => {
    const fixture = TestBed.createComponent(PublicShell);
    fixture.detectChanges();

    const first = (fixture.nativeElement as HTMLElement).querySelector('a, button');

    expect(first?.classList).toContain('skip-link');
    expect(first?.textContent?.trim()).toBe('Přeskočit na obsah');
  });

  it('when the skip link is activated, then the main content takes the focus and the URL stays', () => {
    const fixture = TestBed.createComponent(PublicShell);
    fixture.detectChanges();
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
