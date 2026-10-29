import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CompanyLookupApi, RegisteredCompany } from './company-lookup-api';

describe('Given the company lookup API', () => {
  let api: CompanyLookupApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CompanyLookupApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when the register knows the company, then its name and seat come back', () => {
    const company: RegisteredCompany = {
      companyIdentifier: '45274649',
      name: 'Stavby Novák s.r.o.',
      address: { street: 'Dlouhá 12', city: 'Ústí nad Labem', postalCode: '400 01' },
    };
    let answer: RegisteredCompany | null | undefined;

    api.lookUp('45274649').subscribe((found) => (answer = found));
    const request = http.expectOne('/api/donors/company-lookup?companyIdentifier=45274649');
    expect(request.request.method).toBe('GET');
    request.flush(company);

    expect(answer).toEqual(company);
  });

  it('when the register has nothing to say, then the answer is empty', () => {
    let answer: RegisteredCompany | null | undefined;

    api.lookUp('10000011').subscribe((found) => (answer = found));
    http
      .expectOne('/api/donors/company-lookup?companyIdentifier=10000011')
      .flush(null, { status: 204, statusText: 'No Content' });

    expect(answer).toBeNull();
  });
});
