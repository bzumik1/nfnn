import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { ExternalNavigation } from '../../../core/navigation/external-navigation';
import { QrCode } from '../../../shared/ui/qr-code/qr-code';
import { encodeText } from '../../../shared/ui/qr-code/qr-encoder';
import { QrMatrix } from '../../../shared/ui/qr-code/qr-matrix';
import { foundationPaymentDetails, paymentQrCase } from '../testing/payment-details-fixtures';
import { PaymentPanel } from './payment-panel';

const PAYMENT_DETAILS_URL = '/api/donations/payment-details';
const REDRAW_MS = 400;
const QR_OF_500 = paymentQrCase('500 Kč without a variable symbol');
const QR_OF_1000 = paymentQrCase('1 000 Kč without a variable symbol');
const QR_OF_500_FOR_JANA = paymentQrCase('500 Kč with a ten-digit variable symbol');

function pngOf(matrix: QrMatrix): Blob {
  return new Blob([`png of ${matrix.modules}`], { type: 'image/png' });
}

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
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        const url = `blob:nfnn/${blobs.size + 1}`;
        blobs.set(url, blob);
        return url;
      },
      revokeObjectURL: () => undefined,
    });
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
    await openWithQr();

    const order = Array.from(
      panel().nativeElement.querySelectorAll(
        '.bank, .bank-app-open, .bank-app-image, .other-device, .qr',
      ) as NodeListOf<Element>,
    ).map((part) => part.classList[0]);
    expect(order).toEqual(['bank', 'bank-app-open', 'bank-app-image', 'other-device', 'qr']);
    expect(squashed('.bank-app-open')).toBe('Otevřít v aplikaci banky');
    expect(squashed('.bank-app-image')).toBe('Poslat QR jako obrázek');
    expect(squashed('.other-device')).toBe(
      'Platíte z jiného zařízení? Zobrazit QR kód ke skenování',
    );
    expect(otherDevice().getAttribute('aria-expanded')).toBe('false');
    expect(qrRegion().hidden).toBe(true);
    expect(qrRegion().classList.contains('qr')).toBe(true);
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

  it('when the visitor taps Otevřít v aplikaci banky, then the phone is offered platba.spayd holding the payment of the chosen amount and nothing more is said', async () => {
    await openWithQr();

    await tap('Otevřít v aplikaci banky');

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
    expect(element('.bank-app-image').getAttribute('aria-disabled')).toBe('true');

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
    expect(handoffStatus()).toContain('Neotevřela se vám banka?');
  });

  it('when the visitor picks 1 000 Kč and taps Otevřít v aplikaci banky, then the file holds the payment of 1 000 Kč', async () => {
    await openWithQr();
    await tap('1 000 Kč');

    await tap('Otevřít v aplikaci banky');

    expect(await readText((shared[0].files ?? [])[0])).toBe(QR_OF_1000.spayd);
  });

  it('when a signed-in donor taps Otevřít v aplikaci banky, then the file carries their variable symbol', async () => {
    panel().componentRef.setInput('variableSymbol', '1234567890');
    await openWithQr();

    await tap('Otevřít v aplikaci banky');

    expect(await readText((shared[0].files ?? [])[0])).toBe(QR_OF_500_FOR_JANA.spayd);
  });

  it('when the visitor closes the offer without a bank, then a polite line says how to pay without it', async () => {
    shareRefusal = new DOMException('Share canceled', 'AbortError');
    await openWithQr();
    expect(element('.bank-app-status').getAttribute('role')).toBe('status');

    await tap('Otevřít v aplikaci banky');

    expect(handoffStatus()).toBe(
      'Neotevřela se vám banka? Zkopírujte údaje výše do bankovní aplikace, nebo pošlete QR jako obrázek a v bance zvolte platbu z obrázku.',
    );
  });

  it('when the phone refuses to offer the file, then the same line says how to pay without it', async () => {
    shareRefusal = new DOMException('Not allowed', 'NotAllowedError');
    await openWithQr();

    await tap('Otevřít v aplikaci banky');

    expect(handoffStatus()).toContain('Neotevřela se vám banka?');
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

  it('when the browser cannot share the file and the service worker answers the payment route, then the payment opens from the device, nothing downloads and a line says what to do if no bank opened', async () => {
    sharesFiles = (file) => file.type !== 'application/x-shortpaymentdescriptor';
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { controller: {} } });
    const opened: string[] = [];
    vi.spyOn(ExternalNavigation.prototype, 'assign').mockImplementation((url: string) => {
      opened.push(url);
    });
    await openWithQr();

    button('Otevřít v aplikaci banky').click();
    await settle();
    http
      .expectOne((request) => request.url === '/platba.spayd' && request.method === 'HEAD')
      .flush('', { headers: { 'Content-Type': 'application/x-shortpaymentdescriptor' } });
    await settle();

    expect(shared).toEqual([]);
    expect(downloads).toEqual([]);
    expect(opened).toEqual([`/platba.spayd?${new URLSearchParams({ data: QR_OF_500.spayd })}`]);
    expect(handoffStatus()).toBe(
      'Neotevřela se vám banka? Zkopírujte údaje výše do bankovní aplikace, nebo pošlete QR jako obrázek a v bance zvolte platbu z obrázku.',
    );
  });

  it('when the visitor taps Poslat QR jako obrázek, then the phone is offered the PNG of the QR drawn for the chosen amount', async () => {
    await openWithQr();

    button('Poslat QR jako obrázek').click();

    expect(shared).toHaveLength(1);
    const [file] = shared[0].files ?? [];
    expect(file.name).toBe('qr-platba-nova-nadeje.png');
    expect(file.type).toBe('image/png');
    expect(shared[0].title).toBe('QR platba');
    expect(await readText(file)).toBe(pngTextOf(QR_OF_500.spayd));
    await settle();
    expect(downloads).toEqual([]);
  });

  it('when the visitor picks 1 000 Kč and taps Poslat QR jako obrázek, then the image shared is the QR drawn for 1 000 Kč', async () => {
    await openWithQr();
    await tap('1 000 Kč');

    button('Poslat QR jako obrázek').click();

    expect(await readText((shared[0].files ?? [])[0])).toBe(pngTextOf(QR_OF_1000.spayd));
    await settle();
  });

  it('when the QR image is still being drawn, then Poslat QR jako obrázek waits for it', async () => {
    vi.mocked(QrCode.prototype.pngBlob).mockReturnValue(new Promise<Blob>(() => undefined));
    await openWithQr();

    expect(element<HTMLButtonElement>('.bank-app-image').disabled).toBe(true);
    expect(element<HTMLButtonElement>('.bank-app-open').disabled).toBe(false);
  });

  it('when the QR image could not be drawn ahead, then Poslat QR jako obrázek saves it instead and says where it is', async () => {
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

    expect(squashed('.bank-app-image')).toBe('Uložit QR kód');
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
    expect(element<HTMLButtonElement>('.bank-app-image').disabled).toBe(true);
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
    expect(panel.querySelector('.bank-app-image')).toBeNull();
    expect(panel.querySelector('.other-device')).toBeNull();
  });
});
