import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { reportView } from '../testing/admin-fixtures';
import { AdminReport } from './admin-report';

const REPORT_URL = '/api/admin/donations/report';
const SETTINGS_URL = '/api/admin/donations/report/settings';
const SEND_URL = '/api/admin/donations/report/send';

function problem(status: number, type: string, title: string, detail: string) {
  return {
    body: { type: `https://nfnn.cz/problems/${type}`, title, detail, status },
    options: {
      status,
      statusText: 'Error',
      headers: { 'Content-Type': 'application/problem+json' },
    },
  };
}

describe('Given an administrator on the monthly report page', () => {
  let fixture: ComponentFixture<AdminReport>;
  let http: HttpTestingController;
  let store: AuthStore;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminReport],
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
    fixture = TestBed.createComponent(AdminReport);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function element<T extends HTMLElement>(selector: string): T {
    const found = fixture.nativeElement.querySelector(selector) as T | null;
    if (found === null) {
      throw new Error(`No element matches ${selector}`);
    }
    return found;
  }

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function button(name: string): HTMLButtonElement {
    const found = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((candidate) => candidate.textContent?.trim() === name);
    if (found === undefined) {
      throw new Error(`No button ${name}`);
    }
    return found;
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function respond(body: object, status = 200): Promise<void> {
    http
      .expectOne(REPORT_URL)
      .flush(body, status === 200 ? undefined : { status, statusText: 'Error' });
    await settle();
  }

  async function type(selector: string, value: string): Promise<void> {
    const control = element<HTMLTextAreaElement | HTMLSelectElement>(selector);
    control.value = value;
    control.dispatchEvent(new Event('input'));
    control.dispatchEvent(new Event('change'));
    control.dispatchEvent(new Event('blur'));
    await settle();
  }

  async function choose(selector: string, index: number): Promise<void> {
    const select = element<HTMLSelectElement>(selector);
    select.selectedIndex = index;
    select.dispatchEvent(new Event('change'));
    select.dispatchEvent(new Event('blur'));
    await settle();
  }

  async function submit(): Promise<void> {
    element<HTMLFormElement>('form.settings-form').dispatchEvent(new Event('submit'));
    await settle();
  }

  it('when the page opens, then it asks for the report with the token and says it is loading', () => {
    const request = http.expectOne(REPORT_URL);

    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(text('h1')).toBe('Měsíční přehled');
    expect(text('[role="status"]')).toBe('Načítáme nastavení přehledu…');
    request.flush(reportView());
  });

  it('when the server defaults still apply, then the form shows them, the next report is announced and no report is listed', async () => {
    await respond(reportView());

    expect(element<HTMLTextAreaElement>('#report-recipients').value).toBe('info@nfnn.cz');
    expect(element<HTMLSelectElement>('#report-send-day').selectedOptions[0]?.textContent).toBe(
      '1.',
    );
    expect(
      Array.from(
        fixture.nativeElement.querySelectorAll(
          '.sections input[type="checkbox"]',
        ) as NodeListOf<HTMLInputElement>,
      ).map((box) => box.checked),
    ).toEqual([true, true, true, true]);
    expect(text('.next-report')).toContain('Příští přehled za září 2026 odejde 01. 10. 2026 ráno.');
    expect(text('.changed-at')).toBe('Zatím platí výchozí nastavení ze serveru.');
    expect(text('[aria-labelledby="report-sent-title"]')).toContain(
      'Zatím žádný přehled neodešel.',
    );

    const options = Array.from(element<HTMLSelectElement>('#report-month').options);
    expect(options).toHaveLength(24);
    expect(options[0]?.value).toBe('2026-09');
    expect(options[0]?.textContent).toBe('září 2026 (zatím neodesláno)');
    expect(options[23]?.value).toBe('2024-10');
  });

  it('when settings were changed and reports went out, then the change time, the sent months and the sent dates in the month list are shown', async () => {
    await respond(
      reportView({
        settings: {
          recipients: ['pavel@example.cz', 'jakub@example.cz'],
          sendDay: 5,
          sections: { donors: false, donations: true, unpairedPayments: false, bankImport: true },
          changedAt: '2026-10-05T07:00:00Z',
        },
        sentReports: [
          { month: '2026-09', sentAt: '2026-10-05T05:00:00Z' },
          { month: '2026-08', sentAt: '2026-09-01T05:00:00Z' },
        ],
        nextReport: { month: '2026-10', dueOn: '2026-11-05' },
      }),
    );

    expect(element<HTMLTextAreaElement>('#report-recipients').value).toBe(
      'pavel@example.cz\njakub@example.cz',
    );
    expect(element<HTMLSelectElement>('#report-send-day').selectedOptions[0]?.textContent).toBe(
      '5.',
    );
    expect(element<HTMLInputElement>('input[name="donors"]').checked).toBe(false);
    expect(element<HTMLInputElement>('input[name="donations"]').checked).toBe(true);
    expect(text('.changed-at')).toBe('Naposledy změněno 05. 10. 2026 09:00.');
    expect(text('.next-report')).toContain(
      'Příští přehled za říjen 2026 odejde 05. 11. 2026 ráno.',
    );
    expect(
      Array.from(
        fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLTableRowElement>,
      ).map((row) => (row.textContent ?? '').replace(/\s+/g, ' ').trim()),
    ).toEqual(['září 2026 05. 10. 2026 07:00', 'srpen 2026 01. 09. 2026 07:00']);
    expect(element<HTMLSelectElement>('#report-month').options[0]?.textContent).toBe(
      'září 2026 (odesláno 05. 10. 2026)',
    );
  });

  it('when the recipients, the day and the sections are changed and saved, then the settings are sent and the page confirms and reloads', async () => {
    await respond(reportView());

    await type('#report-recipients', 'pavel@example.cz\njakub@example.cz');
    await choose('#report-send-day', 4);
    element<HTMLInputElement>('input[name="donors"]').click();
    await settle();
    await submit();

    const request = http.expectOne(SETTINGS_URL);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      recipients: ['pavel@example.cz', 'jakub@example.cz'],
      sendDay: 5,
      sections: { donors: false, donations: true, unpairedPayments: true, bankImport: true },
    });
    expect(text('form.settings-form button[type="submit"]')).toBe('Ukládáme…');

    request.flush({
      recipients: ['pavel@example.cz', 'jakub@example.cz'],
      sendDay: 5,
      sections: { donors: false, donations: true, unpairedPayments: true, bankImport: true },
      changedAt: '2026-10-23T08:00:00Z',
    });
    await settle();

    expect(text('.ui-notice--status')).toBe(
      'Nastavení jsme uložili. Příští přehled odejde podle něj.',
    );
    await respond(
      reportView({
        settings: {
          recipients: ['pavel@example.cz', 'jakub@example.cz'],
          sendDay: 5,
          sections: { donors: false, donations: true, unpairedPayments: true, bankImport: true },
          changedAt: '2026-10-23T08:00:00Z',
        },
      }),
    );
    expect(text('.changed-at')).toBe('Naposledy změněno 23. 10. 2026 10:00.');
  });

  it('when an address is not an e-mail, then the field says so and nothing is sent', async () => {
    await respond(reportView());

    await type('#report-recipients', 'pavel');
    await submit();

    expect(element<HTMLTextAreaElement>('#report-recipients').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(text('.field-error')).toBe(
      'Některá z adres není platná e-mailová adresa. Pište každou na vlastní řádek.',
    );
    http.expectNone(SETTINGS_URL);
  });

  it('when the same address is listed twice or more than ten are listed, then the field explains which rule failed', async () => {
    await respond(reportView());

    await type('#report-recipients', 'pavel@example.cz\nPavel@example.cz');
    await submit();
    expect(text('.field-error')).toBe('Některá adresa je v seznamu dvakrát.');

    await type(
      '#report-recipients',
      Array.from({ length: 11 }, (_, index) => `donor${index + 1}@example.cz`).join('\n'),
    );
    await submit();
    expect(text('.field-error')).toBe('Přehled může mít nejvíc 10 příjemců.');
    http.expectNone(SETTINGS_URL);
  });

  it('when every section is unticked, then the form refuses to save without a section', async () => {
    await respond(reportView());

    fixture.nativeElement
      .querySelectorAll('.sections input[type="checkbox"]')
      .forEach((box: HTMLInputElement) => box.click());
    await settle();
    await submit();

    expect(text('.form-error')).toBe('Vyberte prosím aspoň jednu část přehledu.');
    http.expectNone(SETTINGS_URL);
  });

  it('when the server refuses the settings, then the form shows its words', async () => {
    await respond(reportView());

    await submit();
    const refusal = problem(
      400,
      'validation',
      'Neplatný požadavek',
      'Zkontrolujte prosím zadané údaje.',
    );
    http.expectOne(SETTINGS_URL).flush(refusal.body, refusal.options);
    await settle();

    expect(text('.form-error')).toBe('Neplatný požadavek. Zkontrolujte prosím zadané údaje.');
  });

  it('when a month is chosen and the sending is confirmed, then the report goes out and the page says to whom', async () => {
    await respond(
      reportView({ sentReports: [{ month: '2026-09', sentAt: '2026-10-01T05:00:00Z' }] }),
    );

    await type('#report-month', '2026-08');
    button('Poslat').click();
    await settle();

    expect(text('[role="group"][aria-label="Poslat přehled znovu?"]')).toContain(
      'Poslat přehled za srpen 2026 na info@nfnn.cz?',
    );
    expect(element<HTMLSelectElement>('#report-month').disabled).toBe(true);
    http.expectNone(SEND_URL);

    button('Ano, poslat').click();
    await settle();

    const request = http.expectOne(SEND_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ month: '2026-08' });
    request.flush({
      month: '2026-08',
      recipients: ['info@nfnn.cz'],
      sentAt: '2026-10-23T08:00:00Z',
    });
    await settle();

    expect(text('.ui-notice--status')).toBe('Přehled za srpen 2026 jsme poslali na info@nfnn.cz.');
    await respond(
      reportView({
        sentReports: [
          { month: '2026-09', sentAt: '2026-10-01T05:00:00Z' },
          { month: '2026-08', sentAt: '2026-10-23T08:00:00Z' },
        ],
      }),
    );
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('[role="group"]')).toBeNull();
  });

  it('when the sending is called off, then nothing is sent and the month can be changed again', async () => {
    await respond(reportView());

    button('Poslat').click();
    await settle();
    button('Ne').click();
    await settle();

    expect(fixture.nativeElement.querySelector('[role="group"]')).toBeNull();
    expect(element<HTMLSelectElement>('#report-month').disabled).toBe(false);
    http.expectNone(SEND_URL);
  });

  it('when the mail server refuses the report, then the alert carries the backend words', async () => {
    await respond(reportView());

    button('Poslat').click();
    await settle();
    button('Ano, poslat').click();
    await settle();
    const refusal = problem(
      502,
      'donations/report-not-delivered',
      'Přehled se nepodařilo odeslat',
      'Poštovní server e-mail odmítl. Zkontrolujte nastavení MAIL_* a log backendu.',
    );
    http.expectOne(SEND_URL).flush(refusal.body, refusal.options);
    await settle();

    expect(text('.ui-notice--alert')).toBe(
      'Přehled se nepodařilo odeslat. Poštovní server e-mail odmítl. Zkontrolujte nastavení MAIL_* a log backendu.',
    );
    expect(fixture.nativeElement.querySelector('[role="group"]')).toBeNull();
  });

  it('when the report cannot be loaded, then an alert offers a retry that asks again', async () => {
    await respond({ title: 'Server error' }, 500);

    expect(text('[role="alert"]')).toContain('Nastavení přehledu se nepodařilo načíst.');

    element<HTMLButtonElement>('.ui-load-state--error button').click();
    await respond(reportView());

    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(element<HTMLTextAreaElement>('#report-recipients').value).toBe('info@nfnn.cz');
  });

  it('when the role was taken away meanwhile, then the administrator is sent to their own overview', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(403, 'auth/forbidden', 'Nemáte oprávnění', '');

    http.expectOne(REPORT_URL).flush(refusal.body, refusal.options);
    await settle();

    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
  });

  it('when the session has ended, then the administrator is sent home to sign in and comes back after it', async () => {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'url', 'get').mockReturnValue('/sprava/prehledy');
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(401, 'auth/unauthenticated', 'Přihlaste se', '');

    http.expectOne(REPORT_URL).flush(refusal.body, refusal.options);
    http
      .expectOne('/api/donors/auth/logout')
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(store.signedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/');
    expect(TestBed.inject(LoginDialogService).isOpen()).toBe(true);

    TestBed.inject(LoginDialogService).signedIn();

    expect(navigate).toHaveBeenLastCalledWith('/sprava/prehledy');
  });
});
