import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LoginDialogService } from '../../../../../core/auth/login-dialog.service';
import { QrCode } from '../../../../../shared/ui/qr-code/qr-code';
import { encodeText } from '../../../../../shared/ui/qr-code/qr-encoder';
import { QrMatrix } from '../../../../../shared/ui/qr-code/qr-matrix';
import { PaymentDetails } from '../../../../donations/payment-details-api';
import {
  foundationPaymentDetails,
  paymentQrCase,
} from '../../../../donations/testing/payment-details-fixtures';
import { DonateCta } from './donate-cta';

const PAYMENT_DETAILS_URL = '/api/donations/payment-details';
const REDRAW_MS = 400;
const ANNOUNCE_MS = 1200;
const QR_OF_500 = paymentQrCase('500 Kč without a variable symbol');
const QR_OF_1000 = paymentQrCase('1 000 Kč without a variable symbol');
const QR_OF_100 = paymentQrCase('100 Kč without a variable symbol');
const QR_OF_500_FOR_JANA = paymentQrCase('500 Kč with a ten-digit variable symbol');

function qrOfTyped(crowns: number): QrMatrix {
  return encodeText(
    `SPD*1.0*ACC:CZ2620100000005544332217*AM:${crowns}.00*CC:CZK*RN:NADACNI FOND NOVA NADEJE*MSG:DAR NADACNI FOND NOVA NADEJE`,
    'H',
  );
}

