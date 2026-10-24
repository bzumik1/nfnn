import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { RESTART_POLL_MS } from '../../operations/setup/setup-api';
import { settingsView } from '../testing/admin-fixtures';
import { AdminSettings } from './admin-settings';

const SETTINGS_URL = '/api/admin/operations/settings';
const MAIL_TEST_URL = '/api/admin/operations/settings/mail-test';
const STATUS_URL = '/api/operations/setup';
const SIGNATURE_URL = '/api/admin/donations/receipt-signature';

describe('Given an administrator on the settings page', () => {
  let fixture: ComponentFixture<AdminSettings>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminSettings],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminSettings);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.match(SIGNATURE_URL);
    http.verify();
    vi.useRealTimers();
  });

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

  function texts(selector: string): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll(selector) as NodeListOf<HTMLElement>,
    ).map((item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim());
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

  async function respond(body: object): Promise<void> {
    const request = http.expectOne(SETTINGS_URL);
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
    request.flush(body);
    await settle();
  }

  async function type(selector: string, value: string): Promise<void> {
    const input = element<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await settle();
  }

  async function submit(): Promise<void> {
    element<HTMLFormElement>('form.settings-form').dispatchEvent(new Event('submit'));
    await settle();
  }

  it('when the page opens, then it says it is loading', () => {
    expect(text('h1')).toBe('Nastavení');
    expect(text('[role="status"]:not(:empty)')).toBe('Načítáme nastavení…');
    http.expectOne(SETTINGS_URL).flush(settingsView());
  });

  describe('when the settings arrive', () => {
    beforeEach(async () => {
      await respond(settingsView());
    });

    it('then they are grouped, plain values fill the fields and secrets only say whether they are set', () => {
      expect(texts('h2')).toEqual([
        'Web',
        'E-maily',
        'Banka',
        'Potvrzení o daru',
        'Podpis na potvrzeních',
      ]);
      expect(element<HTMLInputElement>('#setting-PUBLIC_URL').value).toBe('https://nfnn.cz');
      expect(element<HTMLInputElement>('#setting-MAIL_PASSWORD').value).toBe('');
      expect(element<HTMLInputElement>('#setting-MAIL_AUTH').checked).toBe(true);
      expect(element<HTMLInputElement>('#setting-FIO_HISTORY_FROM').type).toBe('date');
      expect(texts('.secret-state')).toEqual([
        'Heslo nebo klíč SMTP: Nastaveno',
        'Token Fio API (jen pro čtení): Uložená hodnota nejde přečíst, zadejte ji prosím znovu.',
      ]);
    });

    it('then each secret field is named after its secret and its group carries the stored state', () => {
      expect(text('label[for="setting-MAIL_PASSWORD"]')).toBe('Nové heslo nebo klíč SMTP');
      expect(text('label[for="setting-FIO_TOKEN"]')).toBe('Nový token Fio API');
      const group = element('#setting-MAIL_PASSWORD').closest('[role="group"]') as HTMLElement;
      const stateId = group.getAttribute('aria-labelledby') ?? '';
      expect(text(`#${stateId}`)).toBe('Heslo nebo klíč SMTP: Nastaveno');
    });

    it('then ticking the removal of a secret says what stops working', async () => {
      element<HTMLInputElement>('#setting-MAIL_PASSWORD-remove').click();
      await settle();
      element<HTMLInputElement>('#setting-FIO_TOKEN-remove').click();
      await settle();

      expect(texts('.secret .ui-callout--danger')).toEqual([
        'Bez hesla web nepošle žádný e-mail: ani obnovu hesla, ani potvrzení registrace, ani měsíční přehled.',
        'Bez tokenu se přestanou stahovat platby z banky.',
      ]);
    });

    it('then saving without a change says so right after the button and sends nothing', async () => {
      await submit();

      expect(text('.save-row .ui-form-status')).toBe('Nic jste nezměnili.');
    });

    it('then the confirmation names every change, says what a removal stops, takes the focus and gives it back when called off', async () => {
      await type('#setting-MAIL_HOST', 'smtp.example.cz');
      element<HTMLInputElement>('#setting-MAIL_PASSWORD-remove').click();
      await settle();
      await submit();

      expect(text('.confirm-changes')).toBe(
        'Mění se: Server pro odesílání (SMTP), Heslo nebo klíč SMTP (odebrat).',
      );
      expect(texts('.confirm .ui-callout--danger')).toEqual([
        'Bez hesla web nepošle žádný e-mail: ani obnovu hesla, ani potvrzení registrace, ani měsíční přehled.',
      ]);
      expect(text('.confirm .ui-callout--warning')).toContain(
        'Spojení s poštovním serverem jste s novými údaji neověřili.',
      );
      expect(document.activeElement).toBe(button('Zrušit'));

      button('Zrušit').click();
      await settle();

      expect(document.activeElement).toBe(button('Uložit nastavení'));
    });

    it('then a connection tried with the same values leaves the confirmation without the warning', async () => {
      await type('#setting-MAIL_HOST', 'smtp.example.cz');
      button('Ověřit spojení').click();
      await settle();
      http.expectOne(MAIL_TEST_URL).flush({ ok: true });
      await settle();
      await submit();

      expect(fixture.nativeElement.querySelector('.confirm .ui-callout--warning')).toBeNull();
    });

    it('then saving asks first, sends only what changed and waits for the restart before reloading', async () => {
      await type('#setting-RECEIPT_FIRST_YEAR', '2025');
      await type('#setting-PUBLIC_URL', '');
      await type('#setting-FIO_TOKEN', ' new-token ');
      element<HTMLInputElement>('#setting-MAIL_STARTTLS').click();
      element<HTMLInputElement>('#setting-MAIL_PASSWORD-remove').click();
      await settle();
      await submit();

      expect(text('.confirm')).toContain('Uložením se web restartuje');
      button('Uložit a restartovat').click();
      await settle();

      const request = http.expectOne(SETTINGS_URL);
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({
        changes: [
          { name: 'PUBLIC_URL', value: '' },
          { name: 'MAIL_PASSWORD', value: '' },
          { name: 'MAIL_STARTTLS', value: 'false' },
          { name: 'FIO_TOKEN', value: 'new-token' },
          { name: 'RECEIPT_FIRST_YEAR', value: '2025' },
        ],
      });
      vi.useFakeTimers();
      request.flush({ changed: ['PUBLIC_URL'], restarting: true });
      await vi.advanceTimersByTimeAsync(1);
      fixture.detectChanges();
      expect(text('[role="status"]:not(:empty)')).toContain('web se restartuje');

      await vi.advanceTimersByTimeAsync(RESTART_POLL_MS);
      http.expectOne(STATUS_URL).flush('', { status: 502, statusText: 'Bad Gateway' });
      await vi.advanceTimersByTimeAsync(RESTART_POLL_MS);
      http.expectOne(STATUS_URL).flush({ required: false, codeRequired: true });
      await vi.advanceTimersByTimeAsync(1);
      http.expectOne(SETTINGS_URL).flush(settingsView());
      await vi.advanceTimersByTimeAsync(1);
      fixture.detectChanges();

      expect(text('.ui-notice--status')).toBe('Nastavení je uložené a web po restartu běží s ním.');
    });

    it('then a value the backend refuses is listed with its name and nothing restarts', async () => {
      await type('#setting-RECEIPT_FIRST_YEAR', '26');
      await submit();
      button('Uložit a restartovat').click();
      await settle();

      http.expectOne(SETTINGS_URL).flush(
        {
          type: 'https://nfnn.cz/problems/operations/invalid-settings',
          title: 'Nastavení nejde uložit',
          detail: 'Opravte prosím označené hodnoty.',
          status: 400,
          errors: [
            { field: 'RECEIPT_FIRST_YEAR', code: 'invalid-year', message: 'Rok mezi 2000 a 2100.' },
          ],
        },
        { status: 400, statusText: 'Bad Request' },
      );
      await settle();

      expect(texts('.form-error li')).toEqual(['Potvrzení na webu od roku: Rok mezi 2000 a 2100.']);
      expect(document.activeElement).toBe(button('Uložit nastavení'));
    });

    it('then the mail server is tried with the form values and without a typed password', async () => {
      await type('#setting-MAIL_PORT', '465');
      button('Ověřit spojení').click();
      await settle();

      const request = http.expectOne(MAIL_TEST_URL);
      expect(request.request.body).toEqual({
        host: 'smtp-relay.brevo.com',
        port: 465,
        username: 'abc@smtp-brevo.com',
        password: '',
        auth: true,
        startTls: true,
      });
      request.flush({ ok: true });
      await settle();

      expect(text('.test-result')).toBe('Spojení funguje, server přihlášení přijal.');
    });
  });

  it('when a stored secret cannot be read, as after a restore on a new server, then the page names it at the top', async () => {
    await respond(settingsView());

    expect(text('.ui-notice--alert')).toBe(
      'Tyto tajné údaje jsou uložené jiným klíčem, než má tento server, třeba po obnově ze zálohy na novém serveru: Token Fio API (jen pro čtení). Dokud je znovu nezadáte a neuložíte, nebudou fungovat.',
    );
  });

  it('when the server has no encryption key, then the page says secrets cannot be saved and their fields are off', async () => {
    await respond(settingsView({ secretsCanBeStored: false }));

    expect(text('.ui-notice--alert')).toContain('Tajné údaje (hesla a tokeny) teď nejde uložit');
    expect(element<HTMLInputElement>('#setting-FIO_TOKEN').disabled).toBe(true);
  });
});

describe('Given an administrator sent to the mail settings from another page', () => {
  it('when the settings arrive, then the mail card takes the focus', async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminSettings],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { fragment: 'settings-MAIL' } } },
      ],
    }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminSettings);
    fixture.detectChanges();
    http.expectOne(SETTINGS_URL).flush(settingsView());
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement?.id).toBe('settings-MAIL');
    http.match(SIGNATURE_URL);
    http.verify();
  });
});
