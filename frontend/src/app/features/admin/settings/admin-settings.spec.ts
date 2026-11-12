import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { RESTART_POLL_MS } from '../../operations/setup/setup-api';
import { SETTINGS_VERSION, settingsView } from '../testing/admin-fixtures';
import {
  draftWorkOf,
  MemoryDraftShelf,
  memoryDraftShelfProviders,
} from '../../../core/drafts/testing/memory-draft-shelf';
import { AdminSettings } from './admin-settings';
import { copyOf, openOfflineFromCopy, textOf } from '../device-copy/testing/opened-copy';

const SETTINGS_URL = '/api/admin/operations/settings';
const TEST_EMAIL_URL = '/api/admin/operations/settings/test-email';
const STATUS_URL = '/api/operations/setup';
const SIGNATORY_URL = '/api/admin/donations/receipt-signatory';
const REFRESH_URL = '/api/donors/auth/refresh';
const SIGNING_KEYS_URL = '/api/admin/donations/receipt-signing-keys';

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
    http.match(SIGNATORY_URL);
    http.match(SIGNING_KEYS_URL);
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

    it('then the everyday parts come first and the technical ones follow under a warning, opened because a secret needs entering again', () => {
      expect(texts('h2')).toEqual([
        'Potvrzení o daru',
        'Kdo potvrzení podepisuje',
        'Klíč k ověřovacím QR kódům',
        'Kontaktní formulář',
        'Odesílatel e-mailů',
        'Přihlášení',
        'Technické nastavení (pro správce serveru)',
      ]);
      expect(texts('h3')).toEqual(['Adresa webu', 'Server pro odesílání e-mailů', 'Banka']);
      expect(
        element('#nastaveni-potvrzeni')
          .closest('section')
          ?.querySelector('#setting-RECEIPT_FIRST_YEAR'),
      ).not.toBeNull();
      expect(
        element('#nastaveni-kontaktni-formular')
          .closest('section')
          ?.querySelector('#setting-CONTACT_RECIPIENT'),
      ).not.toBeNull();
      expect(
        element('#nastaveni-odesilatel').closest('section')?.querySelector('#setting-MAIL_FROM'),
      ).not.toBeNull();
      const technical = element<HTMLDetailsElement>('details#technicke-nastaveni');
      expect(technical.querySelector('#setting-PUBLIC_URL')).not.toBeNull();
      expect(technical.querySelector('#setting-MAIL_HOST')).not.toBeNull();
      expect(technical.querySelector('#setting-FIO_TOKEN')).not.toBeNull();
      expect(technical.open).toBe(true);
      expect(text('.technical-warning')).toBe(
        'Chybná hodnota tady může zastavit odesílání e-mailů nebo stahování plateb z banky. Než změny e-mailů uložíte, pošlete si zkušební e-mail.',
      );
    });

    it('then plain values fill the fields and secrets only say whether they are set', () => {
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
        'Zkušební e-mail jste s novými údaji neposlali.',
      );
      expect(document.activeElement).toBe(button('Zrušit'));

      button('Zrušit').click();
      await settle();

      expect(document.activeElement).toBe(button('Uložit nastavení'));
    });

    it('then a test e-mail sent with the same values leaves the confirmation without the warning', async () => {
      await type('#setting-MAIL_HOST', 'smtp.example.cz');
      button('Poslat zkušební e-mail na moji adresu').click();
      await settle();
      http
        .expectOne(TEST_EMAIL_URL)
        .flush({ outcome: 'SENT', sent: true, recipient: 'jana@example.cz' });
      await settle();
      await submit();

      expect(fixture.nativeElement.querySelector('.confirm .ui-callout--warning')).toBeNull();
    });

    it('then another sender without a test e-mail brings the warning into the confirmation', async () => {
      await type('#setting-MAIL_FROM', 'novy@nfnn.cz');
      await submit();

      expect(text('.confirm-changes')).toBe('Mění se: Odesílatel e-mailů.');
      expect(text('.confirm .ui-callout--warning')).toContain(
        'Zkušební e-mail jste s novými údaji neposlali.',
      );
    });

    it('then a refused test e-mail says in plain words what went wrong and the warning stays', async () => {
      await type('#setting-MAIL_FROM', 'novy@nfnn.cz');
      button('Poslat zkušební e-mail na moji adresu').click();
      await settle();
      http
        .expectOne(TEST_EMAIL_URL)
        .flush({ outcome: 'SENDER_REFUSED', sent: false, recipient: 'jana@example.cz' });
      await settle();

      expect(text('.test-row [role="alert"]')).toBe(
        'Server odmítl e-mail od adresy novy@nfnn.cz. Zkontrolujte prosím, že je adresa odesílatele i její doména v Brevo ověřená.',
      );
      await submit();
      expect(text('.confirm .ui-callout--warning')).toContain('neposlali');
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
      expect(request.request.headers.get('If-Match')).toBe(`"${SETTINGS_VERSION}"`);
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
      request.flush({ changed: ['PUBLIC_URL'], restarting: true, version: '00000000000000c2' });
      await vi.advanceTimersByTimeAsync(1);
      fixture.detectChanges();
      expect(text('[role="status"]:not(:empty)')).toContain('web se restartuje');

      await vi.advanceTimersByTimeAsync(RESTART_POLL_MS);
      http.expectOne(STATUS_URL).flush('', { status: 502, statusText: 'Bad Gateway' });
      await vi.advanceTimersByTimeAsync(RESTART_POLL_MS);
      http.expectOne(STATUS_URL).flush({ required: false, codeRequired: true });
      await vi.advanceTimersByTimeAsync(1);
      http
        .expectOne(REFRESH_URL)
        .flush(authResponse('token-2', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
      await vi.advanceTimersByTimeAsync(1);
      const reload = http.expectOne(SETTINGS_URL);
      expect(reload.request.headers.get('Authorization')).toBe('Bearer token-2');
      reload.flush(settingsView());
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

    it('then a save refused because someone saved newer settings meanwhile keeps their edits and saving their version names the newer one', async () => {
      await type('#setting-RECEIPT_FIRST_YEAR', '2025');
      await submit();
      button('Uložit a restartovat').click();
      await settle();

      http.expectOne(SETTINGS_URL).flush(
        {
          type: 'https://nfnn.cz/problems/operations/changed-meanwhile',
          title: 'Mezitím se to změnilo',
          status: 409,
          version: '00000000000000c9',
          current: {
            settings: [
              {
                name: 'MAIL_FROM',
                value: 'novy@nfnn.cz',
                sealed: false,
                updatedAt: '2026-11-12T08:05:00Z',
              },
            ],
          },
        },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(text('app-changed-meanwhile-dialog dialog')).toContain(
        'Zatímco jste měli formulář otevřený, uložil novější verzi někdo jiný (jiný správce nebo připojená aplikace) nebo vy v jiném okně.',
      );
      expect(text('app-changed-meanwhile-dialog dialog')).toContain(
        'Novější verze je z 12. 11. 2026 9:05.',
      );
      expect(element<HTMLInputElement>('#setting-RECEIPT_FIRST_YEAR').value).toBe('2025');

      button('Uložit svou verzi místo novější').click();
      await settle();
      expect(text('.confirm')).toContain('Uložením se web restartuje');
      button('Uložit a restartovat').click();
      await settle();

      const again = http.expectOne(SETTINGS_URL);
      expect(again.request.headers.get('If-Match')).toBe('"00000000000000c9"');
      expect(again.request.body).toEqual({
        changes: [{ name: 'RECEIPT_FIRST_YEAR', value: '2025' }],
      });
      again.flush({ changed: [], restarting: false, version: '00000000000000ca' });
      await settle();
    });

    it('then a save refused as changed meanwhile can be dropped for the stored settings, read again', async () => {
      await type('#setting-RECEIPT_FIRST_YEAR', '2025');
      await submit();
      button('Uložit a restartovat').click();
      await settle();
      http.expectOne(SETTINGS_URL).flush(
        {
          type: 'https://nfnn.cz/problems/operations/changed-meanwhile',
          title: 'Mezitím se to změnilo',
          status: 409,
          version: '00000000000000c9',
          current: { settings: [] },
        },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      button('Zahodit své úpravy a načíst novější verzi').click();
      await settle();
      http.expectOne(SETTINGS_URL).flush(settingsView({ version: '00000000000000c9' }));
      await settle();

      expect(element<HTMLInputElement>('#setting-RECEIPT_FIRST_YEAR').value).toBe('2026');
      expect(text('.ui-notice--status')).toBe(
        'Vaše úpravy jsme zahodili a načetli uložené nastavení.',
      );
      await type('#setting-RECEIPT_FIRST_YEAR', '2024');
      await submit();
      button('Uložit a restartovat').click();
      await settle();
      expect(http.expectOne(SETTINGS_URL).request.headers.get('If-Match')).toBe(
        '"00000000000000c9"',
      );
    });

    it('then the test e-mail goes to the administrator with the form values and without a typed password', async () => {
      expect(text('.test-hint')).toContain('jana@example.cz');
      await type('#setting-MAIL_PORT', '465');
      button('Poslat zkušební e-mail na moji adresu').click();
      await settle();

      const request = http.expectOne(TEST_EMAIL_URL);
      expect(request.request.body).toEqual({
        host: 'smtp-relay.brevo.com',
        port: 465,
        username: 'abc@smtp-brevo.com',
        password: '',
        auth: true,
        startTls: true,
        sender: 'info@nfnn.cz',
      });
      expect(button('Posíláme zkušební e-mail…').disabled).toBe(true);
      request.flush({ outcome: 'SENT', sent: true, recipient: 'jana@example.cz' });
      await settle();

      expect(text('.test-row [role="status"]')).toBe(
        'Zkušební e-mail odešel na jana@example.cz. Podívejte se prosím do schránky, i do nevyžádané pošty. Když do pár minut nedorazí, zkontrolujte adresu odesílatele a ověření její domény v Brevo.',
      );
    });
  });

  it('when every secret can be read, then the technical settings stay folded away', async () => {
    await respond(
      settingsView({
        settings: settingsView().settings.map((setting) => ({ ...setting, unreadable: false })),
      }),
    );

    expect(element<HTMLDetailsElement>('details#technicke-nastaveni').open).toBe(false);
    expect(text('details#technicke-nastaveni summary')).toBe(
      'Adresa webu, server pro odesílání e-mailů a napojení na banku',
    );
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
  it('when the settings arrive, then the technical settings open and the mail part takes the focus', async () => {
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
    http.expectOne(SETTINGS_URL).flush(
      settingsView({
        settings: settingsView().settings.map((setting) => ({ ...setting, unreadable: false })),
      }),
    );
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement?.id).toBe('nastaveni-odesilani-emailu');
    expect(
      (fixture.nativeElement.querySelector('details#technicke-nastaveni') as HTMLDetailsElement)
        .open,
    ).toBe(true);
    http.match(SIGNATORY_URL);
    http.match(SIGNING_KEYS_URL);
    http.verify();
  });
});

describe('Given an administrator sent to the receipt signing key from the overview', () => {
  it('when the settings arrive, then the signing key card of the receipt settings takes the focus', async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminSettings],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { fragment: 'klic-k-overovacim-qr' } } },
      ],
    }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminSettings);
    fixture.detectChanges();
    http.expectOne(SETTINGS_URL).flush(settingsView());
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement?.id).toBe('klic-k-overovacim-qr');
    expect(document.activeElement?.textContent?.trim()).toBe('Klíč k ověřovacím QR kódům');
    http.match(SIGNATORY_URL);
    http.match(SIGNING_KEYS_URL);
    http.verify();
  });
});

