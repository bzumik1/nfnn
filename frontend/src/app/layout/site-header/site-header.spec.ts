import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthStore } from '../../core/auth/auth-store';
import { LoginDialogService } from '../../core/auth/login-dialog.service';
import { authResponse } from '../../core/auth/testing/donor-fixtures';
import { SiteHeader } from './site-header';

describe('Given the site header on a phone', () => {
  let fixture: ComponentFixture<SiteHeader>;
  let phoneLayout: HTMLStyleElement;

  const toggle = () => fixture.nativeElement.querySelector('.mobile-menu-btn') as HTMLButtonElement;
  const menu = () => fixture.nativeElement.querySelector('#mobile-menu') as HTMLElement | null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteHeader],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    phoneLayout = document.createElement('style');
    phoneLayout.textContent =
      '.mobile-menu-btn { display: flex !important; } .desktop-nav { display: none !important; }';
    document.head.appendChild(phoneLayout);
    fixture = TestBed.createComponent(SiteHeader);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    fixture.nativeElement.remove();
    phoneLayout.remove();
  });

  function openMenu(): void {
    toggle().focus();
    toggle().click();
    fixture.detectChanges();
  }

  it('when it renders, then its navigation is named for screen readers', () => {
    expect(fixture.nativeElement.querySelector('nav').getAttribute('aria-label')).toBe(
      'Hlavní menu',
    );
  });

  it('when the menu is closed, then its button says it opens the menu and is not expanded', () => {
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-controls')).toBe('mobile-menu');
    expect(toggle().getAttribute('aria-label')).toBe('Otevřít menu');
    expect(menu()).toBeNull();
  });

  it('when the button is pressed, then the menu opens and the button says it closes it', () => {
    openMenu();

    expect(menu()).not.toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-label')).toBe('Zavřít menu');
  });

  it('when Esc is pressed in the open menu, then it closes and the focus is back on its button', () => {
    openMenu();
    (menu()!.querySelector('a') as HTMLAnchorElement).focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });

  it('when the focus moves past the last link of the open menu, then the menu closes so nothing hides the focused control', () => {
    const after = document.createElement('button');
    document.body.appendChild(after);
    openMenu();
    const links = menu()!.querySelectorAll<HTMLElement>('a, button');
    links[links.length - 1].focus();

    after.focus();
    fixture.detectChanges();

    expect(menu()).toBeNull();
    after.remove();
  });

  it('when the focus moves from the open menu back to its button, then the menu stays open', () => {
    openMenu();
    (menu()!.querySelector('a') as HTMLAnchorElement).focus();

    toggle().focus();
    fixture.detectChanges();

    expect(menu()).not.toBeNull();
  });

  it('when the page outside the menu is clicked, then the menu closes', () => {
    openMenu();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(menu()).toBeNull();
  });

  it('when a link in the menu is clicked, then the menu closes', () => {
    openMenu();

    (menu()!.querySelector('a') as HTMLAnchorElement).click();
    fixture.detectChanges();

    expect(menu()).toBeNull();
  });

  it('when the menu opens, then it lists the sections without a separate home link and the donate one as Přispět', () => {
    openMenu();

    const links = Array.from(menu()!.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>).map(
      (link) => link.textContent?.trim(),
    );
    expect(links).toEqual(['O nás', 'Projekty', 'Aktuality', 'Kontakt', 'Přispět']);
  });

  it('when the visitor signs in from the menu, then the menu closes and the sign-in dialog opens', () => {
    openMenu();

    (menu()!.querySelector('button.mobile-login') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(menu()).toBeNull();
    expect(TestBed.inject(LoginDialogService).isOpen()).toBe(true);
  });

  it('when the visitor signs in from the menu, then the page stays and the focus waits quietly at the top of the header', async () => {
    openMenu();
    (menu()!.querySelector('button.mobile-login') as HTMLButtonElement).click();
    fixture.detectChanges();

    await signInThroughTheDialog(fixture);

    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('nav.nav'));
  });
});

describe('Given the site header on a computer', () => {
  let fixture: ComponentFixture<SiteHeader>;

  const loginButton = () =>
    fixture.nativeElement.querySelector('.desktop-nav .nav-login') as HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [SiteHeader],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(SiteHeader);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    fixture.nativeElement.remove();
  });

  it('when it renders, then the logo leads home and the links name each section, the donate one as Přispět', () => {
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('.desktop-nav a') as NodeListOf<HTMLAnchorElement>,
    ).map((link) => link.textContent?.trim());

    expect(links).toEqual(['O nás', 'Projekty', 'Aktuality', 'Kontakt', 'Přispět']);
    expect(fixture.nativeElement.querySelector('.brand').getAttribute('href')).toBe('/#uvod');
  });

  it('when the visitor signs in, then the page stays, the header offers the overview and no control is left highlighted', async () => {
    loginButton().focus();
    loginButton().click();
    fixture.detectChanges();
    expect(TestBed.inject(LoginDialogService).isOpen()).toBe(true);

    await signInThroughTheDialog(fixture);

    expect(loginButton().tagName).toBe('A');
    expect(loginButton().textContent).toContain('Můj přehled');
    expect(loginButton().getAttribute('href')).toBe('/darce/prehled');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('nav.nav'));
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
  });
});

async function signInThroughTheDialog(fixture: ComponentFixture<SiteHeader>): Promise<void> {
  TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne('/api/donors/auth/login')
    .flush(authResponse('token-1'));
  TestBed.inject(LoginDialogService).signedIn();
  fixture.detectChanges();
  await fixture.whenStable();
}
