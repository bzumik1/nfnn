import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BankLogosApi } from '../bank-logos-api';
import { FakeBankLogosApi, LOGO_IMAGE_ID } from '../testing/bank-logo-fixtures';
import { BankLogo } from './bank-logo';

function render(account: string, size = 40): ComponentFixture<BankLogo> {
  const fixture = TestBed.createComponent(BankLogo);
  fixture.componentRef.setInput('account', account);
  fixture.componentRef.setInput('size', size);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<BankLogo>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('Given the logos the server keeps', () => {
  beforeEach(() => {
    (TestBed.inject(BankLogosApi) as unknown as FakeBankLogosApi).items = [
      { code: '0800', imageId: LOGO_IMAGE_ID },
    ];
  });

  it('when an account of a bank with a logo renders, then its logo is shown', () => {
    const image = host(render('2000145399/0800')).querySelector('img');

    expect(image?.getAttribute('src')).toBe(`/api/donations/bank-logos/images/${LOGO_IMAGE_ID}`);
    expect(image?.getAttribute('width')).toBe('40');
  });

  it('when an account of a bank without a logo renders, then the monogram of its short name is shown', () => {
    const element = host(render('2900233333/2010', 24));

    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('.bank-monogram')?.getAttribute('data-monogram')).toBe('FB');
  });

  it('when an account is not a Czech account, then a plain bank sign is shown', () => {
    const element = host(render('CZ6508000000192000145399'));

    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('svg.bank-sign')).not.toBeNull();
  });
});
