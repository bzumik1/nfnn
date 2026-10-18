import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DonationListResponse, DonationsApi, DonationSummaryResponse } from './donations-api';
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

  it("when the list is requested without a year, then it asks for all of the donor's donations", () => {
    let received: DonationListResponse | undefined;
    api.list().subscribe((response) => (received = response));

    const request = http.expectOne((req) => req.url === '/api/donations/me');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.has('year')).toBe(false);
    expect(request.request.urlWithParams).toBe('/api/donations/me');
    request.flush(twoYearDonations());

    expect(received).toEqual(twoYearDonations());
  });

  it('when the list is requested for a year, then the year travels as a query parameter', () => {
    api.list(2025).subscribe();

    const request = http.expectOne((req) => req.url === '/api/donations/me');
    expect(request.request.urlWithParams).toBe('/api/donations/me?year=2025');
    request.flush(twoYearDonations());
  });

  it("when the summary is requested, then it asks for the donor's summary", () => {
    let received: DonationSummaryResponse | undefined;
    api.summary().subscribe((response) => (received = response));

    const request = http.expectOne('/api/donations/me/summary');
    expect(request.request.method).toBe('GET');
    request.flush(twoYearSummary());

    expect(received).toEqual(twoYearSummary());
  });
});
