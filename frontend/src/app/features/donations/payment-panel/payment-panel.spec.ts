import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { QrCode } from '../../../shared/ui/qr-code/qr-code';
import { encodeText } from '../../../shared/ui/qr-code/qr-encoder';
import { QrMatrix } from '../../../shared/ui/qr-code/qr-matrix';
import { DonationItem } from '../donations-api';
import { GIFT_FEED } from '../gift-arrival/gift-feed';
import { FakeGiftFeed, giftItem } from '../gift-arrival/testing/gift-feed-fixtures';
import { foundationPaymentDetails, paymentQrCase } from '../testing/payment-details-fixtures';
import { LocalPaymentRoute } from './local-payment-route';
import { PaymentHandOffs } from './payment-hand-offs';
import { PaymentPanel } from './payment-panel';

const PAYMENT_DETAILS_URL = '/api/donations/payment-details';
const REDRAW_MS = 400;
const RESERVATION_ID = '6f1c1e9a-3c1b-4f53-9d55-0d0a9b1f2c11';
const QR_OF_500 = paymentQrCase('500 Kč without a variable symbol');
const QR_OF_1000 = paymentQrCase('1 000 Kč without a variable symbol');
const QR_OF_500_FOR_JANA = paymentQrCase('500 Kč with a ten-digit variable symbol');

function pngOf(matrix: QrMatrix): Blob {
  return new Blob([`png of ${matrix.modules}`], { type: 'image/png' });
}

function sharesOnlyImages(file: File): boolean {
  return file.type !== 'application/x-shortpaymentdescriptor';
}

const IMAGE_NOT_SHARED =
  'Nenašli jste v nabídce svou banku? Klepněte znovu, zvolte Uložit obrázek a v bankovní aplikaci načtěte QR platbu z Fotek. Nebo zkopírujte údaje výše do bankovní aplikace.';

function pngTextOf(spaydText: string): string {
  return `png of ${encodeText(spaydText, 'H').modules}`;
}

interface Downloaded {
  readonly name: string;
  readonly blob: Blob | undefined;
}

