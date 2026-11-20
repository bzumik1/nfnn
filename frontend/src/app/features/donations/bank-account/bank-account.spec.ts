import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BankAccount } from './bank-account';
import { withOrdinarySpaces } from '../../../../testing/ordinary-spaces';

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
    expect(withOrdinarySpaces(element.querySelector('.ui-figures')?.textContent)?.trim()).toBe(
      '2000145399/0800',
    );
    expect(withOrdinarySpaces(element.textContent)?.replace(/\s+/g, ' ').trim()).toBe(
      '2000145399/0800 · Česká spořitelna',
    );
    expect(withOrdinarySpaces(element.querySelector('.bank')?.textContent)).toBe(
      '· Česká spořitelna',
    );
    http.expectNone(BANK_CODES_URL);
  });
});

describe('Given a Czech account number wider than its line', () => {
  it('when it renders, then the number may break only before its bank code', () => {
    const figures = host(render('2000145399/0800')).querySelector('.ui-figures')!;
    const breakOpportunity = figures.querySelector('wbr')!;

    expect(figures.textContent).toBe('2000145399/0800');
    expect(breakOpportunity.previousSibling?.textContent).toBe('2000145399/');
    expect(breakOpportunity.nextSibling?.textContent).toBe('0800');
  });
});

describe('Given an account with the name of its bank', () => {
  it('when it renders, then the number and the bank use the shared separator that hides at a line break', () => {
    const element = host(render('2000145399/0800'));

    expect(element.querySelector('.account')?.classList).toContain('ui-separated');
    expect(element.querySelector('.bank')?.classList).toContain('ui-separated__item');
    expect(element.querySelector('.bank > .separator')?.classList).toContain(
      'ui-separated__separator',
    );
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

    expect(withOrdinarySpaces(host(fixture).textContent)?.replace(/\s+/g, ' ').trim()).toBe(
      '1234567890/4000 · Max banka',
    );
  });

  it('when the server does not know the bank either, then it shows only the number', () => {
    const fixture = render('2000145399/9999');

    http.expectOne(BANK_CODES_URL).flush({ fetchedAt: null, items: [] });
    fixture.detectChanges();

    expect(withOrdinarySpaces(host(fixture).textContent)?.trim()).toBe('2000145399/9999');
    expect(withOrdinarySpaces(host(fixture).textContent)).not.toContain('·');
    expect(host(fixture).querySelector('.bank')).toBeNull();
  });
});

describe('Given an account shown in the administration', () => {
  it('when it is a Czech account, then the small round mark of its bank, without a logo the bank sign, comes before the number, and a foreign one gets none', () => {
    const czech = host(render('2000145399/0800'));
    const mark = czech.querySelector('app-bank-logo');

    expect(mark?.querySelector('svg.bank-sign')).not.toBeNull();
    expect(mark?.compareDocumentPosition(czech.querySelector('.ui-figures')!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(host(render('CZ6508000000192000145399')).querySelector('app-bank-logo')).toBeNull();
  });
});

describe('Given a Czech account with a prefix, as long as an account number gets', () => {
  it('when it renders, then the number is one run of text that may break only before the bank code, so a screen reader reads it as one item', () => {
    const number = host(render('000019-2000145399/0800')).querySelector('.ui-figures')!;

    expect(number.children.length).toBe(1);
    expect(number.firstElementChild?.tagName).toBe('WBR');
    expect([...number.childNodes].map((node) => node.textContent?.trim())).toEqual([
      '000019-2000145399/',
      '',
      '0800',
    ]);
  });
});

describe('Given an account that is not a Czech account number', () => {
  it('when it renders, then the whole number is one run of text without a break', () => {
    const fixture = render('CZ6508000000192000145399');
    http.expectNone(BANK_CODES_URL);

    const number = host(fixture).querySelector('.ui-figures')!;
    expect(number.children.length).toBe(0);
    expect(number.textContent?.trim()).toBe('CZ6508000000192000145399');
  });
});
