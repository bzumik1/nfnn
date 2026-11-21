import { TestBed } from '@angular/core/testing';

import { appConfig } from '../../app.config';
import { InputModality, inputModalityAtStart } from './input-modality';

describe('Given the page that remembers whether the last press came from a pointer or the keyboard', () => {
  let modality: InputModality;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [inputModalityAtStart] });
    modality = TestBed.inject(InputModality);
    modality.start();
  });

  afterEach(() => modality.stop());

  it('when nothing has been pressed yet, then it does not claim a pointer', () => {
    expect(modality.lastPressByPointer()).toBe(false);
  });

  it('when a finger or a mouse presses something, then the last press came from a pointer', () => {
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(modality.lastPressByPointer()).toBe(true);
  });

  it('when a key is pressed after the pointer, then the last press came from the keyboard', () => {
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));

    expect(modality.lastPressByPointer()).toBe(false);
  });

  it('when a press is noticed, then nothing of it is cancelled', () => {
    const press = new Event('pointerdown', { bubbles: true, cancelable: true });

    document.body.dispatchEvent(press);

    expect(press.defaultPrevented).toBe(false);
  });

  it('when it is stopped, then later presses change nothing', () => {
    modality.stop();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(modality.lastPressByPointer()).toBe(false);
  });

  describe('Given the root element that tells the styles which input came last', () => {
    const lastInput = () => document.documentElement.getAttribute('data-input');
    const press = (key: string) =>
      document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
    const touch = () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    it('when nothing has been pressed yet, then it names no input, so the ring shows as for the keyboard', () => {
      expect(lastInput()).toBeNull();
    });

    it('when a finger or a mouse presses something, then it names the pointer', () => {
      touch();

      expect(lastInput()).toBe('pointer');
    });

    it('when Tab is pressed after a touch, then it names the keyboard at once', () => {
      touch();
      press('Tab');

      expect(lastInput()).toBe('keyboard');
    });

    it('when an arrow key is pressed after a touch, then it names the keyboard', () => {
      touch();
      press('ArrowDown');

      expect(lastInput()).toBe('keyboard');
    });

    for (const modifier of ['Shift', 'Control', 'Alt', 'Meta']) {
      it(`when ${modifier} alone is pressed after a touch, then it still names the pointer`, () => {
        touch();
        press(modifier);

        expect(lastInput()).toBe('pointer');
        expect(modality.lastPressByPointer()).toBe(true);
      });
    }

    it('when a press reaches its target, then the root already names the pointer, before any handler there can move the focus', () => {
      const target = document.createElement('button');
      document.body.appendChild(target);
      let seenByTarget: string | null = 'not seen';
      target.addEventListener('pointerdown', () => (seenByTarget = lastInput()), { capture: true });

      target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      target.remove();

      expect(seenByTarget).toBe('pointer');
    });

    describe('Given a text field the site focused after a finger or a mouse pressed something', () => {
      let field: HTMLInputElement;
      const pressIn = (target: Element, init: KeyboardEventInit) =>
        target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));

      beforeEach(() => {
        field = document.createElement('input');
        document.body.appendChild(field);
        touch();
        field.focus();
      });

      afterEach(() => field.remove());

      for (const key of ['a', '5', 'Enter', 'Backspace', 'ArrowLeft']) {
        it(`when ${key} is typed into it, then it still names the pointer`, () => {
          pressIn(field, { key });

          expect(lastInput()).toBe('pointer');
          expect(modality.lastPressByPointer()).toBe(true);
        });
      }

      for (const [name, init] of [
        ['Tab', { key: 'Tab' }],
        ['Shift+Tab', { key: 'Tab', shiftKey: true }],
        ['Escape', { key: 'Escape' }],
      ] as const) {
        it(`when ${name} is pressed in it, then it names the keyboard`, () => {
          pressIn(field, init);

          expect(lastInput()).toBe('keyboard');
          expect(modality.lastPressByPointer()).toBe(false);
        });
      }

      it('when a letter is typed into a text area, then it still names the pointer', () => {
        const area = document.createElement('textarea');
        document.body.appendChild(area);

        pressIn(area, { key: 'a' });
        area.remove();

        expect(lastInput()).toBe('pointer');
      });

      for (const type of ['checkbox', 'radio', 'range', 'button']) {
        it(`when a letter is pressed on a ${type} input, then it names the keyboard`, () => {
          field.type = type;

          pressIn(field, { key: 'a' });

          expect(lastInput()).toBe('keyboard');
        });
      }
    });

    it('when a letter is pressed on a control that takes no text, then it names the keyboard', () => {
      touch();
      press('a');

      expect(lastInput()).toBe('keyboard');
    });

    for (const [what, init] of [
      ['a key of a composition', { key: 'Tab', isComposing: true }],
      ['an unidentified key', { key: 'Unidentified' }],
      ['a key the input method processes', { key: 'Process' }],
      ['a key with the composition code 229', { key: 'Tab', keyCode: 229 }],
    ] as const) {
      it(`when ${what} is pressed after a touch, then it still names the pointer`, () => {
        touch();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));

        expect(lastInput()).toBe('pointer');
        expect(modality.lastPressByPointer()).toBe(true);
      });
    }

    it('when the same input comes again, then the root is not written again', () => {
      const writes = new MutationObserver(() => undefined);
      writes.observe(document.documentElement, { attributeFilter: ['data-input'] });

      touch();
      touch();
      press('Tab');
      press('Tab');
      const recorded = writes.takeRecords();
      writes.disconnect();

      expect(recorded).toHaveLength(2);
    });

    it('when it is stopped, then the root names no input any more', () => {
      touch();

      modality.stop();

      expect(lastInput()).toBeNull();
    });
  });

  it('when the app is configured, then it starts listening at the start', () => {
    expect(appConfig.providers).toContain(inputModalityAtStart);
  });
});
