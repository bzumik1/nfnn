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
import { newsArticle } from '../testing/news-fixtures';
import { draftProject, project } from '../testing/project-fixtures';
import { Home } from './home';
import { foundationPaymentDetails } from '../../donations/testing/payment-details-fixtures';
import { spayd } from '../../donations/spayd';
import { drawsText } from '../../../shared/ui/qr-code/testing/branded-qr';

const PAYMENT_DETAILS_URL = '/api/donations/payment-details';

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
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  }

  function expectHomeRequest(): TestRequest {
    const request = http.expectOne('/api/content/home');
    request.flush({ news: [], projects: [] });
    return request;
  }

  function expectDetailsRequest(): TestRequest {
    const request = http.expectOne(PAYMENT_DETAILS_URL);
    request.flush(foundationPaymentDetails());
    return request;
  }

  async function drawsPayment(variableSymbol?: string): Promise<boolean> {
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
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
    await settle();

    expectHomeRequest();
    expectDetailsRequest();
    expect(await drawsPayment()).toBe(true);
  });

  it('when the home content arrives, then the news and the projects show it and link to their pages', async () => {
    await settle();
    expectDetailsRequest();
    http.expectOne('/api/content/home').flush({
      news: [newsArticle()],
      projects: [project(), draftProject({ publishedOn: '2026-10-01' })],
    });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('#aktuality .news-link')?.getAttribute('href')).toBe(
      '/aktuality/zahrada-pro-deti',
    );
    expect(root.querySelectorAll('#aktuality .news-card')).toHaveLength(1);
    expect(
      Array.from(root.querySelectorAll('#projekty .card-link')).map((link) => [
        link.getAttribute('href'),
        link.textContent?.trim(),
      ]),
    ).toEqual([
      ['/projekty/zahrada-pro-deti', 'Zahrada pro děti'],
      ['/projekty/beneficni-koncert', 'Benefiční koncert'],
    ]);
  });

  it('when the home content is empty or cannot be loaded, then the placeholder cards stay', async () => {
    await settle();
    expectDetailsRequest();
    http.expectOne('/api/content/home').flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('#aktuality .news-card')).toHaveLength(3);
    expect(root.querySelectorAll('#projekty app-project-card')).toHaveLength(3);
    expect(root.querySelector('#aktuality a, #projekty a')).toBeNull();
  });

  describe('Given a signed-in donor', () => {
    it('when the page opens, then the drawn QR payment carries their variable symbol', async () => {
      donor.set(sampleDonor({ variableSymbol: '4242424242' }));

      await settle();

      expectHomeRequest();
      expectDetailsRequest();
      expect(await drawsPayment('4242424242')).toBe(true);
    });

    it('when the page opens, then the donate section says who pays and with which symbol', async () => {
      donor.set(sampleDonor({ name: 'Jana Nováková', variableSymbol: '4242424242' }));

      await settle();

      expectHomeRequest();
      expectDetailsRequest();
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement)
          .querySelector('.before-pay')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim(),
      ).toBe('Platíte jako Jana Nováková, variabilní symbol 4242424242.');
    });
  });
});
