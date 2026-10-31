import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { receiptSigningKey, receiptSigningKeys } from '../../testing/admin-fixtures';
import { ReceiptSigningKey } from './receipt-signing-key';

const SIGNING_KEYS_URL = '/api/admin/donations/receipt-signing-keys';

describe('Given the receipt signing key section of the receipt settings', () => {
  let fixture: ComponentFixture<ReceiptSigningKey>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceiptSigningKey],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReceiptSigningKey);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

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

  async function load(body: object, status = 200): Promise<void> {
    http
      .expectOne({ method: 'GET', url: SIGNING_KEYS_URL })
      .flush(body, status === 200 ? undefined : { status, statusText: 'Error' });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('when it opens, then it says the key is loading', () => {
    expect(text('[role="status"]')).toBe('Načítáme klíč…');
    http.expectOne(SIGNING_KEYS_URL).flush(receiptSigningKeys());
  });

  it('when the published key arrives, then its id, its registration time in Prague and that it is published are shown, read only', async () => {
    await load(receiptSigningKeys());

    expect(text('h2')).toBe('Klíč k ověřovacím QR kódům');
    expect(text('.ui-card__intro')).toBe(
      'Tímto klíčem server podepisuje ověřovací QR kódy na potvrzeních o daru. Jeho veřejnou část web zveřejňuje, aby se podle ní dala potvrzení ověřit. Klíč vytvořil server sám a tady se nedá změnit.',
    );
    expect(rows()).toEqual({
      'Klíč serveru': '21fe31df',
      Zaregistrovaný: '13. 11. 2026 12:00',
      Stav: 'Zveřejněný',
    });
    expect(fixture.nativeElement.querySelector('button, input')).toBeNull();
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
    await load({ currentKeyId: '21fe31df', currentKeyPublished: false, keys: [] });

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
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await load(receiptSigningKeys());

    expect(rows()['Klíč serveru']).toBe('21fe31df');
  });
});
