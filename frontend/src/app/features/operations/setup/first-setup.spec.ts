import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { FirstSetup } from './first-setup';
import { RESTART_POLL_MS } from './setup-api';

const STATUS_URL = '/api/operations/setup';
const UNLOCK_URL = '/api/operations/setup/unlock';
const MAIL_TEST_URL = '/api/operations/setup/mail-test';
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
    Object.defineProperty(input, 'files', { value: { length: 1, item: () => file } });
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

  it('when the page opens, then it says it is finding out whether the site is set up', () => {
    expect(text('[role="status"]')).toBe('Zjišťujeme, jestli je web nastavený…');
    http.expectOne(STATUS_URL).flush({ required: true, codeRequired: false });
  });

  it('when the site is already set up, then the page says so and points to the administration', async () => {
    await status(false, true);

    expect(text('h1')).toBe('Web už je nastavený');
    expect(element<HTMLAnchorElement>('a.form-submit').getAttribute('href')).toBe(
      '/sprava/nastaveni',
    );
  });

  it('when the backend does not answer yet, then the page says to wait and retries on request', async () => {
    http.expectOne(STATUS_URL).flush('', { status: 502, statusText: 'Bad Gateway' });
    await settle();

    expect(text('[role="alert"]')).toContain('Počkejte prosím minutu');

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
      expect(text('.lead')).toContain('kontejner nfnn-backend');
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

      expect(text('[role="alert"]')).toBe(
        'Kód nesedí. Opište prosím ten z posledního startu webu, kód se při každém startu mění.',
      );
    });

    it('then the right code opens the form and travels with the settings', async () => {
      await type('#setup-code', ' k7qm-2xpa-9trd ');
      await submit('form');
      http.expectOne(UNLOCK_URL).flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      await type('#setup-admin-email', 'spravce@example.cz');
      await submit('form.setup-form');

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

    it('then a missing administrator and a bad address are named at their fields', async () => {
      await type('#setup-public-url', 'nfnn.cz');
      await submit('form.setup-form');

      const errors = Array.from(
        fixture.nativeElement.querySelectorAll('.field-error') as NodeListOf<HTMLElement>,
      ).map((error) => error.textContent?.trim());
      expect(errors).toEqual([
        'Napište celou adresu včetně https://, například https://nfnn.cz.',
        'Vyplňte prosím e-mailovou adresu.',
      ]);
    });

    it('then the mail server is tried with what is typed and the answer is shown', async () => {
      await type('#setup-mail-username', 'abc@smtp-brevo.com');
      await type('#setup-mail-password', 'xsmtpsib-key');
      button('Ověřit spojení').click();
      await settle();

      const request = http.expectOne(MAIL_TEST_URL);
      expect(request.request.body).toEqual({
        code: null,
        host: 'smtp-relay.brevo.com',
        port: 587,
        username: 'abc@smtp-brevo.com',
        password: 'xsmtpsib-key',
        auth: true,
        startTls: true,
      });
      expect(button('Zkoušíme se přihlásit…').disabled).toBe(true);
      request.flush({ ok: false });
      await settle();

      expect(text('.test-result')).toBe(
        'Ke serveru se nepodařilo přihlásit. Zkontrolujte prosím server, port, jméno a heslo.',
      );
    });

    it('then saving sends every value, waits for the restart and offers the registration', async () => {
      await type('#setup-mail-password', 'xsmtpsib-key');
      await type('#setup-fio-token', ' fio-token ');
      await type('#setup-admin-email', 'spravce@example.cz');
      await submit('form.setup-form');

      const request = http.expectOne(STATUS_URL);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        code: null,
        settings: [
          { name: 'PUBLIC_URL', value: 'https://nfnn.cz' },
          { name: 'MAIL_HOST', value: 'smtp-relay.brevo.com' },
          { name: 'MAIL_PORT', value: '587' },
          { name: 'MAIL_USERNAME', value: '' },
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
      button('Zaregistrovat se').click();
      const dialog = TestBed.inject(LoginDialogService);
      expect(dialog.isOpen()).toBe(true);
      expect(dialog.initialMode()).toBe('register');
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
        expect(text('[role="status"]')).toBe('Nahráváme zálohu… 42 %');
        expect(button('Nahrát a obnovit').disabled).toBe(true);
        request.flush({
          requestId: REQUEST_ID,
          fileName: `${REQUEST_ID}.upload`,
          requestedAt: '2026-10-23T18:00:00Z',
        });
        await settle();

        expect(text('h1')).toBe('Obnovujeme web ze zálohy');
      });

      it('then a file that is not a backup is refused with the reason and can be replaced', async () => {
        await chooseFile('fotka.jpg');
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

        expect(text('[role="alert"]')).toContain('Vyberte prosím soubor zálohy s příponou .dump.');
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
        expect(text('[role="status"]')).toContain(
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
        expect(text('[role="alert"]')).toBe(
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
        expect(text('[role="alert"]')).toContain('Kontejner záloh si obnovu do pěti minut nevzal.');
      });
    });

    it('then values the backend refuses are listed with their names', async () => {
      await type('#setup-admin-email', 'spravce@example.cz');
      await submit('form.setup-form');

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
          fixture.nativeElement.querySelectorAll('.form-error li') as NodeListOf<HTMLElement>,
        ).map((item) => item.textContent?.trim()),
      ).toEqual(['Port: Port je číslo od 1 do 65535.', 'S těmito hodnotami web nenastartuje.']);
      expect(text('h1')).toBe('První nastavení webu');
    });
  });
});
