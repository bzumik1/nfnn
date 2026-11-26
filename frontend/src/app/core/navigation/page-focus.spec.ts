import { Location } from '@angular/common';
import { Component, signal } from '@angular/core';
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
import { CompactLayout } from '../layout/compact-layout';
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

const compact = signal(true);

describe('Given a list of the administration that a step back returns to from the card it opened', () => {
  let router: Router;
  let focus: PageFocus;
  let scope: HTMLElement;
  let heading: HTMLHeadingElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Blank }]),
        { provide: CompactLayout, useValue: { isCompact: compact.asReadonly() } },
      ],
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

    async function returnWithTheLinkAt(
      top: number,
      within: HTMLElement = scope,
      height = 56,
    ): Promise<void> {
      link = row({ href: CARD });
      link.getBoundingClientRect = () => new DOMRect(0, top, 300, height);
      within.append(link);
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

    async function copiedByTheStepBackWithTheLinkAt(top: number): Promise<void> {
      link = row({ href: CARD });
      link.getBoundingClientRect = () => new DOMRect(0, top, 300, 56);
      scope.append(link);
      await openTheCard(link);
      await stepBack();
      shown = vi.fn<(options?: boolean | ScrollIntoViewOptions) => void>();
      link.scrollIntoView = shown;
      focus.bringReturnIntoView(scope);
    }

    it('then a step back about to copy the list brings the row hidden under the head into view at once, the least it can, and leaves the focus to the return, so the copy shows the list where it will stand (#2088)', async () => {
      await copiedByTheStepBackWithTheLinkAt(header - 56);

      expect(shown).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
      expect(document.activeElement).toBe(heading);
    });

    it('then a step back about to copy the list leaves a row that shows where it is (#2088)', async () => {
      await copiedByTheStepBackWithTheLinkAt(300);

      expect(shown).not.toHaveBeenCalled();
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

    describe('when the row shows only in part, under a band, as the donor card’s last row lay 31 px under the bottom band that WebKit then revealed by itself in its first frame after the focus though the focus asked it not to scroll (run 45550415459)', () => {
      const root = document.documentElement;
      const underTheBottomBand = window.innerHeight - 80 - 56 + 31;
      let scrollY: number;
      let frames: FrameRequestCallback[];
      let putBack: ReturnType<typeof vi.fn<(options?: ScrollToOptions | number) => void>>;

      beforeEach(() => {
        scrollY = 0;
        frames = [];
        Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
        const frameRequests = vi
          .spyOn(window, 'requestAnimationFrame')
          .mockImplementation((frame) => {
            frames.push(frame);
            return frames.length;
          });
        putBack = vi.fn<(options?: ScrollToOptions | number) => void>();
        const scrolls = vi
          .spyOn(window, 'scrollTo')
          .mockImplementation(putBack as typeof window.scrollTo);
        onTestFinished(() => {
          frameRequests.mockRestore();
          scrolls.mockRestore();
          delete (window as { scrollY?: number }).scrollY;
        });
      });

      function drawFrame(): void {
        frames.splice(0).forEach((frame) => frame(performance.now()));
      }

      function browserScrollsBy(px: number): void {
        scrollY += px;
        window.dispatchEvent(new Event('scroll'));
      }

      it('then the page lifts its bottom band from the moment the row takes the focus until the focus has been drawn in two frames, the third frame callback, so the browser has nothing to reveal, and the page does not move', async () => {
        await returnWithTheLinkAt(underTheBottomBand);

        expect(document.activeElement).toBe(link);
        expect(root.style.scrollPaddingBottom).toBe('0px');
        expect(root.style.scrollPaddingTop).toBe(`${header}px`);
        drawFrame();
        drawFrame();
        expect(root.style.scrollPaddingBottom).toBe('0px');
        drawFrame();

        expect(root.style.scrollPaddingBottom).toBe('80px');
        expect(shown).not.toHaveBeenCalled();
        expect(putBack).not.toHaveBeenCalled();
      });

      it('then the page lifts its top band when the row lies partly under the head', async () => {
        await returnWithTheLinkAt(header - 20);

        expect(root.style.scrollPaddingTop).toBe('0px');
        expect(root.style.scrollPaddingBottom).toBe('80px');
        expect(shown).not.toHaveBeenCalled();
      });

      it('then the page puts the kept scroll back when the row sticks out past the window itself, where no band can be lifted, and the browser scrolls it', async () => {
        await returnWithTheLinkAt(window.innerHeight - 100, scope, 120);

        browserScrollsBy(20);

        expect(putBack).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
        expect(shown).not.toHaveBeenCalled();
      });

      it('then the page puts back a scroll the browser makes while the row’s tile still lifts, since the guard starts with the focus and not once the tile is at rest', async () => {
        const tile = document.createElement('div');
        scope.append(tile);
        let lifted = (): void => undefined;
        const lift = new Promise<void>((done) => (lifted = done));
        tile.getAnimations = () =>
          [
            {
              playState: 'running',
              finished: lift,
              effect: { getComputedTiming: () => ({ endTime: 200 }) },
            },
          ] as unknown as Animation[];
        await returnWithTheLinkAt(window.innerHeight - 100, tile, 120);

        browserScrollsBy(31);
        lifted();
        await Promise.resolve();
        await Promise.resolve();

        expect(putBack).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
        expect(shown).not.toHaveBeenCalled();
      });

      it('then the bands come back and nothing is put back once the visitor scrolls', async () => {
        await returnWithTheLinkAt(window.innerHeight - 100, scope, 120);

        window.dispatchEvent(new Event('wheel'));
        browserScrollsBy(20);

        expect(putBack).not.toHaveBeenCalled();
        expect(root.style.scrollPaddingBottom).toBe('80px');
      });

      it('then the bands come back once the focus moves elsewhere', async () => {
        const search = document.createElement('input');
        scope.append(search);
        await returnWithTheLinkAt(underTheBottomBand);

        search.focus();
        drawFrame();

        expect(root.style.scrollPaddingBottom).toBe('80px');
      });

      it('then the page lifts the bottom band for a row that shows whole but whose focus ring reach, its scroll margin, lies under the band', async () => {
        const focusRingReach = 5;
        const linkStyle = document.createElement('style');
        linkStyle.textContent = `a { scroll-margin-top: ${focusRingReach}px; scroll-margin-bottom: ${focusRingReach}px; }`;
        document.head.append(linkStyle);
        onTestFinished(() => linkStyle.remove());

        await returnWithTheLinkAt(window.innerHeight - 80 - 56 - 2);

        expect(root.style.scrollPaddingBottom).toBe('0px');
        expect(shown).not.toHaveBeenCalled();
      });

      describe('on a window as wide as a computer’s, past the bar of tabs', () => {
        beforeEach(() => {
          compact.set(false);
          onTestFinished(() => compact.set(true));
        });

        it('then the row takes the focus and the page moves the least it can to show it whole at once, as before the steps moved, and no band is lifted', async () => {
          await returnWithTheLinkAt(underTheBottomBand);

          expect(document.activeElement).toBe(link);
          expect(shown).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
          expect(root.style.scrollPaddingBottom).toBe('80px');
          browserScrollsBy(31);
          expect(putBack).not.toHaveBeenCalled();
        });
      });

      it('then the bands stay as they are for a row that shows whole', async () => {
        await returnWithTheLinkAt(window.innerHeight - 80 - 56);

        expect(root.style.scrollPaddingBottom).toBe('80px');
        expect(root.style.scrollPaddingTop).toBe(`${header}px`);
      });
    });

    it('then the page moves the least it can to show the row when it lies out of the window', async () => {
      await returnWithTheLinkAt(window.innerHeight + 120);

      expect(document.activeElement).toBe(link);
      expect(shown).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    });

    describe("when the focus sets the row's tile moving, as a tile lifts while its link shows the focus ring", () => {
      let lifted: () => void;
      let tile: HTMLElement;

      beforeEach(() => {
        tile = document.createElement('div');
        scope.append(tile);
        const lift = new Promise<void>((done) => (lifted = done));
        tile.getAnimations = () =>
          [
            {
              playState: 'running',
              finished: lift,
              effect: { getComputedTiming: () => ({ endTime: 200 }) },
            },
          ] as unknown as Animation[];
      });

      it('then the page moves only once the tile has come to rest, so the row is measured where it stays and ends at the edge', async () => {
        await returnWithTheLinkAt(window.innerHeight + 120, tile);

        expect(document.activeElement).toBe(link);
        expect(shown).not.toHaveBeenCalled();
        lifted();
        await Promise.resolve();
        await Promise.resolve();

        expect(shown).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
      });

      it('then the page stays when the visitor has moved the focus elsewhere before the tile came to rest', async () => {
        const search = document.createElement('input');
        scope.append(search);
        await returnWithTheLinkAt(window.innerHeight + 120, tile);

        search.focus();
        lifted();
        await Promise.resolve();
        await Promise.resolve();

        expect(shown).not.toHaveBeenCalled();
      });
    });

    describe('when answers that came after the step make the page grow above the row it brought into view', () => {
      const edge = window.innerHeight - 80 - 56;
      let top: number;
      let grown: () => void;
      let scrolled: ReturnType<typeof vi.fn<(options: ScrollToOptions) => void>>;

      beforeEach(async () => {
        const watching: (() => void)[] = [];
        vi.stubGlobal(
          'ResizeObserver',
          class {
            constructor(private readonly changed: () => void) {}
            observe(): void {
              watching.push(this.changed);
            }
            disconnect(): void {
              watching.splice(watching.indexOf(this.changed), 1);
            }
          },
        );
        grown = () => [...watching].forEach((changed) => changed());
        scrolled = vi.fn<(options: ScrollToOptions) => void>((options) => {
          top -= options.top ?? 0;
        });
        vi.spyOn(window, 'scrollBy').mockImplementation(scrolled as typeof window.scrollBy);
        top = window.innerHeight + 120;
        link = row({ href: CARD });
        link.getBoundingClientRect = () => new DOMRect(0, top, 300, 56);
        scope.append(link);
        await openTheCard(link);
        await stepBack();
        link.scrollIntoView = () => (top = edge);
      });

      afterEach(() => {
        vi.unstubAllGlobals();
      });

      it('then the page follows the row, so it stays at the edge it was brought to', () => {
        focus.returnAfterStepBack(scope);

        top += 8;
        grown();

        expect(scrolled).toHaveBeenCalledWith({ top: 8, behavior: 'instant' });
        expect(top).toBe(edge);
      });

      it('then the page stays once the visitor has moved the focus elsewhere', () => {
        const search = document.createElement('input');
        scope.append(search);
        focus.returnAfterStepBack(scope);
        search.focus();

        top += 8;
        grown();

        expect(scrolled).not.toHaveBeenCalled();
      });

      it('then the page stays when it grows only after the wait for the row has ended', () => {
        vi.useFakeTimers();
        focus.returnAfterStepBack(scope);
        vi.advanceTimersByTime(RETURNING_FOCUS_LONGEST_MS);

        top += 8;
        grown();

        expect(scrolled).not.toHaveBeenCalled();
      });
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

  it('when no row came and the focus was lost to the page while it waited, then the heading takes the focus once the wait has ended', async () => {
    await openTheCard();
    await stepBack();
    vi.useFakeTimers();

    focus.returnAfterStepBack(scope);
    heading.blur();
    await vi.advanceTimersByTimeAsync(RETURNING_FOCUS_LONGEST_MS);

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
