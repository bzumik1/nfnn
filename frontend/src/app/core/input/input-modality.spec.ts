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

  it('when the app is configured, then it starts listening at the start', () => {
    expect(appConfig.providers).toContain(inputModalityAtStart);
  });
});
