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
    box(native(), 102, 203);
    box(find('#form-password'), 224, 269);
    find<HTMLInputElement>('#form-password').focus();

    keyboard.show({ top: 102, height: 101 });
    fixture.detectChanges();

    expect(scrolled).toEqual([269 - (102 + 101 - 16)]);
  });

  it('when the sheet scrolls its panel under a sticky head 57 px tall and the field sits under that head, then the panel scrolls the field down below the head', () => {
    const panelScrolled: number[] = [];
    panel().style.overflowY = 'auto';
    panel().style.scrollPaddingTop = '57px';
    panel().scrollBy = ((options: ScrollToOptions) =>
      panelScrolled.push(options.top ?? 0)) as never;
    box(panel(), 0, 549);
    box(find('#form-email'), 30, 74);

    openKeyboardFor('#form-email');

    expect(panelScrolled).toEqual([-(57 + 16 - 30)]);
    expect(30 - panelScrolled[0]).toBeGreaterThanOrEqual(57);
  });

  it('when an iPhone pans the view under the keyboard and measures every box from the visible part, then a field already in sight stays where it is', () => {
    box(native(), 0, 287);
    box(find('#form-email'), 100, 144);
    box(find('#form-submit'), 160, 200);
    find<HTMLInputElement>('#form-email').focus();

    keyboard.show({ top: 303, height: 287 });
    fixture.detectChanges();

    expect(scrolled).toEqual([]);
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

  it('when the keyboard is still up and a button below its top edge takes the focus, as an opener does when a dialog inside closes, then the dialog stays where it is', () => {
    openKeyboardFor('#form-email');
    scrolled.length = 0;

    find<HTMLButtonElement>('#form-submit').focus();

    expect(scrolled).toEqual([]);
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

@Component({
  imports: [Dialog],
  template: `
    <app-dialog labelledBy="sheet-title">
      <h2 id="sheet-title">Bankovní účty</h2>
      <app-dialog labelledBy="nested-title">
        <h2 id="nested-title">Přidat bankovní účet</h2>
        <label for="nested-field">Číslo účtu</label>
        <input id="nested-field" />
      </app-dialog>
    </app-dialog>
  `,
})
class NestedFormDialogHost {}

describe('Given a dialog with a field opened inside another dialog, on a phone whose keyboard covers the lower part of the screen', () => {
  let fixture: ComponentFixture<NestedFormDialogHost>;
  let keyboard: FakeSoftKeyboard;
  let outerScrolled: number[];

  const dialogs = () =>
    fixture.nativeElement.querySelectorAll('dialog') as NodeListOf<HTMLDialogElement>;
  const box = (element: Element, top: number, bottom: number): void => {
    element.getBoundingClientRect = () => ({ top, bottom, height: bottom - top }) as DOMRect;
  };

  beforeEach(async () => {
    keyboard = new FakeSoftKeyboard();
    TestBed.configureTestingModule({
      imports: [NestedFormDialogHost],
      providers: [
        { provide: DialogHistory, useClass: FakeDialogHistory },
        provideFakeSoftKeyboard(keyboard),
      ],
    });
    fixture = TestBed.createComponent(NestedFormDialogHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    outerScrolled = [];
    const outer = dialogs()[0];
    const outerPanel = outer.querySelector(':scope > .dialog-panel') as HTMLElement;
    outer.scrollBy = ((options: ScrollToOptions) => outerScrolled.push(options.top ?? 0)) as never;
    outerPanel.scrollBy = ((options: ScrollToOptions) =>
      outerScrolled.push(options.top ?? 0)) as never;
    dialogs()[1].scrollBy = (() => undefined) as never;
    (dialogs()[1].querySelector('.dialog-panel') as HTMLElement).scrollBy = (() =>
      undefined) as never;
    box(outer, 0, 549);
    box(dialogs()[1], 0, 549);
    box(fixture.nativeElement.querySelector('#nested-field'), 400, 444);
  });

  afterEach(() => fixture.nativeElement.remove());

  it('when the keyboard comes up for the field of the inner dialog, then the outer dialog does not scroll for it', () => {
    (fixture.nativeElement.querySelector('#nested-field') as HTMLInputElement).focus();
    keyboard.show();
    fixture.detectChanges();

    expect(outerScrolled).toEqual([]);
  });
});