function readText(file: Blob): Promise<string> {
  return file.text();
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe('Given the payment panel on a phone or a tablet', () => {
  let created: ComponentFixture<PaymentPanel> | null;
  let http: HttpTestingController;
  let shared: ShareData[];
  let shareRefusal: Error | null;
  let shareAnswer: Promise<void> | null;
  let sharesFiles: (file: File) => boolean;
  let downloads: Downloaded[];
  let blobs: Map<string, Blob>;
  let compactLayout: WritableSignal<boolean>;

  beforeEach(async () => {
    compactLayout = signal(true);
    shared = [];
    shareRefusal = null;
    shareAnswer = null;
    sharesFiles = () => true;
    downloads = [];
    blobs = new Map();
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: () => Promise.resolve() },
      canShare: (data: ShareData) => (data.files ?? []).every((file) => sharesFiles(file)),
      share: async (data: ShareData) => {
        shared.push(data);
        if (shareAnswer) {
          await shareAnswer;
        }
        if (shareRefusal) {
          throw shareRefusal;
        }
      },
    });
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL(blob: Blob): string {
          const url = `blob:nfnn/${blobs.size + 1}`;
          blobs.set(url, blob);
          return url;
        }

        static override revokeObjectURL(): void {
          return;
        }
      },
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push({ name: this.download, blob: blobs.get(this.getAttribute('href') ?? '') });
    });
    vi.spyOn(QrCode.prototype, 'pngBlob').mockImplementation(function (this: QrCode) {
      return Promise.resolve(pngOf(this.matrix()));
    });

    await TestBed.configureTestingModule({
      imports: [PaymentPanel],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: CompactLayout, useValue: { isCompact: compactLayout.asReadonly() } },
      ],
    }).compileComponents();
    vi.useFakeTimers();
    created = null;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function panel(): ComponentFixture<PaymentPanel> {
    created ??= TestBed.createComponent(PaymentPanel);
    return created;
  }

  function element<T extends HTMLElement>(selector: string): T {
    return panel().nativeElement.querySelector(selector) as T;
  }

  function squashed(selector: string): string {
    return (element(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(panel().nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
  }

  function button(label: string): HTMLButtonElement {
    const match = buttons().find(
      (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === label,
    );
    if (!match) {
      throw new Error(`No button labelled "${label}"`);
    }
    return match;
  }

  function otherDevice(): HTMLButtonElement {
    return element<HTMLButtonElement>('.other-device');
  }

  function qrRegion(): HTMLElement {
    return element(`#${otherDevice().getAttribute('aria-controls')}`);
  }

  function handoffStatus(): string {
    return squashed('.bank-app-status');
  }

  async function settle(milliseconds = 0): Promise<void> {
    panel().detectChanges();
    await vi.advanceTimersByTimeAsync(milliseconds);
    panel().detectChanges();
  }

  async function openWithQr(): Promise<void> {
    await settle();
    http
      .expectOne((request) => request.url === PAYMENT_DETAILS_URL)
      .flush(foundationPaymentDetails());
    await settle();
  }

  async function tap(label: string): Promise<void> {
    button(label).click();
    await settle();
  }

  it('when it opens, then the bank details come first, then Otevřít v aplikaci banky, Poslat QR jako obrázek and the QR folded under Platíte z jiného zařízení?', async () => {
    sharesFiles = sharesOnlyImages;
    await openWithQr();

    const order = Array.from(
      panel().nativeElement.querySelectorAll(
        '.bank, .bank-app-open, .bank-app-second, .other-device, .qr',
      ) as NodeListOf<Element>,
    ).map((part) => part.classList[0]);
    expect(order).toEqual(['bank', 'bank-app-open', 'bank-app-second', 'other-device', 'qr']);
    expect(squashed('.bank-app-open')).toBe('Otevřít v aplikaci banky');
    expect(squashed('.bank-app-second')).toBe('Poslat QR jako obrázek');
    expect(squashed('.other-device')).toBe(
      'Platíte z jiného zařízení? Zobrazit QR kód ke skenování',
    );
    expect(otherDevice().getAttribute('aria-expanded')).toBe('false');
    expect(qrRegion().hidden).toBe(true);
    expect(qrRegion().classList.contains('qr')).toBe(true);
  });

  it('when it opens, then Bankovní spojení heads the bank details and still takes the focus', async () => {
    await openWithQr();

    const label = Array.from(
      panel().nativeElement.querySelectorAll('.bank p') as NodeListOf<HTMLElement>,
    ).find((candidate) => candidate.textContent?.trim() === 'Bankovní spojení');
    expect(label?.getAttribute('tabindex')).toBe('-1');
    expect(label?.nextElementSibling?.textContent).toContain('Číslo účtu');
  });

  it('when it opens, then Platíte z jiného zařízení? stays with the bank app buttons', async () => {
    await openWithQr();

    expect(otherDevice().closest('.bank-app')).not.toBeNull();
  });

  it('when the phone shares payment files too, then the second button offers the payment as a file', async () => {
    await openWithQr();

    expect(squashed('.bank-app-open')).toBe('Otevřít v aplikaci banky');
    expect(squashed('.bank-app-second')).toBe('Poslat jako soubor platby');
  });

  it('when the QR region is read out, then its name stays Platíte z jiného zařízení? whether it is folded or not', async () => {
    await openWithQr();

    const named = () => squashed(`#${qrRegion().getAttribute('aria-labelledby')}`);
    expect(named()).toBe('Platíte z jiného zařízení?');

    otherDevice().click();
    await settle();

    expect(named()).toBe('Platíte z jiného zařízení?');
  });

  it("when it sits in another card, then its QR region and disclosure carry that card's ids", async () => {
    panel().componentRef.setInput('idPrefix', 'gift');
    await openWithQr();

    expect(otherDevice().getAttribute('aria-controls')).toBe('gift-qr');
    expect(qrRegion().id).toBe('gift-qr');
    expect(element('#gift-other-device')?.textContent?.trim()).toBe('Platíte z jiného zařízení?');
  });

  it('when the visitor unfolds Platíte z jiného zařízení?, then the QR of the chosen amount shows with a line naming the amount, and folding hides it again', async () => {
    await openWithQr();

    otherDevice().click();
    await settle();

    expect(otherDevice().getAttribute('aria-expanded')).toBe('true');
    expect(qrRegion().hidden).toBe(false);
    expect(qrRegion().querySelector('svg[role="img"]')?.getAttribute('aria-label')).toBe(
      'QR platba na účet Nadačního fondu Nová naděje',
    );
    expect(squashed('.other-device')).toBe(
      'Platíte z jiného zařízení? Naskenujte kód aplikací banky',
    );
    expect(squashed('.qr-caption')).toBe('QR platba na účet Nadačního fondu Nová naděje, 500 Kč.');
    expect(element('.qr-caption').getAttribute('aria-hidden')).toBeNull();
    expect(element('.qr-save')).toBeNull();

    otherDevice().click();
    await settle();
    expect(otherDevice().getAttribute('aria-expanded')).toBe('false');
    expect(qrRegion().hidden).toBe(true);
  });

  it('when the visitor taps Otevřít v aplikaci banky, then the phone is offered the PNG of the QR drawn for the chosen amount and nothing more is said', async () => {
    await openWithQr();

    await tap('Otevřít v aplikaci banky');

    expect(shared).toHaveLength(1);
    const [file] = shared[0].files ?? [];
    expect(shared[0].title).toBe('QR platba');
    expect(file.name).toBe('QR platba Nová naděje 500 Kč.png');
    expect(file.type).toBe('image/png');
    expect(await readText(file)).toBe(pngTextOf(QR_OF_500.spayd));
    expect(downloads).toEqual([]);
    expect(handoffStatus()).toBe('');
  });

  it('when the visitor hands the payment to an app, then the hand-off is noted for the return to the site', async () => {
    await openWithQr();

    await tap('Otevřít v aplikaci banky');

    expect(TestBed.inject(PaymentHandOffs).handedOffAt()).not.toBeNull();
  });

  it('when the visitor closes the share offer without picking an app, then no hand-off is left noted', async () => {
    shareRefusal = new DOMException('Share canceled', 'AbortError');
    await openWithQr();

    await tap('Otevřít v aplikaci banky');

    expect(TestBed.inject(PaymentHandOffs).handedOffAt()).toBeNull();
  });

  it('when the phone offers the QR image, then a line says the offer is opening until it closes', async () => {
    const answer = deferred();
    shareAnswer = answer.promise;
    await openWithQr();

    await tap('Otevřít v aplikaci banky');
    expect(handoffStatus()).toBe('Otevíráme nabídku sdílení…');

    answer.resolve();
    await settle();
    expect(handoffStatus()).toBe('');
  });

  it('when the QR image is still being drawn, then Otevřít v aplikaci banky waits for it', async () => {
    vi.mocked(QrCode.prototype.pngBlob).mockReturnValue(new Promise<Blob>(() => undefined));
    await openWithQr();

    expect(element<HTMLButtonElement>('.bank-app-open').disabled).toBe(true);
  });

  it('when the QR image could not be drawn ahead, then Otevřít v aplikaci banky offers platba.spayd instead', async () => {
    vi.mocked(QrCode.prototype.pngBlob).mockRejectedValue(new Error('canvas lost'));
    await openWithQr();

    await tap('Otevřít v aplikaci banky');

    const [file] = shared[0].files ?? [];
    expect(file.name).toBe('platba.spayd');
    expect(await readText(file)).toBe(QR_OF_500.spayd);
  });

  it('when the visitor taps Poslat jako soubor platby, then the phone is offered platba.spayd holding the payment of the chosen amount and nothing more is said', async () => {
    await openWithQr();

    await tap('Poslat jako soubor platby');

    expect(shared).toHaveLength(1);
    const [file] = shared[0].files ?? [];
    expect(shared[0].title).toBe('QR platba');
    expect(file.name).toBe('platba.spayd');
    expect(file.type).toBe('application/x-shortpaymentdescriptor');
    expect(await readText(file)).toBe(QR_OF_500.spayd);
    expect(downloads).toEqual([]);
    expect(handoffStatus()).toBe('');
  });

  it('when the visitor taps Otevřít v aplikaci banky, then the phone is asked to share within the tap itself, before anything is awaited', async () => {
    await openWithQr();

    button('Otevřít v aplikaci banky').click();

    expect(shared).toHaveLength(1);
    await settle();
  });

  it('when the visitor closes the offer of the payment file without a bank, then a line points to the QR image', async () => {
    shareRefusal = new DOMException('Share canceled', 'AbortError');
    await openWithQr();

    await tap('Poslat jako soubor platby');

    expect(handoffStatus()).toBe(
      'Neotevřela se vám banka? Zkuste Otevřít v aplikaci banky, které pošle QR jako obrázek, nebo zkopírujte údaje výše do bankovní aplikace.',
    );
  });

  it('when the visitor taps again while the phone still offers the file, then it is offered once and the buttons say they wait without losing the focus', async () => {
    const answer = deferred();
    shareAnswer = answer.promise;
    await openWithQr();
    const open = button('Otevřít v aplikaci banky');
    open.focus();

    await tap('Otevřít v aplikaci banky');
    await tap('Otevřít v aplikaci banky');

    expect(shared).toHaveLength(1);
    expect(open.getAttribute('aria-disabled')).toBe('true');
    expect(open.disabled).toBe(false);
    expect(document.activeElement).toBe(open);
    expect(element('.bank-app-second').getAttribute('aria-disabled')).toBe('true');

    answer.resolve();
    await settle();
    expect(open.getAttribute('aria-disabled')).toBeNull();
  });

  it('when the visitor picks another amount while the phone still offers the file, then the answer to the old offer says nothing under the new amount', async () => {
    const answer = deferred();
    shareAnswer = answer.promise;
    shareRefusal = new DOMException('Share canceled', 'AbortError');
    await openWithQr();
    await tap('Otevřít v aplikaci banky');

    await tap('1 000 Kč');
    answer.resolve();
    await settle();

    expect(handoffStatus()).toBe('');
  });

  it('when the tablet turns to the computer layout and back while the phone offers the file, then the buttons come back ready and the answer still says how to pay without the bank', async () => {
    const answer = deferred();
    shareAnswer = answer.promise;
    shareRefusal = new DOMException('Share canceled', 'AbortError');
    await openWithQr();
    await tap('Otevřít v aplikaci banky');

    compactLayout.set(false);
    await settle();
    expect(element('.bank-app')).toBeNull();
    expect(element('.qr').hidden).toBe(false);
    compactLayout.set(true);
    answer.resolve();
    await settle();

    expect(qrRegion().hidden).toBe(true);
    expect(element<HTMLButtonElement>('.bank-app-open').getAttribute('aria-disabled')).toBeNull();
    expect(handoffStatus()).toBe(IMAGE_NOT_SHARED);
  });

  it('when the visitor picks 1 000 Kč and taps Otevřít v aplikaci banky, then the file holds the payment of 1 000 Kč', async () => {
    await openWithQr();
    await tap('1 000 Kč');

    await tap('Otevřít v aplikaci banky');

    expect(await readText((shared[0].files ?? [])[0])).toBe(pngTextOf(QR_OF_1000.spayd));
  });

  it('when the visitor picks 1 000 Kč and taps Otevřít v aplikaci banky, then the image offered is named after the foundation and the amount', async () => {
    await openWithQr();
    await tap('1 000 Kč');

    await tap('Otevřít v aplikaci banky');

    expect((shared[0].files ?? [])[0].name).toBe('QR platba Nová naděje 1 000 Kč.png');
  });

  it('when a signed-in donor taps Otevřít v aplikaci banky, then the file carries their variable symbol', async () => {
    panel().componentRef.setInput('variableSymbol', '1234567890');
    await openWithQr();

    await tap('Otevřít v aplikaci banky');

    expect(await readText((shared[0].files ?? [])[0])).toBe(pngTextOf(QR_OF_500_FOR_JANA.spayd));
  });

  it('when the visitor closes the offer without a bank, then a polite line says how to pay without it', async () => {
    shareRefusal = new DOMException('Share canceled', 'AbortError');
    await openWithQr();
    expect(element('.bank-app-status').getAttribute('role')).toBe('status');

    await tap('Otevřít v aplikaci banky');

    expect(handoffStatus()).toBe(IMAGE_NOT_SHARED);
  });

  it('when the phone refuses to offer the file, then the same line says how to pay without it', async () => {
    shareRefusal = new DOMException('Not allowed', 'NotAllowedError');
    await openWithQr();

    await tap('Otevřít v aplikaci banky');

    expect(handoffStatus()).toBe(IMAGE_NOT_SHARED);
    expect(downloads).toEqual([]);
  });

  it('when the line was said and the visitor picks another amount, then it goes away', async () => {
    shareRefusal = new DOMException('Share canceled', 'AbortError');
    await openWithQr();
    await tap('Otevřít v aplikaci banky');

    await tap('1 000 Kč');

    expect(handoffStatus()).toBe('');
  });

  it('when the browser cannot share the file, then platba.spayd downloads and a line says to open it and choose the bank', async () => {
    sharesFiles = (file) => file.type !== 'application/x-shortpaymentdescriptor';
    await openWithQr();

    await tap('Otevřít v aplikaci banky');

    expect(shared).toEqual([]);
    expect(downloads.map((download) => download.name)).toEqual(['platba.spayd']);
    expect(await readText(downloads[0].blob as Blob)).toBe(QR_OF_500.spayd);
    expect(handoffStatus()).toBe(
      'Soubor platba.spayd je ve stažených souborech. Některé bankovní aplikace po jeho otevření nabídnou platbu. Neotevřela se vám banka? Zkopírujte údaje výše do bankovní aplikace, nebo pošlete QR jako obrázek a v bance zvolte platbu z obrázku.',
    );
  });

  describe('when the browser cannot share the file and the service worker serves payment files', () => {
    let reservations: { readonly payment: string; readonly answer: (id: string | null) => void }[];
    let opened: string[];

    beforeEach(() => {
      sharesFiles = (file) => file.type !== 'application/x-shortpaymentdescriptor';
      reservations = [];
      opened = [];
      vi.spyOn(LocalPaymentRoute.prototype, 'reserve').mockImplementation(
        (payment: string) =>
          new Promise((answer) => {
            reservations.push({ payment, answer });
          }),
      );
      vi.spyOn(LocalPaymentRoute.prototype, 'open').mockImplementation((id: string) => {
        opened.push(id);
      });
    });

    it('then the tap reserves the payment of the chosen amount, opens it from the device, downloads nothing and a line says what to do if no bank opened', async () => {
      await openWithQr();

      await tap('Otevřít v aplikaci banky');
      expect(reservations.map((reservation) => reservation.payment)).toEqual([QR_OF_500.spayd]);
      reservations[0].answer(RESERVATION_ID);
      await settle();

      expect(shared).toEqual([]);
      expect(downloads).toEqual([]);
      expect(opened).toEqual([RESERVATION_ID]);
      expect(handoffStatus()).toBe(
        'Neotevřela se vám banka? Zkopírujte údaje výše do bankovní aplikace, nebo pošlete QR jako obrázek a v bance zvolte platbu z obrázku.',
      );
    });

    it('and the device is still getting the payment ready, then a line says the bank app is opening', async () => {
      await openWithQr();

      await tap('Otevřít v aplikaci banky');

      expect(handoffStatus()).toBe('Otevíráme platbu v aplikaci banky…');
      reservations[0].answer(RESERVATION_ID);
      await settle();
    });

    it('and the worker reserves nothing, then platba.spayd downloads as before', async () => {
      await openWithQr();

      await tap('Otevřít v aplikaci banky');
      reservations[0].answer(null);
      await settle();

      expect(opened).toEqual([]);
      expect(downloads.map((download) => download.name)).toEqual(['platba.spayd']);
      expect(await readText(downloads[0].blob as Blob)).toBe(QR_OF_500.spayd);
      expect(handoffStatus()).toContain('Soubor platba.spayd je ve stažených souborech.');
    });

    for (const [name, id] of [
      ['reserves the earlier payment', RESERVATION_ID],
      ['reserves nothing', null],
    ] as const) {
      it(`and the visitor picks another amount before the worker ${name}, then the earlier payment neither opens nor downloads and nothing is said`, async () => {
        await openWithQr();

        await tap('Otevřít v aplikaci banky');
        await tap('1 000 Kč');
        await settle(REDRAW_MS);
        reservations[0].answer(id);
        await settle();

        expect(opened).toEqual([]);
        expect(downloads).toEqual([]);
        expect(handoffStatus()).toBe('');
      });
    }
  });

  it('when the visitor taps Poslat QR jako obrázek, then the phone is offered the PNG of the QR drawn for the chosen amount', async () => {
    sharesFiles = sharesOnlyImages;
    await openWithQr();

    button('Poslat QR jako obrázek').click();

    expect(shared).toHaveLength(1);
    const [file] = shared[0].files ?? [];
    expect(file.name).toBe('QR platba Nová naděje 500 Kč.png');
    expect(file.type).toBe('image/png');
    expect(shared[0].title).toBe('QR platba');
    expect(await readText(file)).toBe(pngTextOf(QR_OF_500.spayd));
    await settle();
    expect(downloads).toEqual([]);
  });

  it('when the visitor picks 1 000 Kč and taps Poslat QR jako obrázek, then the image shared is the QR drawn for 1 000 Kč', async () => {
    sharesFiles = sharesOnlyImages;
    await openWithQr();
    await tap('1 000 Kč');

    button('Poslat QR jako obrázek').click();

    expect(await readText((shared[0].files ?? [])[0])).toBe(pngTextOf(QR_OF_1000.spayd));
    await settle();
  });

  it('when the QR image is still being drawn, then Poslat QR jako obrázek waits for it', async () => {
    sharesFiles = sharesOnlyImages;
    vi.mocked(QrCode.prototype.pngBlob).mockReturnValue(new Promise<Blob>(() => undefined));
    await openWithQr();

    expect(element<HTMLButtonElement>('.bank-app-second').disabled).toBe(true);
    expect(element<HTMLButtonElement>('.bank-app-open').disabled).toBe(false);
  });

  it('when the QR image could not be drawn ahead, then Poslat QR jako obrázek saves it instead and says where it is', async () => {
    sharesFiles = sharesOnlyImages;
    vi.mocked(QrCode.prototype.pngBlob)
      .mockRejectedValueOnce(new Error('canvas lost'))
      .mockImplementation(function (this: QrCode) {
        return Promise.resolve(pngOf(this.matrix()));
      });
    await openWithQr();

    await tap('Poslat QR jako obrázek');

    expect(shared).toEqual([]);
    expect(downloads.map((download) => download.name)).toEqual(['qr-platba-nova-nadeje.png']);
    expect(handoffStatus()).toBe(
      'QR kód qr-platba-nova-nadeje.png je uložený. Najdete ho ve stažených souborech.',
    );
  });

  it('when the phone refuses to share the QR image, then the image downloads instead and a line says where it is', async () => {
    sharesFiles = sharesOnlyImages;
    shareRefusal = new DOMException('Not allowed', 'NotAllowedError');
    await openWithQr();

    await tap('Poslat QR jako obrázek');

    expect(downloads.map((download) => download.name)).toEqual(['qr-platba-nova-nadeje.png']);
    expect(handoffStatus()).toBe(
      'QR kód qr-platba-nova-nadeje.png je uložený. Najdete ho ve stažených souborech.',
    );
  });

  it('when the browser cannot share images, then the second button saves the QR code and says where it is', async () => {
    sharesFiles = () => false;
    await openWithQr();

    expect(squashed('.bank-app-second')).toBe('Uložit QR kód');
    await tap('Uložit QR kód');

    expect(shared).toEqual([]);
    expect(downloads.map((download) => download.name)).toEqual(['qr-platba-nova-nadeje.png']);
    expect(handoffStatus()).toBe(
      'QR kód qr-platba-nova-nadeje.png je uložený. Najdete ho ve stažených souborech.',
    );
  });

  it('when the browser cannot share images and the visitor closes the bank offer, then the line suggests saving the QR code instead of sending it', async () => {
    sharesFiles = (file) => file.type !== 'image/png';
    shareRefusal = new DOMException('Share canceled', 'AbortError');
    await openWithQr();

    await tap('Otevřít v aplikaci banky');

    expect(handoffStatus()).toBe(
      'Neotevřela se vám banka? Zkopírujte údaje výše do bankovní aplikace, nebo si uložte QR kód a v bance zvolte platbu z obrázku.',
    );
  });

  it('when the visitor types an amount that is not valid, then both buttons wait for an amount', async () => {
    await openWithQr();
    await tap('Jiná částka');
    await settle(REDRAW_MS);

    expect(element<HTMLButtonElement>('.bank-app-open').disabled).toBe(true);
    expect(element<HTMLButtonElement>('.bank-app-second').disabled).toBe(true);
  });

  it('when the payment details fail to load, then the failure and its retry show without unfolding the QR', async () => {
    await settle();
    http
      .expectOne((request) => request.url === PAYMENT_DETAILS_URL)
      .flush(null, { status: 503, statusText: 'Service Unavailable' });
    await settle();

    expect(qrRegion().hidden).toBe(true);
    expect(squashed('.qr-error')).toContain('QR platbu se nepodařilo připravit.');
    expect(qrRegion().querySelector('.qr-error')).toBeNull();
    const order = Array.from(
      panel().nativeElement.querySelectorAll('.qr-error, .bank-app-open') as NodeListOf<Element>,
    ).map((part) => part.classList.contains('qr-error'));
    expect(order).toEqual([true, false]);
    expect(element<HTMLButtonElement>('.bank-app-open').disabled).toBe(true);

    await tap('Zkusit znovu');
    expect(document.activeElement).toBe(element('.bank-app'));
    expect(element('.bank-app').getAttribute('aria-busy')).toBe('true');
    http
      .expectOne((request) => request.url === PAYMENT_DETAILS_URL)
      .flush(foundationPaymentDetails());
    await settle();
    expect(element('.qr-error')).toBeNull();
    expect(element<HTMLButtonElement>('.bank-app-open').disabled).toBe(false);
    expect(document.activeElement).toBe(element('.bank-app-open'));
  });
});

describe('Given the payment panel on a computer', () => {
  let fixture: ComponentFixture<PaymentPanel>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentPanel],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: CompactLayout, useValue: { isCompact: signal(false).asReadonly() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PaymentPanel);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when it opens, then the QR stays shown beside its text with Uložit QR kód, and nothing offers a bank app or folds the QR', async () => {
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === PAYMENT_DETAILS_URL)
      .flush(foundationPaymentDetails());
    fixture.detectChanges();
    await fixture.whenStable();

    const panel = fixture.nativeElement as HTMLElement;
    expect(panel.querySelector('.qr')?.hasAttribute('hidden')).toBe(false);
    expect(panel.querySelector('.qr-code svg[role="img"]')).not.toBeNull();
    expect(panel.querySelector('.qr-title')?.textContent?.trim()).toBe('Naskenujte a přispějte');
    expect(panel.querySelector('.qr-save')?.textContent?.trim()).toBe('Uložit QR kód');
    expect(panel.querySelector('.bank-app-open')).toBeNull();
    expect(panel.querySelector('.bank-app-second')).toBeNull();
    expect(panel.querySelector('.other-device')).toBeNull();
  });
});