describe('Given the donate section', () => {
  let fixture: ComponentFixture<DonateCta>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DonateCta],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    vi.useFakeTimers();
    fixture = TestBed.createComponent(DonateCta);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function element<T extends HTMLElement>(selector: string): T {
    return fixture.nativeElement.querySelector(selector) as T;
  }

  function text(selector: string): string {
    return element(selector)?.textContent ?? '';
  }

  function button(label: string): HTMLButtonElement {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    const match = buttons.find((candidate) => candidate.textContent?.trim() === label);
    if (!match) {
      throw new Error(`No button labelled "${label}"`);
    }
    return match;
  }

  async function settle(milliseconds = 0): Promise<void> {
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(milliseconds);
    fixture.detectChanges();
  }

  function respondWithDetails(details: PaymentDetails = foundationPaymentDetails()): void {
    http.expectOne((request) => request.url === PAYMENT_DETAILS_URL).flush(details);
    fixture.detectChanges();
  }

  async function openWithQr(): Promise<void> {
    await settle();
    respondWithDetails();
    await settle();
  }

  function qrCode(): SVGSVGElement | null {
    return fixture.nativeElement.querySelector('.qr-code svg[role="img"]');
  }

  function drawnMatrixIs(matrix: QrMatrix): boolean {
    const dots = Array.from(qrCode()?.querySelectorAll('circle.qr-dot') ?? []);
    return (
      dots.length > 0 &&
      dots.every((dot) => {
        const column = Number(dot.getAttribute('cx')) - 4.5;
        const row = Number(dot.getAttribute('cy')) - 4.5;
        const dark = matrix.modules[row * matrix.size + column] === '1';
        return dark !== dot.classList.contains('is-off');
      })
    );
  }

  function squashed(selector: string): string {
    return text(selector).replace(/\s+/g, ' ').trim();
  }

  function stepOrder(): string[] {
    const steps = ['.amount', '.before-pay', '.bank', '.qr', '.next'];
    return Array.from(
      fixture.nativeElement.querySelectorAll(steps.join(', ')) as NodeListOf<Element>,
    ).map((step) => steps.find((selector) => step.matches(selector)) ?? '');
  }

  function frame(): { dimmed: boolean; busy: string | null; old: boolean } {
    return {
      dimmed: isDimmed(),
      busy: element('.qr-code').getAttribute('aria-busy'),
      old: drawnMatrixIs(QR_OF_500),
    };
  }

  function drawsMatrixInFocus(): boolean {
    return document.activeElement === element('.qr-code') && drawnMatrixIs(QR_OF_500);
  }

  function isDimmed(): boolean {
    return element('.qr-image')?.classList.contains('qr-image-stale') ?? false;
  }

  function announcement(): string {
    return element('.qr-announcement[role="status"]').textContent?.replace(/\s/g, ' ').trim() ?? '';
  }

  async function type(value: string): Promise<void> {
    const input = element<HTMLInputElement>('#donate-custom-amount');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function enterCustomAmount(value: string): Promise<void> {
    button('Jiná částka').click();
    fixture.detectChanges();
    await type(value);
  }

  it('when it renders, then its photo waits until it is near and comes in two widths', async () => {
    await openWithQr();
    const image = element<HTMLImageElement>('.donate-img img');

    expect(image.getAttribute('srcset')).toBe(
      '/images/donate-720.webp 720w, /images/donate-1440.webp 1440w',
    );
    expect(image.getAttribute('loading')).toBe('lazy');
  });

  it('when it opens, then it loads the payment details once and draws the QR payment of 500 Kč without a variable symbol beside the bank account', async () => {
    await settle();

    const request = http.expectOne((pending) => pending.url === PAYMENT_DETAILS_URL);
    expect(request.request.method).toBe('GET');
    request.flush(foundationPaymentDetails());
    await settle();

    expect(qrCode()?.getAttribute('aria-label')).toBe(
      'QR platba na účet Nadačního fondu Nová naděje',
    );
    expect(drawnMatrixIs(QR_OF_500)).toBe(true);
    expect(text('.bank')).toContain('5544332217/2010');
    expect(text('.bank')).toContain('CZ26 2010 0000 0055 4433 2217');
    expect(text('.bank')).not.toContain('Variabilní symbol');
    expect(button('500 Kč').getAttribute('aria-pressed')).toBe('true');
  });

  it('when it renders, then the section is introduced as Přispět with a heading about the gift and one sentence why', async () => {
    await openWithQr();

    expect(text('.ui-eyebrow').trim()).toBe('Přispět');
    expect(text('h2').trim()).toBe('Přispějte na pomůcky pro děti');
    expect(squashed('.lead')).toBe(
      'Z darů pořizujeme zdravotní a kompenzační pomůcky a přístroje pro konkrétní děti.',
    );
  });

  it('when it renders, then the steps follow one order: amount, the line before paying, bank details, QR and what comes next', async () => {
    await openWithQr();

    expect(stepOrder()).toEqual(['.amount', '.before-pay', '.bank', '.qr', '.next']);
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('h3') as NodeListOf<Element>).map(
        (heading) => heading.textContent?.trim(),
      ),
    ).toEqual(['Zaplaťte', 'Co bude dál']);
  });

  it('when nobody is signed in, then before the payment a line offers the receipt for the tax return with the account actions', async () => {
    await openWithQr();

    expect(squashed('.before-pay p')).toBe(
      'Chcete potvrzení o daru pro daňové přiznání? Přihlaste se nebo si založte účet ještě před platbou: QR kód pak ponese váš variabilní symbol.',
    );
    expect(element('.before-pay .account-register')).not.toBeNull();
    expect(element('.before-pay .account-sign-in')).not.toBeNull();
  });

  it('when nobody is signed in, then a line says the receipt can be issued to a company registered with its company ID', async () => {
    await openWithQr();

    expect(squashed('.before-pay .company-hint')).toBe(
      'Potvrzení vystavíme i na firmu: při registraci zvolte Firma a vyplňte IČO.',
    );
  });

  it('when nobody is signed in, then what comes next says how an earlier gift can still be paired and where the yearly receipt is', async () => {
    await openWithQr();

    const items = Array.from(
      fixture.nativeElement.querySelectorAll('.next li') as NodeListOf<Element>,
    ).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(items).toEqual([
      'Platili jste bez přihlášení? Po registraci si v sekci Bankovní účty přidejte svůj účet ověřovací platbou 1 Kč a dřívější dary z něj se vám přiřadí také.',
      'S účtem dárce si po skončení roku stáhnete roční potvrzení o daru. Dar si můžete odečíst od základu daně podle zákona o daních z příjmů.',
    ]);
  });

  it('when it opens, then it offers the amounts from the largest down, with another amount last', async () => {
    await openWithQr();

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.amount-option') as NodeListOf<HTMLButtonElement>,
    ).map((option) => option.textContent?.trim());
    expect(labels).toEqual(['1 000 Kč', '500 Kč', '100 Kč', 'Jiná částka']);
  });

  it('when the payment details are on their way, then it says the QR is being prepared', async () => {
    await settle();

    expect(text('.qr-code')).toContain('Připravujeme QR kód');
    respondWithDetails();
    expect(text('.qr-code')).not.toContain('Připravujeme QR kód');
  });

  it('when the visitor picks every preset and types an amount, then nothing more is asked of the server', async () => {
    await openWithQr();

    button('1 000 Kč').click();
    await settle();
    button('100 Kč').click();
    await settle();
    expect(drawnMatrixIs(QR_OF_100)).toBe(true);
    await enterCustomAmount('250');
    await settle(REDRAW_MS);

    http.expectNone(() => true);
    expect(drawnMatrixIs(qrOfTyped(250))).toBe(true);
  });

  it('when the visitor picks 1 000 Kč, then its QR payment is drawn at once in the browser, with other dots than for 500 Kč', async () => {
    await openWithQr();

    button('1 000 Kč').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(QR_OF_1000.modules).not.toBe(QR_OF_500.modules);
    expect(drawnMatrixIs(QR_OF_1000)).toBe(true);
    expect(isDimmed()).toBe(false);
    expect(text('.qr-code')).not.toContain('Připravujeme QR kód');
    expect(button('1 000 Kč').getAttribute('aria-pressed')).toBe('true');
    expect(button('500 Kč').getAttribute('aria-pressed')).toBe('false');

    button('500 Kč').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(drawnMatrixIs(QR_OF_500)).toBe(true);
  });

  it('when the visitor enters another amount, then its QR payment is drawn 400 ms after the last key', async () => {
    await openWithQr();

    await enterCustomAmount('250');
    await settle(REDRAW_MS - 1);
    expect(drawnMatrixIs(QR_OF_500)).toBe(true);

    await settle(1);
    expect(drawnMatrixIs(qrOfTyped(250))).toBe(true);
    expect(isDimmed()).toBe(false);
  });

  it('when the visitor types, then the previous QR is dimmed at once and stays until the new one replaces it', async () => {
    await openWithQr();

    await enterCustomAmount('250');

    expect(isDimmed()).toBe(true);
    expect(drawnMatrixIs(QR_OF_500)).toBe(true);
    expect(element('.qr-code').getAttribute('aria-busy')).toBe('true');
    expect(element<HTMLButtonElement>('.qr-save').disabled).toBe(true);
    expect(text('.bank')).toContain('250');
    await settle(REDRAW_MS);
    expect(isDimmed()).toBe(false);
    expect(element('.qr-code').getAttribute('aria-busy')).toBe('false');
    expect(element<HTMLButtonElement>('.qr-save').disabled).toBe(false);
  });

  it('when the section opens, then its status region is there and stays quiet', async () => {
    await openWithQr();

    expect(element('.qr-announcement[role="status"]').textContent?.trim()).toBe('');
    expect(element('.qr-text').hasAttribute('aria-live')).toBe(false);
  });

  it('when the visitor picks another amount, then after 1.2 s of quiet the status region says the QR for that amount is ready', async () => {
    await openWithQr();

    button('1 000 Kč').click();
    await settle(ANNOUNCE_MS - 1);
    expect(announcement()).toBe('');

    await settle(1);
    expect(announcement()).toBe('QR platba na 1 000 Kč je připravená.');
  });

  it('when the visitor types a burst of keys, then the status region speaks once, for the finished amount', async () => {
    await openWithQr();
    await enterCustomAmount('2');
    const spoken: string[] = [];

    for (const typed of ['25', '250', '2500']) {
      await settle(ANNOUNCE_MS / 3);
      spoken.push(announcement());
      await type(typed);
    }
    await settle(ANNOUNCE_MS);
    spoken.push(announcement());

    expect(spoken.filter((line) => line !== '')).toEqual(['QR platba na 2 500 Kč je připravená.']);
  });

  it('when the visitor enters an amount that is not a whole number from 1 to 1 000 000, then no QR is drawn and a hint explains why', async () => {
    await openWithQr();
    button('Jiná částka').click();
    fixture.detectChanges();

    for (const typed of ['12.5', '12,50', '0', '1000001', 'abc']) {
      await type(typed);
      await settle(REDRAW_MS);

      expect(qrCode()).toBeNull();
      expect(squashed('.qr-placeholder')).toBe('Nejprve zadejte částku');
    }
    expect(element('.amount-hint')).toBeNull();

    element('#donate-custom-amount').dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(text('.amount-hint')).toContain('celou částku od 1 do 1 000 000 Kč');
  });

  it('when the visitor types an amount that is not valid yet, then the QR stays dimmed until 400 ms after the last key and only then asks for an amount', async () => {
    await openWithQr();

    await enterCustomAmount('0');

    expect(qrCode()).not.toBeNull();
    expect(isDimmed()).toBe(true);
    await settle(REDRAW_MS);
    expect(qrCode()).toBeNull();
    expect(squashed('.qr-placeholder')).toBe('Nejprve zadejte částku');
  });

  it('when the visitor writes the amount with a space between thousands, then the QR is drawn for that amount', async () => {
    await openWithQr();

    await enterCustomAmount('2 500');
    await settle(REDRAW_MS);

    expect(drawnMatrixIs(qrOfTyped(2500))).toBe(true);
  });

  it('when the QR is ready, then the bank details list the account, the amount and the IBAN, each with a copy button', async () => {
    await openWithQr();

    const rows = Array.from(fixture.nativeElement.querySelectorAll('.bank-row')) as HTMLElement[];
    expect(rows.map((row) => row.querySelector('.bank-key')?.textContent?.trim())).toEqual([
      'Číslo účtu',
      'Částka',
      'IBAN',
    ]);
    expect(rows[1].querySelector('.bank-value')?.textContent?.replace(/\s/g, ' ').trim()).toBe(
      '500 Kč',
    );
    const copied = rows.map((row) =>
      row.querySelector('app-copy-button button')?.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(copied).toEqual(['Kopírovat číslo účtu', 'Kopírovat částku', 'Kopírovat IBAN']);
  });

  it('when the visitor saves the QR, then a PNG of it downloads for the banking app', async () => {
    await openWithQr();
    vi.spyOn(QrCode.prototype, 'pngDataUrl').mockResolvedValue('data:image/png;base64,AAAA');
    const downloads: { href: string; name: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push({ href: this.href, name: this.download });
    });

    button('Uložit QR kód').click();
    await vi.waitFor(() => expect(downloads).toHaveLength(1));

    expect(downloads[0]).toEqual({
      href: 'data:image/png;base64,AAAA',
      name: 'qr-platba-nova-nadeje.png',
    });
    vi.restoreAllMocks();
  });

  it('when the visitor saves the QR, then a status line names the saved file and where to find it until another amount is picked', async () => {
    await openWithQr();
    vi.spyOn(QrCode.prototype, 'pngDataUrl').mockResolvedValue('data:image/png;base64,AAAA');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    expect(element('.qr-saved').getAttribute('role')).toBe('status');
    expect(squashed('.qr-saved')).toBe('');

    button('Uložit QR kód').click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(squashed('.qr-saved')).toBe(
        'QR kód qr-platba-nova-nadeje.png je uložený. Najdete ho ve stažených souborech.',
      );
    });

    button('1 000 Kč').click();
    await settle();
    expect(squashed('.qr-saved')).toBe('');
    vi.restoreAllMocks();
  });

  it('when the visitor picks Jiná částka, then the field opens empty, nothing is asked for and the QR waits for an amount', async () => {
    await openWithQr();

    button('Jiná částka').click();
    await settle();
    expect(isDimmed()).toBe(true);
    await settle(REDRAW_MS);

    expect(element<HTMLInputElement>('#donate-custom-amount').value).toBe('');
    http.expectNone(() => true);
    expect(qrCode()).toBeNull();
    expect(squashed('.qr-placeholder')).toBe('Nejprve zadejte částku');
    expect(squashed('.bank')).not.toContain('Částka');
    expect(button('500 Kč').getAttribute('aria-pressed')).toBe('false');
    expect(button('Jiná částka').getAttribute('aria-pressed')).toBe('true');
  });

  it('when nobody is signed in, then it offers to create an account and opens the registration that leads back here after the e-mail', async () => {
    await openWithQr();

    button('Založit účet').click();

    const dialog = TestBed.inject(LoginDialogService);
    expect(dialog.isOpen()).toBe(true);
    expect(dialog.initialMode()).toBe('register');
    expect(dialog.confirmationReturnTo()).toBe('/#prispet');
  });

  it('when nobody is signed in and the visitor signs in from it, then the page stays and the bank details with their variable symbol take the focus', async () => {
    document.body.appendChild(fixture.nativeElement);
    await openWithQr();
    button('Přihlásit se').focus();
    button('Přihlásit se').click();
    const dialog = TestBed.inject(LoginDialogService);
    expect(dialog.isOpen()).toBe(true);
    expect(dialog.initialMode()).toBe('login');
    expect(dialog.confirmationReturnTo()).toBe('/#prispet');

    fixture.componentRef.setInput('variableSymbol', '1234567890');
    dialog.signedIn();
    await settle();

    expect(document.activeElement).toBe(element('.bank .panel-label'));
    expect(text('.bank')).toContain('1234567890');
    fixture.nativeElement.remove();
  });

  it('when it renders, then nothing in it sends the visitor to the contact form', async () => {
    await openWithQr();

    expect(element('a[href*="contact"]')).toBeNull();
  });

  it('when the visitor is still typing an amount, then the QR is redrawn once, for the finished amount, without a placeholder in between', async () => {
    await openWithQr();
    button('Jiná částka').click();
    fixture.detectChanges();
    await type('2');
    const frames: boolean[] = [];

    for (const typed of ['25', '250']) {
      await settle(REDRAW_MS / 3);
      frames.push(qrCode() !== null);
      expect(drawnMatrixIs(QR_OF_500)).toBe(true);
      await type(typed);
    }
    await settle(REDRAW_MS);

    expect(frames).toEqual([true, true]);
    expect(drawnMatrixIs(qrOfTyped(250))).toBe(true);
    http.expectNone(() => true);
  });

  it('when the payment details fail to load, then it says so in Czech and asking again loads them and draws the QR', async () => {
    await settle();

    http
      .expectOne((request) => request.url === PAYMENT_DETAILS_URL)
      .flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(qrCode()).toBeNull();
    expect(text('.qr-error')).toContain('QR platbu se nepodařilo připravit');

    button('Zkusit znovu').click();
    await settle();

    respondWithDetails();
    await settle();
    expect(drawnMatrixIs(QR_OF_500)).toBe(true);
    expect(element('.qr-error')).toBeNull();
  });

  it('when the payment details fail to load, then a polite status says so, and only a retry the visitor started that fails again is an alert, with the focus on the QR meanwhile and on the retry after', async () => {
    await settle();
    http
      .expectOne((request) => request.url === PAYMENT_DETAILS_URL)
      .flush(null, { status: 503, statusText: 'Service Unavailable' });
    await settle();

    expect(element('[role="alert"]')).toBeNull();
    expect(element('[role="status"] .qr-error')?.textContent).toContain(
      'QR platbu se nepodařilo připravit. Zkuste to prosím znovu.',
    );
    button('Zkusit znovu').focus();
    button('Zkusit znovu').click();
    await settle();
    expect(document.activeElement).toBe(element('.qr-code'));

    http
      .expectOne((request) => request.url === PAYMENT_DETAILS_URL)
      .flush(null, { status: 503, statusText: 'Service Unavailable' });
    await settle();
    expect(element('.qr-error[role="alert"]')?.textContent).toContain(
      'QR platbu se nepodařilo připravit. Zkuste to prosím znovu.',
    );
    expect(element('[role="status"] .qr-error')).toBeNull();
    expect(document.activeElement).toBe(button('Zkusit znovu'));

    button('Zkusit znovu').click();
    await settle();
    respondWithDetails();
    await settle();
    expect(drawsMatrixInFocus()).toBe(true);
  });

  it('when the answer is not payment details, then no QR is drawn and it offers to try again instead of breaking the section', async () => {
    await settle();
    http.expectOne((request) => request.url === PAYMENT_DETAILS_URL).flush({ currency: 'CZK' });
    await settle();

    expect(qrCode()).toBeNull();
    expect(text('.qr-error')).toContain('QR platbu se nepodařilo připravit');
    expect(button('Zkusit znovu')).not.toBeNull();
  });

  it('when the browser refuses the payment details it holds, then it says the QR cannot be made now and to pay by the bank details, which stay, and asking again reloads them past the browser cache', async () => {
    await settle();
    const details = foundationPaymentDetails();
    respondWithDetails({ ...details, messages: { ...details.messages, donation: 'Dar*AM:1' } });
    await settle();

    expect(qrCode()).toBeNull();
    expect(squashed('[role="status"] .qr-error')).toContain(
      'QR kód teď nejde vytvořit. Zaplaťte prosím podle bankovního spojení.',
    );
    expect(text('.bank')).toContain('5544332217/2010');

    button('Zkusit znovu').click();
    await settle();
    const again = http.expectOne((request) => request.url === PAYMENT_DETAILS_URL);
    expect(again.request.headers.get('Cache-Control')).toBe('no-cache');
    again.flush(details);
    await settle();

    expect(drawnMatrixIs(QR_OF_500)).toBe(true);
    expect(element('.qr-error')).toBeNull();
  });

  it('when the visitor types keys 300 ms apart, then the old QR stays dimmed until 400 ms after the last key and is redrawn once, for the finished amount', async () => {
    await openWithQr();
    button('Jiná částka').click();
    fixture.detectChanges();
    await type('2');
    const frames: { dimmed: boolean; busy: string | null; old: boolean }[] = [];

    for (const typed of ['25', '250', '2500']) {
      await settle(300);
      frames.push(frame());
      await type(typed);
    }
    await settle(REDRAW_MS - 1);
    frames.push(frame());
    await settle(1);

    expect(frames).toEqual(Array(4).fill({ dimmed: true, busy: 'true', old: true }));
    expect(isDimmed()).toBe(false);
    expect(drawnMatrixIs(qrOfTyped(2500))).toBe(true);
  });

  it('when the visitor types, then the field names the hint that the QR is redrawn once they stop typing', async () => {
    await openWithQr();
    button('Jiná částka').click();
    fixture.detectChanges();

    const described = element('#donate-custom-amount').getAttribute('aria-describedby') ?? '';
    expect(described.split(' ').map((id) => text(`#${id}`).trim())).toContain(
      'QR kód se překreslí, když přestanete psát.',
    );
  });

  it('when the section goes away while a redraw and an announcement wait, then it leaves no timer behind', async () => {
    await openWithQr();
    await enterCustomAmount('250');

    fixture.destroy();
    await vi.advanceTimersByTimeAsync(0);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('when the visitor picks Jiná částka after an amount was announced, then the status region no longer says that QR is ready', async () => {
    await openWithQr();
    button('1 000 Kč').click();
    await settle(ANNOUNCE_MS);
    expect(announcement()).toBe('QR platba na 1 000 Kč je připravená.');

    button('Jiná částka').click();
    await settle();

    expect(announcement()).toBe('');
  });

  it('when the visitor picks the amount whose QR was just announced once more, then it is not announced again', async () => {
    await openWithQr();
    button('1 000 Kč').click();
    await settle(ANNOUNCE_MS);

    button('1 000 Kč').click();
    await settle(ANNOUNCE_MS);

    expect(announcement()).toBe('');
    button('500 Kč').click();
    await settle(ANNOUNCE_MS);
    expect(announcement()).toBe('QR platba na 500 Kč je připravená.');
  });

  it('when the visitor picks Jiná částka after 1 000 Kč was announced and types 1000, then the QR that comes back is announced again', async () => {
    await openWithQr();
    button('1 000 Kč').click();
    await settle(ANNOUNCE_MS);
    button('Jiná částka').click();
    await settle(REDRAW_MS);
    expect(text('.qr-placeholder')).toContain('Nejprve zadejte částku');

    for (const typed of ['1', '10', '100', '1000']) {
      await type(typed);
      await settle(100);
    }
    await settle(ANNOUNCE_MS);

    expect(announcement()).toBe('QR platba na 1 000 Kč je připravená.');
  });

  it('when the visitor goes from 1 000 Kč to an amount that is not valid and back to 1 000 Kč, then the QR that comes back is announced again', async () => {
    await openWithQr();
    button('1 000 Kč').click();
    await settle(ANNOUNCE_MS);
    button('Jiná částka').click();
    await settle();
    await type('0');
    await settle(ANNOUNCE_MS);

    button('1 000 Kč').click();
    await settle(ANNOUNCE_MS);

    expect(announcement()).toBe('QR platba na 1 000 Kč je připravená.');
  });

  it('when the IBAN of the payment details is not the IBAN of their account number, then neither the bank details nor a QR are shown, only the failure with a retry', async () => {
    await settle();
    const details = foundationPaymentDetails();
    respondWithDetails({
      ...details,
      account: { ...details.account, iban: 'CZ6508000000192000145399' },
    });
    await settle();

    expect(qrCode()).toBeNull();
    expect(element('.bank')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('5544332217/2010');
    expect(text('.qr-error')).toContain('QR platbu se nepodařilo připravit');
    expect(button('Zkusit znovu')).not.toBeNull();
  });

  it('when the visitor picks an amount five minutes after the details came, then the browser checks them again past its cache', async () => {
    await openWithQr();
    await settle(5 * 60 * 1000);

    button('1 000 Kč').click();
    await settle();

    const check = http.expectOne((request) => request.url === PAYMENT_DETAILS_URL);
    expect(check.request.headers.get('Cache-Control')).toBe('no-cache');
    check.flush(foundationPaymentDetails());
    await settle();
    expect(drawnMatrixIs(QR_OF_1000)).toBe(true);
  });

  describe('Given a signed-in donor with a variable symbol', () => {
    it('when the section opens, then the variable symbol is in the QR payment and shown with the bank account', async () => {
      fixture.componentRef.setInput('variableSymbol', '1234567890');
      fixture.componentRef.setInput('donorName', 'Jana Nováková');

      await openWithQr();

      expect(drawnMatrixIs(QR_OF_500_FOR_JANA)).toBe(true);
      expect(text('.bank')).toContain('Variabilní symbol');
      expect(text('.bank')).toContain('1234567890');
      const items = Array.from(
        fixture.nativeElement.querySelectorAll('.next li') as NodeListOf<Element>,
      ).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
      expect(items).toEqual([
        'Dar se ve vašem přehledu objeví do hodiny poté, co ho banka připíše. Převod z jiné banky k nám obvykle dorazí do následujícího pracovního dne.',
        'Po skončení roku si ve svém účtu dárce stáhnete roční potvrzení o daru. Dar si můžete odečíst od základu daně podle zákona o daních z příjmů.',
      ]);
      expect(squashed('.before-pay')).toBe(
        'Platíte jako Jana Nováková, variabilní symbol 1234567890.',
      );
      const keys = Array.from(fixture.nativeElement.querySelectorAll('.bank-key')).map((key) =>
        (key as HTMLElement).textContent?.trim(),
      );
      expect(keys).toEqual(['Číslo účtu', 'Částka', 'Variabilní symbol', 'IBAN']);
      expect(fixture.nativeElement.textContent).not.toContain('Založit účet');
    });
  });
});
