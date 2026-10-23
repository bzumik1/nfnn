import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  noReceiptSignature,
  receiptSignature,
  SIGNATURE_IMAGE,
} from '../../testing/admin-fixtures';
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
  });

  it('when a signature is uploaded, then it shows the scan with its size and upload time', async () => {
    await load(receiptSignature());

    expect(preview()?.getAttribute('src')).toBe(SIGNATURE_IMAGE);
    expect(preview()?.getAttribute('alt')).toBe('Nahraný podpis');
    expect(text('.signature-state')).toBe('Nahráno 23. 10. 2026 21:30, 1 200 × 400 px.');
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
        'Vyberte prosím sken ve formátu JPEG, PNG nebo WebP.',
      );
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

  describe('when the administrator removes the uploaded signature', () => {
    beforeEach(async () => {
      await load(receiptSignature());
      button('Odebrat podpis').click();
      await settle();
    });

    it('then it asks first and removing nothing happens on no', async () => {
      expect(text('.signature-confirm')).toContain(
        'Potvrzení vystavená potom budou bez podpisu. Odebrat?',
      );

      button('Ne').click();
      await settle();

      expect(fixture.nativeElement.querySelector('.signature-confirm')).toBeNull();
      expect(preview()).not.toBeNull();
    });

    it('then on yes it removes the signature and says so', async () => {
      button('Ano, odebrat').click();
      await settle();

      http.expectOne({ method: 'DELETE', url: SIGNATURE_URL }).flush(null);
      await settle();

      expect(preview()).toBeNull();
      expect(text('[role="status"]:not(:empty)')).toBe(
        'Podpis je odebraný. Potvrzení vystavená od teď ho nebudou mít.',
      );
      expect(text('.signature-state')).toContain('Podpis není nahraný.');
    });
  });
});
