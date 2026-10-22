import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../../core/auth/testing/donor-fixtures';
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

  describe('when an administrator sees it in the donor area', () => {
    beforeEach(async () => {
      signIn(['DONOR', 'ADMIN']);
      fixture.detectChanges();
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
      await fixture.whenStable();
    });

    it('then it leads back to their own overview instead', () => {
      expect(links()).toEqual(['Hlavní stránkaDomů → /', 'Můj přehled → /donor/prehled']);
    });
  });
});
