import { TestBed } from '@angular/core/testing';
import { FocusReturn } from './focus-return';

describe('Given a button that a closing dialog hands the focus back to', () => {
  let button: HTMLButtonElement;
  let focusReturn: FocusReturn;

  beforeEach(() => {
    focusReturn = TestBed.inject(FocusReturn);
    button = document.createElement('button');
    document.body.appendChild(button);
  });

  afterEach(() => button?.remove());

  it('when the focus is handed back, then the button has it and is known as returning while it takes it', () => {
    let returningWhileFocused = false;
    button.addEventListener('focusin', () => {
      returningWhileFocused = focusReturn.isReturning(button);
    });

    focusReturn.returnTo(button);

    expect(document.activeElement).toBe(button);
    expect(returningWhileFocused).toBe(true);
  });

  it('when the focus has been handed back, then the button is no longer known as returning', () => {
    focusReturn.returnTo(button);

    expect(focusReturn.isReturning(button)).toBe(false);
  });

  it('when the browser moves the focus to the button while a dialog closes for it, then the button is known as returning only while that happens', () => {
    let returningWhileFocused = false;
    button.addEventListener('focusin', () => {
      returningWhileFocused = focusReturn.isReturning(button);
    });

    focusReturn.whileReturning(button, () => button.focus({ preventScroll: true }));

    expect(returningWhileFocused).toBe(true);
    expect(focusReturn.isReturning(button)).toBe(false);
  });

  it('when the button takes the focus by itself, then it is not known as returning', () => {
    let returningWhileFocused = true;
    button.addEventListener('focusin', () => {
      returningWhileFocused = focusReturn.isReturning(button);
    });

    button.focus();

    expect(returningWhileFocused).toBe(false);
  });
});
