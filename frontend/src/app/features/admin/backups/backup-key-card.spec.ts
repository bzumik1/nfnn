import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { PasskeyAuthenticator } from '../../../core/auth/passkey-authenticator';
import {
  authResponse,
  FakePasskeyAuthenticator,
  passkeySignInOptions,
  SAMPLE_ASSERTION,
  SAMPLE_CHALLENGE,
  sampleDonor,
} from '../../../core/auth/testing/donor-fixtures';
import { BackupKeyStatus } from '../admin-api';
import { BackupKeyCard } from './backup-key-card';

const REVEAL_URL = '/api/admin/operations/backups/key/reveal';
const CONFIRM_URL = '/api/admin/operations/backups/key/confirmation';
const KEY = 'AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH';
const UNCONFIRMED: BackupKeyStatus = { available: true, confirmed: false, confirmedAt: null };
const CONFIRMED: BackupKeyStatus = {
  available: true,
  confirmed: true,
  confirmedAt: '2026-10-28T09:00:00Z',
};

describe('Given the backup key card', () => {
  let fixture: ComponentFixture<BackupKeyCard>;
  let http: HttpTestingController;
  let passkeys: FakePasskeyAuthenticator;
  let changed: BackupKeyStatus[];

  async function render(
    status: BackupKeyStatus,
    secondFactor = { enabled: true, neededForAdministration: true },
  ): Promise<void> {
    passkeys = new FakePasskeyAuthenticator();
    await TestBed.configureTestingModule({
      imports: [BackupKeyCard],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PasskeyAuthenticator, useValue: passkeys },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'], secondFactor })));
    fixture = TestBed.createComponent(BackupKeyCard);
    fixture.componentRef.setInput('status', status);
    changed = [];
    fixture.componentInstance.changed.subscribe((value) => changed.push(value));
    await settle();
  }

  afterEach(() => http.verify());

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const root = () => fixture.nativeElement as HTMLElement;

  function text(selector: string): string {
    return (root().querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  async function click(name: string): Promise<void> {
    const button = Array.from(root().querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === name,
    );
    expect(button, `button "${name}"`).toBeDefined();
    button?.click();
    await settle();
  }

  async function type(id: string, value: string): Promise<void> {
    const input = root().querySelector(`#${id}`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await settle();
  }

  async function submit(): Promise<void> {
    root().querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
  }

  async function revealWithCode(): Promise<void> {
    await click('Zobrazit klíč…');
    await type('backup-key-code', ' 123456 ');
    await submit();
    const request = http.expectOne(REVEAL_URL);
    expect(request.request.body).toEqual({ secondFactorCode: '123456' });
    request.flush({ key: KEY });
    await settle();
  }

  describe('when nobody has confirmed saving the key', () => {
    beforeEach(() => render(UNCONFIRMED));

    it('then it asks to save the key and does not show it', () => {
      expect(text('.ui-callout--warning')).toContain('Klíč si zatím nikdo neuložil.');
      expect(root().textContent).not.toContain(KEY);
    });

    it('and the administrator asks to see it, then a fresh code is asked for first', async () => {
      await click('Zobrazit klíč…');

      expect(document.activeElement).toBe(root().querySelector('#backup-key-code'));
      await submit();
      expect(text('#backup-key-code-error')).toBe('Opište prosím kód z aplikace.');
      http.expectNone(REVEAL_URL);
    });

    it('and the code is refused, then the reason stands and the key stays hidden', async () => {
      await click('Zobrazit klíč…');
      await type('backup-key-code', '000000');
      await submit();
      http.expectOne(REVEAL_URL).flush(
        {
          type: 'https://nfnn.cz/problems/donors/second-factor-code-rejected',
          title: 'Kód nesedí',
          detail: 'Opište prosím nový kód z aplikace.',
          status: 400,
        },
        { status: 400, statusText: 'Bad Request' },
      );
      await settle();

      expect(text('[role="alert"]')).toContain('Opište prosím nový kód z aplikace.');
      expect(root().textContent).not.toContain(KEY);
    });

    it('and the right code is typed, then the key is shown with copy and download', async () => {
      await revealWithCode();

      expect(text('.backup-key')).toBe(KEY);
      expect(root().querySelector('app-copy-button')).not.toBeNull();
      expect(text('.backup-key-download')).toBe('Stáhnout jako soubor');
      expect(document.activeElement).toBe(root().querySelector('.revealed'));
    });

    it('and other characters are typed, then the confirmation is refused at the field', async () => {
      await revealWithCode();
      await type('backup-key-check', 'AAAA');
      await submit();

      expect(text('#backup-key-check-error')).toBe(
        'Znaky nesedí s koncem klíče. Zkontrolujte prosím, že jste uložili celý klíč.',
      );
      http.expectNone(CONFIRM_URL);
    });

    it('and the last four characters are typed, then saving is confirmed and the key hides', async () => {
      await revealWithCode();
      await type('backup-key-check', '6gwh');
      await submit();

      const request = http.expectOne(CONFIRM_URL);
      expect(request.request.body).toEqual({ check: '6gwh' });
      request.flush(CONFIRMED);
      await settle();

      expect(changed).toEqual([CONFIRMED]);
      expect(root().textContent).not.toContain(KEY);
      expect(text('[role="status"]:not(:empty)')).toBe(
        'Děkujeme, uložení klíče jsme si poznamenali. Klíč jsme zase skryli.',
      );
    });

    it('and the key is hidden again, then nothing is sent', async () => {
      await revealWithCode();
      await click('Skrýt klíč');

      expect(root().textContent).not.toContain(KEY);
      expect(document.activeElement?.textContent?.trim()).toBe('Zobrazit klíč…');
    });

    it('and the passkey is used instead of the code, then its answer goes with the request', async () => {
      await click('Zobrazit klíč…');
      await click('Potvrdit přístupovým klíčem');
      http
        .expectOne({ method: 'POST', url: '/api/donors/auth/passkey/options' })
        .flush(passkeySignInOptions());
      await settle();

      const request = http.expectOne(REVEAL_URL);
      expect(request.request.body).toEqual({
        passkey: { challenge: SAMPLE_CHALLENGE, credential: SAMPLE_ASSERTION },
      });
      request.flush({ key: KEY });
      await settle();
      expect(text('.backup-key')).toBe(KEY);
    });
  });

  describe('when an administrator without the code app has a passkey', () => {
    beforeEach(() => render(CONFIRMED, { enabled: false, neededForAdministration: true }));

    it('then it says when saving was confirmed and the passkey confirms the view', async () => {
      expect(text('.key-confirmed')).toBe('Uložení klíče jste potvrdili 28. 10. 2026 10:00.');
      await click('Zobrazit klíč…');

      expect(root().querySelector('#backup-key-code')).toBeNull();
      expect(text('.key-note')).toContain('přístupovým klíčem');
      passkeys.failure = 'cancelled';
      await submit();
      http
        .expectOne({ method: 'POST', url: '/api/donors/auth/passkey/options' })
        .flush(passkeySignInOptions());
      await settle();

      http.expectNone(REVEAL_URL);
      expect(text('[role="alert"]')).toBe(
        'Zařízení zobrazení nepotvrdilo. Zkuste to prosím znovu.',
      );
    });
  });

  describe('when the server has no key', () => {
    beforeEach(() => render({ available: false, confirmed: false, confirmedAt: null }));

    it('then it says the backups wait and offers nothing to show', () => {
      expect(text('.ui-callout--danger')).toContain('nové zálohy nevznikají');
      expect(root().querySelector('button')).toBeNull();
    });
  });
});
