import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { Donor } from '../../../core/auth/donor';
import { sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { Home } from './home';

const PAYMENT_QR_URL = '/api/donations/payment-qr';
const DEBOUNCE_MS = 300;

describe('Given the home page', () => {
  const donor = signal<Donor | null>(null);
  let fixture: ComponentFixture<Home>;
  let http: HttpTestingController;

  beforeEach(async () => {
    donor.set(null);
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthStore, useValue: { donor: donor.asReadonly() } },
      ],
    }).compileComponents();
    vi.useFakeTimers();
    fixture = TestBed.createComponent(Home);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    fixture.detectChanges();
  }

  function expectQrRequest(): TestRequest {
    const request = http.expectOne((candidate) => candidate.url === PAYMENT_QR_URL);
    request.flush({
      spayd: 'SPD*1.0*ACC:CZ2620100000005544332217*AM:500.00*CC:CZK',
      qrPngBase64: 'png',
      bankAccount: {
        accountNumber: '5544332217/2010',
        iban: 'CZ2620100000005544332217',
        recipientName: 'Nadační fond Nová naděje',
      },
    });
    return request;
  }

  it('when nobody is signed in, then the QR payment is asked for without a variable symbol', async () => {
    await settle();

    expect(expectQrRequest().request.params.has('variableSymbol')).toBe(false);
  });

  describe('Given a signed-in donor', () => {
    it('when the page opens, then the QR payment carries their variable symbol', async () => {
      donor.set(sampleDonor({ variableSymbol: '4242424242' }));

      await settle();

      expect(expectQrRequest().request.params.get('variableSymbol')).toBe('4242424242');
    });
  });
});
