import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  noReceiptSignature,
  receiptSignature,
  SIGNATURE_IMAGE,
  vectorReceiptSignature,
} from '../../testing/admin-fixtures';
import { ReceiptSignatureResponse } from '../../admin-api';
import { ReceiptSignature } from './receipt-signature';

const SIGNATURE_URL = '/api/admin/donations/receipt-signature';

describe('Given the signature section of the receipt settings', () => {
  let fixture: ComponentFixture<ReceiptSignature>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceiptSignature],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReceiptSignature);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function button(name: string): HTMLButtonElement {
    const found = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((candidate) => candidate.textContent?.trim() === name);
    if (found === undefined) {
      throw new Error(`No button ${name}`);
    }
    return found;
  }

  function preview(): HTMLImageElement | null {
    return fixture.nativeElement.querySelector('img.signature-preview');
  }

  function vectorPreview(): SVGSVGElement | null {
    return fixture.nativeElement.querySelector('svg.signature-preview');
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function load(body: object): Promise<void> {
    http.expectOne({ method: 'GET', url: SIGNATURE_URL }).flush(body);
    await settle();
  }

  async function choose(file: File): Promise<void> {
    const input = fixture.nativeElement.querySelector(
      '#receipt-signature-file',
    ) as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
  }

  function scan(name = 'podpis.jpg', type = 'image/jpeg', size = 1000): File {
    return new File([new Uint8Array(size)], name, { type });
  }

  it('when it loads, then it says so until the signature arrives', () => {
    expect(text('[role="status"]:not(:empty)')).toBe('Načítáme podpis…');
    http.expectOne(SIGNATURE_URL).flush(noReceiptSignature());
  });

  it('when no signature is uploaded, then it says receipts carry only the line and the name', async () => {
    await load(noReceiptSignature());

    expect(preview()).toBeNull();
    expect(text('.signature-state')).toBe(
      'Podpis není nahraný. Potvrzení mají místo něj jen čáru se jménem.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Odebrat podpis');
    expect(text('h2')).toBe('Podpis na potvrzeních');
    expect(text('label[for="receipt-signature-file"]')).toBe('Nahrát podpis');
  });

  it('when a signature is uploaded, then it shows the scan with its size and upload time', async () => {
    await load(receiptSignature());

    expect(preview()?.getAttribute('src')).toBe(SIGNATURE_IMAGE);
    expect(preview()?.getAttribute('alt')).toBe('Nahraný podpis');
    expect(text('.signature-state')).toBe('Nahráno 23. 10. 2026 21:30, 1 200 × 400 px.');
    expect(text('label[for="receipt-signature-file"]')).toBe('Nahrát jiný podpis');
    expect(vectorPreview()).toBeNull();
  });

  it('when a vector signature is uploaded, then it draws its paths from the data and names it as SVG', async () => {
    await load(vectorReceiptSignature());

    const svg = vectorPreview();
    expect(preview()).toBeNull();
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Nahraný podpis');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 300 100');
    const paths = Array.from(svg?.querySelectorAll('path') ?? []);
    expect(paths.map((path) => path.namespaceURI)).toEqual([
      'http://www.w3.org/2000/svg',
      'http://www.w3.org/2000/svg',
    ]);
    expect(
      paths.map((path) => [
        path.getAttribute('d'),
        path.getAttribute('fill'),
        path.getAttribute('fill-opacity'),
      ]),
    ).toEqual([
      ['M10 80 C40 10 65 10 95 80 S150 150 180 80 Z', '#1d2a5c', '0.9'],
      ['M250 50 L290 90 Z', '#c0392b', '1'],
    ]);
    expect(text('.signature-state')).toBe('Nahráno 23. 10. 2026 21:30, vektorový podpis (SVG).');
    expect(text('label[for="receipt-signature-file"]')).toBe('Nahrát jiný podpis');
  });

  it.each(['url(https://example.com/a)', 'url(#a) #123456', '#abc', '#ABCDEF', '#1d2a5cff'])(
    'when a vector path carries the fill %s, which is not #rrggbb in lower case, then it is drawn black',
    async (fill) => {
      await load(
        vectorReceiptSignature({
          vector: { viewBox: [0, 0, 10, 10], paths: [{ d: 'M0 0 L1 1', fill, opacity: 1 }] },
        }),
      );

      expect(vectorPreview()?.querySelector('path')?.getAttribute('fill')).toBe('#000000');
    },
  );

  it('when a scan arrives without a vector field at all, then it is still shown as a scan with its size', async () => {
    const withoutVector: Partial<ReceiptSignatureResponse> = receiptSignature();
    delete withoutVector.vector;
    await load(withoutVector);

    expect(preview()?.getAttribute('src')).toBe(SIGNATURE_IMAGE);
    expect(vectorPreview()).toBeNull();
    expect(text('.signature-state')).toBe('Nahráno 23. 10. 2026 21:30, 1 200 × 400 px.');
  });

  it('when the hint is read, then it says a handwritten SVG signature is fine as filled shapes and only strokes and effects are refused, before the scan', async () => {
    await load(noReceiptSignature());

    expect(text('#receipt-signature-hint')).toBe(
      'Podpis se tiskne nad jméno podepisujícího na potvrzeních vystavených po nahrání; ta už vystavená se nemění. Nejlépe SVG do 200 kB: ručně psaný podpis jde, když jsou jeho tahy převedené na vyplněné tvary. Obrysy s nastavenou tloušťkou čáry (stroke) a efekty web odmítne. Jinak sken JPEG, PNG či WebP do 10 MB: tmavý podpis na bílém papíře.',
    );
  });

  it('when the signature cannot be loaded, then it says so and loads again on request', async () => {
    http.expectOne(SIGNATURE_URL).flush(null, { status: 500, statusText: 'Internal Server Error' });
    await settle();

    expect(text('[role="alert"]:not(:empty)')).toContain('Podpis se nepodařilo načíst.');

    button('Zkusit znovu').click();
    await load(noReceiptSignature());
    expect(text('.signature-state')).toContain('Podpis není nahraný.');
  });

  describe('when the administrator chooses a scan', () => {
    beforeEach(async () => await load(noReceiptSignature()));

    it('then it uploads the file, says the upload is running and shows the new scan', async () => {
      await choose(scan());

      expect(text('[role="status"]:not(:empty)')).toBe('Nahráváme podpis…');
      const request = http.expectOne({ method: 'POST', url: SIGNATURE_URL });
      expect((request.request.body as FormData).get('file')).toBeInstanceOf(File);
      request.flush(receiptSignature());
      await settle();

      expect(preview()?.getAttribute('src')).toBe(SIGNATURE_IMAGE);
      expect(text('[role="status"]:not(:empty)')).toBe(
        'Podpis je uložený. Ponesou ho potvrzení vystavená od teď.',
      );
    });

    it('then a file of another type is refused before uploading', async () => {
      await choose(scan('podpis.pdf', 'application/pdf'));

      expect(text('[role="alert"]:not(:empty)')).toBe(
        'Vyberte prosím podpis ve formátu SVG nebo sken ve formátu JPEG, PNG či WebP.',
      );
    });

    it('then an SVG is uploaded and its vector is shown', async () => {
      await choose(scan('podpis.svg', 'image/svg+xml', 30 * 1024));

      http.expectOne({ method: 'POST', url: SIGNATURE_URL }).flush(vectorReceiptSignature());
      await settle();

      expect(vectorPreview()?.querySelectorAll('path').length).toBe(2);
      expect(text('[role="status"]:not(:empty)')).toBe(
        'Podpis je uložený. Ponesou ho potvrzení vystavená od teď.',
      );
    });

    it('then an SVG whose browser names no type is still uploaded', async () => {
      await choose(scan('Podpis.SVG', '', 1000));

      http.expectOne({ method: 'POST', url: SIGNATURE_URL }).flush(vectorReceiptSignature());
      await settle();

      expect(vectorPreview()).not.toBeNull();
    });

    it('then an SVG of exactly 200 kB is uploaded', async () => {
      await choose(scan('podpis.svg', 'image/svg+xml', 200 * 1024));

      http.expectOne({ method: 'POST', url: SIGNATURE_URL }).flush(vectorReceiptSignature());
      await settle();

      expect(vectorPreview()).not.toBeNull();
    });

    it('then an SVG over 200 kB is refused before uploading', async () => {
      await choose(scan('podpis.svg', 'image/svg+xml', 200 * 1024 + 1));

      expect(text('[role="alert"]:not(:empty)')).toBe(
        'SVG je větší než 200 kB. Zjednodušte ho prosím a zkuste to znovu.',
      );
    });

    it('then a refused SVG says first that it cannot be used and why, once', async () => {
      await choose(scan('podpis.svg', 'image/svg+xml', 1000));

      http.expectOne({ method: 'POST', url: SIGNATURE_URL }).flush(
        {
          type: 'https://nfnn.cz/problems/donations/unsupported-signature-vector',
          title: 'SVG nejde použít jako podpis',
          detail:
            'Soubor obsahuje nepovolený prvek. Ručně psaný podpis v SVG jde, když jsou jeho tahy převedené na vyplněné tvary (path); obrysy s nastavenou tloušťkou čáry (stroke) a efekty web nepřijme a soubor smí mít nejvýš 200 kB. Místo něj můžete nahrát sken JPEG, PNG nebo WebP.',
          status: 400,
          errors: [
            {
              field: 'file',
              code: 'element',
              message: 'Soubor obsahuje nepovolený prvek.',
            },
          ],
        },
        { status: 400, statusText: 'Bad Request' },
      );
      await settle();

      expect(text('[role="alert"]:not(:empty)')).toBe(
        'SVG nejde použít jako podpis. Soubor obsahuje nepovolený prvek. Ručně psaný podpis v SVG jde, když jsou jeho tahy převedené na vyplněné tvary (path); obrysy s nastavenou tloušťkou čáry (stroke) a efekty web nepřijme a soubor smí mít nejvýš 200 kB. Místo něj můžete nahrát sken JPEG, PNG nebo WebP.',
      );
      expect(vectorPreview()).toBeNull();
    });

    it('then a file over 10 MB is refused before uploading', async () => {
      await choose(scan('podpis.jpg', 'image/jpeg', 10 * 1024 * 1024 + 1));

      expect(text('[role="alert"]:not(:empty)')).toBe(
        'Soubor je větší než 10 MB. Zmenšete ho prosím a zkuste to znovu.',
      );
    });

    it('then a refusal of the server is shown with its explanation', async () => {
      await choose(scan());

      http.expectOne({ method: 'POST', url: SIGNATURE_URL }).flush(
        {
          type: 'https://nfnn.cz/problems/donations/unsupported-signature-image',
          title: 'Soubor nejde použít jako podpis',
          detail: 'Nahrajte prosím sken podpisu ve formátu JPEG, PNG nebo WebP.',
          status: 400,
        },
        { status: 400, statusText: 'Bad Request' },
      );
      await settle();

      expect(text('[role="alert"]:not(:empty)')).toContain('Soubor nejde použít jako podpis');
      expect(preview()).toBeNull();
    });
  });

  describe('when the administrator replaces one kind of signature with the other', () => {
    it('then a scan replacing a vector is shown as a scan with its size', async () => {
      await load(vectorReceiptSignature());

      await choose(scan());
      http.expectOne({ method: 'POST', url: SIGNATURE_URL }).flush(receiptSignature());
      await settle();

      expect(vectorPreview()).toBeNull();
      expect(preview()?.getAttribute('src')).toBe(SIGNATURE_IMAGE);
      expect(text('.signature-state')).toBe('Nahráno 23. 10. 2026 21:30, 1 200 × 400 px.');
      expect(text('[role="status"]:not(:empty)')).toBe(
        'Podpis je uložený. Ponesou ho potvrzení vystavená od teď.',
      );
    });

    it('then a vector replacing a scan is drawn and named as SVG', async () => {
      await load(receiptSignature());

      await choose(scan('podpis.svg', 'image/svg+xml', 1000));
      http.expectOne({ method: 'POST', url: SIGNATURE_URL }).flush(vectorReceiptSignature());
      await settle();

      expect(preview()).toBeNull();
      expect(vectorPreview()?.querySelectorAll('path').length).toBe(2);
      expect(text('.signature-state')).toBe('Nahráno 23. 10. 2026 21:30, vektorový podpis (SVG).');
    });
  });

  describe('when the administrator removes the uploaded signature', () => {
    beforeEach(async () => {
      await load(receiptSignature());
      button('Odebrat podpis').click();
      await settle();
    });

    it('then it asks first with the focus on calling it off, and nothing happens on cancel', async () => {
      expect(text('.signature-confirm')).toContain(
        'Potvrzení vystavená potom budou bez podpisu. Odebrat?',
      );
      expect(document.activeElement).toBe(button('Zrušit'));

      button('Zrušit').click();
      await settle();

      expect(fixture.nativeElement.querySelector('.signature-confirm')).toBeNull();
      expect(preview()).not.toBeNull();
      expect(document.activeElement).toBe(button('Odebrat podpis'));
    });

    it('then a failed removal says so and gives the focus back to the remove button', async () => {
      (
        fixture.nativeElement.querySelector('.signature-confirm .ui-button--danger') as HTMLElement
      ).click();
      await settle();
      http
        .expectOne({ method: 'DELETE', url: SIGNATURE_URL })
        .flush(null, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(text('[role="alert"]:not(:empty)')).toBe(
        'Podpis se nepodařilo odebrat. Zkuste to prosím znovu.',
      );
      expect(document.activeElement).toBe(button('Odebrat podpis'));
    });

    it('then on confirming it removes the signature and says so', async () => {
      (
        fixture.nativeElement.querySelector('.signature-confirm .ui-button--danger') as HTMLElement
      ).click();
      await settle();

      http.expectOne({ method: 'DELETE', url: SIGNATURE_URL }).flush(null);
      await settle();

      expect(preview()).toBeNull();
      expect(text('[role="status"]:not(:empty)')).toBe(
        'Podpis je odebraný. Potvrzení vystavená od teď ho nebudou mít.',
      );
      expect(text('.signature-state')).toContain('Podpis není nahraný.');
      expect(document.activeElement).toBe(
        fixture.nativeElement.querySelector('#receipt-signature-file'),
      );
    });
  });
});
