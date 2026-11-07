import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BankCodesResponse } from './bank-codes-api';
import { BankNames } from './bank-names';

const BANK_CODES_URL = '/api/donations/bank-codes';

function served(items: BankCodesResponse['items']): BankCodesResponse {
  return { fetchedAt: '2026-11-09T04:40:00Z', items };
}

describe('Given the names of Czech banks', () => {
  let names: BankNames;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    names = TestBed.inject(BankNames);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when the bank code has a short name of the site, then that name is given and the server is not asked', () => {
    names.require('2000145399/0800');

    expect(names.nameOf('2000145399/0800')).toBe('Česká spořitelna');
    http.expectNone(BANK_CODES_URL);
  });

  it('when the account is no Czech account, then no name is given and the server is not asked', () => {
    names.require('CZ6508000000192000145399');

    expect(names.nameOf('CZ6508000000192000145399')).toBeNull();
    http.expectNone(BANK_CODES_URL);
  });

  describe('when a bank code the site does not know is required', () => {
    beforeEach(() => names.require('1234567890/4000'));

    it('then the list the server keeps is asked for once, and the name it holds is given shortened', () => {
      names.require('1234567890/4100');
      const request = http.expectOne(BANK_CODES_URL);
      expect(request.request.method).toBe('GET');
      expect(names.nameOf('1234567890/4000')).toBeNull();

      request.flush(served([{ code: '4000', name: 'Max banka a.s.' }]));

      expect(names.nameOf('1234567890/4000')).toBe('Max banka');
      expect(names.nameOf('1234567890/4100')).toBeNull();
      expect(names.nameOf('2000145399/0800')).toBe('Česká spořitelna');
      names.require('1234567890/4100');
      http.expectNone(BANK_CODES_URL);
    });

    it('then a server that holds the code under another name does not replace the short name of the site', () => {
      http
        .expectOne(BANK_CODES_URL)
        .flush(served([{ code: '0800', name: 'Česká spořitelna, a.s.' }]));

      expect(names.nameOf('2000145399/0800')).toBe('Česká spořitelna');
    });

    it('then a failed answer gives no name and breaks nothing', () => {
      http
        .expectOne(BANK_CODES_URL)
        .flush(null, { status: 503, statusText: 'Service Unavailable' });

      expect(names.nameOf('1234567890/4000')).toBeNull();
      expect(names.nameOf('2000145399/0800')).toBe('Česká spořitelna');
    });
  });
});
