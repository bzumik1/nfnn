import { TestBed } from '@angular/core/testing';

import { KEYBOARD_OPEN_CLASS, SoftKeyboard } from './soft-keyboard';

const SCREEN_HEIGHT = 549;
const KEYBOARD_HEIGHT = 262;

class FakeVisualViewport extends EventTarget {
  height = SCREEN_HEIGHT;
  offsetTop = 0;

  showKeyboard(height = KEYBOARD_HEIGHT, offsetTop = 0): void {
    this.height = SCREEN_HEIGHT - height;
    this.offsetTop = offsetTop;
    this.dispatchEvent(new Event('resize'));
  }

  hideKeyboard(): void {
    this.height = SCREEN_HEIGHT;
    this.offsetTop = 0;
    this.dispatchEvent(new Event('resize'));
  }
}

describe('Given a phone whose on-screen keyboard shortens the visual viewport', () => {
  let viewport: FakeVisualViewport;
  let keyboard: SoftKeyboard;
  let field: HTMLInputElement;
  let button: HTMLButtonElement;

  const root = () => document.documentElement;

  beforeEach(() => {
    viewport = new FakeVisualViewport();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: SCREEN_HEIGHT });
    field = document.createElement('input');
    button = document.createElement('button');
    document.body.append(field, button);
    keyboard = TestBed.inject(SoftKeyboard);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    field.remove();
    button.remove();
    delete (window as { visualViewport?: unknown }).visualViewport;
    root().classList.remove(KEYBOARD_OPEN_CLASS);
  });

  it('when nothing is typed into, then the keyboard counts as closed and the page is left as it is', () => {
    expect(keyboard.isOpen()).toBe(false);
    expect(root().classList.contains(KEYBOARD_OPEN_CLASS)).toBe(false);
    expect(root().style.getPropertyValue('--keyboard-covered-height')).toBe('');
  });

  describe('when the visitor taps a text field and the keyboard comes up', () => {
    beforeEach(() => {
      field.focus();
      viewport.showKeyboard(KEYBOARD_HEIGHT, 40);
    });

    it('then the page is marked and knows the part of the screen the keyboard leaves visible and the part it covers', () => {
      expect(keyboard.isOpen()).toBe(true);
      expect(root().classList.contains(KEYBOARD_OPEN_CLASS)).toBe(true);
      expect(root().style.getPropertyValue('--keyboard-covered-height')).toBe('222px');
      expect(keyboard.visibleArea()).toEqual({ top: 40, height: 287 });
    });

    it('and the keyboard goes down again, then the mark and the visible part are gone', () => {
      viewport.hideKeyboard();

      expect(keyboard.isOpen()).toBe(false);
      expect(root().classList.contains(KEYBOARD_OPEN_CLASS)).toBe(false);
      expect(root().style.getPropertyValue('--keyboard-covered-height')).toBe('');
    });

    it('and the field loses the focus to a button, then the keyboard counts as closed at once', async () => {
      button.focus();
      await Promise.resolve();

      expect(keyboard.isOpen()).toBe(false);
      expect(root().classList.contains(KEYBOARD_OPEN_CLASS)).toBe(false);
    });
  });

  it('when a button has the focus and the visible part shrinks, as when the browser shows a bar, then no keyboard is assumed', () => {
    button.focus();

    viewport.showKeyboard();

    expect(keyboard.isOpen()).toBe(false);
  });

  it('when a text field has the focus and the visible part shrinks only a little, as a hardware keyboard’s shortcut bar does, then no keyboard is assumed', () => {
    field.focus();

    viewport.showKeyboard(60);

    expect(keyboard.isOpen()).toBe(false);
  });
});

describe('Given a browser without a visual viewport', () => {
  it('when a text field takes the focus, then the keyboard never counts as open', () => {
    delete (window as { visualViewport?: unknown }).visualViewport;
    const keyboard = TestBed.inject(SoftKeyboard);
    const field = document.createElement('input');
    document.body.append(field);

    field.focus();

    expect(keyboard.isOpen()).toBe(false);
    field.remove();
    TestBed.resetTestingModule();
  });
});
