import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Donor, Passkey } from '../../../../core/auth/donor';
import { PasskeyAuthenticator } from '../../../../core/auth/passkey-authenticator';
import {
  authResponse,
  FakePasskeyAuthenticator,
  passkeyCreationOptions,
  passkeySignInOptions,
  problem,
  SAMPLE_ASSERTION,
  SAMPLE_CHALLENGE,
  sampleDonor,
  samplePasskey,
  secondFactorEnrolment,
} from '../../../../core/auth/testing/donor-fixtures';
import { sharedCases } from '../../../../../testing/shared-cases';
import { decodePlainQr, drawnRows } from '../../../../shared/ui/qr-code/testing/plain-qr-decoder';
import { AccountCard } from './account-card';

const PASSKEYS_URL = '/api/donors/me/passkeys';
const PROFILE_URL = '/api/donors/me';
const EMAIL_CHANGE_URL = '/api/donors/me/email-change';
const IPHONE = samplePasskey();
const WINDOWS = samplePasskey({ id: '019a1b2c-3d4e-7f00-8000-000000000002', name: 'Windows' });
const PENDING = { newEmail: 'jana.nova@example.cz', expiresAt: '2026-10-19T10:00:00Z' };

function normalized(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

class CardDriver {
  constructor(
    private readonly fixture: () => ComponentFixture<AccountCard>,
    private readonly http: () => HttpTestingController,
  ) {}

  root(): HTMLElement {
    return this.fixture().nativeElement as HTMLElement;
  }

  element<T extends HTMLElement>(selector: string): T {
    return this.root().querySelector(selector) as T;
  }

  texts(selector: string): string[] {
    return Array.from(this.root().querySelectorAll(selector)).map((node) =>
      normalized(node.textContent),
    );
  }

  values(): string[] {
    return this.texts('.account-value');
  }

  actions(): string[] {
    return this.texts('.account-action');
  }

  row(label: string): HTMLElement {
    return Array.from(this.root().querySelectorAll<HTMLElement>('.account-row')).find(
      (row) => normalized(row.querySelector('dt')?.textContent) === label,
    )!;
  }

  button(text: string): HTMLButtonElement | undefined {
    return Array.from(this.root().querySelectorAll('button')).find(
      (candidate) => normalized(candidate.textContent) === text,
    );
  }

  async settle(): Promise<void> {
    this.fixture().detectChanges();
    await this.fixture().whenStable();
    this.fixture().detectChanges();
  }

  async click(selector: string): Promise<void> {
    this.element<HTMLButtonElement>(selector).click();
    await this.settle();
  }

  async clickButton(text: string): Promise<void> {
    const found = this.button(text);
    expect(found, `button "${text}"`).toBeDefined();
    found?.click();
    await this.settle();
  }

  async fillIn(selector: string, value: string): Promise<void> {
    const input = this.element<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await this.settle();
  }

  async submit(): Promise<void> {
    this.element<HTMLFormElement>('.account-form').dispatchEvent(new Event('submit'));
    await this.settle();
  }

  async showDonor(donor: Donor): Promise<void> {
    TestBed.inject(AuthStore).updateProfile({}).subscribe();
    this.http().expectOne(PROFILE_URL).flush(donor);
    await this.settle();
  }
}

describe('Given the sign-in and security card of the details page', () => {
  let fixture: ComponentFixture<AccountCard>;
  let http: HttpTestingController;
  let store: AuthStore;
  let sessionEnded: number;
  const card = new CardDriver(
    () => fixture,
    () => http,
  );

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountCard],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));
  });

  afterEach(() => http.verify());

  async function render(passkeys: Passkey[] = []): Promise<void> {
    fixture = TestBed.createComponent(AccountCard);
    sessionEnded = 0;
    fixture.componentInstance.sessionEnded.subscribe(() => sessionEnded++);
    await card.settle();
    http.expectOne(PASSKEYS_URL).flush({ items: passkeys });
    await card.settle();
  }

  describe('when it opens', () => {
    beforeEach(() => render());

    it('then one row per sign-in item shows its state and its action', () => {
      expect(card.element('h2').textContent).toContain('Přihlášení a zabezpečení');
      expect(card.texts('.account-row dt')).toEqual([
        'E-mail',
        'Heslo',
        'Dvoufaktorové ověření',
        'Přístupové klíče',
      ]);
      expect(card.values()).toEqual(['jana@example.cz', 'Nastavené', 'Vypnuté', 'Žádný']);
      expect(card.actions()).toEqual([
        'Změnit e-mail',
        'Změnit heslo',
        'Zapnout dvoufaktorové ověření',
        'Spravovat přístupové klíče',
      ]);
      expect(card.element('.account-hint')).toBeNull();
      expect(card.element('.account-pending')).toBeNull();
    });

    it('then every action is a closed disclosure of the panel under its own row', () => {
      for (const action of Array.from(card.root().querySelectorAll('.account-action'))) {
        expect(action.getAttribute('aria-expanded')).toBe('false');
        const panel = card.element(`#${action.getAttribute('aria-controls')}`);
        expect(panel.hidden).toBe(true);
        expect(panel.closest('.account-row')).toBe(action.closest('.account-row'));
      }
    });

    it('then a row action opens its form under the row and pressing it again closes the form', async () => {
      await card.clickButton('Změnit e-mail');
      const action = card.button('Změnit e-mail')!;
      expect(action.getAttribute('aria-expanded')).toBe('true');
      expect(card.element('#account-email-panel').hidden).toBe(false);
      expect(card.row('E-mail').querySelector('#account-new-email')).not.toBeNull();

      await card.clickButton('Změnit e-mail');

      expect(action.getAttribute('aria-expanded')).toBe('false');
      expect(card.element('.account-form')).toBeNull();
      expect(document.activeElement).toBe(action);
    });

    it('then opening another row closes the open form, so only one is open at a time', async () => {
      await card.clickButton('Změnit e-mail');
      await card.fillIn('#account-new-email', 'jana.nova@example.cz');

      await card.clickButton('Změnit heslo');

      expect(card.root().querySelectorAll('.account-form')).toHaveLength(1);
      expect(card.element('#account-new-email')).toBeNull();
      expect(card.row('Heslo').querySelector('#account-current-password')).not.toBeNull();
      expect(card.button('Změnit e-mail')!.getAttribute('aria-expanded')).toBe('false');
      expect(card.button('Změnit heslo')!.getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(card.element('#account-current-password'));
    });

    it('then the passkeys row opens the list of passkeys under it with the focus on that list', async () => {
      await card.clickButton('Spravovat přístupové klíče');

      const panel = card.element('#account-passkeys-panel');
      expect(panel.hidden).toBe(false);
      const region = panel.querySelector<HTMLElement>('section')!;
      expect(region.getAttribute('aria-labelledby')).toBe('account-passkeys-label');
      expect(document.activeElement).toBe(region);
      expect(panel.textContent).toContain('Přihlaste se otiskem prstu');
      expect(card.button('Spravovat přístupové klíče')!.getAttribute('aria-expanded')).toBe('true');
    });
  });

  it('when the donor has two passkeys, then the passkeys row counts them in Czech', async () => {
    await render([IPHONE, WINDOWS]);

    expect(card.values()[3]).toBe('2 klíče');
    expect(card.values()[2]).toBe('VypnutéPřihlášení přístupovým klíčem je chráněné i bez kódu.');
  });

  describe('when the donor turns the second factor on', () => {
    beforeEach(async () => {
      await render();
      await card.clickButton('Zapnout dvoufaktorové ověření');
    });

    it('then the password field under the row has the focus and the form names the authenticator apps', () => {
      expect(document.activeElement).toBe(card.element('#account-second-factor-password'));
      expect(
        card.row('Dvoufaktorové ověření').querySelector('#account-second-factor-password'),
      ).not.toBeNull();
      expect(card.element('.account-form-intro').textContent).toContain('Google Authenticator');
      http.expectNone('/api/donors/me/second-factor/setup');
    });

    it('then before continuing the form says how access comes back when the phone is lost', () => {
      expect(normalized(card.element('.account-lost-phone').textContent)).toBe(
        'Když telefon s aplikací ztratíte, přístup obnovíte platbou 1 Kč z bankovního účtu, který u nás máte ověřený aspoň týden. Dřív to nejde; do té doby nám napište a kód z aplikace vám vypneme.',
      );
      const actions = card.element('.account-form-actions');
      expect(
        card.element('.account-lost-phone').compareDocumentPosition(actions) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('and confirms the password, then the QR code, the key and the code field appear with the focus on the code', async () => {
      await card.fillIn('#account-second-factor-password', 'correct horse battery');

      await card.submit();
      const request = http.expectOne({ method: 'POST', url: '/api/donors/me/second-factor/setup' });
      expect(request.request.body).toEqual({ password: 'correct horse battery' });
      request.flush(secondFactorEnrolment());
      await card.settle();

      const qr = card.element('.account-qr svg[role="img"]');
      expect(qr.getAttribute('aria-label')).toBe('QR kód s nastavením pro ověřovací aplikaci');
      expect(qr.querySelector('.qr-plain')).not.toBeNull();
      expect(qr.querySelector('.qr-star')).toBeNull();
      expect(card.element('.account-secret-value').textContent?.trim()).toBe(
        'GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ',
      );
      expect(card.element('app-copy-button button').textContent).toContain('klíč');
      expect(card.element('#account-second-factor-code').getAttribute('autocomplete')).toBe(
        'one-time-code',
      );
      expect(document.activeElement).toBe(card.element('#account-second-factor-code'));
      expect(card.element<HTMLAnchorElement>('.account-otpauth').getAttribute('href')).toBe(
        secondFactorEnrolment()['otpauthUri'],
      );
      expect(card.element('.account-otpauth').textContent?.trim()).toBe(
        'Přidat do ověřovací aplikace v tomto telefonu',
      );
    });

    it("and confirms the password, then the QR code is the browser's own encoding of the otpauth URI, not the matrix the server sent beside it", async () => {
      const authenticatorCase = sharedCases('qr/totp.json').find(
        (sharedCase) => sharedCase.name === 'an address with a dot',
      )!;
      await card.fillIn('#account-second-factor-password', 'correct horse battery');

      await card.submit();
      http
        .expectOne('/api/donors/me/second-factor/setup')
        .flush({ ...secondFactorEnrolment(), otpauthUri: authenticatorCase.input.uri });
      await card.settle();

      const qr = card.element('.account-qr svg[role="img"]') as unknown as SVGSVGElement;
      expect(drawnRows(qr)).toEqual(authenticatorCase.expected.matrix);
      expect(decodePlainQr(qr)?.data).toBe(authenticatorCase.input.uri);
    });

    it('and confirms the password but the browser cannot encode the otpauth URI, then the key stays and an alert says to type it into the app', async () => {
      await card.fillIn('#account-second-factor-password', 'correct horse battery');

      await card.submit();
      http
        .expectOne('/api/donors/me/second-factor/setup')
        .flush({ ...secondFactorEnrolment(), otpauthUri: 'otpauth://totp/Nová naděje:jana' });
      await card.settle();

      expect(card.element('.account-qr')).toBeNull();
      expect(normalized(card.element('.account-enrolment [role="alert"]').textContent)).toBe(
        'QR kód se nepodařilo vykreslit. Opište prosím klíč níže do ověřovací aplikace.',
      );
      expect(card.element('.account-secret-value').textContent?.trim()).toBe(
        'GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ',
      );
      expect(card.element('#account-second-factor-code')).not.toBeNull();
    });

    it('and the password is wrong, then the password form stays and shows the reason', async () => {
      await card.fillIn('#account-second-factor-password', 'wrong horse battery');

      await card.submit();
      http
        .expectOne('/api/donors/me/second-factor/setup')
        .flush(problem('donors/wrong-password', 'Nesprávné současné heslo', ''), {
          status: 400,
          statusText: 'Bad Request',
        });
      await card.settle();

      expect(card.element('#account-second-factor-password')).not.toBeNull();
      expect(card.element('.account-form .ui-field-error').textContent).toContain(
        'Nesprávné současné heslo',
      );
    });

    describe('and has the key in the app', () => {
      beforeEach(async () => {
        await card.fillIn('#account-second-factor-password', 'correct horse battery');
        await card.submit();
        http.expectOne('/api/donors/me/second-factor/setup').flush(secondFactorEnrolment());
        await card.settle();
      });

      it('and sends the code the app shows, then the new session is adopted and the row says the factor is on', async () => {
        await card.fillIn('#account-second-factor-code', '287082');

        await card.submit();
        const request = http.expectOne({
          method: 'POST',
          url: '/api/donors/me/second-factor/confirm',
        });
        expect(request.request.body).toEqual({ code: '287082' });
        request.flush(
          authResponse(
            'token-2',
            sampleDonor({ secondFactor: { enabled: true, neededForAdministration: false } }),
          ),
        );
        await card.settle();

        expect(card.element('.account-form')).toBeNull();
        expect(card.element('.account-status').textContent).toContain('Kód z aplikace je zapnutý.');
        expect(card.values()).toEqual([
          'jana@example.cz',
          'Nastavené',
          'Zapnuté, kód z ověřovací aplikace',
          'Žádný',
        ]);
        expect(normalized(document.activeElement?.textContent)).toBe(
          'Vypnout dvoufaktorové ověření',
        );
        store.updateProfile({}).subscribe();
        expect(http.expectOne(PROFILE_URL).request.headers.get('Authorization')).toBe(
          'Bearer token-2',
        );
      });

      it('and sends a wrong code, then the QR step stays and shows the reason', async () => {
        await card.fillIn('#account-second-factor-code', '000000');

        await card.submit();
        http
          .expectOne('/api/donors/me/second-factor/confirm')
          .flush(
            problem(
              'donors/second-factor-code-rejected',
              'Nesprávný kód',
              'Zadejte prosím aktuální kód z ověřovací aplikace; každý kód platí jen jednou.',
            ),
            { status: 400, statusText: 'Bad Request' },
          );
        await card.settle();

        expect(card.element('.account-qr')).not.toBeNull();
        expect(card.element('.account-form .ui-field-error').textContent).toContain(
          'Nesprávný kód.',
        );
      });

      it('and sends a wrong code and then edits it, then the reason from the server goes away', async () => {
        await card.fillIn('#account-second-factor-code', '000000');
        await card.submit();
        http
          .expectOne('/api/donors/me/second-factor/confirm')
          .flush(problem('donors/second-factor-code-rejected', 'Nesprávný kód', ''), {
            status: 400,
            statusText: 'Bad Request',
          });
        await card.settle();

        await card.fillIn('#account-second-factor-code', '2870');

        expect(card.element('.account-form p.ui-field-error[role="alert"]')).toBeNull();
      });

      it('and sends a wrong code and then an incomplete one, then only the field says what is wrong', async () => {
        await card.fillIn('#account-second-factor-code', '000000');
        await card.submit();
        http
          .expectOne('/api/donors/me/second-factor/confirm')
          .flush(problem('donors/second-factor-code-rejected', 'Nesprávný kód', ''), {
            status: 400,
            statusText: 'Bad Request',
          });
        await card.settle();

        await card.fillIn('#account-second-factor-code', '12345');
        await card.submit();

        http.expectNone('/api/donors/me/second-factor/confirm');
        expect(card.element('.account-form p.ui-field-error[role="alert"]')).toBeNull();
        expect(card.element('#account-second-factor-code-error').textContent).toContain(
          'Kód má přesně šest číslic.',
        );
      });

      it('and sends five digits, then nothing goes out and the field says the code has six', async () => {
        await card.fillIn('#account-second-factor-code', '12345');

        await card.submit();

        http.expectNone('/api/donors/me/second-factor/confirm');
        expect(card.element('#account-second-factor-code-error').textContent).toContain(
          'Kód má přesně šest číslic.',
        );
      });

      it('and cancels, then the QR code is gone and the focus returns to the row action', async () => {
        await card.click('.account-cancel');

        expect(card.element('.account-form')).toBeNull();
        expect(card.element('.account-qr')).toBeNull();
        expect(normalized(document.activeElement?.textContent)).toBe(
          'Zapnout dvoufaktorové ověření',
        );
      });
    });
  });

  describe('when an administrator without the second factor opens the card', () => {
    beforeEach(async () => {
      await render();
      await card.showDonor(
        sampleDonor({
          roles: ['DONOR'],
          secondFactor: { enabled: false, neededForAdministration: true },
        }),
      );
    });

    it('then the second factor row says the administration waits for it', () => {
      expect(
        card.row('Dvoufaktorové ověření').querySelector('.account-hint')?.textContent,
      ).toContain(
        'Správa se vám otevře, až se přihlásíte přístupovým klíčem nebo zapnete kód z aplikace a',
      );
    });
  });

  describe('when a donor with the second factor on turns it off', () => {
    beforeEach(async () => {
      await render();
      await card.showDonor(
        sampleDonor({ secondFactor: { enabled: true, neededForAdministration: false } }),
      );
      await card.clickButton('Vypnout dvoufaktorové ověření');
    });

    it('then the password field has the focus and the form says the password will do', () => {
      expect(document.activeElement).toBe(card.element('#account-second-factor-off-password'));
      expect(card.element('.account-form-intro').textContent).toContain(
        'K přihlášení pak bude stačit heslo.',
      );
    });

    it('and sends the password and the code, then the new session is adopted and the row says the factor is off', async () => {
      await card.fillIn('#account-second-factor-off-password', 'correct horse battery');
      await card.fillIn('#account-second-factor-off-code', '287082');

      await card.submit();
      const request = http.expectOne({
        method: 'POST',
        url: '/api/donors/me/second-factor/disable',
      });
      expect(request.request.body).toEqual({ password: 'correct horse battery', code: '287082' });
      request.flush(authResponse('token-3'));
      await card.settle();

      expect(card.element('.account-form')).toBeNull();
      expect(card.element('.account-status').textContent).toContain('Kód z aplikace jsme vypnuli.');
      expect(card.actions()).toEqual([
        'Změnit e-mail',
        'Změnit heslo',
        'Zapnout dvoufaktorové ověření',
        'Spravovat přístupové klíče',
      ]);
      expect(normalized(document.activeElement?.textContent)).toBe('Zapnout dvoufaktorové ověření');
    });

    it('and the code was already used, then the form stays and shows the reason', async () => {
      await card.fillIn('#account-second-factor-off-password', 'correct horse battery');
      await card.fillIn('#account-second-factor-off-code', '287082');

      await card.submit();
      http
        .expectOne('/api/donors/me/second-factor/disable')
        .flush(problem('donors/second-factor-code-rejected', 'Nesprávný kód', ''), {
          status: 400,
          statusText: 'Bad Request',
        });
      await card.settle();

      expect(card.element('#account-second-factor-off-code')).not.toBeNull();
      expect(card.element('.account-form .ui-field-error').textContent).toContain('Nesprávný kód');
    });
  });

  describe('when the donor changes the e-mail', () => {
    beforeEach(async () => {
      await render();
      await card.clickButton('Změnit e-mail');
    });

    it('then the new address field has the focus and the form explains the link', () => {
      expect(document.activeElement).toBe(card.element('#account-new-email'));
      expect(card.element('.account-form-intro').textContent).toContain(
        'Na novou adresu pošleme odkaz.',
      );
    });

    it('and sends a valid address and the password, then the request goes out, the card says where the link went and the row shows the pending address', async () => {
      await card.fillIn('#account-new-email', ' Jana.Nova@example.cz ');
      await card.fillIn('#account-email-password', 'correct horse battery');

      await card.submit();
      const request = http.expectOne({ method: 'POST', url: EMAIL_CHANGE_URL });
      expect(request.request.body).toEqual({
        newEmail: 'Jana.Nova@example.cz',
        password: 'correct horse battery',
      });
      request.flush(null, { status: 202, statusText: 'Accepted' });
      http
        .expectOne({ method: 'GET', url: PROFILE_URL })
        .flush(sampleDonor({ pendingEmailChange: PENDING }));
      await card.settle();

      expect(card.element('.account-form')).toBeNull();
      expect(card.element('.account-status').textContent).toContain(
        'Odkaz jsme poslali na Jana.Nova@example.cz.',
      );
      expect(card.element('.account-email').textContent?.trim()).toBe('jana@example.cz');
      expect(normalized(card.element('.account-pending-address').textContent)).toBe(
        'Čeká na potvrzení: jana.nova@example.cz',
      );
      expect(normalized(document.activeElement?.textContent)).toBe('Změnit e-mail');
    });

    it('and leaves the address malformed, then nothing is sent and the field says so', async () => {
      await card.fillIn('#account-new-email', 'not-an-email');
      await card.fillIn('#account-email-password', 'correct horse battery');

      await card.submit();

      http.expectNone(EMAIL_CHANGE_URL);
      expect(card.element('#account-new-email-error').textContent).toContain(
        'Zadejte prosím platnou e-mailovou adresu.',
      );
      expect(document.activeElement).toBe(card.element('#account-new-email'));
    });

    it('and the password is wrong, then the form stays and shows the reason', async () => {
      await card.fillIn('#account-new-email', 'jana.nova@example.cz');
      await card.fillIn('#account-email-password', 'wrong horse battery');

      await card.submit();
      http
        .expectOne(EMAIL_CHANGE_URL)
        .flush(
          problem(
            'donors/wrong-password',
            'Nesprávné současné heslo',
            'Zadejte prosím heslo, kterým se teď přihlašujete.',
          ),
          { status: 400, statusText: 'Bad Request' },
        );
      await card.settle();

      expect(card.element('.account-form .ui-field-error').textContent).toContain(
        'Nesprávné současné heslo. Zadejte prosím heslo, kterým se teď přihlašujete.',
      );
      expect(card.element<HTMLButtonElement>('.account-save').disabled).toBe(false);
    });

    it('and cancels, then nothing is sent and the focus returns to the row action', async () => {
      await card.fillIn('#account-new-email', 'jana.nova@example.cz');

      await card.click('.account-cancel');

      http.expectNone(EMAIL_CHANGE_URL);
      expect(card.element('.account-form')).toBeNull();
      expect(normalized(document.activeElement?.textContent)).toBe('Změnit e-mail');
    });

    it('and the session has ended, then the details page is told to send the donor to sign in', async () => {
      await card.fillIn('#account-new-email', 'jana.nova@example.cz');
      await card.fillIn('#account-email-password', 'correct horse battery');

      await card.submit();
      http.expectOne(EMAIL_CHANGE_URL).flush(problem('auth/unauthenticated', 'Nejste přihlášeni'), {
        status: 401,
        statusText: 'Unauthorized',
      });
      await card.settle();

      expect(sessionEnded).toBe(1);
    });
  });

  describe('when an e-mail change waits for confirmation', () => {
    beforeEach(async () => {
      await render();
      await card.showDonor(sampleDonor({ pendingEmailChange: PENDING }));
    });

    it('then the e-mail row shows the current address, the pending one with the expiry of its link and both actions', () => {
      const row = card.row('E-mail');
      expect(normalized(row.querySelector('.account-email')?.textContent)).toBe('jana@example.cz');
      expect(normalized(row.querySelector('.account-pending-address')?.textContent)).toBe(
        'Čeká na potvrzení: jana.nova@example.cz',
      );
      expect(normalized(row.querySelector('.account-pending .account-row-note')?.textContent)).toBe(
        'Potvrzovací odkaz platí do 19. 10. 2026 12:00.',
      );
      expect(card.button('Poslat znovu potvrzovací odkaz')).toBeDefined();
      expect(card.button('Zrušit změnu e-mailu')).toBeDefined();
      expect(card.button('Změnit e-mail')).toBeDefined();
    });

    it('and the donor sends the link again, then the button waits, the request goes out and the card says a new link is on its way', async () => {
      await card.clickButton('Poslat znovu potvrzovací odkaz');

      expect(normalized(card.element('.account-resend').textContent)).toBe('Posíláme…');
      expect(card.element<HTMLButtonElement>('.account-resend').disabled).toBe(true);
      expect(card.element<HTMLButtonElement>('.account-cancel-change').disabled).toBe(true);
      const request = http.expectOne({ method: 'POST', url: `${EMAIL_CHANGE_URL}/resend` });
      request.flush(null, { status: 202, statusText: 'Accepted' });
      http
        .expectOne({ method: 'GET', url: PROFILE_URL })
        .flush(
          sampleDonor({ pendingEmailChange: { ...PENDING, expiresAt: '2026-10-19T11:00:00Z' } }),
        );
      await card.settle();

      expect(card.element('.account-status').textContent).toContain(
        'Nový potvrzovací odkaz je na cestě. Předchozí odkaz už neplatí.',
      );
      expect(card.element('.account-pending').textContent).toContain('19. 10. 2026 13:00');
      expect(card.element<HTMLButtonElement>('.account-resend').disabled).toBe(false);
    });

    it('and the server refuses to send it again, then the row shows the reason and nothing else changes', async () => {
      await card.clickButton('Poslat znovu potvrzovací odkaz');
      http
        .expectOne(`${EMAIL_CHANGE_URL}/resend`)
        .flush(problem('donors/rate-limited', 'Příliš mnoho požadavků', 'Zkuste to za hodinu.'), {
          status: 429,
          statusText: 'Too Many Requests',
        });
      await card.settle();

      expect(card.row('E-mail').querySelector('[role="alert"]')?.textContent).toContain(
        'Příliš mnoho požadavků',
      );
      expect(card.element('.account-pending-address')).not.toBeNull();
      expect(card.texts('.account-status span')).toEqual([]);
    });

    it('and the donor cancels the change, then the request goes out, the pending address goes and the focus moves to the change action', async () => {
      await card.clickButton('Zrušit změnu e-mailu');

      expect(normalized(card.element('.account-cancel-change').textContent)).toBe('Rušíme…');
      const request = http.expectOne({ method: 'DELETE', url: EMAIL_CHANGE_URL });
      request.flush(null, { status: 204, statusText: 'No Content' });
      http.expectOne({ method: 'GET', url: PROFILE_URL }).flush(sampleDonor());
      await card.settle();

      expect(card.element('.account-pending')).toBeNull();
      expect(card.element('.account-status').textContent).toContain('Změnu e-mailu jsme zrušili.');
      expect(normalized(document.activeElement?.textContent)).toBe('Změnit e-mail');
    });

    it('and the session has ended while cancelling, then the details page is told to send the donor to sign in', async () => {
      await card.clickButton('Zrušit změnu e-mailu');
      http.expectOne(EMAIL_CHANGE_URL).flush(problem('auth/unauthenticated', 'Nejste přihlášeni'), {
        status: 401,
        statusText: 'Unauthorized',
      });
      await card.settle();

      expect(sessionEnded).toBe(1);
    });
  });

  describe('when the donor has a passkey and removes the password', () => {
    beforeEach(async () => {
      await render([IPHONE]);
      await card.clickButton('Odebrat heslo');
    });

    it('then the form opens under the password row and the password confirms it, the new session is adopted and the row offers to set one again', async () => {
      expect(card.row('Heslo').querySelector('#account-remove-password')).not.toBeNull();
      expect(card.button('Odebrat heslo')!.getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(card.element('#account-remove-password'));
      await card.fillIn('#account-remove-password', 'correct horse battery');

      await card.submit();
      const request = http.expectOne({ method: 'POST', url: '/api/donors/me/password/remove' });
      expect(request.request.body).toEqual({ password: 'correct horse battery' });
      request.flush(authResponse('token-2', sampleDonor({ hasPassword: false })));
      await card.settle();

      expect(card.element('.account-status').textContent).toContain('Heslo jsme odebrali.');
      expect(card.values()).toEqual([
        'jana@example.cz',
        'Bez hesla, jen přístupové klíče',
        'VypnutéPřihlášení přístupovým klíčem je chráněné i bez kódu.',
        '1 klíč',
      ]);
      expect(card.actions()).toEqual([
        'Změnit e-mail',
        'Nastavit heslo',
        'Zapnout dvoufaktorové ověření',
        'Spravovat přístupové klíče',
      ]);
    });
  });

  it('when the donor has no passkey, then the password cannot be removed', async () => {
    await render();

    expect(card.actions()).not.toContain('Odebrat heslo');
  });

  describe('when the donor changes the password', () => {
    beforeEach(async () => {
      await render();
      await card.clickButton('Změnit heslo');
    });

    it('then the current password field has the focus and the new one carries the hint', () => {
      expect(document.activeElement).toBe(card.element('#account-current-password'));
      expect(card.element('#account-new-password-hint').textContent).toContain('Alespoň 12 znaků.');
    });

    it('and the new passwords differ, then nothing is sent and the form says so', async () => {
      await card.fillIn('#account-current-password', 'correct horse battery');
      await card.fillIn('#account-new-password', 'a brand new passphrase');
      await card.fillIn('#account-new-password-confirm', 'a brand new passphrasX');

      await card.submit();

      http.expectNone('/api/donors/me/password');
      expect(card.element('.account-form .ui-field-error').textContent).toContain(
        'Nová hesla se neshodují.',
      );
    });

    it('and the new password is short, then nothing is sent and the field says so', async () => {
      await card.fillIn('#account-current-password', 'correct horse battery');
      await card.fillIn('#account-new-password', 'short');
      await card.fillIn('#account-new-password-confirm', 'short');

      await card.submit();

      http.expectNone('/api/donors/me/password');
      expect(card.element('#account-new-password-error').textContent).toContain(
        'Heslo musí mít alespoň 12 znaků.',
      );
    });

    it('and sends matching passwords, then the new session is adopted and the card says the others ended', async () => {
      await card.fillIn('#account-current-password', 'correct horse battery');
      await card.fillIn('#account-new-password', 'a brand new passphrase');
      await card.fillIn('#account-new-password-confirm', 'a brand new passphrase');

      await card.submit();
      const request = http.expectOne({ method: 'PUT', url: '/api/donors/me/password' });
      expect(request.request.body).toEqual({
        currentPassword: 'correct horse battery',
        newPassword: 'a brand new passphrase',
      });
      request.flush(authResponse('token-2'));
      await card.settle();

      expect(card.element('.account-form')).toBeNull();
      expect(card.element('.account-status').textContent).toContain(
        'Heslo jsme změnili. Ostatní přihlášení jsme ukončili, tohle zůstává.',
      );
      expect(normalized(document.activeElement?.textContent)).toBe('Změnit heslo');
      store.updateProfile({}).subscribe();
      expect(http.expectOne(PROFILE_URL).request.headers.get('Authorization')).toBe(
        'Bearer token-2',
      );
    });

    it('and the current password is wrong, then the form stays and shows the reason', async () => {
      await card.fillIn('#account-current-password', 'wrong horse battery');
      await card.fillIn('#account-new-password', 'a brand new passphrase');
      await card.fillIn('#account-new-password-confirm', 'a brand new passphrase');

      await card.submit();
      http
        .expectOne('/api/donors/me/password')
        .flush(problem('donors/wrong-password', 'Nesprávné současné heslo', ''), {
          status: 400,
          statusText: 'Bad Request',
        });
      await card.settle();

      expect(card.element('.account-form .ui-field-error').textContent).toContain(
        'Nesprávné současné heslo',
      );
    });
  });
});

describe('Given the sign-in and security card of a donor without a password', () => {
  let fixture: ComponentFixture<AccountCard>;
  let http: HttpTestingController;
  let passkeys: FakePasskeyAuthenticator;
  const card = new CardDriver(
    () => fixture,
    () => http,
  );

  beforeEach(async () => {
    passkeys = new FakePasskeyAuthenticator();
    await TestBed.configureTestingModule({
      imports: [AccountCard],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: PasskeyAuthenticator, useValue: passkeys },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).signInWithPasskey().subscribe();
    http.expectOne('/api/donors/auth/passkey/options').flush(passkeySignInOptions());
    const signIn = await vi.waitFor(() => http.expectOne('/api/donors/auth/passkey'));
    signIn.flush(authResponse('token-1', sampleDonor({ hasPassword: false })));
    passkeys.requested.length = 0;
  });

  afterEach(() => http.verify());

  async function render(items: Passkey[] = [IPHONE]): Promise<void> {
    fixture = TestBed.createComponent(AccountCard);
    await card.settle();
    http.expectOne(PASSKEYS_URL).flush({ items });
    await card.settle();
  }

  it('when it opens, then it says the account has no password and offers to set one, not to remove it', async () => {
    await render();

    expect(card.values()).toEqual([
      'jana@example.cz',
      'Bez hesla, jen přístupové klíče',
      'VypnutéPřihlášení přístupovým klíčem je chráněné i bez kódu.',
      '1 klíč',
    ]);
    expect(card.actions()).toEqual([
      'Změnit e-mail',
      'Nastavit heslo',
      'Zapnout dvoufaktorové ověření',
      'Spravovat přístupové klíče',
    ]);
  });

  describe('when the donor has no passkey either', () => {
    beforeEach(() => render([]));

    it('then the card offers no change that a passkey must confirm and asks for a passkey first', () => {
      expect(card.actions()).toEqual(['Spravovat přístupové klíče']);
      expect(card.values()).toEqual(['jana@example.cz', 'Bez hesla', 'Vypnuté', 'Žádný']);
      expect(card.element('.account-no-method').textContent).toContain(
        'Nejdřív si vytvořte přístupový klíč',
      );
    });

    it('and the donor presses the button, then the passkeys row opens with the form for a new key', async () => {
      await card.clickButton('Vytvořit přístupový klíč');

      expect(card.element('#account-passkeys-panel').hidden).toBe(false);
      expect(card.element('.account-no-method')).toBeNull();
      expect(document.activeElement).toBe(card.element('#passkey-name'));
    });

    it('and the first passkey arrives, then the changes are offered again', async () => {
      await card.clickButton('Vytvořit přístupový klíč');
      await card.fillIn('#passkey-name', 'iPhone');
      card.element<HTMLFormElement>('.passkeys-form').dispatchEvent(new Event('submit'));
      await card.settle();
      http.expectOne('/api/donors/me/passkeys/options').flush(passkeyCreationOptions());
      await vi.waitFor(() => expect(passkeys.created).toHaveLength(1));
      await card.settle();
      http.expectOne(PASSKEYS_URL).flush(samplePasskey());
      await card.settle();

      expect(card.values()[3]).toBe('1 klíč');
      expect(card.actions()).toEqual([
        'Změnit e-mail',
        'Nastavit heslo',
        'Zapnout dvoufaktorové ověření',
        'Spravovat přístupové klíče',
      ]);
    });
  });

  it('when the donor turns the code off, then the form says what changes for an account without a password', async () => {
    await render();
    await card.showDonor(
      sampleDonor({
        hasPassword: false,
        secondFactor: { enabled: true, neededForAdministration: false },
      }),
    );

    await card.clickButton('Vypnout dvoufaktorové ověření');

    expect(card.element('.account-form-intro').textContent).toContain(
      'Při obnově přístupu odkazem z e-mailu pak kód z aplikace chtít nebudeme.',
    );
    expect(card.element('.account-form').textContent).not.toContain('bude stačit heslo');
  });

  it('when the e-mail changes, then a passkey confirms it instead of the password', async () => {
    await render();
    await card.clickButton('Změnit e-mail');
    expect(card.element('#account-email-password')).toBeNull();
    expect(card.element('.account-form').textContent).toContain(
      'jedním z vašich přístupových klíčů',
    );
    await card.fillIn('#account-new-email', 'jana.nova@example.cz');

    await card.submit();
    http.expectOne('/api/donors/auth/passkey/options').flush(passkeySignInOptions());
    const request = await vi.waitFor(() => http.expectOne(EMAIL_CHANGE_URL));
    expect(request.request.body).toEqual({
      newEmail: 'jana.nova@example.cz',
      passkey: { challenge: SAMPLE_CHALLENGE, credential: SAMPLE_ASSERTION },
    });
    request.flush(null, { status: 202, statusText: 'Accepted' });
    http
      .expectOne({ method: 'GET', url: PROFILE_URL })
      .flush(sampleDonor({ hasPassword: false, pendingEmailChange: PENDING }));
    await card.settle();

    expect(card.element('.account-status').textContent).toContain('jana.nova@example.cz');
  });

  it('when a password is set, then only the new one is asked for and a passkey confirms it', async () => {
    await render();
    await card.clickButton('Nastavit heslo');
    expect(card.element('.account-form h3').textContent).toContain('Nastavení hesla');
    expect(card.element('#account-current-password')).toBeNull();
    expect(document.activeElement).toBe(card.element('#account-new-password'));
    await card.fillIn('#account-new-password', 'a brand new passphrase');
    await card.fillIn('#account-new-password-confirm', 'a brand new passphrase');

    await card.submit();
    http.expectOne('/api/donors/auth/passkey/options').flush(passkeySignInOptions());
    const request = await vi.waitFor(() => http.expectOne('/api/donors/me/password'));
    expect(request.request.body).toEqual({
      passkey: { challenge: SAMPLE_CHALLENGE, credential: SAMPLE_ASSERTION },
      newPassword: 'a brand new passphrase',
    });
    request.flush(authResponse('token-2'));
    await card.settle();

    expect(card.element('.account-status').textContent).toContain('Heslo je nastavené.');
    expect(card.actions()).toContain('Odebrat heslo');
  });

  it('when the device does not confirm the passkey, then the form stays and says what to do', async () => {
    await render();
    passkeys.failure = 'cancelled';
    await card.clickButton('Zapnout dvoufaktorové ověření');
    expect(card.element('.account-form-intro').textContent).toContain('obnovovat přístup');

    await card.submit();
    http.expectOne('/api/donors/auth/passkey/options').flush(passkeySignInOptions());
    await vi.waitFor(() => expect(card.element('.account-form .ui-field-error')).not.toBeNull());
    await card.settle();

    expect(card.element('.account-form .ui-field-error').textContent).toContain(
      'Změnu se nepodařilo potvrdit přístupovým klíčem',
    );
    http.expectNone('/api/donors/me/second-factor/setup');
  });
});

describe('Given the sign-in and security card of a donor without a password in a browser without passkeys', () => {
  let fixture: ComponentFixture<AccountCard>;
  let http: HttpTestingController;

  beforeEach(async () => {
    const passkeys = new FakePasskeyAuthenticator();
    passkeys.available = false;
    await TestBed.configureTestingModule({
      imports: [AccountCard],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: PasskeyAuthenticator, useValue: passkeys },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ hasPassword: false })));
    fixture = TestBed.createComponent(AccountCard);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne(PASSKEYS_URL).flush({ items: [] });
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('when it opens, then it asks for a passkey first without a button that could not create one', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.account-no-method')?.textContent).toContain(
      'Nejdřív si vytvořte přístupový klíč',
    );
    expect(root.querySelector('.account-create-passkey')).toBeNull();
    expect(
      Array.from(root.querySelectorAll('.account-action')).map((node) =>
        normalized(node.textContent),
      ),
    ).toEqual(['Spravovat přístupové klíče']);
  });
});
