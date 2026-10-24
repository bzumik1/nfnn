import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Navigation, provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { draftArticle, newsArticle } from '../../content/testing/news-fixtures';
import { AdminNews } from './admin-news';

const LIST_URL = '/api/admin/content/news';

function problem(status: number, type: string) {
  return {
    body: { type: `https://nfnn.cz/problems/${type}`, title: 'Chyba', detail: 'Detail', status },
    options: {
      status,
      statusText: 'Error',
      headers: { 'Content-Type': 'application/problem+json' },
    },
  };
}

describe('Given an administrator on the news list', () => {
  let fixture: ComponentFixture<AdminNews>;
  let http: HttpTestingController;
  let store: AuthStore;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminNews],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminNews);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function texts(selector: string): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll(selector) as NodeListOf<Element>).map(
      (element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  function rows(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<Element>,
    ).map((row) =>
      Array.from(row.querySelectorAll('td'))
        .map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
        .join(' '),
    );
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('when the list arrives, then every article shows its title as a link, its tag, its state and when it was last saved', async () => {
    http.expectOne(LIST_URL).flush({ items: [draftArticle(), newsArticle()] });
    await settle();

    expect(rows()).toEqual([
      'Benefiční koncert bez štítku Koncept 22. 10. 2026 11:00',
      'Zahrada pro děti Projekt Zveřejněno 20. 10. 2026 20. 10. 2026 09:30',
    ]);
    const links = fixture.nativeElement.querySelectorAll(
      'tbody a',
    ) as NodeListOf<HTMLAnchorElement>;
    expect(links[0].getAttribute('href')).toBe(`/sprava/aktuality/${draftArticle().id}`);
    expect(
      (
        fixture.nativeElement.querySelector('a.ui-button--primary') as HTMLAnchorElement
      ).getAttribute('href'),
    ).toBe('/sprava/aktuality/nova');
  });

  it('when there is no article yet, then the page says so and offers the first one', async () => {
    http.expectOne(LIST_URL).flush({ items: [] });
    await settle();

    expect(texts('.ui-card__intro')).toEqual([
      'Zatím tu žádná aktualita není. Napište první tlačítkem Nová aktualita.',
    ]);
  });

  it('when the list cannot be loaded, then an alert offers a retry that asks again', async () => {
    http.expectOne(LIST_URL).flush(null, { status: 500, statusText: 'Error' });
    await settle();

    expect(texts('[role="alert"]:not(:empty)')).toEqual([
      'Aktuality se nepodařilo načíst. Zkusit znovu',
    ]);
    (
      fixture.nativeElement.querySelector('.ui-load-state--error button') as HTMLButtonElement
    ).click();
    await settle();
    http.expectOne(LIST_URL).flush({ items: [newsArticle()] });
    await settle();

    expect(rows()).toHaveLength(1);
  });

  it('when the donor is no administrator, then the page sends them to their overview', async () => {
    const router = TestBed.inject(Router);
    const navigated = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const { body, options } = problem(403, 'auth/forbidden');
    http.expectOne(LIST_URL).flush(body, options);
    await settle();

    expect(navigated).toHaveBeenCalledWith('/darce/prehled');
  });

  it('when the session is gone, then the page signs the donor out and opens the sign-in dialog', async () => {
    const router = TestBed.inject(Router);
    const navigated = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const dialog = TestBed.inject(LoginDialogService);
    const opened = vi.spyOn(dialog, 'open');
    const { body, options } = problem(401, 'auth/unauthenticated');
    http.expectOne(LIST_URL).flush(body, options);
    await settle();
    http
      .expectOne('/api/donors/auth/logout')
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(navigated).toHaveBeenCalledWith('/');
    expect(opened).toHaveBeenCalled();
  });
});

describe('Given an administrator who has just deleted an article', () => {
  it('when the list opens, then it says which article was deleted', async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminNews],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'currentNavigation').mockReturnValue({
      extras: { state: { deleted: 'Zahrada pro děti' } },
    } as unknown as Navigation);
    const fixture = TestBed.createComponent(AdminNews);
    fixture.detectChanges();
    http.expectOne(LIST_URL).flush({ items: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      (
        fixture.nativeElement.querySelector('[role="status"]:not(:empty)')?.textContent ?? ''
      ).trim(),
    ).toBe('Aktualitu „Zahrada pro děti“ jsme smazali.');
    http.verify();
  });
});
