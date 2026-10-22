import { Location } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, problem } from '../../../core/auth/testing/donor-fixtures';
import { EmailVerification } from './email-verification';

describe('Given the page that confirms the e-mail from the registration link', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let store: AuthStore;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'potvrzeni-emailu', component: EmailVerification }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
  });

  afterEach(() => http.verify());

  async function open(url: string): Promise<void> {
    harness = await RouterTestingHarness.create(url);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await settle();
  }

  async function settle(): Promise<void> {
    harness.detectChanges();
    await harness.fixture.whenStable();
  }

  function element<T extends HTMLElement>(selector: string): T {
    return harness.routeNativeElement!.querySelector(selector) as T;
  }

  function heading(): HTMLElement {
    return element('#email-verification-title');
  }

  async function fillIn(selector: string, value: string): Promise<void> {
    const input = element<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function click(selector: string): Promise<void> {
    element<HTMLButtonElement>(selector).click();
    await settle();
  }

  async function submitRequest(): Promise<void> {
    element<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
    await settle();
  }

  async function answerConfirm(
    body: Record<string, unknown> | null,
    status: number,
    statusText: string,
  ): Promise<void> {
    http
      .expectOne('/api/donors/auth/email-verification/confirm')
      .flush(body, { status, statusText });
    await settle();
  }

  describe('when the link carries a token', () => {
    beforeEach(() => open('/potvrzeni-emailu#token=abc'));

    it('then the token leaves the address bar and is sent at once while the page says it is confirming', () => {
      expect(TestBed.inject(Location).path(true)).toBe('/potvrzeni-emailu');
      const request = http.expectOne('/api/donors/auth/email-verification/confirm');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ token: 'abc' });
      expect(heading().textContent).toContain('Potvrzujeme váš e-mail');
      expect(element('[role="status"]').textContent).toContain('Chvilku strpení');
      request.flush(authResponse('token-1'));
    });

    it('and the server confirms it, then the donor is signed in, the success panel takes focus and leads to the overview', async () => {
      await answerConfirm(authResponse('token-1') as unknown as Record<string, unknown>, 200, 'OK');

      expect(store.signedIn()).toBe(true);
      expect(store.donor()?.email).toBe('jana@example.cz');
      expect(heading().textContent).toContain('E-mail je potvrzený');
      expect(element('[role="status"]').textContent).toContain('jste přihlášeni');
      expect(document.activeElement).toBe(heading());

      await click('.form-submit');

      expect(navigate).toHaveBeenCalledWith('/donor/prehled');
    });

    it('and the link is no longer valid, then the invalid panel asks for the e-mail and sends a new link', async () => {
      await answerConfirm(
        problem(
          'donors/invalid-email-verification-token',
          'Odkaz pro potvrzení e-mailu je neplatný nebo vypršel',
          'Nechte si prosím poslat nový odkaz.',
        ),
        400,
        'Bad Request',
      );

      expect(store.signedIn()).toBe(false);
      expect(heading().textContent).toContain('Odkaz je neplatný nebo vypršel');
      expect(element('.lead').textContent).toContain('platí 24 hodin');
      expect(document.activeElement).toBe(heading());

      await fillIn('#verification-email', ' jana@example.cz ');
      await submitRequest();
      const request = http.expectOne('/api/donors/auth/email-verification/request');
      expect(request.request.body).toEqual({ email: 'jana@example.cz' });
      expect(element<HTMLButtonElement>('.form-submit').disabled).toBe(true);
      expect(element('.form-submit').textContent).toContain('Odesílám…');
      request.flush(null, { status: 202, statusText: 'Accepted' });
      await settle();

      expect(heading().textContent).toContain('E-mail odeslán');
      expect(element('[role="status"]').textContent).toContain('poslali jsme na ni nový odkaz');
      expect(element('form')).toBeNull();
    });

    it('and the link is no longer valid and the address is empty, then nothing is sent and the field says what is missing', async () => {
      await answerConfirm(problem('donors/invalid-email-verification-token'), 400, 'Bad Request');

      await submitRequest();

      http.expectNone('/api/donors/auth/email-verification/request');
      expect(element('#verification-email-error').textContent).toContain('Vyplňte prosím e-mail.');
    });

    it('and too many links were asked for from this address, then the form says to wait an hour', async () => {
      await answerConfirm(problem('donors/invalid-email-verification-token'), 400, 'Bad Request');

      await fillIn('#verification-email', 'jana@example.cz');
      await submitRequest();
      http
        .expectOne('/api/donors/auth/email-verification/request')
        .flush(problem('donors/rate-limited', 'Příliš mnoho požadavků'), {
          status: 429,
          statusText: 'Too Many Requests',
        });
      await settle();

      expect(element('.form-error').getAttribute('role')).toBe('alert');
      expect(element('.form-error').textContent).toContain('Zkuste to prosím za hodinu.');
      expect(element<HTMLButtonElement>('.form-submit').disabled).toBe(false);
    });

    it('and the server fails, then the failed panel shows a generic error and retries on request', async () => {
      await answerConfirm(null, 502, 'Bad Gateway');

      expect(heading().textContent).toContain('E-mail se nepodařilo potvrdit');
      expect(element('[role="alert"]').textContent).toContain('Spojení se serverem se nepodařilo.');

      await click('.form-submit');

      expect(heading().textContent).toContain('Potvrzujeme váš e-mail');
      await answerConfirm(authResponse('token-1') as unknown as Record<string, unknown>, 200, 'OK');
      expect(heading().textContent).toContain('E-mail je potvrzený');
    });

    it('and the donor leaves the page before the answer arrives, then the late answer is dropped silently', async () => {
      harness.fixture.destroy();

      http.expectOne('/api/donors/auth/email-verification/confirm').flush(authResponse('token-1'));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(store.signedIn()).toBe(true);
    });
  });

  describe('when the link has no token', () => {
    beforeEach(() => open('/potvrzeni-emailu'));

    it('then nothing is sent and the page says the link is incomplete and offers a new one', async () => {
      http.expectNone('/api/donors/auth/email-verification/confirm');
      expect(heading().textContent).toContain('Odkaz je neúplný');

      await fillIn('#verification-email', 'jana@example.cz');
      await submitRequest();
      http
        .expectOne('/api/donors/auth/email-verification/request')
        .flush(null, { status: 202, statusText: 'Accepted' });
      await settle();

      expect(heading().textContent).toContain('E-mail odeslán');
    });
  });
});
