import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { PasskeyAuthenticator } from '../../../../core/auth/passkey-authenticator';
import {
  authResponse,
  FakePasskeyAuthenticator,
  passkeyCreationOptions,
  passkeySignInOptions,
  problem,
  SAMPLE_ASSERTION,
  SAMPLE_CHALLENGE,
  SAMPLE_REGISTRATION,
  sampleDonor,
  samplePasskey,
} from '../../../../core/auth/testing/donor-fixtures';
import { PasskeysCard } from './passkeys-card';

const PASSKEYS_URL = '/api/donors/me/passkeys';
const OPTIONS_URL = '/api/donors/me/passkeys/options';
const IPHONE = samplePasskey({ lastUsedAt: '2026-10-22T09:00:00Z' });
const WINDOWS = samplePasskey({
  id: '019a1b2c-3d4e-7f00-8000-000000000002',
  name: 'Windows',
  createdAt: '2026-10-20T08:00:00Z',
  lastUsedAt: null,
});

describe('Given the passkeys card in the overview', () => {
  let fixture: ComponentFixture<PasskeysCard>;
  let http: HttpTestingController;
  let passkeys: FakePasskeyAuthenticator;
  let sessionEnded: number;

  beforeEach(async () => {
    passkeys = new FakePasskeyAuthenticator();
    await TestBed.configureTestingModule({
      imports: [PasskeysCard],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: PasskeyAuthenticator, useValue: passkeys },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1'));
  });

  afterEach(() => http.verify());

  async function render(items = [IPHONE, WINDOWS]): Promise<void> {
    fixture = TestBed.createComponent(PasskeysCard);
    sessionEnded = 0;
    fixture.componentInstance.sessionEnded.subscribe(() => sessionEnded++);
    await settle();
    http.expectOne(PASSKEYS_URL).flush({ items });
    await settle();
  }

  const root = () => fixture.nativeElement as HTMLElement;

  function element<T extends HTMLElement>(selector: string): T {
    return root().querySelector(selector) as T;
  }

  function texts(selector: string): string[] {
    return Array.from(root().querySelectorAll(selector)).map(
      (node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function clickButton(text: string): Promise<void> {
    const button = Array.from(root().querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes(text),
    );
    expect(button, `button "${text}"`).toBeDefined();
    button?.click();
    await settle();
  }

  async function fillIn(selector: string, value: string): Promise<void> {
    const input = element<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function submit(): Promise<void> {
    element<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
    await settle();
  }

  it('when it opens, then it explains passkeys and lists the donor passkeys with their dates', async () => {
    await render();

    expect(element('h2').textContent).toContain('Přístupové klíče');
    expect(element('.passkeys-intro').textContent).toContain('dvoufaktorové ověření');
    expect(texts('.passkey-name')).toEqual(['iPhone', 'Windows']);
    expect(texts('.passkey-dates')[0]).toContain('přidáno 17. 10. 2026');
    expect(texts('.passkey-dates')[0]).toContain('naposledy použito 22. 10. 2026');
    expect(texts('.passkey-dates')[1]).toContain('zatím nepoužito');
  });

  it('when the donor has no passkey, then the card says so and offers to add one', async () => {
    await render([]);

    expect(element('.passkeys-empty').textContent).toContain('Zatím nemáte žádný přístupový klíč');
    expect(texts('button')).toContain('Přidat přístupový klíč');
  });

  it('when the list cannot be loaded, then an alert offers to load it again', async () => {
    fixture = TestBed.createComponent(PasskeysCard);
    await settle();
    http
      .expectOne(PASSKEYS_URL)
      .flush(problem('internal', 'Chyba serveru', 'Zkuste to prosím později.'), {
        status: 500,
        statusText: 'Server Error',
      });
    await settle();

    expect(element('[role="alert"]').textContent).toContain('Chyba serveru');
    await clickButton('Načíst znovu');
    http.expectOne(PASSKEYS_URL).flush({ items: [IPHONE] });
    await settle();
    expect(texts('.passkey-name')).toEqual(['iPhone']);
  });

  describe('when the donor adds a passkey', () => {
    beforeEach(async () => {
      await render([IPHONE]);
      await clickButton('Přidat přístupový klíč');
    });

    it('then the password goes first, the device creates the key and the new key is listed', async () => {
      await fillIn('#passkey-name', 'MacBook');
      await fillIn('#passkey-password', 'correct horse battery');
      await submit();

      const options = http.expectOne(OPTIONS_URL);
      expect(options.request.body).toEqual({ password: 'correct horse battery' });
      options.flush(passkeyCreationOptions());
      await vi.waitFor(() => expect(passkeys.created).toHaveLength(1));
      await settle();
      const added = http.expectOne(PASSKEYS_URL);
      expect(added.request.method).toBe('POST');
      expect(added.request.body).toEqual({
        challenge: SAMPLE_CHALLENGE,
        name: 'MacBook',
        credential: SAMPLE_REGISTRATION,
      });
      added.flush(samplePasskey({ id: 'new', name: 'MacBook', lastUsedAt: null }));
      await settle();

      expect(texts('.passkey-name')).toEqual(['iPhone', 'MacBook']);
      expect(element('[role="status"]').textContent).toContain(
        'Přístupový klíč MacBook je přidaný',
      );
      expect(element('form')).toBeNull();
    });

    it('then the name and the password are required', async () => {
      await fillIn('#passkey-name', '');
      await submit();

      http.expectNone(OPTIONS_URL);
      expect(element('#passkey-name-error').textContent).toContain('Pojmenujte prosím klíč');
      expect(element('#passkey-password-error').textContent).toContain('Zadejte prosím své heslo');
    });

    it('and the password is wrong, then the reason from the server is shown at the form', async () => {
      await fillIn('#passkey-name', 'MacBook');
      await fillIn('#passkey-password', 'wrong horse battery');
      await submit();

      http
        .expectOne(OPTIONS_URL)
        .flush(problem('donors/wrong-password', 'Nesprávné heslo', 'Zkuste to prosím znovu.'), {
          status: 400,
          statusText: 'Bad Request',
        });
      await settle();

      expect(element('.ui-field-error').textContent).toContain('Nesprávné heslo');
      expect(passkeys.created).toHaveLength(0);
    });

    it('and dismisses the prompt of the device, then the card says nothing was created', async () => {
      passkeys.failure = 'cancelled';
      await fillIn('#passkey-name', 'MacBook');
      await fillIn('#passkey-password', 'correct horse battery');
      await submit();
      http.expectOne(OPTIONS_URL).flush(passkeyCreationOptions());
      await vi.waitFor(() => expect(element('.ui-field-error')).not.toBeNull());
      await settle();

      expect(element('.ui-field-error').textContent).toContain('Klíč se nevytvořil');
      expect(element<HTMLButtonElement>('.passkeys-save').disabled).toBe(false);
    });

    it('and the device already holds a key of the account, then the card says so', async () => {
      passkeys.failure = 'already-registered';
      await fillIn('#passkey-name', 'MacBook');
      await fillIn('#passkey-password', 'correct horse battery');
      await submit();
      http.expectOne(OPTIONS_URL).flush(passkeyCreationOptions());
      await vi.waitFor(() => expect(element('.ui-field-error')).not.toBeNull());
      await settle();

      expect(element('.ui-field-error').textContent).toContain(
        'už přístupový klíč k vašemu účtu má',
      );
    });

    it('and cancels, then the form closes without a request', async () => {
      await clickButton('Zrušit');

      expect(element('form')).toBeNull();
      expect(texts('button')).toContain('Přidat přístupový klíč');
    });
  });

  describe('when the donor removes a passkey', () => {
    beforeEach(() => render());

    it('then the removal asks first and the confirmed key disappears', async () => {
      await clickButton('Odebrat');
      expect(element('.passkey-confirm').textContent).toContain('Odebrat klíč iPhone?');

      await clickButton('Ano, odebrat');
      const removal = http.expectOne(`${PASSKEYS_URL}/${IPHONE.id}`);
      expect(removal.request.method).toBe('DELETE');
      removal.flush(null);
      await settle();

      expect(texts('.passkey-name')).toEqual(['Windows']);
      expect(element('[role="status"]').textContent).toContain(
        'Přístupový klíč iPhone je odebraný',
      );
    });

    it('and keeps it after all, then nothing is sent', async () => {
      await clickButton('Odebrat');
      await clickButton('Ponechat');

      expect(element('.passkey-confirm')).toBeNull();
      expect(texts('.passkey-name')).toEqual(['iPhone', 'Windows']);
    });
  });

  describe('when the donor renames a passkey', () => {
    beforeEach(() => render());

    it('then the field holds the current name and the saved name replaces it', async () => {
      await clickButton('Přejmenovat');
      const field = element<HTMLInputElement>('#passkey-rename');
      expect(field.value).toBe('iPhone');
      expect(document.activeElement).toBe(field);

      await fillIn('#passkey-rename', '  iPhone 16 Pro Max  ');
      await submit();
      const rename = http.expectOne(`${PASSKEYS_URL}/${IPHONE.id}`);
      expect(rename.request.method).toBe('PATCH');
      expect(rename.request.body).toEqual({ name: 'iPhone 16 Pro Max' });
      rename.flush({ ...IPHONE, name: 'iPhone 16 Pro Max' });
      await settle();

      expect(element('#passkey-rename')).toBeNull();
      expect(texts('.passkey-name')).toEqual(['iPhone 16 Pro Max', 'Windows']);
      expect(element('[role="status"]').textContent).toContain(
        'Přístupový klíč je přejmenovaný na iPhone 16 Pro Max.',
      );
    });

    it('then an empty name is refused at the field without a request', async () => {
      await clickButton('Přejmenovat');
      await fillIn('#passkey-rename', '');
      await submit();

      expect(element('.passkey-rename').textContent).toContain('Pojmenujte prosím klíč.');
      expect(texts('.passkey-name')).toEqual(['iPhone', 'Windows']);
    });

    it('and the server refuses the name, then the reason is shown at the form', async () => {
      await clickButton('Přejmenovat');
      await fillIn('#passkey-rename', 'Mac');
      await submit();
      http
        .expectOne(`${PASSKEYS_URL}/${IPHONE.id}`)
        .flush(problem('validation', 'Neplatný požadavek', 'Název je příliš dlouhý.'), {
          status: 400,
          statusText: 'Bad Request',
        });
      await settle();

      expect(element('.passkey-rename [role="alert"]').textContent).toContain(
        'Název je příliš dlouhý.',
      );
      expect(texts('.passkey-name')).toEqual(['iPhone', 'Windows']);
    });

    it('and cancels, then the name stays and nothing is sent', async () => {
      await clickButton('Přejmenovat');
      await fillIn('#passkey-rename', 'Mac');
      await clickButton('Zrušit');

      expect(element('#passkey-rename')).toBeNull();
      expect(texts('.passkey-name')).toEqual(['iPhone', 'Windows']);
      expect(document.activeElement?.textContent?.trim()).toBe('Přejmenovat');
    });
  });

  it('when the session has ended, then the card hands the donor to the sign-in', async () => {
    fixture = TestBed.createComponent(PasskeysCard);
    sessionEnded = 0;
    fixture.componentInstance.sessionEnded.subscribe(() => sessionEnded++);
    await settle();
    http
      .expectOne(PASSKEYS_URL)
      .flush(problem('auth/unauthenticated', 'Nejste přihlášeni', 'Přihlaste se prosím.'), {
        status: 401,
        statusText: 'Unauthorized',
      });
    await settle();

    expect(sessionEnded).toBe(1);
  });

  it('when the browser cannot create passkeys, then the card says so instead of offering to add one', async () => {
    passkeys.available = false;
    await render([IPHONE]);

    expect(element('.passkeys-unsupported').textContent).toContain('Tento prohlížeč');
    expect(texts('button')).not.toContain('Přidat přístupový klíč');
    expect(texts('.passkey-name')).toEqual(['iPhone']);
  });
});

describe('Given the passkeys card of a donor without a password', () => {
  let fixture: ComponentFixture<PasskeysCard>;
  let http: HttpTestingController;
  let passkeys: FakePasskeyAuthenticator;
  let counts: number[];

  beforeEach(async () => {
    passkeys = new FakePasskeyAuthenticator();
    await TestBed.configureTestingModule({
      imports: [PasskeysCard],
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

  async function render(items = [IPHONE]): Promise<void> {
    fixture = TestBed.createComponent(PasskeysCard);
    counts = [];
    fixture.componentInstance.countChanged.subscribe((count) => counts.push(count));
    await settle();
    http.expectOne(PASSKEYS_URL).flush({ items });
    await settle();
  }

  const root = () => fixture.nativeElement as HTMLElement;

  function element<T extends HTMLElement>(selector: string): T {
    return root().querySelector(selector) as T;
  }

  function texts(selector: string): string[] {
    return Array.from(root().querySelectorAll(selector)).map(
      (node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function clickButton(text: string): Promise<void> {
    const button = Array.from(root().querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes(text),
    );
    expect(button, `button "${text}"`).toBeDefined();
    button?.click();
    await settle();
  }

  async function fillIn(selector: string, value: string): Promise<void> {
    const input = element<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function submit(): Promise<void> {
    element<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
    await settle();
  }

  it('when the only key is listed, then it cannot be removed, a second key is recommended and the count is reported', async () => {
    await render([IPHONE]);

    expect(texts('button')).not.toContain('Odebrat');
    expect(texts('button')).toContain('Přejmenovat');
    expect(element('.passkey .passkeys-hint').textContent).toContain('Jediný způsob přihlášení');
    expect(texts('.passkeys-hint')[1]).toContain('aspoň ve dvou zařízeních');
    expect(counts).toEqual([1]);
  });

  it('when two keys are listed, then either can be removed', async () => {
    await render([IPHONE, WINDOWS]);

    expect(texts('button').filter((text) => text === 'Odebrat')).toHaveLength(2);
    expect(element('.passkeys-hint')).toBeNull();
  });

  it('when no key is left, then a warning asks for one and the first needs no confirmation', async () => {
    await render([]);

    expect(element('.passkeys-warning').textContent).toContain(
      'Účet nemá heslo ani přístupový klíč',
    );
    await clickButton('Přidat přístupový klíč');
    expect(element('#passkey-password')).toBeNull();
    await fillIn('#passkey-name', 'iPhone');
    await submit();

    const options = http.expectOne(OPTIONS_URL);
    expect(options.request.body).toEqual({});
    options.flush(passkeyCreationOptions());
    await vi.waitFor(() => expect(passkeys.created).toHaveLength(1));
    await settle();
    http.expectOne(PASSKEYS_URL).flush(samplePasskey());
    await settle();

    expect(texts('.passkey-name')).toEqual(['iPhone']);
    expect(counts).toEqual([0, 1]);
  });

  it('when a further key is added, then an existing key confirms it instead of a password', async () => {
    await render([IPHONE]);
    await clickButton('Přidat přístupový klíč');
    expect(element('#passkey-password')).toBeNull();
    expect(element('.passkeys-form-intro').textContent).toContain('jedním z vašich klíčů');
    await fillIn('#passkey-name', 'MacBook');
    await submit();

    http.expectOne('/api/donors/auth/passkey/options').flush(passkeySignInOptions());
    const options = await vi.waitFor(() => http.expectOne(OPTIONS_URL));
    expect(options.request.body).toEqual({
      passkey: { challenge: SAMPLE_CHALLENGE, credential: SAMPLE_ASSERTION },
    });
    options.flush(passkeyCreationOptions());
    await vi.waitFor(() => expect(passkeys.created).toHaveLength(1));
    await settle();
    http.expectOne(PASSKEYS_URL).flush(samplePasskey({ id: 'new', name: 'MacBook' }));
    await settle();

    expect(texts('.passkey-name')).toEqual(['iPhone', 'MacBook']);
  });
});
