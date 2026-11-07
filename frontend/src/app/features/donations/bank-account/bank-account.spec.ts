import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BankAccount } from './bank-account';

const BANK_CODES_URL = '/api/donations/bank-codes';

let http: HttpTestingController;

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  http = TestBed.inject(HttpTestingController);
});

afterEach(() => http.verify());

function render(account: string): ComponentFixture<BankAccount> {
  const fixture = TestBed.createComponent(BankAccount);
  fixture.componentRef.setInput('account', account);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<BankAccount>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('Given a Czech account of a bank the site names itself', () => {
  it('when it renders, then it shows only the number in figures, followed by the short name of the bank, and asks the server for nothing', () => {
    const element = host(render('2000145399/0800'));

    expect(element.querySelectorAll('.ui-figures')).toHaveLength(1);
    expect(element.querySelector('.ui-figures')?.textContent?.trim()).toBe('2000145399/0800');
    expect(element.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '2000145399/0800 · Česká spořitelna',
    );
    expect(element.querySelector('.bank')?.textContent).toBe('·\u00a0Česká spořitelna');
    http.expectNone(BANK_CODES_URL);
  });
});

describe('Given an account whose bank code the site does not name itself', () => {
  it('when the list the server keeps names the bank, then its short name follows the number', () => {
    const fixture = render('1234567890/4000');

    http.expectOne(BANK_CODES_URL).flush({
      fetchedAt: '2026-11-09T04:40:00Z',
      items: [{ code: '4000', name: 'Max banka' }],
    });
    fixture.detectChanges();

    expect(host(fixture).textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '1234567890/4000 · Max banka',
    );
  });

  it('when the server does not know the bank either, then it shows only the number', () => {
    const fixture = render('2000145399/9999');

    http.expectOne(BANK_CODES_URL).flush({ fetchedAt: null, items: [] });
    fixture.detectChanges();

    expect(host(fixture).textContent?.trim()).toBe('2000145399/9999');
    expect(host(fixture).textContent).not.toContain('·');
    expect(host(fixture).querySelector('.bank')).toBeNull();
  });
});
