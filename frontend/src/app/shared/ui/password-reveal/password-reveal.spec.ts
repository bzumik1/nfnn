import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PasswordReveal } from './password-reveal';

@Component({
  imports: [PasswordReveal],
  template: `<app-password-reveal
    ><input id="secret" type="password" value="correct horse battery"
  /></app-password-reveal>`,
})
class Host {}

describe('Given a password field with a reveal button', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const input = () => (fixture.nativeElement as HTMLElement).querySelector('input')!;
  const button = () => (fixture.nativeElement as HTMLElement).querySelector('button')!;

  it('when it renders, then the password is hidden and the button says what it does', () => {
    expect(input().type).toBe('password');
    expect(button().getAttribute('type')).toBe('button');
    expect(button().getAttribute('aria-label')).toBe('Zobrazit heslo');
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(button().getAttribute('aria-controls')).toBe('secret');
  });

  it('when the button is pressed, then the password shows, and pressing it again hides it', async () => {
    button().click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(input().type).toBe('text');
    expect(button().getAttribute('aria-pressed')).toBe('true');

    button().click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(input().type).toBe('password');
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });
});
