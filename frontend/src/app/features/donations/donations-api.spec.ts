import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BankCheckResponse, DonationListResponse, DonationsApi, DonationSummaryResponse, DownloadedFile } from './donations-api';
import { twoYearDonations, twoYearSummary } from './testing/donation-fixtures';

describe('Given the donations API', () => {
  let api: DonationsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(DonationsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("when the list is requested, then it asks for all of the donor's donations without a year", () => {
    let received: DonationListResponse | undefined;
    api.list().subscribe((response) => (received = response));

    const request = http.expectOne('/api/donations/me');
    expect(request.request.method).toBe('GET');
    expect(request.request.urlWithParams).toBe('/api/donations/me');
    request.flush(twoYearDonations());

    expect(received).toEqual(twoYearDonations());
  });

  it("when the summary is requested, then it asks for the donor's summary", () => {
    let received: DonationSummaryResponse | undefined;
    api.summary().subscribe((response) => (received = response));

    const request = http.expectOne('/api/donations/me/summary');
    expect(request.request.method).toBe('GET');
    request.flush(twoYearSummary());

    expect(received).toEqual(twoYearSummary());
  });

  function pdf(): Blob {
    return new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' });
  }

  it('when a bank check is requested, then it posts an empty body and reads when the bank data was last updated', () => {
    let received: BankCheckResponse | undefined;
    api.requestBankCheck().subscribe((response) => (received = response));

    const request = http.expectOne('/api/donations/me/bank-check');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush({ bankDataAsOf: '2026-10-18T08:05:30Z', checking: true }, { status: 202, statusText: 'Accepted' });

    expect(received).toEqual({ bankDataAsOf: '2026-10-18T08:05:30Z', checking: true });
  });

  it('when the bank check is read, then it asks whether the bank is still being checked', () => {
    let received: BankCheckResponse | undefined;
    api.bankCheck().subscribe((response) => (received = response));

    const request = http.expectOne('/api/donations/me/bank-check');
    expect(request.request.method).toBe('GET');
    request.flush({ bankDataAsOf: null, checking: false });

    expect(received).toEqual({ bankDataAsOf: null, checking: false });
  });

  it("when the receipt of one donation is requested, then it downloads that donation's PDF under the file name from the server", async () => {
    let received: DownloadedFile | undefined;
    api.singleReceipt('0192f0f1-0000-7000-8000-000000000003').subscribe((file) => (received = file));

    const request = http.expectOne('/api/donations/me/0192f0f1-0000-7000-8000-000000000003/receipt');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(pdf(), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          "attachment; filename=\"potvrzeni-o-daru-2027-000001.pdf\"; filename*=UTF-8''potvrzeni-o-daru-2027-000001.pdf",
      },
    });

    expect(received?.fileName).toBe('potvrzeni-o-daru-2027-000001.pdf');
    expect(await received?.blob.text()).toBe('%PDF-1.4\n%%EOF');
  });

  it('when the yearly receipt is requested, then it downloads the PDF of that year', () => {
    let received: DownloadedFile | undefined;
    api.yearlyReceipt(2025).subscribe((file) => (received = file));

    const request = http.expectOne('/api/donations/me/receipts/yearly?year=2025');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(pdf(), { headers: { 'Content-Disposition': 'attachment; filename="potvrzeni-o-darech-2025.pdf"' } });

    expect(received?.fileName).toBe('potvrzeni-o-darech-2025.pdf');
    expect(received?.blob).toBeInstanceOf(Blob);
  });

  it('when the server names the file in both forms, then the UTF-8 form wins', () => {
    let received: DownloadedFile | undefined;
    api.yearlyReceipt(2025).subscribe((file) => (received = file));

    http.expectOne('/api/donations/me/receipts/yearly?year=2025').flush(pdf(), {
      headers: { 'Content-Disposition': "attachment; filename=\"potvrzeni.pdf\"; filename*=UTF-8''potvrzen%C3%AD%20o%20darech.pdf" },
    });

    expect(received?.fileName).toBe('potvrzení o darech.pdf');
  });

  it('when the server names the file only in the UTF-8 form, then that name is used', () => {
    let received: DownloadedFile | undefined;
    api.singleReceipt('d-1').subscribe((file) => (received = file));

    http.expectOne('/api/donations/me/d-1/receipt').flush(pdf(), {
      headers: { 'Content-Disposition': "attachment; filename*=utf-8''donation-receipt-2027-000002.pdf" },
    });

    expect(received?.fileName).toBe('donation-receipt-2027-000002.pdf');
  });

  it('when the server sends no file name, then the yearly receipt is saved under a name with the year', () => {
    let received: DownloadedFile | undefined;
    api.yearlyReceipt(2024).subscribe((file) => (received = file));

    http.expectOne('/api/donations/me/receipts/yearly?year=2024').flush(pdf());

    expect(received?.fileName).toBe('potvrzeni-o-darech-2024.pdf');
  });

  it('when the server sends no file name, then the single receipt is saved under a generic name', () => {
    let received: DownloadedFile | undefined;
    api.singleReceipt('d-1').subscribe((file) => (received = file));

    http.expectOne('/api/donations/me/d-1/receipt').flush(pdf(), { headers: { 'Content-Disposition': 'attachment' } });

    expect(received?.fileName).toBe('potvrzeni-o-daru.pdf');
  });
});
