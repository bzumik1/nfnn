import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  FakeSoftKeyboard,
  provideFakeSoftKeyboard,
} from '../../../core/layout/testing/fake-soft-keyboard';
import { Dialog } from './dialog';
import { DialogHistory } from './dialog-history';
import { FakeDialogHistory } from './testing/fake-dialog-history';

@Component({
  imports: [Dialog],
  template: `
    <app-dialog labelledBy="form-title">
      <h2 id="form-title">Přihlášení</h2>
      <p id="lead">Přístup do přehledu</p>
      <form>
        <label for="form-email">E-mail</label>
        <input id="form-email" type="email" />
        <label for="form-password">Heslo</label>
        <input id="form-password" type="password" />
        <button id="form-submit" type="submit">Přihlásit se</button>
      </form>
    </app-dialog>
  `,
})
class FormDialogHost {}

describe('Given a dialog with a form on a phone whose keyboard covers the lower part of the screen', () => {
  let fixture: ComponentFixture<FormDialogHost>;
  let keyboard: FakeSoftKeyboard;
  let scrolled: number[];

  const find = <T extends HTMLElement>(selector: string) =>
    fixture.nativeElement.querySelector(selector) as T;
  const native = () => find<HTMLDialogElement>('dialog');
  const panel = () => find<HTMLElement>('.dialog-panel');
  const box = (element: Element, top: number, bottom: number): void => {
    element.getBoundingClientRect = () => ({ top, bottom, height: bottom - top }) as DOMRect;
  };

  beforeEach(async () => {
    keyboard = new FakeSoftKeyboard();
    TestBed.configureTestingModule({
      imports: [FormDialogHost],
      providers: [
        { provide: DialogHistory, useClass: FakeDialogHistory },
        provideFakeSoftKeyboard(keyboard),
      ],
    });
    fixture = TestBed.createComponent(FormDialogHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    scrolled = [];
    native().scrollBy = ((options: ScrollToOptions) => scrolled.push(options.top ?? 0)) as never;
    box(native(), 0, 549);
    box(find('#form-email'), 200, 244);
    box(find('#form-password'), 300, 344);
    box(find('#form-submit'), 380, 428);
  });

  afterEach(() => fixture.nativeElement.remove());

  function openKeyboardFor(selector: string): void {
    find<HTMLInputElement>(selector).focus();
    keyboard.show();
    fixture.detectChanges();
  }

  describe('when the keyboard comes up for the password', () => {
    it('and the password and the sign-in button fit above it together, then the dialog scrolls both into sight', () => {
      openKeyboardFor('#form-password');

      expect(scrolled).toEqual([428 - (287 - 16)]);
    });

    it('and they do not fit together, then the dialog scrolls just the password into sight', () => {
      box(find('#form-submit'), 380, 700);

      openKeyboardFor('#form-password');

      expect(scrolled).toEqual([344 - (287 - 16)]);
    });
  });

  it('when the phone lies on its side and the browser has moved the visible part down, then the dialog scrolls the field into that part', () => {
    box(native(), 0, 375);
    box(find('#form-password'), 224, 269);
    find<HTMLInputElement>('#form-password').focus();

    keyboard.show({ top: 102, height: 101 });
    fixture.detectChanges();

    expect(scrolled).toEqual([269 - (102 + 101 - 16)]);
  });

  it('when the keyboard comes up for a field that is already in sight with the button, then the dialog stays where it is', () => {
    box(find('#form-email'), 100, 144);
    box(find('#form-submit'), 160, 200);

    openKeyboardFor('#form-email');

    expect(scrolled).toEqual([]);
  });

  it('when the visitor moves on to the next field with the keyboard up, then that field is scrolled into sight', () => {
    openKeyboardFor('#form-email');
    scrolled.length = 0;

    find<HTMLInputElement>('#form-password').focus();

    expect(scrolled).toEqual([428 - (287 - 16)]);
  });

  it('when no keyboard is up, then focusing a field leaves the dialog where it is', () => {
    find<HTMLInputElement>('#form-password').focus();

    expect(scrolled).toEqual([]);
  });

  function touch(target: Element, type: string, fingers = 1): void {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, 'touches', { value: Array.from({ length: fingers }) });
    target.dispatchEvent(event);
  }

  describe('when the keyboard is up and the visitor drags the dialog with a finger', () => {
    beforeEach(() => {
      openKeyboardFor('#form-password');
      touch(find('#lead'), 'touchstart');
      native().dispatchEvent(new Event('scroll'));
    });

    it('then the keyboard goes away, as a native form sheet does, and the focus stays in the dialog', () => {
      expect(document.activeElement).toBe(panel());
    });

    it('and the visitor taps a field again, then that field takes the focus and the dialog stays reachable by Tab', () => {
      find<HTMLInputElement>('#form-email').focus();

      expect(document.activeElement).toBe(find('#form-email'));
      expect(panel().hasAttribute('tabindex')).toBe(false);
    });
  });

  it('when the drag starts in the focused field itself, as to move the caret, then the keyboard stays', () => {
    openKeyboardFor('#form-password');

    touch(find('#form-password'), 'touchstart');
    native().dispatchEvent(new Event('scroll'));

    expect(document.activeElement).toBe(find('#form-password'));
  });

  it('when two fingers touch the dialog, then the keyboard stays', () => {
    openKeyboardFor('#form-password');

    touch(find('#lead'), 'touchstart', 2);
    native().dispatchEvent(new Event('scroll'));

    expect(document.activeElement).toBe(find('#form-password'));
  });

  it('when the dialog scrolls after the finger has let go, as it does by itself, then the keyboard stays', () => {
    openKeyboardFor('#form-password');

    touch(find('#lead'), 'touchstart');
    touch(find('#lead'), 'touchend', 0);
    native().dispatchEvent(new Event('scroll'));

    expect(document.activeElement).toBe(find('#form-password'));
  });

  it('when no keyboard is up and the visitor drags the dialog, then the focus stays where it is', () => {
    find<HTMLInputElement>('#form-password').focus();

    touch(find('#lead'), 'touchstart');
    native().dispatchEvent(new Event('scroll'));

    expect(document.activeElement).toBe(find('#form-password'));
  });
});