describe('Given an administrator changing the settings on a device that keeps drafts', () => {
  let shelf: MemoryDraftShelf;
  let fixture: ComponentFixture<AdminSettings>;
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

  async function type(selector: string, value: string): Promise<void> {
    const input = element<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function open(): Promise<void> {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminSettings],
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
    fixture = TestBed.createComponent(AdminSettings);
    fixture.detectChanges();
    http.expectOne(SETTINGS_URL).flush(settingsView());
    await settle();
  }

  function keptDraft(startedFrom: string): void {
    shelf.seed('administration', {
      key: 'settings',
      base: `version:${startedFrom}`,
      values: { CONTACT_RECIPIENT: 'pavel@example.cz' },
      savedAt: '2026-11-06T09:00:00.000Z',
    });
  }

  beforeEach(() => {
    shelf = new MemoryDraftShelf();
  });

  afterEach(() => {
    http.match(SIGNATORY_URL);
    http.match(SIGNING_KEYS_URL);
    http.verify();
  });

  it('when they change an address and type a new password, then only the address is kept on the device, never the password', async () => {
    await open();

    await type('#setting-CONTACT_RECIPIENT', 'pavel@example.cz');
    await type('#setting-MAIL_PASSWORD', 'Tajné heslo SMTP 2026');

    const kept = shelf.draftOf('administration', 'settings');
    expect(kept?.values).toEqual({ CONTACT_RECIPIENT: 'pavel@example.cz' });
    expect(JSON.stringify(shelf.kept)).not.toContain('Tajné heslo SMTP 2026');
    expect(Object.keys(kept?.values as object)).not.toContain('MAIL_PASSWORD');
    expect(Object.keys(kept?.values as object)).not.toContain('FIO_TOKEN');
  });

  it('when they switch a flag, then the switch is kept on the device', async () => {
    await open();

    element<HTMLInputElement>('#setting-MAIL_STARTTLS').click();
    await settle();

    expect(shelf.draftOf('administration', 'settings')?.values).toMatchObject({
      MAIL_STARTTLS: 'false',
    });
  });

  it('when the device kept a change started from the saved settings and they continue it, then the form takes it and asks to save as usual', async () => {
    keptDraft(SETTINGS_VERSION);
    await open();
    expect(element('app-draft-offer').textContent).not.toContain(
      'Uložená verze se od té doby změnila',
    );

    button('Pokračovat v rozepsaném').click();
    await settle();
    expect(element<HTMLInputElement>('#setting-CONTACT_RECIPIENT').value).toBe('pavel@example.cz');

    element<HTMLFormElement>('form.settings-form').dispatchEvent(new Event('submit'));
    await settle();
    expect(fixture.nativeElement.textContent).toContain('Mění se: ');
    expect(fixture.nativeElement.querySelector('app-changed-meanwhile-dialog')).toBeNull();
  });

  it('when the device kept a change started from settings saved differently since, then saving asks first and discarding reads them again', async () => {
    keptDraft('00000000000000c0');
    await open();
    expect(element('app-draft-offer').textContent).toContain('Uložená verze se od té doby změnila');

    button('Pokračovat v rozepsaném').click();
    await settle();
    element<HTMLFormElement>('form.settings-form').dispatchEvent(new Event('submit'));
    await settle();
    expect(element('app-changed-meanwhile-dialog dialog').textContent).toContain(
      'Od chvíle, kdy jste na tomto zařízení začali s úpravami',
    );

    button('Zahodit své úpravy a načíst novější verzi').click();
    await settle();
    http.expectOne(SETTINGS_URL).flush(settingsView());
    await settle();
    expect(shelf.draftOf('administration', 'settings')).toBeNull();
    expect(element<HTMLInputElement>('#setting-CONTACT_RECIPIENT').value).toBe('info@nfnn.cz');
  });

  it('when they save their change, then the draft leaves the device', async () => {
    await open();
    await type('#setting-CONTACT_RECIPIENT', 'pavel@example.cz');
    expect(shelf.draftOf('administration', 'settings')).not.toBeNull();

    element<HTMLFormElement>('form.settings-form').dispatchEvent(new Event('submit'));
    await settle();
    button('Uložit a restartovat').click();
    await settle();
    http
      .expectOne(SETTINGS_URL)
      .flush({ changed: ['CONTACT_RECIPIENT'], restarting: false, version: '00000000000000c2' });
    await settle();
    http.match(SETTINGS_URL).forEach((reload) => reload.flush(settingsView()));
    await settle();

    expect(shelf.draftOf('administration', 'settings')).toBeNull();
  });

  it('when they continue a kept change, then the focus moves to the page heading and the form counts as unsaved', async () => {
    keptDraft(SETTINGS_VERSION);
    await open();

    button('Pokračovat v rozepsaném').click();
    await settle();

    expect(document.activeElement).toBe(element('h1'));
    expect(element('[role="status"]:not(:empty)').textContent).toContain(
      'Pokračujete v rozepsaných úpravách',
    );
  });

  it('when the kept change is older than settings saved since, then continuing it changes only the field it holds and saving it over the newer ones sends only that field', async () => {
    keptDraft('00000000000000c0');
    await open();

    button('Pokračovat v rozepsaném').click();
    await settle();
    expect(element<HTMLInputElement>('#setting-MAIL_HOST').value).toBe('smtp-relay.brevo.com');
    element<HTMLFormElement>('form.settings-form').dispatchEvent(new Event('submit'));
    await settle();
    button('Uložit svou verzi místo novější').click();
    await settle();
    expect(element('.confirm-changes').textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Mění se: Kam chodí zprávy z kontaktního formuláře.',
    );
    button('Uložit a restartovat').click();
    await settle();

    expect(http.expectOne(SETTINGS_URL).request.body).toEqual({
      changes: [{ name: 'CONTACT_RECIPIENT', value: 'pavel@example.cz' }],
    });
  });

  it('when a kept change is offered, then the form waits for the choice and the offer says passwords are not kept', async () => {
    keptDraft(SETTINGS_VERSION);
    await open();

    expect(element<HTMLFormElement>('form.settings-form').inert).toBe(true);
    expect(element('app-draft-offer').textContent).toContain('Hesla a tokeny');

    button('Zahodit').click();
    await settle();

    expect(element<HTMLFormElement>('form.settings-form').inert).toBe(false);
    expect(document.activeElement).toBe(element('h1'));
  });

  it('when they discard the kept change, then it leaves the device', async () => {
    keptDraft(SETTINGS_VERSION);
    await open();

    button('Zahodit').click();
    await settle();

    expect(shelf.draftOf('administration', 'settings')).toBeNull();
    expect(element<HTMLInputElement>('#setting-CONTACT_RECIPIENT').value).toBe('info@nfnn.cz');
  });
});

describe('Given an administrator offline whose device keeps the administration copy', () => {
  it('when the settings open, then they come from the copy and the receipt key and signatory say they show once the connection is back', async () => {
    const { page, http, settle } = await openOfflineFromCopy(
      AdminSettings,
      copyOf({ 'operations/settings': [settingsView()] }),
    );
    http.expectOne('/api/admin/donations/receipt-signatory').error(new ProgressEvent('error'));
    http.expectOne('/api/admin/donations/receipt-signing-keys').error(new ProgressEvent('error'));
    await settle();

    expect(
      Array.from(page.querySelectorAll('input')).map((input) => (input as HTMLInputElement).value),
    ).toContain('smtp-relay.brevo.com');
    expect(textOf(page)).toContain('Klíč ukážeme, až se spojení se serverem obnoví.');
    expect(textOf(page)).toContain(
      'Kdo potvrzení podepisuje, ukážeme, až se spojení se serverem obnoví.',
    );
    expect(page.querySelector('.signing-key-error, .signatory-error')).toBeNull();
    http.verify();
  });
});
