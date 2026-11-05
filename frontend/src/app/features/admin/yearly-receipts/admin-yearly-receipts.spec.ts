import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { recordClientErrors } from '../../../core/errors/testing/client-error-reports';
import { DownloadProgress } from '../../../shared/ui/download-progress/download-progress';
import { DownloadedFile } from '../../donations/donations-api';
import { PdfDelivery } from '../../donations/receipt-pdf/pdf-delivery';
import { RECEIPT_PDF_ENVIRONMENT } from '../../donations/receipt-pdf/receipt-pdf';
import { FakeReceiptPdfEnvironment } from '../../donations/receipt-pdf/testing/fake-receipt-worker';
import { SYNTHETIC_SIGNATURE_JSON } from '../../donations/receipt-pdf/testing/synthetic-art';
import { YearlyReceiptCandidate, YearlyReceiptResult } from '../admin-api';
import {
  yearlyCandidate,
  yearlyIssuedReceipt,
  yearlyReceiptCandidates,
  yearlyResult,
} from '../testing/admin-fixtures';
import { AdminYearlyReceipts } from './admin-yearly-receipts';
import { SCREEN_WAKE_LOCKS, WakeLockSentinelLike } from './screen-wake-lock';

const URL = '/api/admin/donations/receipts/yearly';
const SIGNATURE_BYTES = new TextEncoder().encode(SYNTHETIC_SIGNATURE_JSON);

