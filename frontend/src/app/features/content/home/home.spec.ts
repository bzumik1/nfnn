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
import { aboutPhoto } from '../testing/about-fixtures';
import { newsArticle } from '../testing/news-fixtures';
import { publicPeople } from '../testing/people-fixtures';
import { draftProject, project } from '../testing/project-fixtures';
import { Home } from './home';
import { checkerboard } from '../../../shared/ui/qr-code/testing/qr-matrices';

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

  function expectHomeRequest(): TestRequest {
    const request = http.expectOne('/api/content/home');
    request.flush({ news: [], projects: [] });
    return request;
  }

  function qrPayment(amount: string | null): object {
    return {
      spayd: `SPD*1.0*ACC:CZ2620100000005544332217*AM:${amount}.00*CC:CZK`,
      qrCode: checkerboard(25),
      bankAccount: {
        accountNumber: '5544332217/2010',
        iban: 'CZ2620100000005544332217',
        recipientName: 'Nadační fond Nová naděje',
      },
    };
  }

  function expectQrRequest(): TestRequest {
    const request = http.expectOne((candidate) => candidate.url === PAYMENT_QR_URL);
    request.flush(qrPayment(request.request.params.get('amount')));
    http
      .match((candidate) => candidate.url === PAYMENT_QR_URL)
      .forEach((prefetch) => prefetch.flush(qrPayment(prefetch.request.params.get('amount'))));
    return request;
  }

  it('when nobody is signed in, then the QR payment is asked for without a variable symbol', async () => {
    await settle();

    expectHomeRequest();
    expect(expectQrRequest().request.params.has('variableSymbol')).toBe(false);
  });

  it('when the home content arrives, then the news and the projects show it and link to their pages', async () => {
    await settle();
    expectQrRequest();
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
    expectQrRequest();
    http.expectOne('/api/content/home').flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('#aktuality .news-card')).toHaveLength(3);
    expect(root.querySelectorAll('#projekty app-project-card')).toHaveLength(3);
    expect(root.querySelector('#aktuality a, #projekty a')).toBeNull();
  });

  it('when the home content carries a photo for the About section, then the section shows it instead of the placeholder', async () => {
    await settle();
    expectQrRequest();
    http
      .expectOne('/api/content/home')
      .flush({ news: [], projects: [], about: { photo: aboutPhoto() } });
    fixture.detectChanges();

    const section = (fixture.nativeElement as HTMLElement).querySelector('#o-nas')!;
    expect(section.querySelector('figure img')?.getAttribute('alt')).toBe(
      'Malý chlapec v náručí dvou dospělých',
    );
    expect(section.querySelector('img[src^="/images/about-"]')).toBeNull();
  });

  it('when the home content carries the people of the foundation, then the block of who runs it shows them instead of its own cards', async () => {
    await settle();
    expectQrRequest();
    http
      .expectOne('/api/content/home')
      .flush({ news: [], projects: [], about: { photo: null }, people: publicPeople() });
    fixture.detectChanges();

    const board = (fixture.nativeElement as HTMLElement).querySelector('#o-nas .board')!;
    expect(board.querySelector('.board-name')?.textContent?.trim()).toBe('Eva Vzorová');
    expect(board.querySelector('.founders-note')).not.toBeNull();
    expect(board.querySelector('img[src^="/images/"]')).toBeNull();
  });

  it('when the home content keeps no people of the foundation, then the block of who runs it keeps its own cards', async () => {
    await settle();
    expectQrRequest();
    http
      .expectOne('/api/content/home')
      .flush({ news: [], projects: [], about: { photo: null }, people: null });
    fixture.detectChanges();

    const board = (fixture.nativeElement as HTMLElement).querySelector('#o-nas .board')!;
    expect(board.querySelectorAll('.board-person img[src^="/images/"]').length).toBe(2);
    expect(board.querySelector('.founders-note')).toBeNull();
  });

  it('when the home content has no About photo or cannot be loaded, then the About section keeps its placeholder photo', async () => {
    await settle();
    expectQrRequest();
    http.expectOne('/api/content/home').flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    const section = (fixture.nativeElement as HTMLElement).querySelector('#o-nas')!;
    expect(section.querySelector('figure')).toBeNull();
    expect(section.querySelector('img')?.getAttribute('src')).toBe('/images/about-720.webp');
  });

  describe('Given a signed-in donor', () => {
    it('when the page opens, then the QR payment carries their variable symbol', async () => {
      donor.set(sampleDonor({ variableSymbol: '4242424242' }));

      await settle();

      expectHomeRequest();
      expect(expectQrRequest().request.params.get('variableSymbol')).toBe('4242424242');
    });

    it('when the page opens, then the donate section says who pays and with which symbol', async () => {
      donor.set(sampleDonor({ name: 'Jana Nováková', variableSymbol: '4242424242' }));

      await settle();

      expectHomeRequest();
      expectQrRequest();
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
