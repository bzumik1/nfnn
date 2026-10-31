import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { person, PORTRAIT_ID } from '../../../content/testing/people-fixtures';
import {
  noReceiptSignatory,
  receiptSignatory,
  SIGNATORY_ID,
  vectorReceiptSignature,
} from '../../testing/admin-fixtures';
import { ReceiptSignatory } from './receipt-signatory';

const SIGNATORY_URL = '/api/admin/donations/receipt-signatory';
const PEOPLE_URL = '/api/admin/content/people';
const SIGNATURE_URL = `/api/admin/donations/receipt-signatures/${SIGNATORY_ID}`;

describe('Given the receipt settings card that shows who signs the receipts', () => {
  let fixture: ComponentFixture<ReceiptSignatory>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceiptSignatory],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReceiptSignatory);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('when it loads, then it says so', () => {
    expect(text('[role="status"]')).toBe('Načítáme, kdo potvrzení podepisuje…');
    http.expectOne(SIGNATORY_URL).flush(noReceiptSignatory());
  });

  it('when nobody signs the receipts, then it warns that no receipt is issued and leads to the people of the foundation', async () => {
    http.expectOne(SIGNATORY_URL).flush(noReceiptSignatory());
    await settle();

    expect(text('[role="alert"]')).toBe(
      'Potvrzení o daru teď nikdo nepodepisuje, a tak je web dárcům nevystaví. Vyberte u lidí fondu, kdo je podepisuje, a jeho funkci na potvrzení.',
    );
    expect(fixture.nativeElement.querySelector('figure')).toBeNull();
    const link = fixture.nativeElement.querySelector('a.signatory-open') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('Otevřít lidi fondu');
    expect(link.getAttribute('href')).toBe('/sprava/lide-fondu');
  });

  it('when a signatory with a portrait and a signature is chosen, then the preview shows the round portrait, the line for the foundation, the signature, the name and the receipt role', async () => {
    http.expectOne(SIGNATORY_URL).flush(receiptSignatory());
    await settle();
    http.expectOne(PEOPLE_URL).flush({ members: [person()], note: null });
    http.expectOne(SIGNATURE_URL).flush(vectorReceiptSignature());
    await settle();

    expect(text('figcaption')).toBe('Náhled podpisu na potvrzení');
    expect(
      fixture.nativeElement.querySelector('img.signature-block-portrait')?.getAttribute('src'),
    ).toBe(`/api/content/media/${PORTRAIT_ID}?w=240`);
    expect(text('.signature-block-for')).toBe('Za Nová naděje - nadační fond:');
    const svg = fixture.nativeElement.querySelector('svg.signature-artwork') as SVGSVGElement;
    expect(svg.getAttribute('aria-label')).toBe('Podpis na potvrzení');
    expect(svg.querySelector('path')?.getAttribute('d')).toBe(
      'M10 80 C40 10 65 10 95 80 S150 150 180 80 Z',
    );
    expect(text('.signature-block-name')).toBe('Eva Vzorová');
    expect(text('.signature-block-role')).toBe('předsedkyně správní rady');
    expect(fixture.nativeElement.querySelector('.signatory-gaps')).toBeNull();
  });

  it('when the signatory has neither a portrait nor a signature, then the preview keeps the line and the name and says what is missing without loading images', async () => {
    http.expectOne(SIGNATORY_URL).flush(receiptSignatory({ portrait: false, signature: false }));
    await settle();

    expect(fixture.nativeElement.querySelector('img.signature-block-portrait')).toBeNull();
    expect(fixture.nativeElement.querySelector('.signature-artwork')).toBeNull();
    expect(text('.signature-block-name')).toBe('Eva Vzorová');
    expect(text('.signatory-gaps')).toBe(
      'Osoba nemá portrét ani podpis na potvrzení. Potvrzení budou mít jen čáru se jménem a funkcí.',
    );
  });

  it('when the signatory cannot be loaded, then it says so and loads again on request', async () => {
    http.expectOne(SIGNATORY_URL).flush(null, { status: 500, statusText: 'Error' });
    await settle();

    expect(text('[role="alert"]')).toContain('Nepodařilo se načíst, kdo potvrzení podepisuje.');
    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    http.expectOne(SIGNATORY_URL).flush(noReceiptSignatory());
    await settle();
    expect(text('[role="alert"]')).toContain('nikdo nepodepisuje');
  });
});
