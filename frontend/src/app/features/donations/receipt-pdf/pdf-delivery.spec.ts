import { TestBed } from '@angular/core/testing';
import { PDF_DELIVERY_NAVIGATOR, PdfDelivery, ShareableNavigator } from './pdf-delivery';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const FILE = {
  blob: new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
  fileName: 'potvrzeni-o-darech-2026.pdf',
};

function delivery(navigator: ShareableNavigator): PdfDelivery {
  TestBed.configureTestingModule({
    providers: [{ provide: PDF_DELIVERY_NAVIGATOR, useValue: navigator }],
  });
  return TestBed.inject(PdfDelivery);
}

describe('Given a phone or tablet of Apple that can share files', () => {
  let share: ReturnType<typeof vi.fn<(data: ShareData) => Promise<void>>>;
  let shareable: ShareableNavigator;

  beforeEach(() => {
    share = vi.fn<(data: ShareData) => Promise<void>>().mockResolvedValue(undefined);
    shareable = { userAgent: IPHONE, maxTouchPoints: 5, canShare: () => true, share };
  });

  it('when a receipt is ready, then it waits for a second tap, because the long drawing used up the first one', () => {
    expect(delivery(shareable).needsSecondTap(FILE)).toBe(true);
  });

  it('when it is an iPad that presents itself as a Mac, then it waits for the second tap too', () => {
    expect(delivery({ ...shareable, userAgent: IPAD_AS_MAC }).needsSecondTap(FILE)).toBe(true);
  });

  it('when the second tap shares it, then the share sheet gets the PDF under its file name', async () => {
    const outcome = await delivery(shareable).share(FILE);

    expect(outcome).toBe('shared');
    const [{ files, title }] = share.mock.calls[0] as [{ files: File[]; title: string }];
    expect(files[0].name).toBe('potvrzeni-o-darech-2026.pdf');
    expect(files[0].type).toBe('application/pdf');
    expect(title).toBe('potvrzeni-o-darech-2026.pdf');
  });

  it('when the donor closes the share sheet, then it counts as dismissed, not as a failure', async () => {
    share.mockRejectedValue(new DOMException('closed', 'AbortError'));

    expect(await delivery(shareable).share(FILE)).toBe('dismissed');
  });

  it('when the share sheet fails, then it says so', async () => {
    share.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));

    expect(await delivery(shareable).share(FILE)).toBe('failed');
  });
});

describe('Given a browser that downloads files itself', () => {
  it('when it is a desktop that could also share files, then the receipt downloads at once', () => {
    expect(
      delivery({ userAgent: DESKTOP, maxTouchPoints: 0, canShare: () => true }).needsSecondTap(
        FILE,
      ),
    ).toBe(false);
  });

  it('when it is an Apple phone without file sharing, then the receipt downloads at once', () => {
    expect(delivery({ userAgent: IPHONE, maxTouchPoints: 5 }).needsSecondTap(FILE)).toBe(false);
  });

  it('when it is a Mac without touch, then the receipt downloads at once', () => {
    expect(
      delivery({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0, canShare: () => true }).needsSecondTap(
        FILE,
      ),
    ).toBe(false);
  });
});
