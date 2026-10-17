import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { DonorDashboard } from './dashboard';

describe('Given a signed-in donor on the dashboard', () => {
  let fixture: ComponentFixture<DonorDashboard>;
  let http: HttpTestingController;
  let store: AuthStore;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DonorDashboard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1', sampleDonor({ variableSymbol: '9876543210' })));
    fixture = TestBed.createComponent(DonorDashboard);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector) as HTMLElement).textContent ?? '';
  }

  it('when the page opens, then it greets the donor by name and shows the variable symbol', () => {
    expect(text('.topbar-greeting')).toContain('Jana Nováková');
    expect(text('.symbol-value')).toBe('9876543210');
  });

  it('when the donor signs out, then the session ends and the home page opens', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    (fixture.nativeElement.querySelector('.topbar-logout') as HTMLButtonElement).click();
    http.expectOne('/api/donors/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(store.signedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
