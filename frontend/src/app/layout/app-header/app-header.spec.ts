import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth-store';
import { Donor } from '../../core/auth/donor';
import { LoginDialogService } from '../../core/auth/login-dialog.service';
import { sampleDonor } from '../../core/auth/testing/donor-fixtures';
import { CompactLayout } from '../../core/layout/compact-layout';
import { BackTarget } from '../../core/navigation/back-target';
import { AccountBadges } from '../../core/layout/account-badges';
import { AppHeader } from './app-header';

@Component({ template: '' })
class Blank {}

describe('Given the header of the app', () => {
  const donor = signal<Donor | null>(null);
  const admin = signal(false);
  const compact = signal(true);
  const loginOpen = vi.fn();
  const back = vi.fn();
  let fixture: ComponentFixture<AppHeader>;

  beforeEach(async () => {
    donor.set(null);
    admin.set(false);
    compact.set(true);
    loginOpen.mockClear();
    back.mockClear();
    await TestBed.configureTestingModule({
      imports: [AppHeader],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: '', pathMatch: 'full', component: Blank, data: { head: 'photo', landing: true } },
          { path: 'o-nas', component: Blank, data: { head: 'light' } },
          { path: 'aktuality/:slug', component: Blank, data: { parent: '/aktuality' } },
          {
            path: 'darce/prehled',
            component: Blank,
            data: { head: 'light', parent: '/', backOnWide: false },
          },
          { path: 'darce/ucty', component: Blank, data: { head: 'light', parent: '/' } },
        ]),
        { provide: CompactLayout, useValue: { isCompact: compact.asReadonly() } },
        { provide: LoginDialogService, useValue: { open: loginOpen } },
        { provide: BackTarget, useValue: { back } },
        {
          provide: AuthStore,
          useValue: {
            donor: donor.asReadonly(),
            signedIn: () => donor() !== null,
            isAdmin: admin.asReadonly(),
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  async function openAt(url: string): Promise<HTMLElement> {
    await TestBed.inject(Router).navigateByUrl(url);
    fixture = TestBed.createComponent(AppHeader);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('when a question waits in the account, then the account link shows how many and names them, except on the page that holds them', async () => {
    donor.set(sampleDonor({ name: 'Jana Nováková' }));
    TestBed.inject(AccountBadges).show('/darce/ucty', {
      count: 1,
      description: '1 otázka čeká na odpověď',
    });

    const header = await openAt('/darce/prehled');
    const account = header.querySelector('a.account-button')!;

    expect(account.querySelector('.account-badge')?.textContent?.trim()).toBe('1');
    expect(account.querySelector('.account-badge')?.getAttribute('aria-hidden')).toBe('true');
    expect(account.textContent?.replace(/\s+/g, ' ')).toContain('Účet 1 otázka čeká na odpověď');

    await TestBed.inject(Router).navigateByUrl('/darce/ucty');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(account.querySelector('.account-badge')).toBeNull();
    expect(account.textContent).not.toContain('otázka');
  });

  it('when nobody is signed in, then the logo leads home and Přihlásit se opens the sign-in', async () => {
    const header = await openAt('/o-nas');

    expect(header.querySelector('header a.brand')?.getAttribute('href')).toBe('/');
    const signIn = header.querySelector<HTMLButtonElement>('button.sign-in')!;
    expect(signIn.textContent?.trim()).toBe('Přihlásit se');

    signIn.click();

    expect(loginOpen).toHaveBeenCalledWith('login', expect.anything());
  });

  it('when the visitor signs in from the header, then the focus lands on the account link Účet that took the place of Přihlásit se', async () => {
    const header = await openAt('/o-nas');
    document.body.appendChild(header);
    header.querySelector<HTMLButtonElement>('button.sign-in')!.click();
    const options = loginOpen.mock.calls[0][1] as { afterSignIn: () => void };

    donor.set(sampleDonor({ name: 'Jana Nováková' }));
    options.afterSignIn();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(header.querySelector('a.account-button'));
    header.remove();
  });

  it('when the page has a light head, then the logo is the blue one, and over a photo or a dark head the white one', async () => {
    const logo = (header: HTMLElement) => header.querySelector('a.brand img')?.getAttribute('src');

    expect(logo(await openAt('/o-nas'))).toBe('/images/logo.svg');
    fixture.destroy();
    expect(logo(await openAt('/'))).toBe('/images/logo-on-dark.svg');
    fixture.destroy();
    expect(logo(await openAt('/aktuality/clanek'))).toBe('/images/logo-on-dark.svg');
  });

  it('when a donor is signed in, then the initials of their name stand for a link named Účet that opens Můj přehled at once, with no sheet over the page', async () => {
    donor.set(sampleDonor({ name: 'Jana Marie Nováková' }));
    const header = await openAt('/o-nas');
    const account = header.querySelector<HTMLAnchorElement>('a.account-button')!;

    expect(account.querySelector('.visually-hidden')?.textContent?.trim()).toBe('Účet');
    expect(account.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('JN');
    expect(account.getAttribute('href')).toBe('/darce/prehled');
    expect(account.hasAttribute('aria-haspopup')).toBe(false);
    expect(header.querySelector('button.sign-in')).toBeNull();

    account.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/darce/prehled');
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('when the donor keeps no name, then the account link shows a person', async () => {
    donor.set(sampleDonor({ name: ' ' }));
    const header = await openAt('/o-nas');

    expect(header.querySelector('a.account-button svg')).not.toBeNull();
  });

  it('when a tab root is open, then there is no back button', async () => {
    const header = await openAt('/o-nas');

    expect(header.querySelector('button.back-button')).toBeNull();
  });

  it('when a page deeper in a tab is open, then a back button named Zpět leads to its parent', async () => {
    const header = await openAt('/aktuality/clanek');
    const button = header.querySelector<HTMLButtonElement>('button.back-button')!;

    expect(button.getAttribute('aria-label')).toBe('Zpět');

    button.click();

    expect(back).toHaveBeenCalledWith('/aktuality');
  });

  it('when a page of the account is open on a computer, then the side panel leads around and no back button shows', async () => {
    donor.set(sampleDonor());
    compact.set(false);

    const header = await openAt('/darce/prehled');

    expect(header.querySelector('button.back-button')).toBeNull();
  });

  it('when a page of the account is open on a phone, then the back button shows', async () => {
    donor.set(sampleDonor());

    const header = await openAt('/darce/prehled');

    expect(header.querySelector('button.back-button')).not.toBeNull();
  });

  it('when an administrator linked to a person of the foundation with a portrait is signed in, then the account link shows that portrait', async () => {
    donor.set(sampleDonor({ name: 'Jana Nováková' }));
    admin.set(true);
    const header = await openAt('/o-nas');

    TestBed.inject(HttpTestingController)
      .expectOne('/api/admin/content/people/me')
      .flush({
        member: {
          id: '0199f3e0-0000-7000-8000-00000000c001',
          name: 'Jana Nováková',
          portrait: {
            id: '0199f3e0-0000-7000-8000-00000000c101',
            url: '/api/content/media/0199f3e0-0000-7000-8000-00000000c101',
            width: 640,
            height: 640,
          },
        },
      });
    fixture.detectChanges();

    const account = header.querySelector<HTMLAnchorElement>('a.account-button')!;
    expect(account.querySelector('img')?.getAttribute('src')).toBe(
      '/api/content/media/0199f3e0-0000-7000-8000-00000000c101?w=480',
    );
    expect(account.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(account.querySelector('.visually-hidden')?.textContent?.trim()).toBe('Účet');
  });

  it('when an administrator without a portrait is signed in, then the account button keeps the initials', async () => {
    donor.set(sampleDonor({ name: 'Jana Nováková' }));
    admin.set(true);
    const header = await openAt('/o-nas');

    TestBed.inject(HttpTestingController)
      .expectOne('/api/admin/content/people/me')
      .flush({ member: null });
    fixture.detectChanges();

    const account = header.querySelector<HTMLAnchorElement>('a.account-button')!;
    expect(account.querySelector('img')).toBeNull();
    expect(account.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBe('JN');
  });
});
