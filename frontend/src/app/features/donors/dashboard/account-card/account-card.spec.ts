import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { authResponse, problem } from '../../../../core/auth/testing/donor-fixtures';
import { AccountCard } from './account-card';

describe('Given the sign-in data card in the overview', () => {
  let fixture: ComponentFixture<AccountCard>;
  let http: HttpTestingController;
  let store: AuthStore;
  let sessionEnded: number;

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
    fixture = TestBed.createComponent(AccountCard);
    sessionEnded = 0;
    fixture.componentInstance.sessionEnded.subscribe(() => sessionEnded++);
    await settle();
  });

  afterEach(() => http.verify());

  const root = () => fixture.nativeElement as HTMLElement;

  function element<T extends HTMLElement>(selector: string): T {
    return root().querySelector(selector) as T;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function click(selector: string): Promise<void> {
    element<HTMLButtonElement>(selector).click();
    await settle();
  }

  async function clickButton(text: string): Promise<void> {
    const button = Array.from(root().querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes(text),
    );
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
    element<HTMLFormElement>('.account-form').dispatchEvent(new Event('submit'));
    await settle();
  }

  it('when it opens, then it shows the address and the two actions', () => {
    expect(element('h2').textContent).toContain('Přihlašovací údaje');
    expect(element('.account-data dd').textContent?.trim()).toBe('jana@example.cz');
    expect(
      Array.from(root().querySelectorAll('.account-action')).map((b) => b.textContent?.trim()),
    ).toEqual(['Změnit e-mail', 'Změnit heslo']);
  });

  describe('when the donor changes the e-mail', () => {
    beforeEach(() => clickButton('Změnit e-mail'));

    it('then the new address field has the focus and the form explains the link', () => {
      expect(document.activeElement).toBe(element('#account-new-email'));
      expect(element('.account-form-intro').textContent).toContain(
        'Na novou adresu pošleme odkaz.',
      );
    });

    it('and sends a valid address and the password, then the request goes out and the card says where the link went', async () => {
      await fillIn('#account-new-email', ' Jana.Nova@example.cz ');
      await fillIn('#account-email-password', 'correct horse battery');

      await submit();
      const request = http.expectOne({ method: 'POST', url: '/api/donors/me/email-change' });
      expect(request.request.body).toEqual({
        newEmail: 'Jana.Nova@example.cz',
        password: 'correct horse battery',
      });
      request.flush(null, { status: 202, statusText: 'Accepted' });
      await settle();

      expect(element('.account-form')).toBeNull();
      expect(element('.account-status').textContent).toContain(
        'Odkaz jsme poslali na Jana.Nova@example.cz.',
      );
      expect(element('.account-data dd').textContent?.trim()).toBe('jana@example.cz');
      expect(document.activeElement?.textContent?.trim()).toBe('Změnit e-mail');
    });

    it('and leaves the address malformed, then nothing is sent and the field says so', async () => {
      await fillIn('#account-new-email', 'not-an-email');
      await fillIn('#account-email-password', 'correct horse battery');

      await submit();

      http.expectNone('/api/donors/me/email-change');
      expect(element('#account-new-email-error').textContent).toContain(
        'Zadejte prosím platnou e-mailovou adresu.',
      );
      expect(document.activeElement).toBe(element('#account-new-email'));
    });

    it('and the password is wrong, then the form stays and shows the reason', async () => {
      await fillIn('#account-new-email', 'jana.nova@example.cz');
      await fillIn('#account-email-password', 'wrong horse battery');

      await submit();
      http
        .expectOne('/api/donors/me/email-change')
        .flush(
          problem(
            'donors/wrong-password',
            'Nesprávné současné heslo',
            'Zadejte prosím heslo, kterým se teď přihlašujete.',
          ),
          { status: 400, statusText: 'Bad Request' },
        );
      await settle();

      expect(element('.account-form .form-error').textContent).toContain(
        'Nesprávné současné heslo. Zadejte prosím heslo, kterým se teď přihlašujete.',
      );
      expect(element<HTMLButtonElement>('.account-save').disabled).toBe(false);
    });

    it('and cancels, then nothing is sent and the focus returns to the action', async () => {
      await fillIn('#account-new-email', 'jana.nova@example.cz');

      await click('.account-cancel');

      http.expectNone('/api/donors/me/email-change');
      expect(element('.account-form')).toBeNull();
      expect(document.activeElement?.textContent?.trim()).toBe('Změnit e-mail');
    });

    it('and the session has ended, then the overview is told to send the donor to sign in', async () => {
      await fillIn('#account-new-email', 'jana.nova@example.cz');
      await fillIn('#account-email-password', 'correct horse battery');

      await submit();
      http
        .expectOne('/api/donors/me/email-change')
        .flush(problem('auth/unauthenticated', 'Nejste přihlášeni'), {
          status: 401,
          statusText: 'Unauthorized',
        });
      await settle();

      expect(sessionEnded).toBe(1);
    });
  });

  describe('when the donor changes the password', () => {
    beforeEach(() => clickButton('Změnit heslo'));

    it('then the current password field has the focus and the new one carries the hint', () => {
      expect(document.activeElement).toBe(element('#account-current-password'));
      expect(element('#account-new-password-hint').textContent).toContain('Alespoň 12 znaků.');
    });

    it('and the new passwords differ, then nothing is sent and the form says so', async () => {
      await fillIn('#account-current-password', 'correct horse battery');
      await fillIn('#account-new-password', 'a brand new passphrase');
      await fillIn('#account-new-password-confirm', 'a brand new passphrasX');

      await submit();

      http.expectNone('/api/donors/me/password');
      expect(element('.account-form .form-error').textContent).toContain(
        'Nová hesla se neshodují.',
      );
    });

    it('and the new password is short, then nothing is sent and the field says so', async () => {
      await fillIn('#account-current-password', 'correct horse battery');
      await fillIn('#account-new-password', 'short');
      await fillIn('#account-new-password-confirm', 'short');

      await submit();

      http.expectNone('/api/donors/me/password');
      expect(element('#account-new-password-error').textContent).toContain(
        'Heslo musí mít alespoň 12 znaků.',
      );
    });

    it('and sends matching passwords, then the new session is adopted and the card says the others ended', async () => {
      await fillIn('#account-current-password', 'correct horse battery');
      await fillIn('#account-new-password', 'a brand new passphrase');
      await fillIn('#account-new-password-confirm', 'a brand new passphrase');

      await submit();
      const request = http.expectOne({ method: 'PUT', url: '/api/donors/me/password' });
      expect(request.request.body).toEqual({
        currentPassword: 'correct horse battery',
        newPassword: 'a brand new passphrase',
      });
      request.flush(authResponse('token-2'));
      await settle();

      expect(element('.account-form')).toBeNull();
      expect(element('.account-status').textContent).toContain(
        'Heslo jsme změnili. Ostatní přihlášení jsme ukončili, tohle zůstává.',
      );
      expect(document.activeElement?.textContent?.trim()).toBe('Změnit heslo');
      store.updateProfile({}).subscribe();
      expect(http.expectOne('/api/donors/me').request.headers.get('Authorization')).toBe(
        'Bearer token-2',
      );
    });

    it('and the current password is wrong, then the form stays and shows the reason', async () => {
      await fillIn('#account-current-password', 'wrong horse battery');
      await fillIn('#account-new-password', 'a brand new passphrase');
      await fillIn('#account-new-password-confirm', 'a brand new passphrase');

      await submit();
      http
        .expectOne('/api/donors/me/password')
        .flush(problem('donors/wrong-password', 'Nesprávné současné heslo', ''), {
          status: 400,
          statusText: 'Bad Request',
        });
      await settle();

      expect(element('.account-form .form-error').textContent).toContain(
        'Nesprávné současné heslo',
      );
    });
  });
});
