import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PageFocus } from './page-focus';

interface PressedButton {
  page: HTMLElement;
  button: HTMLButtonElement;
  pageFocus: PageFocus;
}

function pressedButtonOnAPage(): PressedButton {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const pageFocus = TestBed.inject(PageFocus);
  const page = document.createElement('main');
  page.tabIndex = -1;
  const button = document.createElement('button');
  button.type = 'button';
  button.addEventListener('click', () => pageFocus.keepOnPressed(button));
  page.append(button);
  document.body.append(page);
  return { page, button, pageFocus };
}

describe('Given a pressed button whose focus the browser handed to the page around it', () => {
  let page: HTMLElement;
  let button: HTMLButtonElement;
  let pageFocus: PageFocus;

  beforeEach(() => {
    ({ page, button, pageFocus } = pressedButtonOnAPage());
    page.focus();
  });

  afterEach(() => page.remove());

  it('when the button is clicked, then the button has the focus', () => {
    button.click();

    expect(document.activeElement).toBe(button);
  });

  it('when the press leaves the focus on the page, then the button takes it back and the page does not move', () => {
    const focus = vi.spyOn(button, 'focus');

    pageFocus.keepOnPressed(button);

    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });
});

describe('Given a pressed button that kept its focus', () => {
  let page: HTMLElement;
  let button: HTMLButtonElement;
  let pageFocus: PageFocus;

  beforeEach(() => {
    ({ page, button, pageFocus } = pressedButtonOnAPage());
    button.focus();
  });

  afterEach(() => page.remove());

  it('when it is pressed, then the focus stays and the page does not move', () => {
    const focus = vi.spyOn(button, 'focus');

    pageFocus.keepOnPressed(button);

    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });
});
