import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AccountUsername } from './account-username';

@Component({
  imports: [AccountUsername],
  template: `<form>
    <app-account-username email="jana@example.cz" />
    <input type="password" autocomplete="current-password" />
  </form>`,
})
class PasswordForm {}

describe('Given a password form with the account user name', () => {
  it('when it renders, then a hidden, read-only user name field holds the account e-mail for password managers', async () => {
    const fixture = TestBed.createComponent(PasswordForm);
    await fixture.whenStable();

    const field = fixture.nativeElement.querySelector(
      'input[autocomplete="username"]',
    ) as HTMLInputElement;
    expect(field.value).toBe('jana@example.cz');
    expect(field.type).toBe('email');
    expect(field.hidden).toBe(true);
    expect(field.readOnly).toBe(true);
    expect(field.tabIndex).toBe(-1);
    expect(field.getAttribute('aria-hidden')).toBe('true');
  });
});
