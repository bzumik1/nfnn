import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { InputModality } from '../input/input-modality';
import { PageFocus, RETURNING_FOCUS_LONGEST_MS } from './page-focus';

@Component({ template: '' })
class Blank {}

const CARD = '/sprava/darci/d1';

function navigated(router: Router): Promise<void> {
  return new Promise((resolve) => {
    const events = router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        events.unsubscribe();
        resolve();
      }
    });
  });
}

describe('Given a list of the administration that a step back returns to from the card it opened', () => {
  let router: Router;
  let focus: PageFocus;
  let scope: HTMLElement;
  let heading: HTMLHeadingElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Blank }])],
    });
    router = TestBed.inject(Router);
    router.setUpLocationChangeListener();
    focus = TestBed.inject(PageFocus);
    scope = document.createElement('div');
    heading = document.createElement('h1');
    heading.tabIndex = -1;
    heading.textContent = 'Dárci';
    scope.append(heading);
    document.body.append(scope);
    await router.navigateByUrl('/sprava/darci');
  });

  afterEach(() => {
    vi.useRealTimers();
    scope.remove();
  });

  function row(attributes: Record<string, string>, tag = 'a'): HTMLElement {
    const element = document.createElement(tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    element.textContent = 'Petr Svoboda';
    return element;
  }

  async function openTheCard(from?: HTMLElement): Promise<void> {
    from?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await router.navigateByUrl(CARD);
  }

  async function stepBack(): Promise<void> {
    const returned = navigated(router);
    TestBed.inject(Location).back();
    await returned;
    heading.focus();
  }

  it('when the list shows the link to the card at once, then the link takes the focus from the heading and comes into view', async () => {
    const link = row({ href: CARD });
    scope.append(link);
    const shown = vi.fn();
    link.scrollIntoView = shown;
    await openTheCard(link);
    await stepBack();

    focus.returnAfterStepBack(scope);

    expect(document.activeElement).toBe(link);
    expect(shown).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });

  it('when the list draws its rows only once its data arrive, then the link takes the focus as it appears', async () => {
    await openTheCard();
    await stepBack();

    focus.returnAfterStepBack(scope);
    expect(document.activeElement).toBe(heading);
    const link = row({ href: CARD });
    scope.append(link);
    await Promise.resolve();

    expect(document.activeElement).toBe(link);
  });

  it('when the visitor moves the focus before the rows appear, then the focus stays where they put it', async () => {
    const search = document.createElement('input');
    scope.append(search);
    await openTheCard();
    await stepBack();

    focus.returnAfterStepBack(scope);
    search.focus();
    scope.append(row({ href: CARD }));
    await Promise.resolve();

    expect(document.activeElement).toBe(search);
  });

  it('when the rows come only after the wait has ended, then the heading keeps the focus', async () => {
    await openTheCard();
    await stepBack();
    vi.useFakeTimers();

    focus.returnAfterStepBack(scope);
    await vi.advanceTimersByTimeAsync(RETURNING_FOCUS_LONGEST_MS);
    scope.append(row({ href: CARD }));
    await Promise.resolve();

    expect(document.activeElement).toBe(heading);
  });

  it('when the card was opened from a row that leads to it without being a link, then that row takes the focus', async () => {
    const button = row({ type: 'button', 'data-leads-to': CARD }, 'button');
    scope.append(button);
    await openTheCard();
    await stepBack();

    focus.returnAfterStepBack(scope);

    expect(document.activeElement).toBe(button);
  });

  it('when the card was opened by a control with an id, then that control takes the focus, even where an earlier link leads to the card too', async () => {
    const earlier = row({ href: CARD });
    const opener = row({ type: 'button', id: 'donor-row-d1' }, 'button');
    scope.append(earlier, opener);
    await openTheCard(opener);
    await stepBack();

    focus.returnAfterStepBack(scope);

    expect(document.activeElement).toBe(opener);
  });

  it('when a link to the card lies in a dialog left in the page, then the heading keeps the focus', async () => {
    const dialog = document.createElement('dialog');
    dialog.append(row({ href: CARD }));
    scope.append(dialog);
    await openTheCard();
    await stepBack();

    focus.returnAfterStepBack(scope);

    expect(document.activeElement).toBe(heading);
  });

  it('when the step back followed the press of a finger or a mouse, then the row takes the focus without showing its ring', async () => {
    const modality = TestBed.inject(InputModality);
    modality.start();
    onTestFinished(() => modality.stop());
    const link = row({ href: CARD });
    scope.append(link);
    const focused = vi.spyOn(link, 'focus');
    await openTheCard(link);
    document.dispatchEvent(new Event('pointerdown'));
    await stepBack();

    focus.returnAfterStepBack(scope);

    expect(focused).toHaveBeenCalledWith({ preventScroll: true, focusVisible: false });
  });

  it('when the step back followed a key, then the row takes the focus as the browser shows it after a key', async () => {
    const modality = TestBed.inject(InputModality);
    modality.start();
    onTestFinished(() => modality.stop());
    const link = row({ href: CARD });
    scope.append(link);
    const focused = vi.spyOn(link, 'focus');
    await openTheCard(link);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await stepBack();

    focus.returnAfterStepBack(scope);

    expect(focused).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('when a page opens forward, then the focus stays on its heading', async () => {
    scope.append(row({ href: CARD }));
    await router.navigateByUrl('/sprava');
    heading.focus();

    focus.returnAfterStepBack(scope);

    expect(document.activeElement).toBe(heading);
  });
});

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
