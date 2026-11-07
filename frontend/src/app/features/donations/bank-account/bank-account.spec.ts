import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BankAccount } from './bank-account';

function render(account: string): ComponentFixture<BankAccount> {
  const fixture = TestBed.createComponent(BankAccount);
  fixture.componentRef.setInput('account', account);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<BankAccount>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('Given a Czech account of a bank on the ČNB list', () => {
  it('when it renders, then it shows only the number in figures, followed by the short name of the bank', () => {
    const element = host(render('2000145399/0800'));

    expect(element.querySelectorAll('.ui-figures')).toHaveLength(1);
    expect(element.querySelector('.ui-figures')?.textContent?.trim()).toBe('2000145399/0800');
    expect(element.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '2000145399/0800 · Česká spořitelna',
    );
    expect(element.querySelector('.bank')?.textContent).toBe('·\u00a0Česká spořitelna');
  });
});

describe('Given an account whose bank code is not on the list', () => {
  it('when it renders, then it shows only the number', () => {
    const element = host(render('2000145399/9999'));

    expect(element.textContent?.trim()).toBe('2000145399/9999');
    expect(element.textContent).not.toContain('·');
    expect(element.querySelector('.bank')).toBeNull();
  });
});
