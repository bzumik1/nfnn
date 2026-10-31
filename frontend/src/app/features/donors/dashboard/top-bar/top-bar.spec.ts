import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../../core/auth/testing/donor-fixtures';
import { SignedOutNotice } from '../../../../core/auth/signed-out-notice';
import { DashboardTopBar } from './top-bar';

describe('Given the dashboard top bar', () => {
  let fixture: ComponentFixture<DashboardTopBar>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DashboardTopBar],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DashboardTopBar);
  });

  afterEach(() => http.verify());

  function signIn(roles: string[]): void {
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1', sampleDonor({ roles })));
  }

  function links(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>)
      .map((link) => `${link.textContent?.trim()} → ${link.getAttribute('href')}`)
      .filter((link) => !link.startsWith(' →'));
  }

  describe('when a donor without the administrator role sees it', () => {
    beforeEach(async () => {
      signIn(['DONOR']);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('then it shows their name and no link to the administration', () => {
      expect(fixture.nativeElement.textContent).toContain('Jana Nováková');
      expect(links()).toEqual(['Hlavní stránkaDomů → /']);
    });
  });

  function own(member: unknown): void {
    http.expectOne('/api/admin/content/people/me').flush({ member });
  }

  function account(): HTMLElement {
    return fixture.nativeElement.querySelector('.topbar-donor') as HTMLElement;
  }

  describe('when an administrator sees it in the donor area', () => {
    beforeEach(async () => {
      signIn(['DONOR', 'ADMIN']);
      fixture.detectChanges();
      own(null);
      await fixture.whenStable();
    });

    it('then it offers the administration', () => {
      expect(links()).toEqual(['Hlavní stránkaDomů → /', 'Správa → /sprava']);
    });
  });

  describe('when an administrator sees it in the administration', () => {
    beforeEach(async () => {
      signIn(['DONOR', 'ADMIN']);
      fixture.componentRef.setInput('area', 'admin');
      fixture.detectChanges();
      own(null);
      await fixture.whenStable();
    });

    it('then it leads back to their own overview instead', () => {
      expect(links()).toEqual(['Hlavní stránkaDomů → /', 'Můj přehled → /darce/prehled']);
    });

    it('and they are no person of the foundation, then their name keeps the plain icon', () => {
      expect(account().querySelector('svg')).not.toBeNull();
      expect(account().querySelector('app-avatar')).toBeNull();
      expect(account().textContent?.trim()).toBe('Jana Nováková');
    });
  });

  describe('when an administrator linked to a person of the foundation with a portrait sees it', () => {
    beforeEach(async () => {
      signIn(['DONOR', 'ADMIN']);
      fixture.componentRef.setInput('area', 'admin');
      fixture.detectChanges();
      own({
        id: '0199f3e0-0000-7000-8000-00000000c001',
        name: 'Jana Nováková',
        portrait: {
          id: '0199f3e0-0000-7000-8000-00000000c101',
          url: '/api/content/media/0199f3e0-0000-7000-8000-00000000c101',
          width: 640,
          height: 640,
        },
      });
      await fixture.whenStable();
    });

    it('then the portrait of that person stands beside their name, hidden from the screen reader', () => {
      const portrait = account().querySelector('app-avatar img') as HTMLImageElement;

      expect(portrait.getAttribute('src')).toBe(
        '/api/content/media/0199f3e0-0000-7000-8000-00000000c101?w=480',
      );
      expect(account().querySelector('app-avatar')!.getAttribute('aria-hidden')).toBe('true');
      expect(account().querySelector('svg')).toBeNull();
      expect(account().textContent?.trim()).toBe('Jana Nováková');
    });
  });

  describe('when an administrator sees it and their person cannot be read', () => {
    beforeEach(async () => {
      signIn(['DONOR', 'ADMIN']);
      fixture.detectChanges();
      http
        .expectOne('/api/admin/content/people/me')
        .flush(null, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();
    });

    it('then their name keeps the plain icon', () => {
      expect(account().querySelector('svg')).not.toBeNull();
      expect(account().textContent?.trim()).toBe('Jana Nováková');
    });
  });
});

describe('Given a signed-in donor at the dashboard top bar', () => {
  let fixture: ComponentFixture<DashboardTopBar>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DashboardTopBar],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1', sampleDonor()));
    fixture = TestBed.createComponent(DashboardTopBar);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('when they sign out, then they land on the home page and the notice says they signed out', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const notice = TestBed.inject(SignedOutNotice);

    (fixture.nativeElement.querySelector('.topbar-logout') as HTMLButtonElement).click();
    expect(notice.shown()).toBe(false);
    http
      .expectOne('/api/donors/auth/logout')
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith('/');
    expect(notice.shown()).toBe(true);
  });
});
