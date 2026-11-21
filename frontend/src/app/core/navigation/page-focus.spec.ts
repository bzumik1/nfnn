import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PageFocus } from './page-focus';

describe('Given a pressed button whose focus the browser handed to the page around it', () => {
  let page: HTMLElement;
  let button: HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const pageFocus = TestBed.inject(PageFocus);
    page = document.createElement('main');
    page.tabIndex = -1;
    button = document.createElement('button');
    button.type = 'button';
    button.addEventListener('click', () => pageFocus.keepOnPressed(button));
    page.append(button);
    document.body.append(page);
    page.focus();
  });

  afterEach(() => page.remove());

  it('when the button is clicked, then the button has the focus', () => {
    button.click();

    expect(document.activeElement).toBe(button);
  });
});