function problem(status: number, type: string, title: string, detail: string) {
  return {
    body: { type: `https://nfnn.cz/problems/${type}`, title, detail, status },
    options: {
      status,
      statusText: 'Error',
      headers: { 'Content-Type': 'application/problem+json' },
    },
  };
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function candidate(index: number, name: string, overrides: Partial<YearlyReceiptCandidate> = {}) {
  return yearlyCandidate({ donorId: `donor-${index}`, name, ...overrides });
}

function issuedFor(donorId: string, number: string, overrides: Partial<YearlyReceiptResult> = {}) {
  return yearlyResult({ donorId, receipt: yearlyIssuedReceipt(donorId, number), ...overrides });
}

class FakeSentinel implements WakeLockSentinelLike {
  released = false;

  release(): Promise<void> {
    this.released = true;
    return Promise.resolve();
  }
}

describe('Given an administrator on the bulk receipts page', () => {
  let fixture: ComponentFixture<AdminYearlyReceipts>;
  let http: HttpTestingController;
  let environment: FakeReceiptPdfEnvironment;
  let sentinels: FakeSentinel[];
  let saved: DownloadedFile[];
  let shared: DownloadedFile[];

  beforeEach(async () => {
    localStorage.clear();
    recordClientErrors();
    environment = new FakeReceiptPdfEnvironment();
    sentinels = [];
    saved = [];
    shared = [];
    await TestBed.configureTestingModule({
      imports: [AdminYearlyReceipts],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: RECEIPT_PDF_ENVIRONMENT, useValue: environment },
        {
          provide: SCREEN_WAKE_LOCKS,
          useValue: {
            request: () => {
              const sentinel = new FakeSentinel();
              sentinels.push(sentinel);
              return Promise.resolve(sentinel);
            },
          },
        },
        {
          provide: PdfDelivery,
          useValue: {
            needsSecondTap: () => false,
            save: (file: DownloadedFile) => saved.push(file),
            share: (file: DownloadedFile) => {
              shared.push(file);
              return Promise.resolve('shared');
            },
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminYearlyReceipts);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  function query<T extends HTMLElement>(selector: string): T | null {
    return fixture.nativeElement.querySelector(selector) as T | null;
  }

  function text(element: Element | null): string {
    return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function button(name: RegExp | string): HTMLButtonElement {
    const found = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((candidate) =>
      typeof name === 'string' ? text(candidate) === name : name.test(text(candidate)),
    );
    if (found === undefined) {
      throw new Error(`No button named ${name}`);
    }
    return found;
  }

  function hasButton(name: string): boolean {
    return Array.from(fixture.nativeElement.querySelectorAll('button')).some(
      (candidate) => text(candidate as Element) === name,
    );
  }

  function status(): string {
    return Array.from(fixture.nativeElement.querySelectorAll('[role="status"]'))
      .map((element) => text(element as Element))
      .filter((line) => line !== '')
      .join(' | ');
  }

  function alert(): string {
    return Array.from(fixture.nativeElement.querySelectorAll('[role="alert"]'))
      .map((element) => text(element as Element))
      .filter((line) => line !== '')
      .join(' | ');
  }

  function pairs(selector: string): string {
    return Array.from(fixture.nativeElement.querySelectorAll(`${selector} dt, ${selector} dd`))
      .map((element) => text(element as Element))
      .join(' ');
  }

  function rows(): string[][] {
    return Array.from(fixture.nativeElement.querySelectorAll('.donors-table tbody tr')).map((row) =>
      Array.from((row as HTMLTableRowElement).cells).map((cell) => text(cell)),
    );
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function answerCandidates(
    donors: YearlyReceiptCandidate[],
    overrides: Parameters<typeof yearlyReceiptCandidates>[0] = {},
  ): void {
    http.expectOne(URL).flush(yearlyReceiptCandidates({ donors, ...overrides }));
    fixture.detectChanges();
  }

  function expectIssue(): TestRequest {
    const request = http.expectOne(
      (candidate) => candidate.url === URL && candidate.method === 'POST',
    );
    return request;
  }

  describe('when the page opens', () => {
    beforeEach(() => {
      const request = http.expectOne(URL);
      expect(request.request.params.keys()).toEqual([]);
      request.flush(
        yearlyReceiptCandidates({
          year: 2026,
          yearlyReceiptsAvailableThrough: 2026,
          receiptsAvailableFrom: 2024,
          erasedDonors: 1,
          donors: [
            candidate(1, 'Šťastná Eva', { giftCount: 2, totalAmountMinor: 50000 }),
            candidate(2, 'Adámek Jan', {
              giftCount: 12,
              totalAmountMinor: 1200050,
              receipt: { id: 'r-2', number: '2027-000003', issuedAt: '2027-01-15T11:00:00Z' },
            }),
            candidate(3, 'Čermák Petr'),
            candidate(4, 'Cibulka Ota'),
            candidate(5, 'Svoboda Karel'),
          ],
        }),
      );
      fixture.detectChanges();
    });

    it('then the last completed year is chosen among every year receipts are issued for', () => {
      const select = query<HTMLSelectElement>('select');
      expect(Array.from(select?.options ?? []).map((option) => text(option))).toEqual([
        '2026',
        '2025',
        '2024',
      ]);
      expect(select?.selectedOptions[0]?.textContent?.trim()).toBe('2026');
    });

    it('then the summary counts the donors, the receipts already issued, the new ones and the erased donors left out', () => {
      expect(pairs('.summary')).toBe(
        'Dárci s dary za rok 2026 5 Potvrzení už vystavená 1 Vystaví se nově 4 Vymazaní dárci, přeskočí se 1',
      );
    });

    it('then the donors are listed by name in Czech order with their gifts, total and receipt', () => {
      expect(rows()).toEqual([
        ['Adámek Jan', '12', '12 000,50 Kč', '2027-000003'],
        ['Cibulka Ota', '3', '1 500 Kč', 'zatím ne'],
        ['Čermák Petr', '3', '1 500 Kč', 'zatím ne'],
        ['Svoboda Karel', '3', '1 500 Kč', 'zatím ne'],
        ['Šťastná Eva', '2', '500 Kč', 'zatím ne'],
      ]);
    });

    it('then two-sided printing is on until the administrator turns it off, and the label says what it adds', () => {
      const duplex = query<HTMLInputElement>('input[type="checkbox"]');
      expect(duplex?.checked).toBe(true);
      expect(text(duplex?.closest('label') ?? null)).toBe(
        'Tisknu oboustranně (vložíme prázdné strany, aby každé potvrzení začalo na novém listu; při jednostranném tisku volbu vypněte)',
      );
    });

    it('then the page asks to stay open until the PDF is ready', () => {
      expect(text(query('.keep-open'))).toBe(
        'Nechte prosím stránku otevřenou, dokud nebude PDF hotové. Odchodem se příprava zastaví; vystavená potvrzení zůstanou.',
      );
    });

    it('when another year is chosen, then its donors are asked for', () => {
      const select = query<HTMLSelectElement>('select');
      if (select === null) {
        throw new Error('no year choice');
      }
      select.value = select.options[1].value;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const request = http.expectOne(`${URL}?year=2025`);
      request.flush(yearlyReceiptCandidates({ year: 2025, donors: [candidate(9, 'Nová Ida')] }));
      fixture.detectChanges();

      expect(rows()).toEqual([['Nová Ida', '3', '1 500 Kč', 'zatím ne']]);
    });

    it('and another year is chosen with the keyboard, then the year choice keeps the focus while its donors load', () => {
      const select = query<HTMLSelectElement>('select');
      if (select === null) {
        throw new Error('no year choice');
      }
      select.focus();
      select.value = select.options[1].value;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(query('select')).toBe(select);
      expect(document.activeElement).toBe(select);
      expect(status()).toContain('Načítáme dárce za rok 2025…');
      expect(query('button[type="submit"]')).toBeNull();
      expect(rows()).toEqual([]);

      http
        .expectOne(`${URL}?year=2025`)
        .flush(yearlyReceiptCandidates({ year: 2025, donors: [candidate(9, 'Nová Ida')] }));
      fixture.detectChanges();

      expect(document.activeElement).toBe(select);
      expect(status()).not.toContain('Načítáme');
      expect(rows()).toEqual([['Nová Ida', '3', '1 500 Kč', 'zatím ne']]);
    });

    it('and another year fails to load, then trying again asks for that year', () => {
      const select = query<HTMLSelectElement>('select');
      if (select === null) {
        throw new Error('no year choice');
      }
      select.value = select.options[1].value;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      http.expectOne(`${URL}?year=2025`).flush(null, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(alert()).toContain('Dárce za rok se nepodařilo načíst.');
      button('Zkusit znovu').click();
      http
        .expectOne(`${URL}?year=2025`)
        .flush(yearlyReceiptCandidates({ year: 2025, donors: [candidate(9, 'Nová Ida')] }));
      fixture.detectChanges();

      expect(rows()).toEqual([['Nová Ida', '3', '1 500 Kč', 'zatím ne']]);
    });
  });

  it('when no year is completed yet, then the page says when bulk receipts become possible', () => {
    const { body, options } = problem(
      400,
      'donations/year-not-yet-completed',
      'Rok ještě neskončil',
      'Později.',
    );
    http.expectOne(URL).flush(body, options);
    fixture.detectChanges();

    expect(text(query('.no-year'))).toBe(
      'Roční potvrzení půjde hromadně vystavit po skončení prvního roku, za který je fond vydává.',
    );
    expect(query('button[type="submit"]')).toBeNull();
  });

  it('when the donors do not load, then an alert offers to try again', () => {
    http.expectOne(URL).flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(alert()).toContain('Dárce za rok se nepodařilo načíst.');
    button('Zkusit znovu').click();
    http.expectOne(URL).flush(yearlyReceiptCandidates());
    fixture.detectChanges();
    expect(rows()).toHaveLength(1);
  });

  it('when the year has no donor with gifts, then nothing can be issued', () => {
    answerCandidates([]);

    expect(text(query('.empty'))).toBe('Za rok 2026 nemá dary žádný dárce.');
    expect(query('button[type="submit"]')).toBeNull();
  });

  describe('when 120 donors are issued for', () => {
    const donors = Array.from({ length: 120 }, (_, index) =>
      candidate(index, `Dárce ${String(index).padStart(3, '0')}`),
    );

    beforeEach(() => {
      answerCandidates([...donors].reverse());
      button('Vystavit a připravit PDF k tisku').click();
      fixture.detectChanges();
    });

    it('then the button stays focusable but says it is busy issuing, so the focus does not fall to the page', () => {
      const running = button('Vystavujeme potvrzení…');

      expect(running.disabled).toBe(false);
      expect(running.getAttribute('aria-disabled')).toBe('true');
      running.click();
      expectIssue();
    });

    it('and the page is left while a batch is issuing, then the run stops without drawing anything', async () => {
      const pending = expectIssue();

      expect(() => fixture.destroy()).not.toThrow();
      await settle();

      expect(pending.cancelled).toBe(true);
      expect(environment.workers).toHaveLength(0);
    });

    it('then they go in batches of at most 50 in the order of the list, each after the one before', async () => {
      const first = expectIssue();
      expect(first.request.body).toEqual({
        year: 2026,
        donorIds: donors.slice(0, 50).map((donor) => donor.donorId),
      });
      expect(status()).toContain('Vystavujeme potvrzení 0 z 120…');
      first.flush({
        year: 2026,
        results: donors
          .slice(0, 50)
          .map((donor, index) =>
            issuedFor(donor.donorId, `2027-${String(index + 1).padStart(6, '0')}`),
          ),
        issued: 50,
        replaced: 0,
        unchanged: 0,
        skipped: 0,
      });
      fixture.detectChanges();

      expect(status()).toContain('Vystavujeme potvrzení 50 z 120…');
      const second = expectIssue();
      expect(second.request.body.donorIds).toEqual(donors.slice(50, 100).map((d) => d.donorId));
      second.flush({
        year: 2026,
        results: donors.slice(50, 100).map((donor) => issuedFor(donor.donorId, '2027-000099')),
        issued: 50,
        replaced: 0,
        unchanged: 0,
        skipped: 0,
      });
      const third = expectIssue();
      expect(third.request.body.donorIds).toEqual(donors.slice(100).map((d) => d.donorId));
      third.flush({
        year: 2026,
        results: donors.slice(100).map((donor) => issuedFor(donor.donorId, '2027-000099')),
        issued: 20,
        replaced: 0,
        unchanged: 0,
        skipped: 0,
      });
      await settle();

      await vi.waitFor(() => expect(environment.workers).toHaveLength(1));
      environment.last().say({ kind: 'ready' });
      expect(environment.last().bundles[0].documents).toHaveLength(120);
      expect(environment.last().bundles[0].documents[0].number).toBe('2027-000001');
    });

    it('then a batch that fails stops the run with an alert, and trying again sends only the donors not issued yet', async () => {
      expectIssue().flush({
        year: 2026,
        results: donors.slice(0, 50).map((donor) => issuedFor(donor.donorId, '2027-000001')),
        issued: 50,
        replaced: 0,
        unchanged: 0,
        skipped: 0,
      });
      expectIssue().flush(null, { status: 503, statusText: 'Unavailable' });
      await settle();

      expect(alert()).toContain(
        'Vystavování potvrzení se přerušilo. Vystavená potvrzení platí; zkuste to prosím znovu a budeme pokračovat tam, kde jsme skončili.',
      );
      await vi.waitFor(() => expect(sentinels.every((sentinel) => sentinel.released)).toBe(true));

      button('Zkusit znovu').click();
      fixture.detectChanges();
      expect(expectIssue().request.body.donorIds).toEqual(
        donors.slice(50, 100).map((donor) => donor.donorId),
      );
    });

    it('and the run is cancelled while a batch is issuing, then the focus goes to the line that says so and trying again goes on', async () => {
      expectIssue().flush({
        year: 2026,
        results: donors.slice(0, 50).map((donor) => issuedFor(donor.donorId, '2027-000001')),
        issued: 50,
        replaced: 0,
        unchanged: 0,
        skipped: 0,
      });
      const pending = expectIssue();
      fixture.debugElement.query(By.directive(DownloadProgress)).componentInstance.cancelled.emit();
      await settle();

      expect(pending.cancelled).toBe(true);
      expect(alert()).toContain('Přípravu jste zrušili.');
      expect(document.activeElement).toBe(query('.failure'));
      button('Zkusit znovu').click();
      fixture.detectChanges();
      expect(expectIssue().request.body.donorIds).toEqual(
        donors.slice(50, 100).map((donor) => donor.donorId),
      );
    });

    it('and the main button is pressed after a batch failed, then the run goes on with the donors not issued yet', async () => {
      expectIssue().flush({
        year: 2026,
        results: donors.slice(0, 50).map((donor) => issuedFor(donor.donorId, '2027-000001')),
        issued: 50,
        replaced: 0,
        unchanged: 0,
        skipped: 0,
      });
      expectIssue().flush(null, { status: 503, statusText: 'Unavailable' });
      await settle();

      button('Vystavit a připravit PDF k tisku').click();
      fixture.detectChanges();
      expect(expectIssue().request.body.donorIds).toEqual(
        donors.slice(50, 100).map((donor) => donor.donorId),
      );
    });
  });

  describe('when a year of four donors is issued, printed on both sides', () => {
    let digest: string;
    let imagesAsked: number;

    beforeEach(async () => {
      digest = await sha256(SIGNATURE_BYTES);
      imagesAsked = 0;
      answerCandidates([
        candidate(1, 'Adámek Jan'),
        candidate(2, 'Bílá Eva', {
          receipt: { id: 'r-2', number: '2027-000003', issuedAt: '2027-01-15T11:00:00Z' },
        }),
        candidate(3, 'Cibulka Ota'),
        candidate(4, 'Dvořák Petr'),
      ]);
      await settle();
      button('Vystavit a připravit PDF k tisku').click();
      fixture.detectChanges();
      await vi.waitFor(() => expect(sentinels).toHaveLength(1));
      const signed = (donorId: string, number: string) => {
        const receipt = yearlyIssuedReceipt(donorId, number);
        return {
          ...receipt,
          receipt: {
            ...receipt.receipt,
            signatory: { ...receipt.receipt.signatory, signatureImage: { sha256: digest } },
          },
        };
      };
      expectIssue().flush({
        year: 2026,
        results: [
          yearlyResult({
            donorId: 'donor-1',
            outcome: 'ISSUED',
            receipt: signed('donor-1', '2027-000010'),
          }),
          yearlyResult({
            donorId: 'donor-2',
            outcome: 'REPLACED',
            replacedNumber: '2027-000003',
            receipt: signed('donor-2', '2027-000011'),
          }),
          yearlyResult({
            donorId: 'donor-3',
            outcome: 'SKIPPED',
            problem: 'donations/donor-erased',
            receipt: null,
          }),
          yearlyResult({
            donorId: 'donor-4',
            outcome: 'UNCHANGED',
            receipt: signed('donor-4', '2027-000004'),
          }),
        ],
        issued: 1,
        replaced: 1,
        unchanged: 1,
        skipped: 1,
      });
      await settle();
      await vi.waitFor(() => {
        const image = http.match(`/api/admin/donations/receipt-images/${digest}`);
        imagesAsked += image.length;
        for (const request of image) {
          request.flush(arrayBuffer(SIGNATURE_BYTES), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        expect(environment.workers).toHaveLength(1);
      });
      environment.last().say({ kind: 'ready' });
      fixture.detectChanges();
    });

    it('then the image the receipts share is fetched once and the worker draws the issued receipts in list order on both sides', () => {
      expect(imagesAsked).toBe(1);
      const bundle = environment.last().bundles[0];
      expect(bundle.documents.map((document) => document.number)).toEqual([
        '2027-000010',
        '2027-000011',
        '2027-000004',
      ]);
      expect(bundle.options.duplex).toBe(true);
      expect(bundle.options.info.title).toBe('Roční potvrzení o darech za rok 2026');
    });

    it('then the drawing tells which receipt it is on without announcing every receipt', () => {
      environment.last().say({ kind: 'receipt', index: 0 });
      fixture.detectChanges();
      const announced = status();
      environment.last().say({ kind: 'receipt', index: 1 });
      fixture.detectChanges();

      expect(status()).toBe(announced);
      expect(status()).toContain('Kreslíme potvrzení…');
      expect(text(query('.download-progress-detail'))).toBe('2 z 3');
      expect(query('progress')?.getAttribute('aria-valuetext')).toBe('2 z 3');
      expect(button('Připravujeme PDF…').getAttribute('aria-disabled')).toBe('true');
    });

    describe('and the PDF is ready', () => {
      beforeEach(async () => {
        environment.last().say({ kind: 'done', bytes: new TextEncoder().encode('%PDF-1.7') });
        await settle();
      });

      it('then the page says so, lets the screen sleep again and counts each outcome', async () => {
        expect(status()).toContain('PDF k tisku je připravené: obsahuje 3 potvrzení.');
        await vi.waitFor(() => expect(sentinels[0].released).toBe(true));
        expect(pairs('.outcomes')).toBe(
          'Nově vystaveno 1 Beze změny 1 Nahrazeno, dary se od vystavení změnily 1 Přeskočeno 1',
        );
      });

      it('then the replaced receipts and the skipped donors are listed with the reason and a link to their card', () => {
        expect(text(query('.replaced'))).toBe(
          'Nahrazená potvrzení V PDF jsou už nová, se všemi dary. Stará potvrzení přestanou platit (jako když je nahradíte na kartě dárce), a tak dárcům pošlete nová. Bílá Eva: 2027-000011 nahrazuje 2027-000003',
        );
        expect(text(query('.skipped'))).toBe(
          'Přeskočení dárci Cibulka Ota: osobní údaje dárce jsou vymazané, nové potvrzení nevystavujeme.',
        );
        expect(query<HTMLAnchorElement>('.skipped a')?.getAttribute('href')).toBe(
          '/sprava/darci/donor-3',
        );
      });

      it('then the summary of the list before the run gives way to the result, and the next step is the PDF', () => {
        expect(query('.summary')).toBeNull();
        expect(button('Vystavit a připravit PDF k tisku').classList).not.toContain(
          'ui-button--primary',
        );
        expect(button('Stáhnout PDF').classList).toContain('ui-button--primary');
        expect(text(query('.print-hint'))).toBe(
          'Tiskněte ve skutečné velikosti (100 %), ať ověřovací QR kód zůstane čitelný.',
        );
      });

      it('then the list shows the receipt numbers now valid', () => {
        expect(rows().map((row) => row[3])).toEqual([
          '2027-000010',
          '2027-000011',
          'zatím ne',
          '2027-000004',
        ]);
      });

      it('then the PDF is saved under the bundle file name and saved again from memory without the network', () => {
        button('Stáhnout PDF').click();
        fixture.detectChanges();
        button('Stáhnout znovu').click();

        expect(saved.map((file) => file.fileName)).toEqual([
          'potvrzeni-o-darech-2026-hromadne.pdf',
          'potvrzeni-o-darech-2026-hromadne.pdf',
        ]);
        expect(saved[0]).toBe(saved[1]);
      });

      it('then opening the PDF hands it to the system', () => {
        button('Otevřít PDF').click();

        expect(shared).toHaveLength(1);
      });

      it('and two-sided printing is turned off, then the PDF is drawn again one-sided without issuing anew', async () => {
        query<HTMLInputElement>('input[type="checkbox"]')?.click();
        fixture.detectChanges();

        expect(hasButton('Stáhnout PDF')).toBe(false);
        await vi.waitFor(() => {
          for (const request of http.match(`/api/admin/donations/receipt-images/${digest}`)) {
            request.flush(arrayBuffer(SIGNATURE_BYTES), {
              headers: { 'Content-Type': 'application/json' },
            });
          }
          expect(environment.workers).toHaveLength(2);
        });
        environment.last().say({ kind: 'ready' });
        fixture.detectChanges();
        expect(environment.last().bundles[0].options.duplex).toBe(false);
        environment.last().say({ kind: 'done', bytes: new TextEncoder().encode('%PDF-1.7') });
        await settle();

        expect(hasButton('Stáhnout PDF')).toBe(true);
        expect(pairs('.outcomes')).toBe(
          'Nově vystaveno 1 Beze změny 1 Nahrazeno, dary se od vystavení změnily 1 Přeskočeno 1',
        );
      });
    });

    it('when the drawing fails, then an alert says what to do and trying again draws without issuing anew', async () => {
      environment.last().say({ kind: 'failed', reason: 'drawing', name: 'TypeError' });
      await settle();

      expect(alert()).toContain(
        'PDF se v prohlížeči nepodařilo vytvořit. Zkuste to prosím znovu, případně v jiném prohlížeči.',
      );
      button('Zkusit znovu').click();
      fixture.detectChanges();
      await vi.waitFor(() => {
        for (const request of http.match(`/api/admin/donations/receipt-images/${digest}`)) {
          request.flush(arrayBuffer(SIGNATURE_BYTES), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        expect(environment.workers).toHaveLength(2);
      });
    });
  });

  it('when the server cannot sign receipts now, then its reason is the alert', async () => {
    answerCandidates([candidate(1, 'Adámek Jan')]);
    button('Vystavit a připravit PDF k tisku').click();
    fixture.detectChanges();

    const { body, options } = problem(
      409,
      'donations/receipt-signing-paused',
      'Potvrzení teď nejde vystavit',
      'Zkuste to prosím za pár minut.',
    );
    expectIssue().flush(body, options);
    await settle();

    expect(alert()).toContain('Potvrzení teď nejde vystavit. Zkuste to prosím za pár minut.');
    expect(hasButton('Stáhnout PDF')).toBe(false);
  });

  it('when every donor is skipped, then no PDF is drawn and the page says why', async () => {
    answerCandidates([candidate(1, 'Adámek Jan')]);
    button('Vystavit a připravit PDF k tisku').click();
    fixture.detectChanges();
    expectIssue().flush({
      year: 2026,
      results: [
        yearlyResult({
          donorId: 'donor-1',
          outcome: 'SKIPPED',
          problem: 'donations/yearly-receipt-not-available',
          receipt: null,
        }),
      ],
      issued: 0,
      replaced: 0,
      unchanged: 0,
      skipped: 1,
    });
    await settle();

    expect(environment.workers).toEqual([]);
    expect(status()).toContain('Žádné potvrzení k tisku: všichni dárci byli přeskočeni.');
    expect(text(query('.skipped'))).toContain('Adámek Jan: za tento rok nemá žádný dar.');
  });
});
