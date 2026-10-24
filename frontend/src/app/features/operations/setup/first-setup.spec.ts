import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { FirstSetup } from './first-setup';
import { RESTART_POLL_MS } from './setup-api';

const STATUS_URL = '/api/operations/setup';
const UNLOCK_URL = '/api/operations/setup/unlock';
const TEST_EMAIL_URL = '/api/operations/setup/test-email';
const RESTORE_URL = '/api/operations/setup/restore';
const REQUEST_ID = '019a1b2c-0000-7000-8000-000000000001';

function problem(status: number, type: string, title: string, detail: string, extra = {}) {
  return {
    body: { type: `https://nfnn.cz/problems/${type}`, title, detail, status, ...extra },
    options: { status, statusText: 'Error' },
  };
}

describe('Given the first setup page', () => {
  let fixture: ComponentFixture<FirstSetup>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FirstSetup],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FirstSetup);
    fixture.detectChanges();
  });

  afterEach(() => {
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

  async function status(required: boolean, codeRequired: boolean): Promise<void> {
    http.expectOne(STATUS_URL).flush({ required, codeRequired });
    await settle();
  }

  async function type(selector: string, value: string): Promise<void> {
    const input = element<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await settle();
  }

  async function chooseFile(name: string): Promise<File> {
    const file = new File(['PGDMP'], name, { type: 'application/octet-stream' });
    const input = element<HTMLInputElement>('#backup-file');
    Object.defineProperty(input, 'files', {
      value: { length: 1, item: () => file },
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));
    await settle();
    return file;
  }

  async function uploadAndRestart(): Promise<void> {
    await chooseFile('nfnn-2026-10-22_0300.dump');
    button('Nahrát a obnovit').click();
    await settle();
    const request = http.expectOne(RESTORE_URL);
    vi.useFakeTimers();
    request.flush({
      requestId: REQUEST_ID,
      fileName: `${REQUEST_ID}.upload`,
      requestedAt: '2026-10-23T18:00:00Z',
    });
    await vi.advanceTimersByTimeAsync(1);
    fixture.detectChanges();
    expect(text('h1')).toBe('Obnovujeme web ze zálohy');
    await vi.advanceTimersByTimeAsync(RESTART_POLL_MS);
    http.expectOne(STATUS_URL).flush('', { status: 502, statusText: 'Bad Gateway' });
    await vi.advanceTimersByTimeAsync(RESTART_POLL_MS);
    http.expectOne(STATUS_URL).flush({ required: true, codeRequired: false, lastRestore: null });
    await vi.advanceTimersByTimeAsync(1);
  }

  async function submit(selector: string): Promise<void> {
    element<HTMLFormElement>(selector).dispatchEvent(new Event('submit'));
    await settle();
  }

  async function fillInMailSignIn(): Promise<void> {
    await type('#setup-mail-username', 'abc@smtp-brevo.com');
    await type('#setup-mail-password', 'xsmtpsib-key');
  }

  async function sendSuccessfulTestEmail(): Promise<void> {
    button('Poslat zkušební e-mail').click();
    await settle();
    http
      .expectOne(TEST_EMAIL_URL)
      .flush({ outcome: 'SENT', sent: true, recipient: 'spravce@example.cz' });
    await settle();
  }

  function fieldErrors(): (string | undefined)[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.field-error') as NodeListOf<HTMLElement>,
    ).map((error) => error.textContent?.trim());
  }

  it('when the page opens, then it says it is finding out whether the site is set up', () => {
    expect(text('[role="status"]:not(:empty)')).toBe('Zjišťujeme, jestli je web nastavený…');
    http.expectOne(STATUS_URL).flush({ required: true, codeRequired: false });
  });

  it('when the site is already set up, then the page says so and points to the administration', async () => {
    await status(false, true);

    expect(text('h1')).toBe('Web už je nastavený');
    expect(element<HTMLAnchorElement>('a.ui-button--primary').getAttribute('href')).toBe(
      '/sprava/nastaveni',
    );
  });

  it('when the backend does not answer yet, then the page says to wait and retries on request', async () => {
    http.expectOne(STATUS_URL).flush('', { status: 502, statusText: 'Bad Gateway' });
    await settle();

    expect(text('[role="alert"]:not(:empty)')).toContain('Počkejte prosím minutu');

    button('Zkusit znovu').click();
    await status(true, false);
    expect(element('#setup-public-url')).toBeTruthy();
  });

  describe('when the page is opened from outside the home network', () => {
    beforeEach(async () => {
      await status(true, true);
    });

    it('then it asks for the code from the log and tells where to find it', () => {
      expect(text('h1')).toBe('První nastavení webu');
      expect(text('.ui-panel__lead')).toContain('kontejner nfnn-backend');
      expect(element('#setup-code')).toBeTruthy();
    });

    it('then an empty code is named at the field without asking the backend', async () => {
      await submit('form');

      expect(text('.field-error')).toBe('Opište prosím kód z logu.');
    });

    it('then a wrong code is refused with a sentence that the code changes with every start', async () => {
      await type('#setup-code', 'AAAA-BBBB-CCCC');
      await submit('form');

      const request = http.expectOne(UNLOCK_URL);
      expect(request.request.body).toEqual({ code: 'AAAA-BBBB-CCCC' });
      const refused = problem(403, 'operations/setup-locked', 'Kód nesedí', '');
      request.flush(refused.body, refused.options);
      await settle();

      expect(text('[role="alert"]:not(:empty)')).toBe(
        'Kód nesedí. Opište prosím ten z posledního startu webu, kód se při každém startu mění.',
      );
    });

    it('then the right code opens the form and travels with the settings', async () => {
      await type('#setup-code', ' k7qm-2xpa-9trd ');
      await submit('form');
      http.expectOne(UNLOCK_URL).flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      await fillInMailSignIn();
      await type('#setup-admin-email', 'spravce@example.cz');
      await submit('form.setup-form');
      button('Uložit i tak').click();
      await settle();

      const request = http.expectOne(STATUS_URL);
      expect(request.request.method).toBe('POST');
      expect(request.request.body.code).toBe('k7qm-2xpa-9trd');
      request.flush({ changed: [], restarting: true });
      await settle();
    });
  });

  describe('when the page is opened directly from the home network', () => {
    beforeEach(async () => {
      await status(true, false);
    });

    it('then the form opens without a code and is filled with the usual values', () => {
      expect(element<HTMLInputElement>('#setup-public-url').value).toBe('https://nfnn.cz');
      expect(element<HTMLInputElement>('#setup-mail-host').value).toBe('smtp-relay.brevo.com');
      expect(element<HTMLInputElement>('#setup-mail-port').value).toBe('587');
      expect(element<HTMLInputElement>('#setup-mail-from').value).toBe('info@nfnn.cz');
      expect(element<HTMLInputElement>('#setup-contact-recipient').value).toBe('info@nfnn.cz');
      expect(element<HTMLInputElement>('#setup-admin-email').value).toBe('');
    });

    it('then a missing administrator, a bad address and the missing sign-in to the mail server are named at their fields', async () => {
      await type('#setup-public-url', 'nfnn.cz');
      await submit('form.setup-form');

      expect(fieldErrors()).toEqual([
        'Napište celou adresu včetně https://, například https://nfnn.cz.',
        'Vyplňte prosím e-mailovou adresu.',
        'Vyplňte prosím přihlašovací jméno ze stránky SMTP v Brevo.',
        'Vyplňte prosím heslo nebo klíč SMTP.',
      ]);
      http.expectNone(STATUS_URL);
    });

    it('then a mail server without sign-in needs no name and no password', async () => {
      element('.advanced summary').click();
      await settle();
      element<HTMLInputElement>('input[name="mailAuth"]').click();
      await settle();
      await type('#setup-admin-email', 'spravce@example.cz');
      await submit('form.setup-form');

      expect(fieldErrors()).toEqual([]);
      expect(text('.mail-unverified')).toContain('Zkušební e-mail s těmito údaji zatím neodešel.');
    });

    it('then it says up front what the operator will need and keeps the server details folded away', () => {
      expect(text('.needs')).toContain('Budete potřebovat');
      expect(text('.needs')).toContain('ověřenou doménu odesílatele');
      expect(element<HTMLDetailsElement>('details.advanced').open).toBe(false);
      expect(text('label[for="setup-fio-token"]')).toBe('Token Fio API (jen pro čtení, nepovinné)');
    });

    describe('when everything is filled in', () => {
      beforeEach(async () => {
        await fillInMailSignIn();
        await type('#setup-admin-email', 'spravce@example.cz');
      });

      it('without trying the mail server first, then saving warns before anything is sent', async () => {
        await submit('form.setup-form');

        http.expectNone(STATUS_URL);
        expect(text('[role="alert"].mail-unverified')).toBe(
          'Zkušební e-mail s těmito údaji zatím neodešel. Bez funkčních e-mailů se správce nepřihlásí. Poslat zkušební e-mail Uložit i tak',
        );
      });

      it('and the warning asks to try the server, then the test runs and the warning goes away', async () => {
        await submit('form.setup-form');

        element<HTMLButtonElement>('.mail-unverified .ui-button').click();
        await settle();
        http
          .expectOne(TEST_EMAIL_URL)
          .flush({ outcome: 'SENT', sent: true, recipient: 'spravce@example.cz' });
        await settle();

        expect(fixture.nativeElement.querySelector('.mail-unverified')).toBeNull();
        expect(text('[role="status"] .test-result')).toBe(
          'Zkušební e-mail odešel na spravce@example.cz. Podívejte se prosím do schránky, i do nevyžádané pošty. Když do pár minut nedorazí, zkontrolujte adresu odesílatele a ověření její domény v Brevo.',
        );
      });

      it('after a successful test with the same values, then saving goes straight on', async () => {
        await sendSuccessfulTestEmail();

        await submit('form.setup-form');

        http.expectOne(STATUS_URL).flush({ changed: [], restarting: true });
        await settle();
      });

      it('after a successful test and a changed password, then saving warns again', async () => {
        await sendSuccessfulTestEmail();
        await type('#setup-mail-password', 'another-key');

        await submit('form.setup-form');

        http.expectNone(STATUS_URL);
        expect(text('.mail-unverified')).toContain('neodešel');
      });

      it('after a successful test and another sender, then saving warns again', async () => {
        await sendSuccessfulTestEmail();
        await type('#setup-mail-from', 'novy@nfnn.cz');

        await submit('form.setup-form');

        http.expectNone(STATUS_URL);
        expect(text('.mail-unverified')).toContain('neodešel');
      });
    });

    it('then the test e-mail goes with what is typed to the first administrator and a refusal is explained', async () => {
      await type('#setup-admin-email', ' spravce@example.cz ');
      await type('#setup-mail-username', 'abc@smtp-brevo.com');
      await type('#setup-mail-password', 'xsmtpsib-key');
      expect(text('.test-hint')).toContain(
        'Zkušební e-mail přijde na e-mail prvního správce z kroku 2.',
      );
      button('Poslat zkušební e-mail').click();
      await settle();

      const request = http.expectOne(TEST_EMAIL_URL);
      expect(request.request.body).toEqual({
        code: null,
        host: 'smtp-relay.brevo.com',
        port: 587,
        username: 'abc@smtp-brevo.com',
        password: 'xsmtpsib-key',
        auth: true,
        startTls: true,
        sender: 'info@nfnn.cz',
        recipient: 'spravce@example.cz',
      });
      expect(button('Posíláme zkušební e-mail…').disabled).toBe(true);
      request.flush({ outcome: 'SIGN_IN_REFUSED', sent: false, recipient: 'spravce@example.cz' });
      await settle();

      expect(text('[role="alert"] .test-result')).toBe(
        'Server odmítl přihlášení. Zkontrolujte prosím přihlašovací jméno a heslo nebo klíč SMTP.',
      );
    });

    it('then a test e-mail without the first administrator is not sent and the empty field is named', async () => {
      await fillInMailSignIn();
      button('Poslat zkušební e-mail').click();
      await settle();

      http.expectNone(TEST_EMAIL_URL);
      expect(text('[role="alert"] .test-result')).toBe(
        'Než zkušební e-mail pošleme, doplňte prosím označená pole.',
      );
      expect(fieldErrors()).toEqual(['Vyplňte prosím e-mailovou adresu.']);
      expect(document.activeElement?.id).toBe('setup-admin-email');
    });

    it('then saving sends every value, waits for the restart and offers the registration', async () => {
      await fillInMailSignIn();
      await type('#setup-fio-token', ' fio-token ');
      await type('#setup-admin-email', ' spravce@example.cz ');
      await sendSuccessfulTestEmail();
      await submit('form.setup-form');

      const request = http.expectOne(STATUS_URL);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        code: null,
        settings: [
          { name: 'PUBLIC_URL', value: 'https://nfnn.cz' },
          { name: 'MAIL_HOST', value: 'smtp-relay.brevo.com' },
          { name: 'MAIL_PORT', value: '587' },
          { name: 'MAIL_USERNAME', value: 'abc@smtp-brevo.com' },
          { name: 'MAIL_PASSWORD', value: 'xsmtpsib-key' },
          { name: 'MAIL_AUTH', value: 'true' },
          { name: 'MAIL_STARTTLS', value: 'true' },
          { name: 'MAIL_FROM', value: 'info@nfnn.cz' },
          { name: 'CONTACT_RECIPIENT', value: 'info@nfnn.cz' },
          { name: 'FIO_TOKEN', value: 'fio-token' },
          { name: 'ADMIN_EMAILS', value: 'spravce@example.cz' },
        ],
      });
      vi.useFakeTimers();
      request.flush({ changed: ['PUBLIC_URL'], restarting: true });
      await vi.advanceTimersByTimeAsync(1);
      fixture.detectChanges();
      expect(text('h1')).toBe('Web se restartuje');

      await vi.advanceTimersByTimeAsync(RESTART_POLL_MS);
      http.expectOne(STATUS_URL).flush('', { status: 502, statusText: 'Bad Gateway' });
      await vi.advanceTimersByTimeAsync(RESTART_POLL_MS);
      http.expectOne(STATUS_URL).flush({ required: false, codeRequired: true });
      await vi.advanceTimersByTimeAsync(1);
      fixture.detectChanges();

      expect(text('h1')).toBe('Web je nastavený');
      expect(
        Array.from(
          fixture.nativeElement.querySelectorAll('.next-steps li') as NodeListOf<HTMLElement>,
        ).map((step) => step.textContent?.replace(/\s+/g, ' ').trim()),
      ).toEqual([
        'Zaregistrujte se s adresou spravce@example.cz.',
        'Otevřete odkaz z e-mailu, který vám přijde.',
        'V části Údaje a zabezpečení zapněte dvoufaktorové ověření.',
        'Odhlaste se a přihlaste se znovu s kódem z aplikace: nahoře se objeví Správa.',
      ]);
      button('Zaregistrovat se').click();
      const dialog = TestBed.inject(LoginDialogService);
      expect(dialog.isOpen()).toBe(true);
      expect(dialog.initialMode()).toBe('register');
      expect(dialog.initialEmail()).toBe('spravce@example.cz');
    });

    describe('when the site is restored from a backup instead', () => {
      beforeEach(async () => {
        button('Obnovit ze zálohy').click();
        await settle();
      });

      it('then the page asks for the backup file and uploads only once one is chosen', async () => {
        expect(text('h1')).toBe('Obnovit web ze zálohy');
        expect(button('Nahrát a obnovit').disabled).toBe(true);

        const file = await chooseFile('nfnn-2026-10-22_0300.dump');
        button('Nahrát a obnovit').click();
        await settle();

        const request = http.expectOne(RESTORE_URL);
        expect(request.request.method).toBe('PUT');
        expect(request.request.body).toBe(file);
        expect(request.request.headers.get('Content-Type')).toBe('application/octet-stream');
        expect(request.request.headers.has('X-Nfnn-Setup-Code')).toBe(false);
        request.event({ type: HttpEventType.UploadProgress, loaded: 42, total: 100 });
        await settle();
        expect(text('[role="status"]:not(:empty)')).toBe('Nahráváme zálohu… 42 %');
        expect(button('Nahrát a obnovit').disabled).toBe(true);
        request.flush({
          requestId: REQUEST_ID,
          fileName: `${REQUEST_ID}.upload`,
          requestedAt: '2026-10-23T18:00:00Z',
        });
        await settle();

        expect(text('h1')).toBe('Obnovujeme web ze zálohy');
      });

      it('then a file without the .dump ending is named at once and cannot be uploaded', async () => {
        await chooseFile('fotka.jpg');

        expect(text('#backup-file-error')).toBe(
          'Tohle není soubor zálohy. Vyberte prosím soubor s příponou .dump.',
        );
        expect(element('#backup-file').getAttribute('aria-describedby')).toContain(
          'backup-file-error',
        );
        expect(button('Nahrát a obnovit').disabled).toBe(true);

        await chooseFile('nfnn-2026-10-22_0300.dump');

        expect(fixture.nativeElement.querySelector('#backup-file-error')).toBeNull();
        expect(button('Nahrát a obnovit').disabled).toBe(false);
      });

      it('then a file that is not a backup is refused with the reason and can be replaced', async () => {
        await chooseFile('fotka.dump');
        button('Nahrát a obnovit').click();
        await settle();

        const refused = problem(
          400,
          'operations/not-a-backup',
          'Soubor není záloha',
          'Vyberte prosím soubor zálohy s příponou .dump.',
        );
        http.expectOne(RESTORE_URL).flush(refused.body, refused.options);
        await settle();

        expect(text('[role="alert"]:not(:empty)')).toContain(
          'Vyberte prosím soubor zálohy s příponou .dump.',
        );
        expect(button('Nahrát a obnovit').disabled).toBe(false);
      });

      it('then going back shows the form again', async () => {
        button('Zpět k nastavení').click();
        await settle();

        expect(text('h1')).toBe('První nastavení webu');
      });

      it('then a backup with its administrators ends on the sign-in that leads to the settings', async () => {
        await uploadAndRestart();
        http
          .expectOne(STATUS_URL)
          .flush({ required: false, codeRequired: true, lastRestore: null });
        await vi.advanceTimersByTimeAsync(1);
        fixture.detectChanges();

        expect(text('h1')).toBe('Web je obnovený ze zálohy');
        expect(text('[role="status"]:not(:empty)')).toContain(
          'znovu zadejte heslo pro odesílání e-mailů a token Fio',
        );
        button('Přihlásit se').click();
        const dialog = TestBed.inject(LoginDialogService);
        expect(dialog.isOpen()).toBe(true);
        expect(dialog.initialMode()).toBe('login');
      });

      it('then a backup from before the setup returns to the form with a note', async () => {
        await uploadAndRestart();
        http.expectOne(STATUS_URL).flush({
          required: true,
          codeRequired: false,
          lastRestore: {
            requestId: REQUEST_ID,
            outcome: 'OK',
            finishedAt: '2026-10-23T18:02:00Z',
            error: null,
          },
        });
        await vi.advanceTimersByTimeAsync(1);
        fixture.detectChanges();

        expect(text('h1')).toBe('První nastavení webu');
        expect(text('.restore-done')).toBe(
          'Záloha je obnovená. Pochází z doby před prvním nastavením, proto ho prosím doplňte.',
        );
      });

      it('then a failed restore names the error and offers another file', async () => {
        await uploadAndRestart();
        http.expectOne(STATUS_URL).flush({
          required: true,
          codeRequired: false,
          lastRestore: {
            requestId: REQUEST_ID,
            outcome: 'FAILED',
            finishedAt: '2026-10-23T18:02:00Z',
            error: 'pg_restore: error: unsupported version',
          },
        });
        await vi.advanceTimersByTimeAsync(1);
        fixture.detectChanges();

        expect(text('h1')).toBe('Obnovit web ze zálohy');
        expect(text('[role="alert"]:not(:empty)')).toBe(
          'Obnova se nepovedla: pg_restore: error: unsupported version. Web zůstal prázdný; zkuste prosím jiný soubor zálohy.',
        );
      });

      it('then a restore the backup container never took says so', async () => {
        await uploadAndRestart();
        http
          .expectOne(STATUS_URL)
          .flush({ required: true, codeRequired: false, lastRestore: null });
        await vi.advanceTimersByTimeAsync(1);
        fixture.detectChanges();

        expect(text('h1')).toBe('Obnovit web ze zálohy');
        expect(text('[role="alert"]:not(:empty)')).toContain(
          'Kontejner záloh si obnovu do pěti minut nevzal.',
        );
      });
    });

    it('then values the backend refuses stand at their fields and the rest is listed', async () => {
      await fillInMailSignIn();
      await type('#setup-admin-email', 'spravce@example.cz');
      await submit('form.setup-form');
      button('Uložit i tak').click();
      await settle();

      const refused = problem(
        400,
        'operations/invalid-settings',
        'Nastavení nejde uložit',
        'Opravte prosím označené hodnoty.',
        {
          errors: [
            { field: 'MAIL_PORT', code: 'invalid-port', message: 'Port je číslo od 1 do 65535.' },
            {
              field: '',
              code: 'rejected-at-startup',
              message: 'S těmito hodnotami web nenastartuje.',
            },
          ],
        },
      );
      http.expectOne(STATUS_URL).flush(refused.body, refused.options);
      await settle();

      expect(
        Array.from(
          fixture.nativeElement.querySelectorAll('.ui-field-error li') as NodeListOf<HTMLElement>,
        ).map((item) => item.textContent?.trim()),
      ).toEqual(['S těmito hodnotami web nenastartuje.']);
      expect(text('#setup-mail-port-error')).toBe('Port je číslo od 1 do 65535.');
      expect(document.activeElement).toBe(element('#setup-mail-port'));
      expect(text('h1')).toBe('První nastavení webu');
    });
  });
});
