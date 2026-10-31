import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { PasskeyAuthenticator } from '../../../../core/auth/passkey-authenticator';
import {
  authResponse,
  FakePasskeyAuthenticator,
  passkeySignInOptions,
  SAMPLE_ASSERTION,
  SAMPLE_CHALLENGE,
  samplePasskey,
  sampleDonor,
} from '../../../../core/auth/testing/donor-fixtures';
import { RestartOutcome, SetupApi } from '../../../operations/setup/setup-api';
import { receiptSigningKey, receiptSigningKeys } from '../../testing/admin-fixtures';
import { ReceiptSigningKeysResponse } from '../../admin-api';
import { ReceiptSigningKey } from './receipt-signing-key';

const SIGNING_KEYS_URL = '/api/admin/donations/receipt-signing-keys';
const WITHDRAW_OWN_URL = '/api/admin/donations/receipt-signing-keys/21fe31df/withdrawal';
const WITHDRAW_EARLIER_URL = '/api/admin/donations/receipt-signing-keys/39f713d0/withdrawal';
const PASSKEYS_URL = '/api/donors/me/passkeys';

describe('Given the receipt signing key section of the receipt settings', () => {
  let fixture: ComponentFixture<ReceiptSigningKey>;
  let http: HttpTestingController;
  let passkeys: FakePasskeyAuthenticator;
  let restarts: Subject<RestartOutcome>;
  let watched: number;

  beforeEach(async () => {
    passkeys = new FakePasskeyAuthenticator();
    restarts = new Subject<RestartOutcome>();
    watched = 0;
    await TestBed.configureTestingModule({
      imports: [ReceiptSigningKey],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PasskeyAuthenticator, useValue: passkeys },
        {
          provide: SetupApi,
          useValue: {
            watchRestart: (): Observable<RestartOutcome> => {
              watched++;
              return restarts;
            },
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(
      authResponse(
        'token-1',
        sampleDonor({
          roles: ['DONOR', 'ADMIN'],
          secondFactor: { enabled: true, neededForAdministration: true },
        }),
      ),
    );
    fixture = TestBed.createComponent(ReceiptSigningKey);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const root = () => fixture.nativeElement as HTMLElement;

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function rows(): Record<string, string> {
    const terms = Array.from(
      fixture.nativeElement.querySelectorAll('dt') as NodeListOf<HTMLElement>,
    );
    return Object.fromEntries(
      terms.map((term) => [
        (term.textContent ?? '').trim(),
        (term.nextElementSibling?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ]),
    );
  }

  function buttons(): string[] {
    return Array.from(root().querySelectorAll('button')).map((button) =>
      (button.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function load(body: object, status = 200): Promise<void> {
    http
      .expectOne({ method: 'GET', url: SIGNING_KEYS_URL })
      .flush(body, status === 200 ? undefined : { status, statusText: 'Error' });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function click(name: string): Promise<void> {
    const button = Array.from(root().querySelectorAll('button')).find(
      (candidate) => (candidate.textContent ?? '').replace(/\s+/g, ' ').trim() === name,
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
    root().querySelector('dialog form')?.dispatchEvent(new Event('submit'));
    await settle();
  }

  async function openWithdrawal(name: string, items = [] as object[]): Promise<void> {
    await click(name);
    http.expectOne(PASSKEYS_URL).flush({ items });
    await settle();
  }

  const earlierKey = () =>
    receiptSigningKey({
      keyId: '39f713d0',
      publicKey: 'PUAXw-hDiVqStwqnTRt-vJyYLM8uxJaMwM1V8Sr0Zgw',
      registeredAt: '2026-11-01T07:00:00Z',
      current: false,
    });

  function withdrawn(
    keys: ReceiptSigningKeysResponse,
    restarting: boolean,
  ): ReceiptSigningKeysResponse & { restarting: boolean } {
    return { ...keys, restarting };
  }

  it('when it opens, then it says the key is loading', () => {
    expect(text('[role="status"]')).toBe('Načítáme klíč…');
    http.expectOne(SIGNING_KEYS_URL).flush(receiptSigningKeys());
  });

  it('when the published key arrives, then its id, its registration time in Prague and that it is published are shown, with only the withdrawal to offer', async () => {
    await load(receiptSigningKeys());

    expect(text('h2')).toBe('Klíč k ověřovacím QR kódům');
    expect(text('.ui-card__intro')).toBe(
      'Tímto klíčem server podepisuje ověřovací QR kódy na potvrzeních o daru. Jeho veřejnou část web zveřejňuje, aby se podle ní dala potvrzení ověřit. Klíč vytvořil server sám. Kdyby se mohl dostat do cizích rukou, stáhněte ho a server si vytvoří nový.',
    );
    expect(rows()).toEqual({
      'Klíč serveru': '21fe31df',
      Zaregistrovaný: '13. 11. 2026 12:00',
      Stav: 'Zveřejněný',
    });
    expect(buttons()).toEqual(['Stáhnout klíč serveru…']);
    expect(root().querySelector('input')).toBeNull();
    expect(text('[role="alert"]')).toBe('');
  });

  it('when a key fails its seal, then an alert names it and says what to do', async () => {
    await load(
      receiptSigningKeys([
        receiptSigningKey({
          keyId: '39f713d0',
          registeredAt: '2026-11-01T07:00:00Z',
          published: false,
          current: false,
        }),
        receiptSigningKey({ published: false }),
      ]),
    );

    expect(rows()['Stav']).toBe('Nezveřejněný');
    expect(text('[role="alert"]')).toBe(
      'Klíče 39f713d0, 21fe31df nejsou zveřejněné, proto se QR kódy jimi podepsané neověří. Jejich záznamy v databázi chybí nebo neprošly kontrolou pečeti (změna mimo web nebo záloha jiného serveru, kterou server nepřevzal); obraťte se na technika serveru.',
    );
  });

  it('when the key of the server is missing from the list, then its id is shown as not published and an alert says so', async () => {
    await load({
      currentKeyId: '21fe31df',
      currentKeyPublished: false,
      keys: [],
      auditMismatches: [],
    });

    expect(rows()).toEqual({ 'Klíč serveru': '21fe31df', Stav: 'Nezveřejněný' });
    expect(text('[role="alert"]')).toBe(
      'Klíč 21fe31df není zveřejněný, proto se QR kódy jím podepsané neověří. Jeho záznam v databázi chybí nebo neprošel kontrolou pečeti (změna mimo web nebo záloha jiného serveru, kterou server nepřevzal); obraťte se na technika serveru.',
    );
  });

  it('when keys of earlier servers are published, then they are listed with their registration time', async () => {
    await load(
      receiptSigningKeys([
        receiptSigningKey({
          keyId: '39f713d0',
          registeredAt: '2026-11-01T07:00:00Z',
          current: false,
        }),
        receiptSigningKey(),
      ]),
    );

    expect(text('.signing-key-earlier')).toBe(
      'Zveřejněné jsou i dřívější klíče: 39f713d0 (zaregistrovaný 01. 11. 2026 08:00).',
    );
  });

  it('when the keys cannot be loaded, then an alert offers a retry that asks again', async () => {
    await load({}, 500);

    expect(text('[role="alert"]')).toContain('Klíč se nepodařilo načíst.');
    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await load(receiptSigningKeys());

    expect(rows()['Klíč serveru']).toBe('21fe31df');
  });

  it('when a key fails its seal, then it offers no withdrawal of it', async () => {
    await load(receiptSigningKeys([receiptSigningKey({ published: false })]));

    expect(buttons()).toEqual([]);
  });

  it('when an earlier key is published, then its withdrawal is offered beside the one of the server', async () => {
    await load(receiptSigningKeys([earlierKey(), receiptSigningKey()]));

    expect(buttons()).toEqual(['Stáhnout klíč serveru…', 'Stáhnout klíč 39f713d0…']);
  });

  it('when keys were withdrawn, then they are shown as withdrawn and no withdrawal is offered', async () => {
    await load(
      receiptSigningKeys([
        receiptSigningKey({ ...earlierKey(), status: 'revoked' }),
        receiptSigningKey({ status: 'revoked' }),
      ]),
    );

    expect(rows()['Stav']).toBe('Stažený');
    expect(text('.signing-key-earlier')).toBe(
      'Zveřejněné jsou i dřívější klíče: 39f713d0 (zaregistrovaný 01. 11. 2026 08:00, stažený).',
    );
    expect(buttons()).toEqual([]);
    expect(text('[role="alert"]')).toBe(
      'Klíč serveru 21fe31df je stažený a server zatím nemá nový, takže se potvrzení o daru teď nestáhnou. Nový klíč si server vytvoří při startu; když se to nestane do pár minut, obraťte se na technika serveru.',
    );
  });

  it('when key rows disagree with the audit trail, then an alert names each of them and a reverted key can be withdrawn again', async () => {
    await load({
      ...receiptSigningKeys([receiptSigningKey({ status: 'revoked' })]),
      currentKeyId: 'dac073e0',
      auditMismatches: [
        { keyId: '21fe31df', kind: 'reverted' },
        { keyId: '39f713d0', kind: 'missing' },
      ],
    });

    expect(text('[role="alert"]')).toContain(
      'Klíč 21fe31df byl ve správě stažený, ale jeho záznam v databázi je znovu aktivní (změna mimo web nebo obnova starší zálohy). Web ho dál zveřejňuje jako stažený; stáhněte ho prosím znovu a obraťte se na technika serveru.',
    );
    expect(text('[role="alert"]')).toContain(
      'Klíč 39f713d0 je v historii správy, ale jeho záznam v databázi chybí (změna mimo web). QR kódy jím podepsané se neověří; obraťte se na technika serveru.',
    );
    expect(buttons()).toEqual(['Stáhnout klíč 21fe31df znovu…']);
  });

  describe('when the administrator asks to withdraw the key of the server', () => {
    beforeEach(async () => {
      await load(receiptSigningKeys([earlierKey(), receiptSigningKey()]));
      await openWithdrawal('Stáhnout klíč serveru…');
    });

    it('then a dialog says what the withdrawal does and asks for a fresh code first', async () => {
      const dialog = root().querySelector('dialog') as HTMLElement;
      expect(dialog.getAttribute('aria-labelledby')).toBe('stazeni-klice-titulek');
      expect(text('#stazeni-klice-titulek')).toBe('Stáhnout klíč 21fe31df?');
      expect(text('dialog .withdrawal-points')).toContain(
        'Je to klíč, kterým server teď podepisuje. Web se hned restartuje',
      );
      expect(document.activeElement).toBe(root().querySelector('#withdrawal-code'));

      await submit();

      expect(text('#withdrawal-code-error')).toBe('Opište prosím kód z aplikace.');
      http.expectNone(WITHDRAW_OWN_URL);
    });

    it('and the code is refused, then the reason stands in the dialog and nothing changes', async () => {
      await type('withdrawal-code', '000000');
      await submit();
      http.expectOne(WITHDRAW_OWN_URL).flush(
        {
          type: 'https://nfnn.cz/problems/donors/second-factor-code-rejected',
          title: 'Kód nesouhlasí',
          status: 400,
          detail: 'Opište prosím nový kód z aplikace.',
        },
        { status: 400, statusText: 'Bad Request' },
      );
      await settle();

      expect(text('dialog [role="alert"]')).toContain('Kód nesouhlasí');
      expect(rows()['Stav']).toBe('Zveřejněný');
      expect(watched).toBe(0);
    });

    it('and a fresh code confirms it, then the key shows as withdrawn while the web restarts, and the new key loads after the restart', async () => {
      await type('withdrawal-code', ' 123456 ');
      await submit();
      const request = http.expectOne(WITHDRAW_OWN_URL);
      expect(request.request.body).toEqual({ secondFactorCode: '123456' });
      request.flush(
        withdrawn(
          receiptSigningKeys([earlierKey(), receiptSigningKey({ status: 'revoked' })]),
          true,
        ),
      );
      await settle();

      expect(root().querySelector('dialog')).toBeNull();
      expect(rows()['Stav']).toBe('Stažený');
      expect(text('[role="status"]:not(:empty)')).toBe(
        'Klíč 21fe31df je stažený. Web se restartuje a vytvoří si nový klíč, obvykle do minuty.',
      );
      expect(text('[role="alert"]')).toBe('');
      expect(watched).toBe(1);

      restarts.next('restarted');
      restarts.complete();
      await settle();
      await load(
        receiptSigningKeys([
          earlierKey(),
          receiptSigningKey({ status: 'revoked', current: false }),
          receiptSigningKey({
            keyId: 'b7e1c2d4',
            registeredAt: '2026-11-20T09:31:00Z',
          }),
        ]),
      );

      expect(rows()['Klíč serveru']).toBe('b7e1c2d4');
      expect(text('[role="status"]:not(:empty)')).toBe(
        'Klíč 21fe31df je stažený a web po restartu podepisuje novým klíčem.',
      );
    });

    it('and the web does not come back in time, then an alert says so and a retry watches again', async () => {
      await type('withdrawal-code', '123456');
      await submit();
      http
        .expectOne(WITHDRAW_OWN_URL)
        .flush(withdrawn(receiptSigningKeys([receiptSigningKey({ status: 'revoked' })]), true));
      await settle();

      restarts.next('slow');
      await settle();

      expect(text('.signing-key-slow')).toContain(
        'Klíč je stažený, ale web se po restartu zatím nespustil. Počkejte pár minut a zkuste to znovu.',
      );
      await click('Zkusit znovu');
      expect(watched).toBe(2);
    });

    it('and it is cancelled, then the dialog closes and nothing is sent', async () => {
      await click('Zrušit');

      expect(root().querySelector('dialog')).toBeNull();
      http.expectNone(WITHDRAW_OWN_URL);
    });
  });

  describe('when the administrator withdraws an earlier key with a passkey', () => {
    beforeEach(async () => {
      await load(receiptSigningKeys([earlierKey(), receiptSigningKey()]));
      await openWithdrawal('Stáhnout klíč 39f713d0…', [samplePasskey()]);
    });

    it('then the passkey is offered first, its answer goes with the request and the web keeps running', async () => {
      expect(root().querySelector('#withdrawal-code')).toBeNull();
      expect(text('dialog .withdrawal-points')).toContain(
        'Tímto klíčem server už nepodepisuje, takže web poběží dál beze změny.',
      );
      await submit();
      http
        .expectOne({ method: 'POST', url: '/api/donors/auth/passkey/options' })
        .flush(passkeySignInOptions());
      await settle();

      const request = http.expectOne(WITHDRAW_EARLIER_URL);
      expect(request.request.body).toEqual({
        passkey: { challenge: SAMPLE_CHALLENGE, credential: SAMPLE_ASSERTION },
      });
      request.flush(
        withdrawn(
          receiptSigningKeys([
            receiptSigningKey({ ...earlierKey(), status: 'revoked' }),
            receiptSigningKey(),
          ]),
          false,
        ),
      );
      await settle();

      expect(root().querySelector('dialog')).toBeNull();
      expect(text('.signing-key-earlier')).toContain('stažený');
      expect(text('[role="status"]:not(:empty)')).toBe('Klíč 39f713d0 je stažený.');
      expect(watched).toBe(0);
      expect(document.activeElement).toBe(root().querySelector('h2'));
    });

    it('and the device does not confirm, then the dialog says so and sends nothing', async () => {
      passkeys.failure = 'cancelled';
      await submit();
      http
        .expectOne({ method: 'POST', url: '/api/donors/auth/passkey/options' })
        .flush(passkeySignInOptions());
      await settle();

      http.expectNone(WITHDRAW_EARLIER_URL);
      expect(text('dialog [role="alert"]')).toBe(
        'Zařízení stažení nepotvrdilo. Zkuste to prosím znovu.',
      );
    });

    it('and chooses the code instead, then the code field takes focus', async () => {
      await click('Zadat kód z aplikace');

      expect(document.activeElement).toBe(root().querySelector('#withdrawal-code'));
    });
  });
});
