import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PaymentDetailsStore } from '../../donations/payment-details-store';
import { foundationPaymentDetails } from '../../donations/testing/payment-details-fixtures';
import { AccountingDetails } from './accounting-details';

describe('Given the details an accountant needs in the contact section', () => {
  let fixture: ComponentFixture<AccountingDetails>;
  let http: HttpTestingController;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await TestBed.configureTestingModule({
      imports: [AccountingDetails],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function show(): Promise<void> {
    fixture = TestBed.createComponent(AccountingDetails);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function receiveFoundationAccount(): void {
    TestBed.inject(PaymentDetailsStore).load();
    http.expectOne('/api/donations/payment-details').flush(foundationPaymentDetails());
  }

  function text(element: Element | null): string {
    return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(): string[][] {
    return Array.from(root().querySelectorAll('dt')).map((term) => [
      text(term),
      text(term.nextElementSibling?.querySelector('.accounting-value') ?? null),
    ]);
  }

  async function copy(name: string): Promise<void> {
    const button = Array.from(root().querySelectorAll('button')).find(
      (candidate) => text(candidate) === name,
    );
    button!.click();
    await fixture.whenStable();
  }

  describe('when the site already knows the foundation account', () => {
    beforeEach(async () => {
      receiveFoundationAccount();
      await show();
    });

    it('then one block under its own heading lists the name, IČO, seat, registry entry, account and IBAN', () => {
      expect(text(root().querySelector('h3'))).toBe('Údaje pro účetní');
      expect(rows()).toEqual([
        ['Název', 'Nová naděje - nadační fond'],
        ['IČO', '27278794'],
        ['Sídlo', 'Jiráskova 436, 473 01 Nový Bor'],
        ['Zápis', 'nadační rejstřík vedený Krajským soudem v Ústí nad Labem, oddíl N, vložka 78'],
        ['Číslo účtu', '5544332217/2010'],
        ['IBAN', 'CZ26 2010 0000 0055 4433 2217'],
      ]);
    });

    it('then the IČO, the seat, the account and the IBAN each copy as typed into accounting', async () => {
      await copy('Kopírovat IČO');
      await copy('Kopírovat sídlo');
      await copy('Kopírovat číslo účtu');
      await copy('Kopírovat IBAN');

      expect(writeText.mock.calls).toEqual([
        ['27278794'],
        ['Jiráskova 436, 473 01 Nový Bor'],
        ['5544332217/2010'],
        ['CZ2620100000005544332217'],
      ]);
    });

    it('then a line under the details says how a company gets its receipt', () => {
      expect(text(root().querySelector('.accounting-note'))).toBe(
        'Potvrzení o daru na firmu získáte, když si při registraci zvolíte Firma a vyplníte IČO.',
      );
    });
  });

  describe('when the foundation account has not arrived', () => {
    beforeEach(show);

    it('then the account row leads to Přispět instead of a number, and the IBAN row waits', () => {
      const account = Array.from(root().querySelectorAll('dt')).find(
        (term) => text(term) === 'Číslo účtu',
      )!;
      const link = account.nextElementSibling!.querySelector('a')!;

      expect(text(link)).toBe('Najdete ho v sekci Přispět');
      expect(link.getAttribute('href')).toBe('/#prispet');
      expect(rows().map(([label]) => label)).not.toContain('IBAN');
    });

    it('and it arrives later, then the number and the IBAN appear', async () => {
      receiveFoundationAccount();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(rows().slice(-2)).toEqual([
        ['Číslo účtu', '5544332217/2010'],
        ['IBAN', 'CZ26 2010 0000 0055 4433 2217'],
      ]);
    });
  });
});
