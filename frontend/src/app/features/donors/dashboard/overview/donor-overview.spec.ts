import { NgTemplateOutlet } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Connectivity } from '../../../../core/connectivity/connectivity';
import { DonationItem, DonationSummaryResponse } from '../../../donations/donations-api';
import { twoYearDonations, twoYearSummary } from '../../../donations/testing/donation-fixtures';
import { LOADING_TIMINGS } from '../../../../shared/ui/skeleton/loading-view';
import { PdfProgress } from '../../../../shared/ui/pdf-progress/pdf-progress';
import { Skeleton } from '../../../../shared/ui/skeleton/skeleton';
import { DonorDonations } from '../donor-donations';
import { DonorOverview } from './donor-overview';
import { withOrdinarySpaces } from '../../../../../testing/ordinary-spaces';

type LoadState = 'loading' | 'ready' | 'error';

describe("Given the donor's overview while the gifts load", () => {
  let fixture: ComponentFixture<DonorOverview>;
  const state = signal<LoadState>('loading');
  const items = signal<readonly DonationItem[]>([]);
  const summary = signal<DonationSummaryResponse | null>(null);
  const offline = signal(false);

  beforeEach(() => {
    state.set('loading');
    items.set([]);
    summary.set(null);
    offline.set(false);
    TestBed.configureTestingModule({
      imports: [DonorOverview],
      providers: [
        provideRouter([]),
        { provide: Connectivity, useValue: { offline } },
        {
          provide: LOADING_TIMINGS,
          useValue: () => ({ delayMs: 300, minimumMs: 400, appearMs: 300 }),
        },
        { provide: AuthStore, useValue: { donor: signal(null) } },
        {
          provide: DonorDonations,
          useValue: {
            state,
            items,
            summary,
            receiptError: signal(null),
            accountsWithQuestion: signal([]),
            offersDiagnostics: signal(false),
            checkBankIfStale: vi.fn(),
            yearlyDownloading: () => false,
            yearlyTarget: () => null,
            yearlyButton: () => 'download',
            yearlyProgress: () => null,
            downloadYearlyReceipt: vi.fn(),
            cancelYearlyReceipt: vi.fn(),
          },
        },
      ],
    });
    TestBed.overrideComponent(DonorOverview, {
      set: {
        imports: [NgTemplateOutlet, RouterLink, Skeleton, PdfProgress],
        schemas: [CUSTOM_ELEMENTS_SCHEMA],
      },
    });
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  async function open(): Promise<void> {
    fixture = TestBed.createComponent(DonorOverview);
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  }

  async function wait(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
  }

  async function answer(): Promise<void> {
    items.set(twoYearDonations().items);
    summary.set(twoYearSummary());
    state.set('ready');
    await settle();
  }

  const root = () => fixture.nativeElement as HTMLElement;
  const all = (selector: string) => [...root().querySelectorAll<HTMLElement>(selector)];
  const statusLines = () =>
    all('[role="status"]')
      .map((line) => (withOrdinarySpaces(line.textContent) ?? '').replace(/\s+/g, ' ').trim())
      .filter((line) => line !== '');

  it('when the answer takes longer than the delay, then the place of the skeletons is held from the start, they show only after the delay, hidden from screen readers, one status line names the loading and Poslat dar stays', async () => {
    await open();
    const place = root().querySelector('.overview-skeletons');
    expect(place).not.toBeNull();
    expect(place!.getAttribute('aria-hidden')).toBe('true');
    expect(place!.classList).not.toContain('overview-skeletons--shown');
    expect(all('.overview-skeletons app-skeleton').length).toBeGreaterThan(0);
    expect(statusLines()).toEqual(['Načítáme vaše dary…']);

    await wait(300);

    expect(root().querySelector('.overview-skeletons')).toBe(place);
    expect(place!.classList).toContain('overview-skeletons--shown');
    const skeletons = all('app-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
    expect(skeletons.every((skeleton) => skeleton.getAttribute('aria-hidden') === 'true')).toBe(
      true,
    );
    expect(statusLines()).toEqual(['Načítáme vaše dary…']);
    const sendGift = root().querySelector('app-send-gift');
    expect(sendGift).not.toBeNull();
    expect(
      sendGift!.compareDocumentPosition(skeletons.at(-1)!) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it('when the gifts arrive after the skeleton showed, then it stays for its minimum, the cards appear together and nothing is announced', async () => {
    await open();
    await wait(300);

    await answer();
    expect(all('app-skeleton').length).toBeGreaterThan(0);
    expect(root().querySelector('.last-gift')).toBeNull();

    await wait(400);

    expect(all('app-skeleton')).toEqual([]);
    for (const card of ['.overview-stats', '.last-gift', '.recent-card']) {
      expect(root().querySelector(card)?.classList).toContain('ui-skeleton-reveal');
    }
    expect(statusLines()).toEqual([]);
  });

  it('when the gifts arrive before the delay, then the held place never shows a skeleton and the cards take it without appearing', async () => {
    await open();
    await wait(100);
    expect(root().querySelector('.overview-skeletons--shown')).toBeNull();

    await answer();
    expect(root().querySelector('.overview-skeletons')).toBeNull();
    await wait(300);

    expect(all('app-skeleton')).toEqual([]);
    expect(root().querySelector('.last-gift')?.classList).not.toContain('ui-skeleton-reveal');
  });

  it('when gifts with a long total arrive, then every amount is its digit groups and Kč as separate pieces that still read as one figure', async () => {
    await open();
    items.set(twoYearDonations().items);
    summary.set({
      ...twoYearSummary(),
      totalAmountMinor: 125206350,
      byYear: [{ year: 2026, count: 2, totalAmountMinor: 100000050 }],
    });
    state.set('ready');
    await settle();
    await wait(400);

    const figures = all('.stat-value.ui-figures, .last-gift-amount');
    expect(figures.map((figure) => [...figure.children].map((piece) => piece.textContent))).toEqual(
      [
        ['1', '252', '063,50', 'Kč'],
        ['1', '000', '000,50', 'Kč'],
        ['500', 'Kč'],
      ],
    );
    expect(figures.map((figure) => figure.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '1 252 063,50 Kč',
      '1 000 000,50 Kč',
      '500 Kč',
    ]);
  });

  it('when the device is offline, then the failure shows at once in place of the skeleton', async () => {
    await open();
    await wait(300);

    offline.set(true);
    state.set('error');
    await settle();

    expect(all('app-skeleton')).toEqual([]);
    expect(root().querySelector('app-donations-pending')).not.toBeNull();
    expect(root().querySelector('app-donations-pending')?.classList).not.toContain(
      'ui-skeleton-reveal',
    );
  });

  it('when the gifts fail after the skeleton showed, then the skeleton stays for its minimum and the failure is revealed in its place', async () => {
    await open();
    await wait(300);

    state.set('error');
    await settle();
    expect(all('app-skeleton').length).toBeGreaterThan(0);
    expect(root().querySelector('app-donations-pending')).toBeNull();

    await wait(400);

    expect(all('app-skeleton')).toEqual([]);
    expect(root().querySelector('app-donations-pending')?.classList).toContain(
      'ui-skeleton-reveal',
    );
  });
});
