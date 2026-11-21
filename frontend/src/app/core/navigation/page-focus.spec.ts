import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type Event as RouterEvent,
  NavigationEnd,
  provideRouter,
  Router,
  Scroll,
} from '@angular/router';
import { Subject } from 'rxjs';
import { InputModality } from '../input/input-modality';
import { PageFocus, RETURNING_FOCUS_LONGEST_MS } from './page-focus';
import { PagePlacement } from './page-placement';

@Component({ template: '' })
class Blank {}

const CARD = '/sprava/darci/d1';

function navigated(router: Router): Promise<NavigationEnd> {
  return new Promise((resolve) => {
    const events = router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        events.unsubscribe();
        resolve(event);
      }
    });
  });
}

function routerScrollsAfter(router: Router, arrived: NavigationEnd): void {
  (router.events as Subject<RouterEvent>).next(new Scroll(arrived, [0, 0], null));
}

async function drawn(): Promise<void> {
  await new Promise<void>((done) => setTimeout(done));
  TestBed.tick();
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

  function from(opener: HTMLElement): void {
    opener.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  async function openTheCard(opener?: HTMLElement): Promise<void> {
    if (opener !== undefined) {
      from(opener);
    }
    await router.navigateByUrl(CARD);
  }

  async function stepBack(): Promise<void> {
    const returned = navigated(router);
    TestBed.inject(Location).back();
    await returned;
    heading.focus();
  }

  describe('when the list shows the link to the card at once', () => {
    const header = 64;
    let link: HTMLElement;
    let focused: ReturnType<typeof vi.fn<(options?: FocusOptions) => void>>;
    let shown: ReturnType<typeof vi.fn<(options?: boolean | ScrollIntoViewOptions) => void>>;

    async function returnWithTheLinkAt(top: number): Promise<void> {
      link = row({ href: CARD });
      link.getBoundingClientRect = () => new DOMRect(0, top, 300, 56);
      scope.append(link);
      await openTheCard(link);
      await stepBack();
      const focusLink = link.focus.bind(link);
      focused = vi.fn<(options?: FocusOptions) => void>((options) => focusLink(options));
      link.focus = focused;
      shown = vi.fn<(options?: boolean | ScrollIntoViewOptions) => void>();
      link.scrollIntoView = shown;
      focus.returnAfterStepBack(scope);
    }

    beforeEach(() => {
      document.documentElement.style.scrollPaddingTop = `${header}px`;
      document.documentElement.style.scrollPaddingBottom = '80px';
    });

    afterEach(() => {
      document.documentElement.style.scrollPaddingTop = '';
      document.documentElement.style.scrollPaddingBottom = '';
    });

    it('then the link takes the focus from the heading without moving the page while the row shows', async () => {
      await returnWithTheLinkAt(300);

      expect(document.activeElement).toBe(link);
      expect(focused).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true }));
      expect(shown).not.toHaveBeenCalled();
    });

    it('then the page moves the least it can to show the row when it hides under the head', async () => {
      await returnWithTheLinkAt(header - 56);

      expect(document.activeElement).toBe(link);
      expect(shown).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    });

    it('then the page moves the least it can to show the row when it lies out of the window', async () => {
      await returnWithTheLinkAt(window.innerHeight + 120);

      expect(document.activeElement).toBe(link);
      expect(shown).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    });

    it('then the row half under the head still counts as shown and the page stays', async () => {
      await returnWithTheLinkAt(header - 20);

      expect(shown).not.toHaveBeenCalled();
    });
  });

  it('when the page is still being put back at its kept scroll, then the row takes the focus only once it is placed, so the focus never ends that placing', async () => {
    const link = row({ href: CARD });
    scope.append(link);
    await openTheCard(link);
    await stepBack();
    const placed = TestBed.inject(PagePlacement).pending();

    focus.returnAfterStepBack(scope);
    await Promise.resolve();
    expect(document.activeElement).toBe(heading);
    placed();
    await drawn();

    expect(document.activeElement).toBe(link);
  });

  it('when the router puts the page back a moment after the step back, then the row takes the focus only after that, so the router never scrolls it away again', async () => {
    const link = row({ href: CARD });
    scope.append(link);
    from(link);
    const opened = navigated(router);
    await router.navigateByUrl(CARD);
    routerScrollsAfter(router, await opened);
    const returned = navigated(router);
    TestBed.inject(Location).back();
    const arrived = await returned;
    heading.focus();

    focus.returnAfterStepBack(scope);
    await Promise.resolve();
    expect(document.activeElement).toBe(heading);
    routerScrollsAfter(router, arrived);
    await drawn();

    expect(document.activeElement).toBe(link);
  });

  it('when the page still reads its data as the router puts it back, then the row takes the focus only once those reads have come and the page has drawn them, so the row and its room are those of the whole page', async () => {
    const drawnLater = row({ href: CARD });
    const drawnAtOnce = row({ href: CARD });
    scope.append(drawnAtOnce);
    const opened = navigated(router);
    await router.navigateByUrl(CARD);
    routerScrollsAfter(router, await opened);
    const returned = navigated(router);
    TestBed.inject(Location).back();
    const arrived = await returned;
    const answered = TestBed.inject(PagePlacement).reading();
    heading.focus();

    focus.returnAfterStepBack(scope);
    routerScrollsAfter(router, arrived);
    await drawn();
    expect(document.activeElement).toBe(heading);
    scope.insertBefore(drawnLater, drawnAtOnce);
    answered();
    await drawn();

    expect(document.activeElement).toBe(drawnLater);
  });

  it('when the page has drawn itself but its reads are still on their way, then the focus does not return in between the router putting it back and its drawing', async () => {
    const link = row({ href: CARD });
    scope.append(link);
    const opened = navigated(router);
    await router.navigateByUrl(CARD);
    routerScrollsAfter(router, await opened);
    const returned = navigated(router);
    TestBed.inject(Location).back();
    const arrived = await returned;
    heading.focus();

    focus.returnAfterStepBack(scope);
    routerScrollsAfter(router, arrived);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.activeElement).toBe(heading);
    await drawn();

    expect(document.activeElement).toBe(link);
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
