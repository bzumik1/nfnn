import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withInMemoryScrolling } from '@angular/router';
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

  afterEach(() => host.remove());

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
