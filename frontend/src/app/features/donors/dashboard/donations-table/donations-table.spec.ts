import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CompactLayout } from '../../../../core/layout/compact-layout';
import { DonationItem } from '../../../donations/donations-api';
import { DonorDonations } from '../donor-donations';
import { DonationsTable } from './donations-table';

interface Watch {
  target: Element;
  callback: ResizeObserverCallback;
  observer: object;
}

const REFUNDED_GIFT = {
  id: '0192f0f1-0000-7000-8000-000000000001',
  receivedAt: '2026-01-05',
  amountMinor: 30000,
  currency: 'CZK',
  purpose: 'Obecný příspěvek',
  status: 'REFUNDED',
  receiptAvailable: false,
  accountVerification: false,
  pairedBy: 'VARIABLE_SYMBOL',
  senderAccount: null,
  confirmedSymbol: null,
} as unknown as DonationItem;

describe('Given the gifts table of the donor portal', () => {
  const root = document.documentElement;
  let watches: Watch[];
  let windowWidth: number;

  beforeEach(() => {
    watches = [];
    windowWidth = 1280;
    vi.stubGlobal('innerWidth', windowWidth);
    vi.stubGlobal('matchMedia', (media: string) => ({
      media,
      get matches(): boolean {
        const limit = /^\(max-width: (\d+)px\)$/.exec(media);
        return limit !== null && windowWidth <= Number(limit[1]);
      },
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
    }));
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: ResizeObserverCallback) {}

        observe(target: Element): void {
          watches.push({ target, callback: this.callback, observer: this });
        }

        disconnect(): void {
          watches = watches.filter((watch) => watch.observer !== this);
        }
      },
    );
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DonorDonations,
          useValue: {
            onYearlyReceipt: () => false,
            receiptsFrom: () => null,
            singleError: () => null,
            offersDiagnostics: () => false,
          },
        },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    root.style.removeProperty('font-size');
    document.body.replaceChildren();
  });

  function shown(width: number, rootFontPx = 16): ComponentFixture<DonationsTable> {
    root.style.fontSize = `${rootFontPx}px`;
    const fixture = TestBed.createComponent(DonationsTable);
    fixture.componentRef.setInput('items', [REFUNDED_GIFT]);
    const host = fixture.nativeElement as HTMLElement;
    host.style.width = `${width}px`;
    document.body.append(host);
    fixture.detectChanges();
    return fixture;
  }

  function resize(fixture: ComponentFixture<DonationsTable>, inlineSize: number): void {
    const host = fixture.nativeElement as HTMLElement;
    host.style.width = `${inlineSize}px`;
    watches
      .filter((watch) => watch.target === host)
      .forEach((watch) =>
        watch.callback(
          [
            {
              target: host,
              contentBoxSize: [{ inlineSize, blockSize: 0 }],
              contentRect: { width: inlineSize },
            } as unknown as ResizeObserverEntry,
          ],
          watch.observer as ResizeObserver,
        ),
      );
    fixture.detectChanges();
  }

  function enlargeText(fixture: ComponentFixture<DonationsTable>, rootFontPx: number): void {
    const host = fixture.nativeElement as HTMLElement;
    root.style.fontSize = `${rootFontPx}px`;
    watches
      .filter((watch) => watch.target !== host)
      .forEach((watch) => watch.callback([], watch.observer as ResizeObserver));
    fixture.detectChanges();
  }

  function headers(fixture: ComponentFixture<DonationsTable>): string[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('th')].map((header) =>
      (header.textContent ?? '').trim(),
    );
  }

  function isNarrow(fixture: ComponentFixture<DonationsTable>): boolean {
    return (fixture.nativeElement as HTMLElement).classList.contains('donations-table--narrow');
  }

  it('when its container is as wide as ledger in text widths at its first render, then the table is narrow without Stav before any resize is reported', () => {
    const fixture = shown(864);

    expect(isNarrow(fixture)).toBe(true);
    expect(headers(fixture)).toEqual(['Datum', 'Částka', 'Účel', 'Potvrzení']);
  });

  it('when its container is a fraction of a pixel wider than ledger, then the table is full with Stav', () => {
    const fixture = shown(864.5);

    expect(isNarrow(fixture)).toBe(false);
    expect(headers(fixture)).toEqual(['Datum', 'Částka', 'Účel', 'Stav', 'Potvrzení']);
  });

  it('when the root text is 17 px, as in the home-screen app, and its container is 918 px, which is ledger in text widths, then the table is narrow', () => {
    expect(isNarrow(shown(918, 17))).toBe(true);
  });

  it('when the root text is 17 px and its container is 918.5 px, then the table is full', () => {
    expect(isNarrow(shown(918.5, 17))).toBe(false);
  });

  it('when its container widens past ledger and narrows again, then the table follows the reported content box', () => {
    const fixture = shown(800);

    resize(fixture, 900);
    const widened = isNarrow(fixture);
    resize(fixture, 863.25);

    expect(widened).toBe(false);
    expect(isNarrow(fixture)).toBe(true);
  });

  it('when it watches its width, then it watches its own host', () => {
    const fixture = shown(800);

    expect(watches.map((watch) => watch.target)).toContain(fixture.nativeElement);
  });

  it('when the table goes, then it stops watching its host', () => {
    const fixture = shown(800);
    const host = fixture.nativeElement as HTMLElement;

    fixture.destroy();

    expect(watches.filter((watch) => watch.target === host)).toEqual([]);
  });

  it('when a 2000 px window has a 32 px root, which is wider than nav in text widths, then a container of 1110 px (34.7 rem), under ledger in text widths, shows the narrow table', () => {
    windowWidth = 2000;
    vi.stubGlobal('innerWidth', windowWidth);

    const fixture = shown(1110, 32);

    expect(isNarrow(fixture)).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('table')).not.toBeNull();
  });

  it('when the root text of an open page grows from 16 to 32 px in a 2000 px window and its 1110 px container keeps its width, then the full table turns narrow without Stav', () => {
    windowWidth = 2000;
    vi.stubGlobal('innerWidth', windowWidth);
    const fixture = shown(1110);
    const fullBefore = !isNarrow(fixture);

    enlargeText(fixture, 32);

    expect(fullBefore).toBe(true);
    expect(isNarrow(fixture)).toBe(true);
    expect(headers(fixture)).toEqual(['Datum', 'Částka', 'Účel', 'Potvrzení']);
  });

  it('when the text is so large that the window is narrower than nav in text widths, then the list rows win over the narrow table', () => {
    windowWidth = 1798;
    vi.stubGlobal('innerWidth', windowWidth);

    const fixture = shown(1500, 32);

    expect(TestBed.inject(CompactLayout).listsAsRows()).toBe(true);
    expect(isNarrow(fixture)).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('table')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.donation-rows')).not.toBeNull();
  });

  it('when the browser cannot watch sizes, then the table is full, as before', () => {
    vi.stubGlobal('ResizeObserver', undefined);

    expect(isNarrow(shown(800))).toBe(false);
  });
});