describe('Given the payment panel of a signed-in donor whose gift is on its way', () => {
  let fixture: ComponentFixture<PaymentPanel>;
  let http: HttpTestingController;
  let feed: FakeGiftFeed;
  let compactLayout: WritableSignal<boolean>;

  async function open(options: { compact: boolean; listedHere?: boolean }): Promise<void> {
    compactLayout = signal(options.compact);
    feed = new FakeGiftFeed(options.listedHere ?? false);
    feed.gifts.set([giftItem('earlier', { amountMinor: 10_000 })]);
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: () => Promise.resolve() },
    });
    await TestBed.configureTestingModule({
      imports: [PaymentPanel],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: CompactLayout, useValue: { isCompact: compactLayout.asReadonly() } },
        { provide: AuthStore, useValue: { donor: signal({ id: 'jana' }) } },
        { provide: GIFT_FEED, useValue: feed },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PaymentPanel);
    fixture.componentRef.setInput('variableSymbol', '1234567890');
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === PAYMENT_DETAILS_URL)
      .flush(foundationPaymentDetails());
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function panel(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function thanks(): string {
    return (panel().querySelector('.gift-arrival [role="status"]')?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buttonNamed(name: string): HTMLButtonElement | undefined {
    return Array.from(panel().querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === name,
    );
  }

  async function copyAccountNumber(): Promise<void> {
    panel().querySelector<HTMLButtonElement>('.bank-row app-copy-button button')?.click();
    await settle();
  }

  async function arrive(...gifts: DonationItem[]): Promise<void> {
    feed.gifts.set([giftItem('earlier', { amountMinor: 10_000 }), ...gifts]);
    await settle();
  }

  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
  });

  it('when the panel only shows, then nothing watches for the gift', async () => {
    await open({ compact: true });

    expect(feed.following).toBe(0);
    expect(thanks()).toBe('');
  });

  it('when the donor copies a bank detail and the gift arrives, then the panel thanks with its amount and offers the overview', async () => {
    await open({ compact: true });

    await copyAccountNumber();
    expect(feed.following).toBe(1);
    await arrive(giftItem('new', { amountMinor: 50_000 }));

    expect(thanks()).toBe('Váš dar 500 Kč dorazil. Děkujeme!');
    const link = panel().querySelector<HTMLAnchorElement>('.gift-arrival a');
    expect(link?.textContent?.trim()).toBe('Zobrazit v přehledu');
    expect(link?.getAttribute('href')).toBe('/darce/prehled');
  });

  it('when the thank-you stands right after the bank details, then it is just above Otevřít v aplikaci banky', async () => {
    await open({ compact: true });
    await copyAccountNumber();
    await arrive(giftItem('new'));

    const order = Array.from(panel().querySelectorAll('.bank, .gift-arrival, .bank-app')).map(
      (part) => part.classList[0],
    );
    expect(order).toEqual(['bank', 'gift-arrival', 'bank-app']);
  });

  it('when the overview lists the gifts itself, then the thank-you offers no link to it', async () => {
    await open({ compact: true, listedHere: true });
    await copyAccountNumber();

    await arrive(giftItem('new'));

    expect(thanks()).toBe('Váš dar 500 Kč dorazil. Děkujeme!');
    expect(panel().querySelector('.gift-arrival a')).toBeNull();
  });

  it('when two or five gifts arrive together, then it names their count and total', async () => {
    await open({ compact: true });
    await copyAccountNumber();

    await arrive(giftItem('a', { amountMinor: 50_000 }), giftItem('b', { amountMinor: 100_000 }));

    expect(thanks()).toBe('Dorazily 2 dary, celkem 1 500 Kč. Děkujeme!');
    buttonNamed('Zavřít')?.click();
    await settle();
    await copyAccountNumber();
    await arrive(...['c', 'd', 'e', 'f', 'g'].map((id) => giftItem(id, { amountMinor: 50_000 })));
    expect(thanks()).toBe('Dorazilo 5 darů, celkem 2 500 Kč. Děkujeme!');
  });

  it('when the donor closes the thank-you, then it goes and the focus moves to Otevřít v aplikaci banky', async () => {
    await open({ compact: true });
    await copyAccountNumber();
    await arrive(giftItem('new'));
    const close = buttonNamed('Zavřít');
    close?.focus();

    close?.click();
    await settle();

    expect(thanks()).toBe('');
    expect(buttonNamed('Zavřít')).toBeUndefined();
    expect(document.activeElement?.classList.contains('bank-app-open')).toBe(true);
  });

  it('when the donor opens the QR for another device, then it watches for the gift', async () => {
    await open({ compact: true });

    panel().querySelector<HTMLButtonElement>('.other-device')?.click();
    await settle();

    expect(feed.following).toBe(1);
  });

  it('when the variable symbol goes, then nothing watches any more', async () => {
    await open({ compact: true });
    await copyAccountNumber();

    fixture.componentRef.setInput('variableSymbol', null);
    await settle();

    expect(feed.following).toBe(0);
  });

  it('when a computer saves the QR code and the gift arrives, then the thanks stand above the QR and closing moves the focus to it', async () => {
    await open({ compact: false });
    vi.spyOn(QrCode.prototype, 'pngDataUrl').mockResolvedValue('data:image/png;base64,AA==');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    buttonNamed('Uložit QR kód')?.click();
    await settle();
    await arrive(giftItem('new'));

    const order = Array.from(panel().querySelectorAll('.bank, .gift-arrival, .qr')).map(
      (part) => part.classList[0],
    );
    expect(order).toEqual(['bank', 'gift-arrival', 'qr']);
    expect(thanks()).toBe('Váš dar 500 Kč dorazil. Děkujeme!');
    const close = buttonNamed('Zavřít');
    close?.focus();
    close?.click();
    await settle();
    expect(document.activeElement?.classList.contains('qr-code')).toBe(true);
  });
});

describe('Given the payment panel of a visitor without a variable symbol', () => {
  it('when the visitor copies a bank detail, then nothing watches for a gift', async () => {
    const feed = new FakeGiftFeed();
    feed.gifts.set([]);
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: () => Promise.resolve() },
    });
    await TestBed.configureTestingModule({
      imports: [PaymentPanel],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
        { provide: AuthStore, useValue: { donor: signal({ id: 'jana' }) } },
        { provide: GIFT_FEED, useValue: feed },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PaymentPanel);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === PAYMENT_DETAILS_URL)
      .flush(foundationPaymentDetails());
    fixture.detectChanges();
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('app-copy-button button')
      ?.click();
    await fixture.whenStable();

    expect(feed.following).toBe(0);
    http.verify();
    vi.unstubAllGlobals();
  });
});
