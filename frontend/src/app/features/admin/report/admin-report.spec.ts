import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DirtyForms } from '../../../core/updates/dirty-forms';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { reportView } from '../testing/admin-fixtures';
import {
  draftWorkOf,
  MemoryDraftShelf,
  memoryDraftShelfProviders,
} from '../../../core/drafts/testing/memory-draft-shelf';
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

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  function today(isoInstant: string): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(isoInstant));
  }

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
    expect(text('h1')).toBe('Měsíční e-mail');
    expect(text('[role="status"]:not(:empty)')).toBe('Načítáme nastavení přehledu…');
    request.flush(reportView());
  });

  it('when the server defaults still apply, then the form shows them, the next report is announced and no report is listed', async () => {
    today('2026-10-01T04:00:00Z');
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
    expect(element<HTMLSelectElement>('#report-send-hour').selectedOptions[0]?.textContent).toBe(
      '7:00',
    );
    expect(text('.next-report')).toBe('Příští přehled za září 2026 odejde 1. 10. 2026 v 7:00.');
    expect(text('.changed-at')).toBe('Nastavení jste zatím neměnili.');
    expect(text('[aria-labelledby="report-sent-title"]')).toContain(
      'Zatím žádný přehled neodešel.',
    );

    const options = Array.from(element<HTMLSelectElement>('#report-month').options);
    expect(options).toHaveLength(24);
    expect(options[0]?.value).toBe('2026-09');
    expect(options[0]?.textContent).toBe('září 2026 (zatím neodesláno)');
    expect(options[23]?.value).toBe('2024-10');
  });

  it('when the report of the ended month is past its sending time and has not gone out, then the line says so and when the web tries again', async () => {
    today('2026-10-30T14:52:00Z');
    await respond(reportView());

    expect(text('.next-report')).toBe(
      'Přehled za září 2026 měl odejít 1. 10. 2026 v 7:00, ale zatím neodešel. Web ho zkusí poslat znovu v příští celou hodinu; poslat ho můžete i hned níže.',
    );
  });

  it('when the sending day has come but not yet the hour, then the line still announces the report for that hour', async () => {
    today('2026-10-05T15:30:00Z');
    await respond(
      reportView({
        settings: { ...reportView().settings, sendDay: 5, sendHour: 18 },
        nextReport: { month: '2026-09', dueOn: '2026-10-05' },
      }),
    );

    expect(text('.next-report')).toBe('Příští přehled za září 2026 odejde 5. 10. 2026 v 18:00.');
  });

  it('when settings were changed and reports went out, then the change time, the sent months and the sent dates in the month list are shown', async () => {
    await respond(
      reportView({
        settings: {
          recipients: ['pavel@example.cz', 'jakub@example.cz'],
          sendDay: 5,
          sendHour: 9,
          sections: { donors: false, donations: true, unpairedPayments: false, bankImport: true },
          changedAt: '2026-10-05T07:00:00Z',
          version: '5e8a1d0c47b2f963',
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
    expect(element<HTMLSelectElement>('#report-send-hour').selectedOptions[0]?.textContent).toBe(
      '9:00',
    );
    expect(element<HTMLInputElement>('input[name="donors"]').checked).toBe(false);
    expect(element<HTMLInputElement>('input[name="donations"]').checked).toBe(true);
    expect(text('.changed-at')).toBe('Naposledy změněno 5. 10. 2026 9:00.');
    expect(text('.next-report')).toContain(
      'Příští přehled za říjen 2026 odejde 5. 11. 2026 v 9:00.',
    );
    expect(
      Array.from(
        fixture.nativeElement.querySelectorAll(
          '.sent-reports a.ui-list__row',
        ) as NodeListOf<HTMLAnchorElement>,
      ).map((row) => ({
        month: row.querySelector('.ui-list__title')?.textContent?.trim(),
        sentAt: row.querySelector('.ui-list__meta')?.textContent?.trim(),
        href: row.getAttribute('href'),
      })),
    ).toEqual([
      { month: 'září 2026', sentAt: 'Odesláno 5. 10. 2026 7:00', href: '/sprava/prehledy/2026-09' },
      { month: 'srpen 2026', sentAt: 'Odesláno 1. 9. 2026 7:00', href: '/sprava/prehledy/2026-08' },
    ]);
    expect(element<HTMLSelectElement>('#report-month').options[0]?.textContent).toBe(
      'září 2026 (odesláno 5. 10. 2026)',
    );
  });

  it('when the recipients, the day, the hour and the sections are changed and saved, then the settings are sent and the page confirms and reloads', async () => {
    await respond(reportView());

    await type('#report-recipients', 'pavel@example.cz\njakub@example.cz');
    await choose('#report-send-day', 4);
    await choose('#report-send-hour', 18);
    element<HTMLInputElement>('input[name="donors"]').click();
    await settle();
    await submit();

    const request = http.expectOne(SETTINGS_URL);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      recipients: ['pavel@example.cz', 'jakub@example.cz'],
      sendDay: 5,
      sendHour: 18,
      sections: { donors: false, donations: true, unpairedPayments: true, bankImport: true },
    });
    expect(text('form.settings-form button[type="submit"]')).toBe('Ukládáme…');

    request.flush({
      recipients: ['pavel@example.cz', 'jakub@example.cz'],
      sendDay: 5,
      sendHour: 18,
      sections: { donors: false, donations: true, unpairedPayments: true, bankImport: true },
      changedAt: '2026-10-23T08:00:00Z',
    });
    await settle();

    expect(text('form.settings-form button[type="submit"] + .ui-form-status')).toBe(
      'Nastavení jsme uložili. Příští přehled odejde podle něj.',
    );
    await respond(
      reportView({
        settings: {
          recipients: ['pavel@example.cz', 'jakub@example.cz'],
          sendDay: 5,
          sendHour: 18,
          sections: { donors: false, donations: true, unpairedPayments: true, bankImport: true },
          changedAt: '2026-10-23T08:00:00Z',
          version: 'b7c3e9f2056d1a48',
        },
      }),
    );
    expect(text('.changed-at')).toBe('Naposledy změněno 23. 10. 2026 10:00.');
  });

  it('when an address is not an e-mail, then the field says so and nothing is sent', async () => {
    await respond(reportView());

    await type('#report-recipients', 'info@nfnn.cz\npavel');
    await submit();

    expect(element<HTMLTextAreaElement>('#report-recipients').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(text('.field-error')).toBe(
      'Adresa „pavel“ není platná e-mailová adresa. Pište každou adresu na vlastní řádek.',
    );
    http.expectNone(SETTINGS_URL);
  });

  it('when the same address is listed twice or more than ten are listed, then the field explains which rule failed', async () => {
    await respond(reportView());

    await type('#report-recipients', 'pavel@example.cz\nPavel@example.cz');
    await submit();
    expect(text('.field-error')).toBe('Adresa „Pavel@example.cz“ je v seznamu dvakrát.');

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

  describe('when someone else changed the settings while they were editing them', () => {
    const current = '9e4b2d7c1a0f6358';

    beforeEach(async () => {
      await respond(reportView());
      await type('#report-recipients', 'pavel@example.cz');
      await submit();
      const request = http.expectOne(SETTINGS_URL);
      expect(request.request.headers.get('If-Match')).toBe(`"${reportView().settings.version}"`);
      const refusal = problem(
        409,
        'donations/changed-meanwhile',
        'Mezitím se to změnilo',
        'Nastavení mezitím změnil někdo jiný.',
      );
      request.flush(
        {
          ...refusal.body,
          version: current,
          current: { recipients: ['eva@example.cz'], changedAt: '2026-11-05T15:21:00Z' },
        },
        refusal.options,
      );
      await settle();
    });

    function sheet(): HTMLDialogElement {
      return element<HTMLDialogElement>('app-changed-meanwhile-dialog dialog');
    }

    it('then the sheet says the edits stay in the form and when the other version was saved', () => {
      expect(sheet().textContent).toContain('zůstávají ve formuláři');
      expect(sheet().textContent).toContain('Novější verze je z 5. 11. 2026 16:21.');
      expect(element<HTMLTextAreaElement>('#report-recipients').value).toBe('pavel@example.cz');
    });

    it('and they keep their version, then it is sent with the version in the refusal and the button says it is saving', async () => {
      button('Uložit svou verzi místo novější').click();
      await settle();

      const request = http.expectOne(SETTINGS_URL);
      expect(request.request.headers.get('If-Match')).toBe(`"${current}"`);
      expect(request.request.body.recipients).toEqual(['pavel@example.cz']);
      expect(button('Ukládáme…').disabled).toBe(true);
      request.flush({});
      await settle();
      await respond(reportView());

      expect(fixture.nativeElement.querySelector('app-changed-meanwhile-dialog')).toBeNull();
      expect(TestBed.inject(DirtyForms).any()).toBe(false);
    });

    it('and they discard theirs, then the settings are read again, the form is clean and the line says so', async () => {
      button('Zahodit své úpravy a načíst novější verzi').click();
      await settle();
      await respond(
        reportView({ settings: { ...reportView().settings, recipients: ['eva@example.cz'] } }),
      );

      expect(fixture.nativeElement.querySelector('app-changed-meanwhile-dialog')).toBeNull();
      expect(element<HTMLTextAreaElement>('#report-recipients').value).toBe('eva@example.cz');
      expect(text('form.settings-form button[type="submit"] + .ui-form-status')).toBe(
        'Načetli jsme nastavení, které uložil někdo jiný.',
      );
      expect(TestBed.inject(DirtyForms).any()).toBe(false);
    });
  });

  it('when the page is ready, then the send card names the saved recipients and why the running month is not offered', async () => {
    await respond(
      reportView({
        settings: { ...reportView().settings, recipients: ['info@nfnn.cz', 'pavel@example.cz'] },
        lastEndedMonth: '2026-09',
      }),
    );

    expect(text('.send-card .send-recipients')).toBe(
      'Přehled dostanou: info@nfnn.cz, pavel@example.cz. To jsou příjemci uložení v nastavení výše.',
    );
    expect(text('.send-card .send-intro')).toBe(
      'Přehled za vybraný měsíc odejde hned, i když už jednou odešel. Poslat jde jen měsíc, který už skončil: přehled za říjen 2026 půjde poslat od 1. 11. 2026.',
    );
    expect(element<HTMLSelectElement>('#report-month').options[0]?.textContent).toBe(
      'září 2026 (zatím neodesláno)',
    );
  });

  it('when a month is chosen and the sending is confirmed, then the report goes out and the page says to whom', async () => {
    await respond(
      reportView({ sentReports: [{ month: '2026-09', sentAt: '2026-10-01T05:00:00Z' }] }),
    );

    await type('#report-month', '2026-08');
    button('Poslat přehled').click();
    await settle();

    expect(text('[role="group"][aria-label="Poslat přehled?"]')).toContain(
      'Poslat přehled za srpen 2026 na info@nfnn.cz?',
    );
    expect(element<HTMLSelectElement>('#report-month').disabled).toBe(true);
    expect(document.activeElement).toBe(button('Zrušit'));
    http.expectNone(SEND_URL);

    button('Poslat přehled').click();
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

    expect(text('.send-card [role="status"]:not(:empty)')).toBe(
      'Přehled za srpen 2026 jsme poslali na info@nfnn.cz.',
    );
    expect(document.activeElement).toBe(button('Poslat přehled'));
    await respond(
      reportView({
        sentReports: [
          { month: '2026-09', sentAt: '2026-10-01T05:00:00Z' },
          { month: '2026-08', sentAt: '2026-10-23T08:00:00Z' },
        ],
      }),
    );
    expect(fixture.nativeElement.querySelectorAll('.sent-reports a.ui-list__row')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('[role="group"]')).toBeNull();
  });

  it('when the sending is called off, then nothing is sent and the month can be changed again', async () => {
    await respond(reportView());

    button('Poslat přehled').click();
    await settle();
    button('Zrušit').click();
    await settle();

    expect(fixture.nativeElement.querySelector('[role="group"]')).toBeNull();
    expect(document.activeElement).toBe(button('Poslat přehled'));
    expect(element<HTMLSelectElement>('#report-month').disabled).toBe(false);
    http.expectNone(SEND_URL);
  });

  it('when the mail server refuses the report, then the alert carries the backend words, leads to the mail settings and the focus returns to the button', async () => {
    await respond(reportView());

    button('Poslat přehled').click();
    await settle();
    button('Poslat přehled').click();
    await settle();
    const refusal = problem(
      502,
      'donations/report-not-delivered',
      'Přehled se nepodařilo odeslat',
      'Poštovní server e-mail odmítl. Zkontrolujte nastavení MAIL_* a log backendu.',
    );
    http.expectOne(SEND_URL).flush(refusal.body, refusal.options);
    await settle();

    expect(text('.send-card .ui-notice--alert')).toBe(
      'Přehled se nepodařilo odeslat. Poštovní server e-mail odmítl. Zkontrolujte nastavení MAIL_* a log backendu.',
    );
    expect(fixture.nativeElement.querySelector('[role="group"]')).toBeNull();
    expect(document.activeElement).toBe(button('Poslat přehled'));
    const link = element<HTMLAnchorElement>('.mail-settings-link');
    expect(link.textContent?.trim()).toBe('Otevřít nastavení e-mailů');
    expect(link.getAttribute('href')).toBe('/sprava/nastaveni#settings-MAIL');
  });

  it('when the report cannot be loaded, then an alert offers a retry that asks again', async () => {
    await respond({ title: 'Server error' }, 500);

    expect(text('[role="alert"]:not(:empty)')).toContain(
      'Nastavení přehledu se nepodařilo načíst.',
    );

    element<HTMLButtonElement>('.ui-load-state--error button').click();
    await respond(reportView());

    expect(fixture.nativeElement.querySelector('[role="alert"]:not(:empty)')).toBeNull();
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

describe('Given an administrator changing the monthly report on a device that keeps drafts', () => {
  const version = reportView().settings.version;
  let shelf: MemoryDraftShelf;
  let fixture: ComponentFixture<AdminReport>;
  let http: HttpTestingController;

  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await draftWorkOf(fixture.componentInstance);
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  function element<T extends HTMLElement>(selector: string): T {
    const found = fixture.nativeElement.querySelector(selector) as T | null;
    if (found === null) {
      throw new Error(`No element matches ${selector}`);
    }
    return found;
  }

  function button(name: string): HTMLButtonElement {
    const found = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === name);
    if (found === undefined) {
      throw new Error(`No button ${name}`);
    }
    return found;
  }

  async function open(): Promise<void> {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminReport],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        ...memoryDraftShelfProviders(shelf),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminReport);
    fixture.detectChanges();
    http.expectOne(REPORT_URL).flush(reportView());
    await settle();
  }

  async function submit(): Promise<void> {
    element<HTMLFormElement>('form.settings-form').dispatchEvent(new Event('submit'));
    await settle();
  }

  function keptDraft(base: string): void {
    shelf.seed('administration', {
      key: 'report-settings',
      base,
      values: {
        recipients: 'info@nfnn.cz\npavel@example.cz',
        sendDay: 3,
        sendHour: 8,
        sections: { donors: true, donations: true, unpairedPayments: false, bankImport: true },
      },
      savedAt: '2026-11-06T09:00:00.000Z',
    });
  }

  beforeEach(() => {
    shelf = new MemoryDraftShelf();
  });

  afterEach(() => http.verify());

  it('when they add a recipient and save, then the settings are kept on the device until the save', async () => {
    await open();
    const recipients = element<HTMLTextAreaElement>('#report-recipients');
    recipients.value = 'info@nfnn.cz\npavel@example.cz';
    recipients.dispatchEvent(new Event('input'));
    await settle();

    expect(shelf.draftOf('administration', 'report-settings')).toMatchObject({
      base: `version:${version}`,
      values: { recipients: 'info@nfnn.cz\npavel@example.cz', sendDay: 1, sendHour: 7 },
    });

    await submit();
    http.expectOne(SETTINGS_URL).flush({});
    await settle();
    http.expectOne(REPORT_URL).flush(reportView());
    await settle();
    expect(shelf.draftOf('administration', 'report-settings')).toBeNull();
  });

  it('when the device kept settings of the version they open and they continue them, then the form takes them and saves under that version', async () => {
    keptDraft(`version:${version}`);
    await open();
    expect(element('app-draft-offer').textContent).toContain('Máte tu rozepsané úpravy');

    button('Pokračovat v rozepsaném').click();
    await settle();
    expect(element<HTMLTextAreaElement>('#report-recipients').value).toBe(
      'info@nfnn.cz\npavel@example.cz',
    );

    await submit();
    const save = http.expectOne(SETTINGS_URL);
    expect(save.request.headers.get('If-Match')).toBe(`"${version}"`);
    expect(save.request.body).toMatchObject({ sendDay: 3, sendHour: 8 });
    save.flush({});
    await settle();
    http.expectOne(REPORT_URL).flush(reportView());
    await settle();
  });

  it('when the device kept settings of an older version and they continue them, then the save names that version and the refusal says the draft was overtaken', async () => {
    keptDraft('version:0000000000000001');
    await open();
    expect(element('app-draft-offer').textContent).toContain('Uložená verze se od té doby změnila');

    button('Pokračovat v rozepsaném').click();
    await settle();
    await submit();
    const save = http.expectOne(SETTINGS_URL);
    expect(save.request.headers.get('If-Match')).toBe('"0000000000000001"');
    save.flush(
      {
        type: 'https://nfnn.cz/problems/donations/changed-meanwhile',
        title: 'Mezitím se to změnilo',
        status: 409,
        version,
        current: { updatedAt: '2026-11-05T08:00:00Z' },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(element('app-changed-meanwhile-dialog dialog').textContent).toContain(
      'Od chvíle, kdy jste na tomto zařízení začali s úpravami',
    );

    button('Zahodit své úpravy a načíst novější verzi').click();
    await settle();
    http.expectOne(REPORT_URL).flush(reportView());
    await settle();
    expect(shelf.draftOf('administration', 'report-settings')).toBeNull();
    expect(element<HTMLTextAreaElement>('#report-recipients').value).toBe('info@nfnn.cz');
  });

  it('when they discard the kept settings, then they leave the device', async () => {
    keptDraft(`version:${version}`);
    await open();

    button('Zahodit').click();
    await settle();

    expect(shelf.draftOf('administration', 'report-settings')).toBeNull();
    expect(element<HTMLTextAreaElement>('#report-recipients').value).toBe('info@nfnn.cz');
  });
});
