import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { Donor } from '../../../core/auth/donor';
import { sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { spayd } from '../../donations/spayd';
import { foundationPaymentDetails } from '../../donations/testing/payment-details-fixtures';
import { drawsText } from '../../../shared/ui/qr-code/testing/branded-qr';
import { DonatePage } from './donate-page';

describe('Given the Přispět page', () => {
  const donor = signal<Donor | null>(null);
  let fixture: ComponentFixture<DonatePage>;
  let http: HttpTestingController;

  beforeEach(async () => {
    donor.set(null);
    await TestBed.configureTestingModule({
      imports: [DonatePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthStore, useValue: { donor: donor.asReadonly() } },
      ],
    }).compileComponents();
    vi.useFakeTimers();
    fixture = TestBed.createComponent(DonatePage);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  async function open(): Promise<void> {
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne('/api/donations/payment-details').flush(foundationPaymentDetails());
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  }

  function drawsPayment(variableSymbol?: string): boolean {
    const payment = spayd(foundationPaymentDetails(), { amountMinor: 50000, variableSymbol });
    return (
      'spayd' in payment &&
      drawsText(
        (fixture.nativeElement as HTMLElement).querySelector('.qr-image svg[role="img"]'),
        payment.spayd,
      )
    );
  }

  it('when nobody is signed in, then the payment details are asked for once and the drawn QR payment carries no variable symbol', async () => {
    await open();

    expect(drawsPayment()).toBe(true);
  });

  it('when it opens, then its one level-one heading is about the gift', async () => {
    await open();

    expect(
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('h1')).map((h) =>
        h.textContent?.trim(),
      ),
    ).toEqual(['Přispějte na pomůcky pro děti']);
  });

  describe('Given a signed-in donor', () => {
    it('when the page opens, then the drawn QR payment carries their variable symbol', async () => {
      donor.set(sampleDonor({ variableSymbol: '4242424242' }));

      await open();

      expect(drawsPayment('4242424242')).toBe(true);
    });

    it('when the page opens, then the donate section says who pays and with which symbol', async () => {
      donor.set(sampleDonor({ name: 'Jana Nováková', variableSymbol: '4242424242' }));

      await open();

      expect(
        (fixture.nativeElement as HTMLElement)
          .querySelector('.before-pay')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim(),
      ).toBe('Platíte jako Jana Nováková, variabilní symbol 4242424242.');
    });
  });
});
