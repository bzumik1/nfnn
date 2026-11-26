import { FocusAfterRowLeaves } from './focus-after-row-leaves';

describe('Given a row whose leave moves the focus to a control below it', () => {
  let list: HTMLUListElement;
  let heading: HTMLHeadingElement;
  let scrolled: { element: HTMLElement; options: unknown }[];

  beforeEach(() => {
    scrolled = [];
    heading = document.createElement('h2');
    heading.tabIndex = -1;
    list = document.createElement('ul');
    list.innerHTML = `
      <li id="other"><button>Odebrat</button></li>
      <li id="leaving"><button>Odebrat</button></li>
      <li id="staying"><button id="below">Přejmenovat</button></li>
    `;
    document.body.append(heading, list);
    for (const element of [heading, byId('below')]) {
      element.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => {
        scrolled.push({ element, options });
      };
    }
  });

  afterEach(() => {
    heading.remove();
    list.remove();
  });

  function byId(id: string): HTMLElement {
    return document.getElementById(id) as HTMLElement;
  }

  function pageAsking(reducedMotion: boolean, innerHeight = 600): Document {
    return {
      get activeElement() {
        return document.activeElement;
      },
      body: document.body,
      documentElement: document.documentElement,
      addEventListener: document.addEventListener.bind(document),
      removeEventListener: document.removeEventListener.bind(document),
      defaultView: {
        innerHeight,
        matchMedia: (query: string) => ({
          matches: reducedMotion && query === '(prefers-reduced-motion: reduce)',
        }),
        getComputedStyle: (element: Element) => getComputedStyle(element),
      },
    } as unknown as Document;
  }

  function focusAfter(reducedMotion = false): FocusAfterRowLeaves {
    return new FocusAfterRowLeaves(pageAsking(reducedMotion), () => list);
  }

  async function removed(row: HTMLElement): Promise<void> {
    row.remove();
    await Promise.resolve();
  }

  it('when it is forgotten while it waits for the row to be removed, then it stops watching the list', () => {
    const focus = focusAfter();
    const row = byId('leaving');
    focus.rowLeaving(row);
    focus.moveFocus(row, byId('below'));
    focus.rowLeaveEnded(row);
    const pending = focus['pending'] as unknown as { stopWatching: () => void };
    const stopWatching = pending.stopWatching;
    let stops = 0;
    pending.stopWatching = () => {
      stops += 1;
      stopWatching();
    };

    focus.forget();

    expect(stops).toBe(1);
  });

  it('when the control takes the focus before the row is removed, then it glides into view only once the row is gone', async () => {
    const focus = focusAfter();
    const row = byId('leaving');
    focus.rowLeaving(row);

    focus.moveFocus(row, byId('below'));
    focus.rowLeaveEnded(row);

    expect(document.activeElement).toBe(byId('below'));
    expect(scrolled).toEqual([]);
    await removed(row);
    expect(scrolled).toEqual([
      { element: byId('below'), options: { block: 'nearest', behavior: 'smooth' } },
    ]);
  });

  it('when the row is removed before the control takes the focus, then the control glides into view as it takes the focus', async () => {
    const focus = focusAfter();
    const row = byId('leaving');
    focus.rowLeaving(row);
    focus.rowLeaveEnded(row);
    await removed(row);
    expect(scrolled).toEqual([]);

    focus.moveFocus(row, byId('below'));

    expect(scrolled).toEqual([
      { element: byId('below'), options: { block: 'nearest', behavior: 'smooth' } },
    ]);
  });

  it('when the device asks for less motion, then the control jumps into view', async () => {
    const focus = focusAfter(true);
    const row = byId('leaving');
    focus.rowLeaving(row);
    focus.moveFocus(row, byId('below'));
    focus.rowLeaveEnded(row);

    await removed(row);

    expect(scrolled).toEqual([
      { element: byId('below'), options: { block: 'nearest', behavior: 'instant' } },
    ]);
  });

  it('when the control is taller than the room the window leaves it, then it is brought into view from its top', async () => {
    const focus = focusAfter();
    const row = byId('leaving');
    byId('below').getBoundingClientRect = () => new DOMRect(0, -700, 300, 601);
    focus.rowLeaving(row);
    focus.moveFocus(row, byId('below'));
    focus.rowLeaveEnded(row);

    await removed(row);

    expect(scrolled).toEqual([
      { element: byId('below'), options: { block: 'start', behavior: 'smooth' } },
    ]);
  });

  it('when no control is left and the focus goes in place to the heading, then nothing scrolls once the row is gone', async () => {
    const focus = focusAfter();
    const row = byId('leaving');
    focus.rowLeaving(row);

    focus.focusInPlace(heading);
    focus.rowLeaveEnded(row);
    await removed(row);

    expect(document.activeElement).toBe(heading);
    expect(scrolled).toEqual([]);
  });

  function focusesAsked(control: HTMLElement): (FocusOptions | undefined)[] {
    const asked: (FocusOptions | undefined)[] = [];
    const focusControl = control.focus.bind(control);
    control.focus = (options?: FocusOptions) => {
      asked.push(options);
      focusControl(options);
    };
    return asked;
  }

  it('when the control below takes the focus while the row it will be revealed after still stands, then the browser is told not to scroll it there first', () => {
    const focus = focusAfter();
    const row = byId('leaving');
    const asked = focusesAsked(byId('below'));
    focus.rowLeaving(row);

    focus.moveFocus(row, byId('below'));

    expect(asked).toEqual([{ preventScroll: true }]);
    expect(document.activeElement).toBe(byId('below'));
  });

  it('when the control takes the focus after a row it was not told about, then the browser scrolls it into view as usual', () => {
    const focus = focusAfter();
    const asked = focusesAsked(byId('below'));
    focus.rowLeaving(byId('leaving'));

    focus.moveFocus(byId('other'), byId('below'));

    expect(asked).toEqual([undefined]);
  });

  it('when the focus goes in place to the heading, then the browser is told not to scroll it into view either', () => {
    const focus = focusAfter();
    const asked: (FocusOptions | undefined)[] = [];
    const focusHeading = heading.focus.bind(heading);
    heading.focus = (options?: FocusOptions) => {
      asked.push(options);
      focusHeading(options);
    };

    focus.focusInPlace(heading);

    expect(asked).toEqual([{ preventScroll: true }]);
  });

  it('when the focus moved elsewhere before the row is gone, then nothing scrolls', async () => {
    const focus = focusAfter();
    const row = byId('leaving');
    focus.rowLeaving(row);
    focus.moveFocus(row, byId('below'));
    focus.rowLeaveEnded(row);

    heading.focus();
    await removed(row);

    expect(scrolled).toEqual([]);
  });

  it('when another action began before the row is gone, then the stale row scrolls nothing', async () => {
    const focus = focusAfter();
    const row = byId('leaving');
    focus.rowLeaving(row);
    focus.moveFocus(row, byId('below'));
    focus.rowLeaveEnded(row);

    focus.forget();
    await removed(row);

    expect(scrolled).toEqual([]);
  });

  it('when a row it was not told about leaves, then nothing scrolls', async () => {
    const focus = focusAfter();
    const row = byId('leaving');
    const other = byId('other');
    focus.rowLeaving(row);
    focus.moveFocus(row, byId('below'));

    focus.rowLeaveEnded(other);
    await removed(other);

    expect(scrolled).toEqual([]);
  });
});

describe('Given the only row whose leave leaves no control to move the focus to', () => {
  let list: HTMLUListElement;
  let region: HTMLElement;
  let result: HTMLParagraphElement;
  let add: HTMLButtonElement;
  let scrolled: { element: HTMLElement; options: unknown }[];

  beforeEach(() => {
    scrolled = [];
    region = document.createElement('section');
    region.tabIndex = -1;
    list = document.createElement('ul');
    list.innerHTML = '<li id="only"><button>Odebrat</button></li>';
    result = document.createElement('p');
    add = document.createElement('button');
    region.append(list, result, add);
    document.body.append(region);
    for (const element of [region, result, add]) {
      element.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => {
        scrolled.push({ element, options });
      };
    }
  });

  afterEach(() => region.remove());

  function standing(element: HTMLElement, top: number, height: number): void {
    element.getBoundingClientRect = () => new DOMRect(0, top, 300, height);
  }

  function pageAsking(reducedMotion: boolean): Document {
    return {
      get activeElement() {
        return document.activeElement;
      },
      body: document.body,
      documentElement: document.documentElement,
      addEventListener: document.addEventListener.bind(document),
      removeEventListener: document.removeEventListener.bind(document),
      defaultView: {
        innerHeight: 600,
        matchMedia: (query: string) => ({
          matches: reducedMotion && query === '(prefers-reduced-motion: reduce)',
        }),
        getComputedStyle: (element: Element) => getComputedStyle(element),
      },
    } as unknown as Document;
  }

  function focusAfter(reducedMotion = false): FocusAfterRowLeaves {
    return new FocusAfterRowLeaves(pageAsking(reducedMotion), () => region);
  }

  async function removed(row: HTMLElement): Promise<void> {
    row.remove();
    await Promise.resolve();
  }

  function only(): HTMLElement {
    return document.getElementById('only') as HTMLElement;
  }

  it('when the region takes the focus in place before the row is removed, then the result above the window glides in from its top only once the row is gone', async () => {
    const focus = focusAfter();
    const row = only();
    standing(result, -300, 40);
    standing(add, -250, 40);
    focus.rowLeaving(row);

    focus.focusInPlace(region, { row, from: result, to: add });
    focus.rowLeaveEnded(row);

    expect(document.activeElement).toBe(region);
    expect(scrolled).toEqual([]);
    await removed(row);
    expect(scrolled).toEqual([
      { element: result, options: { block: 'start', behavior: 'smooth' } },
    ]);
  });

  it('when the row is removed before the region takes the focus in place, then the result is revealed as the region takes the focus', async () => {
    const focus = focusAfter();
    const row = only();
    standing(result, -300, 40);
    standing(add, -250, 40);
    focus.rowLeaving(row);
    focus.rowLeaveEnded(row);
    await removed(row);
    expect(scrolled).toEqual([]);

    focus.focusInPlace(region, { row, from: result, to: add });

    expect(scrolled).toEqual([
      { element: result, options: { block: 'start', behavior: 'smooth' } },
    ]);
  });

  it('when the result and the button below it stand under the window, then the button is brought up to its bottom edge', async () => {
    const focus = focusAfter();
    const row = only();
    standing(result, 550, 40);
    standing(add, 620, 40);
    focus.rowLeaving(row);
    focus.focusInPlace(region, { row, from: result, to: add });
    focus.rowLeaveEnded(row);

    await removed(row);

    expect(scrolled).toEqual([{ element: add, options: { block: 'end', behavior: 'smooth' } }]);
  });

  it('when the result and the button together are taller than the window, then the result wins and is brought into view nearest', async () => {
    const focus = focusAfter();
    const row = only();
    standing(result, -700, 500);
    standing(add, -150, 100);
    focus.rowLeaving(row);
    focus.focusInPlace(region, { row, from: result, to: add });
    focus.rowLeaveEnded(row);

    await removed(row);

    expect(scrolled).toEqual([
      { element: result, options: { block: 'nearest', behavior: 'smooth' } },
    ]);
  });

  it('when the result and the button already stand in the window, then nothing scrolls', async () => {
    const focus = focusAfter();
    const row = only();
    standing(result, 200, 40);
    standing(add, 250, 40);
    focus.rowLeaving(row);
    focus.focusInPlace(region, { row, from: result, to: add });
    focus.rowLeaveEnded(row);

    await removed(row);

    expect(scrolled).toEqual([]);
  });

  it('when the device asks for less motion, then the result jumps into view', async () => {
    const focus = focusAfter(true);
    const row = only();
    standing(result, -300, 40);
    standing(add, -250, 40);
    focus.rowLeaving(row);
    focus.focusInPlace(region, { row, from: result, to: add });
    focus.rowLeaveEnded(row);

    await removed(row);

    expect(scrolled).toEqual([
      { element: result, options: { block: 'start', behavior: 'instant' } },
    ]);
  });

  it('when the result still moves in as the row is gone, then it is revealed only once its motion has finished', async () => {
    const focus = focusAfter();
    const row = only();
    standing(result, -300, 40);
    standing(add, -250, 40);
    let finish: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    result.getAnimations = () => [{ finished }] as never;
    focus.rowLeaving(row);
    focus.focusInPlace(region, { row, from: result, to: add });
    focus.rowLeaveEnded(row);
    await removed(row);
    expect(scrolled).toEqual([]);

    finish();

    await vi.waitFor(() =>
      expect(scrolled).toEqual([
        { element: result, options: { block: 'start', behavior: 'smooth' } },
      ]),
    );
  });

  it('when the result moves in without end, then it is revealed anyway once the grace after its motion has passed', async () => {
    const focus = focusAfter();
    const row = only();
    standing(result, -300, 40);
    standing(add, -250, 40);
    result.getAnimations = () =>
      [
        {
          finished: new Promise<void>(() => undefined),
          effect: { getComputedTiming: () => ({ endTime: Infinity }) },
        },
      ] as never;
    focus.rowLeaving(row);
    focus.focusInPlace(region, { row, from: result, to: add });
    focus.rowLeaveEnded(row);
    await removed(row);

    await vi.waitFor(
      () =>
        expect(scrolled).toEqual([
          { element: result, options: { block: 'start', behavior: 'smooth' } },
        ]),
      { timeout: 2000 },
    );
  });

  it('when the reveal names a row it was not told about, then nothing scrolls', async () => {
    const focus = focusAfter();
    const row = only();
    standing(result, -300, 40);
    standing(add, -250, 40);
    focus.rowLeaving(row);

    focus.focusInPlace(region, { row: list, from: result, to: add });
    focus.rowLeaveEnded(row);
    await removed(row);

    expect(scrolled).toEqual([]);
  });

  it('when the focus moved elsewhere before the row is gone, then nothing scrolls', async () => {
    const focus = focusAfter();
    const row = only();
    standing(result, -300, 40);
    standing(add, -250, 40);
    focus.rowLeaving(row);
    focus.focusInPlace(region, { row, from: result, to: add });
    focus.rowLeaveEnded(row);

    add.focus();
    await removed(row);

    expect(scrolled).toEqual([]);
  });
});

describe('Given the only row whose result was brought into view in place while the page around it still settles', () => {
  let list: HTMLUListElement;
  let region: HTMLElement;
  let result: HTMLParagraphElement;
  let add: HTMLButtonElement;
  let root: HTMLElement;
  let scrolled: { element: HTMLElement; options: unknown }[];
  let page: SettlingPage;
  let focus: FocusAfterRowLeaves;

  class SettlingPage {
    readonly innerHeight = 600;
    reducedMotion = true;
    scrollY = 4400;
    pageHeight = 9000;
    readonly observed: Element[] = [];
    private readonly sizeWatchers: (() => void)[] = [];
    private readonly timers = new Map<number, { due: number; callback: () => void }>();
    private nextTimer = 1;
    private now = 0;

    readonly ResizeObserver = (() => {
      const watchers = this.sizeWatchers;
      const observed = this.observed;
      return class {
        private watching = true;

        constructor(private readonly changed: () => void) {
          watchers.push(() => {
            if (this.watching) {
              this.changed();
            }
          });
        }

        observe(target: Element): void {
          this.watching = true;
          observed.push(target);
        }

        disconnect(): void {
          this.watching = false;
        }
      };
    })();

    matchMedia(query: string): { matches: boolean } {
      return { matches: this.reducedMotion && query === '(prefers-reduced-motion: reduce)' };
    }

    getComputedStyle(element: Element): CSSStyleDeclaration {
      return getComputedStyle(element);
    }

    setTimeout(callback: () => void, delay = 0): number {
      const id = this.nextTimer++;
      this.timers.set(id, { due: this.now + delay, callback });
      return id;
    }

    clearTimeout(id: number): void {
      this.timers.delete(id);
    }

    resizes(): void {
      for (const watcher of this.sizeWatchers) {
        watcher();
      }
    }

    scrolls(): void {
      document.dispatchEvent(new Event('scroll'));
    }

    scrollsTo(scrollY: number, pageHeight = this.pageHeight): void {
      this.scrollY = scrollY;
      this.pageHeight = pageHeight;
      this.scrolls();
    }

    letTimePass(ms: number): void {
      this.now += ms;
      for (const [id, timer] of [...this.timers]) {
        if (timer.due <= this.now) {
          this.timers.delete(id);
          timer.callback();
        }
      }
    }
  }

  beforeEach(() => {
    scrolled = [];
    region = document.createElement('section');
    region.tabIndex = -1;
    list = document.createElement('ul');
    list.innerHTML = '<li id="only"><button>Odebrat</button></li>';
    result = document.createElement('p');
    add = document.createElement('button');
    region.append(list, result, add);
    document.body.append(region);
    for (const element of [region, result, add]) {
      element.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => {
        scrolled.push({ element, options });
      };
    }
    page = new SettlingPage();
    root = document.createElement('div');
    Object.defineProperty(root, 'scrollHeight', { get: () => page.pageHeight });
    focus = new FocusAfterRowLeaves(
      {
        get activeElement() {
          return document.activeElement;
        },
        body: document.body,
        documentElement: root,
        defaultView: page,
        addEventListener: document.addEventListener.bind(document),
        removeEventListener: document.removeEventListener.bind(document),
      } as unknown as Document,
      () => region,
    );
  });

  afterEach(() => {
    focus.forget();
    region.remove();
  });

  function only(): HTMLElement {
    return document.getElementById('only') as HTMLElement;
  }

  function standing(element: HTMLElement, top: number, height: number): void {
    element.getBoundingClientRect = () => new DOMRect(0, top, 300, height);
  }

  function startLeaving(): HTMLElement {
    const row = only();
    standing(result, -300, 40);
    standing(add, -250, 40);
    focus.rowLeaving(row);
    return row;
  }

  async function revealAfter(row: HTMLElement): Promise<void> {
    focus.focusInPlace(region, { row, from: result, to: add });
    focus.rowLeaveEnded(row);
    row.remove();
    await Promise.resolve();
  }

  async function revealInPlace(beforeTheReveal: () => void = () => undefined): Promise<void> {
    const row = startLeaving();
    beforeTheReveal();
    await revealAfter(row);
    expect(scrolled).toEqual([
      {
        element: result,
        options: { block: 'start', behavior: page.reducedMotion ? 'instant' : 'smooth' },
      },
    ]);
    scrolled = [];
    standing(result, 88, 40);
    standing(add, 140, 40);
  }

  function leftAbove(): void {
    standing(result, -191, 40);
    standing(add, -135, 40);
  }

  function broughtBack(): { element: HTMLElement; options: unknown }[] {
    return [{ element: result, options: { block: 'start', behavior: 'instant' } }];
  }

  function fadingIn(): () => Promise<void> {
    let finish: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    result.getAnimations = () =>
      [{ finished, effect: { getComputedTiming: () => ({ endTime: 150 }) } }] as never;
    return async () => {
      finish();
      for (let turn = 0; turn < 5; turn += 1) {
        await Promise.resolve();
      }
    };
  }

  it('when the device allows motion, then no watch starts, as the smooth reveal sends scroll events of its own', async () => {
    page.reducedMotion = false;
    await revealInPlace();
    leftAbove();

    page.resizes();
    page.scrolls();

    expect(scrolled).toEqual([]);
  });

  it('when the page scrolls without the donor and without changing its length between the row starting to leave and the reveal, as the momentum of a flick does on iOS, then no watch starts', async () => {
    await revealInPlace(() => page.scrollsTo(4380));
    leftAbove();

    page.resizes();
    page.scrolls();

    expect(scrolled).toEqual([]);
  });

  it('when the browser clamps the page to its new end as it shortens before the reveal, then the watch still starts', async () => {
    page.scrollY = 8300;
    await revealInPlace(() => page.scrollsTo(8056, 8656));
    leftAbove();

    page.resizes();

    expect(scrolled).toEqual([
      { element: result, options: { block: 'start', behavior: 'instant' } },
    ]);
  });

  it('when the browser anchors the scroll by exactly what the page lost above before the reveal, then the watch still starts', async () => {
    await revealInPlace(() => page.scrollsTo(4056, 8656));
    leftAbove();

    page.resizes();

    expect(scrolled).toEqual([
      { element: result, options: { block: 'start', behavior: 'instant' } },
    ]);
  });

  it('when the result stands in a scroller of its own, then the watch follows the size of that scroller and of its content as well as the page, and hears a scroll inside it', async () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    Object.defineProperty(scroller, 'clientHeight', { get: () => 600 });
    const content = document.createElement('div');
    region.replaceWith(scroller);
    content.append(region);
    scroller.append(content);
    try {
      await revealInPlace();
      leftAbove();

      scroller.dispatchEvent(new Event('scroll'));

      expect(page.observed).toEqual(expect.arrayContaining([document.body, scroller, content]));
      expect(scrolled).toEqual([
        { element: result, options: { block: 'start', behavior: 'instant' } },
      ]);
    } finally {
      scroller.replaceWith(region);
    }
  });

  it('when the result still fades in as the row is gone, then the watch starts only once the fade has ended and the result was revealed', async () => {
    const fadeEnds = fadingIn();
    const row = startLeaving();
    await revealAfter(row);
    leftAbove();
    page.resizes();
    expect(scrolled).toEqual([]);

    await fadeEnds();
    expect(scrolled).toEqual([
      { element: result, options: { block: 'start', behavior: 'instant' } },
    ]);
    scrolled = [];
    page.resizes();

    expect(scrolled).toEqual([
      { element: result, options: { block: 'start', behavior: 'instant' } },
    ]);
  });

  it('when the reveal is forgotten while the result still fades in, then nothing is revealed and no watch starts once the fade ends', async () => {
    const fadeEnds = fadingIn();
    const row = startLeaving();
    await revealAfter(row);

    focus.forget();
    await fadeEnds();
    leftAbove();
    page.resizes();

    expect(scrolled).toEqual([]);
  });

  describe('and the device asks for less motion', () => {
    beforeEach(() => revealInPlace());

    it('when the page then changes size and leaves the result above the window, then the result is brought into view again', () => {
      leftAbove();

      page.resizes();

      expect(scrolled).toEqual(broughtBack());
    });

    it('when the page is then scrolled by something other than the donor and leaves the result above the window, then the result is brought into view again', () => {
      leftAbove();

      page.scrolls();

      expect(scrolled).toEqual(broughtBack());
    });

    it('when the page changes size and the result still stands in the window, then nothing scrolls', () => {
      page.resizes();
      page.scrolls();

      expect(scrolled).toEqual([]);
    });

    for (const visitorMove of ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown']) {
      it(`when the donor's ${visitorMove} comes first, then a later change of the page brings nothing into view`, () => {
        document.dispatchEvent(new Event(visitorMove));
        leftAbove();

        page.resizes();
        page.scrolls();

        expect(scrolled).toEqual([]);
      });
    }

    for (const key of ['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Fn']) {
      it(`when the donor presses ${key} alone first, then a later change of the page that leaves the result above the window still brings it into view`, () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key }));
        leftAbove();

        page.resizes();

        expect(scrolled).toEqual(broughtBack());
      });
    }

    it('when the donor presses Tab first, then a later change of the page brings nothing into view', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
      leftAbove();

      page.resizes();

      expect(scrolled).toEqual([]);
    });

    it('when the focus has moved elsewhere, then a later change of the page brings nothing into view', () => {
      add.focus();
      leftAbove();

      page.resizes();

      expect(scrolled).toEqual([]);
    });

    it('when 999 ms of its settling time have passed, then a change of the page still brings the result back', () => {
      page.letTimePass(999);
      leftAbove();

      page.resizes();

      expect(scrolled).toEqual(broughtBack());
    });

    it('when its whole settling time of 1 s has passed, then a later change of the page brings nothing into view', () => {
      page.letTimePass(1000);
      leftAbove();

      page.resizes();
      page.scrolls();

      expect(scrolled).toEqual([]);
    });

    it('when another row starts to leave, then a later change of the page brings nothing into view', () => {
      focus.rowLeaving(null);
      leftAbove();

      page.resizes();

      expect(scrolled).toEqual([]);
    });
  });
});
describe('Given a control that takes the focus back while the panel below it closes', () => {
  let card: HTMLElement;
  let control: HTMLButtonElement;
  let scrolled: unknown[];

  beforeEach(() => {
    scrolled = [];
    card = document.createElement('section');
    control = document.createElement('button');
    card.append(control);
    document.body.append(card);
    control.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => {
      scrolled.push(options);
    };
    control.focus();
  });

  afterEach(() => card.remove());

  function standing(top: number): void {
    control.getBoundingClientRect = () => new DOMRect(0, top, 300, 40);
  }

  function pageAsking(reducedMotion: boolean): Document {
    return {
      get activeElement() {
        return document.activeElement;
      },
      body: document.body,
      documentElement: document.documentElement,
      addEventListener: document.addEventListener.bind(document),
      removeEventListener: document.removeEventListener.bind(document),
      defaultView: {
        innerHeight: 600,
        matchMedia: (query: string) => ({
          matches: reducedMotion && query === '(prefers-reduced-motion: reduce)',
        }),
        getComputedStyle: (element: Element) => getComputedStyle(element),
      },
    } as unknown as Document;
  }

  function closing(): { motion: Animation; finish: () => void } {
    let finish: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    const motion = {
      finished,
      effect: { getComputedTiming: () => ({ endTime: 60_000 }) },
    } as unknown as Animation;
    return { motion, finish };
  }

  it('when the panel is still closing, then nothing scrolls until it has closed, and then the control glides into view', async () => {
    standing(-1759);
    const { motion, finish } = closing();
    new FocusAfterRowLeaves(pageAsking(false), () => null).keepInViewOnceSettled(
      control,
      [motion],
      false,
    );
    await Promise.resolve();
    expect(scrolled).toEqual([]);

    finish();

    await vi.waitFor(() => expect(scrolled).toEqual([{ block: 'nearest', behavior: 'smooth' }]));
  });

  it('when the device asks for less motion, then the control jumps into view once the panel has closed', async () => {
    standing(-1759);
    const { motion, finish } = closing();
    new FocusAfterRowLeaves(pageAsking(true), () => null).keepInViewOnceSettled(
      control,
      [motion],
      false,
    );

    finish();

    await vi.waitFor(() => expect(scrolled).toEqual([{ block: 'nearest', behavior: 'instant' }]));
  });

  it('when nothing closes any more, then the control is brought into view at once', () => {
    standing(-1759);

    new FocusAfterRowLeaves(pageAsking(false), () => null).keepInViewOnceSettled(
      control,
      [],
      false,
    );

    expect(scrolled).toEqual([{ block: 'nearest', behavior: 'smooth' }]);
  });

  it('when the focus moved elsewhere before the panel has closed, then nothing scrolls', async () => {
    standing(-1759);
    const { motion, finish } = closing();
    new FocusAfterRowLeaves(pageAsking(false), () => null).keepInViewOnceSettled(
      control,
      [motion],
      false,
    );

    control.blur();
    finish();
    await motion.finished;
    await new Promise<void>((resolve) => setTimeout(resolve));

    expect(scrolled).toEqual([]);
  });

  it('when a finger pressed the control and it still stands in the window, then it is left where it is', () => {
    standing(580);

    new FocusAfterRowLeaves(pageAsking(false), () => null).keepInViewOnceSettled(control, [], true);

    expect(scrolled).toEqual([]);
  });

  it('when a finger pressed the control and it ended above the window, then it is brought into view', () => {
    standing(-1759);

    new FocusAfterRowLeaves(pageAsking(false), () => null).keepInViewOnceSettled(control, [], true);

    expect(scrolled).toEqual([{ block: 'nearest', behavior: 'smooth' }]);
  });
});

describe('Given a row whose leave carries the control below it toward the top of what shows the page, on a device that asks for less motion unless a case says otherwise', () => {
  let list: HTMLUListElement;
  let row: HTMLElement;
  let below: HTMLElement;
  let other: HTMLButtonElement;
  let watchers: WatchedSizes[];
  let scrolledBy: ScrollToOptions[];
  let revealed: unknown[];
  let margins: Map<Element, Partial<CSSStyleDeclaration>>;
  let listening: number;
  let timers: Map<number, () => void>;
  let timerIds = 0;
  let focus: FocusAfterRowLeaves;

  class WatchedSizes {
    readonly targets = new Set<Element>();

    constructor(readonly callback: ResizeObserverCallback) {
      watchers.push(this);
    }

    observe(target: Element): void {
      this.targets.add(target);
    }

    disconnect(): void {
      watchers = watchers.filter((watcher) => watcher !== this);
    }
  }

  beforeEach(() => {
    watchers = [];
    scrolledBy = [];
    revealed = [];
    margins = new Map();
    listening = 0;
    timers = new Map();
    list = document.createElement('ul');
    list.innerHTML = `
      <li id="leaving"><button>Odhlásit</button></li>
      <li id="staying"><button id="below">Starší</button></li>
    `;
    other = document.createElement('button');
    document.body.append(list, other);
    row = document.getElementById('leaving')!;
    below = document.getElementById('below')!;
    below.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => {
      revealed.push(options);
    };
    standAt(below, 200);
    focus = new FocusAfterRowLeaves(page(true), () => list);
  });

  afterEach(() => {
    focus.forget();
    list.remove();
    other.remove();
  });

  function page(reducedMotion = false): Document {
    return {
      get activeElement() {
        return document.activeElement;
      },
      body: document.body,
      documentElement: document.documentElement,
      addEventListener: (...listener: Parameters<Document['addEventListener']>) => {
        listening++;
        document.addEventListener(...listener);
      },
      removeEventListener: (...listener: Parameters<Document['removeEventListener']>) => {
        listening--;
        document.removeEventListener(...listener);
      },
      defaultView: {
        innerHeight: 600,
        matchMedia: () => ({ matches: reducedMotion }),
        getComputedStyle: (element: Element) => ({
          ...getComputedStyle(element),
          scrollMarginTop: '',
          scrollPaddingTop: '',
          scrollPaddingBottom: '',
          overflowY: '',
          ...margins.get(element),
        }),
        ResizeObserver: WatchedSizes,
        requestAnimationFrame: (callback: FrameRequestCallback) => requestAnimationFrame(callback),
        scrollBy: (options: ScrollToOptions) => scrolledBy.push(options),
        setTimeout: (callback: () => void) => {
          timerIds += 1;
          timers.set(timerIds, callback);
          return timerIds;
        },
        clearTimeout: (id: number) => timers.delete(id),
      },
    } as unknown as Document;
  }

  function standAt(element: HTMLElement, top: number): void {
    element.getBoundingClientRect = () => new DOMRect(0, top, 300, 40);
  }

  function aFrameOfTheClose(): void {
    for (const watcher of [...watchers]) {
      watcher.callback([], watcher as unknown as ResizeObserver);
    }
  }

  async function removed(): Promise<void> {
    row.remove();
    await Promise.resolve();
    await Promise.resolve();
  }

  it('when a frame of the close carries the control 30 px above the top of the window, then the page scrolls back by those 30 px in that frame, at once', () => {
    focus.rowLeaving(row, () => below);
    standAt(below, -30);

    aFrameOfTheClose();

    expect(scrolledBy).toEqual([{ top: -30, behavior: 'instant' }]);
  });

  it('when the close is watched, then it is watched on the row and on every box around it up to the page, so a change above the list holds the control too', () => {
    focus.rowLeaving(row, () => below);

    expect([...watchers[0].targets]).toEqual([row, list, document.body]);
  });

  it('when a frame of the close leaves the control below the top, then nothing scrolls', () => {
    focus.rowLeaving(row, () => below);
    standAt(below, 4);

    aFrameOfTheClose();

    expect(scrolledBy).toEqual([]);
  });

  it('when the control keeps a scroll margin of 12 px, then it is held 12 px below the top', () => {
    margins.set(below, { scrollMarginTop: '12px' });
    focus.rowLeaving(row, () => below);
    standAt(below, 5);

    aFrameOfTheClose();

    expect(scrolledBy).toEqual([{ top: -7, behavior: 'instant' }]);
  });

  it('when the page keeps 58 px under its header as scroll padding, then the control is held below the header', () => {
    margins.set(document.documentElement, { scrollPaddingTop: '58px' });
    focus.rowLeaving(row, () => below);
    standAt(below, 40);

    aFrameOfTheClose();

    expect(scrolledBy).toEqual([{ top: -18, behavior: 'instant' }]);
  });

  it("when the control stands 8 px under the header as the row starts to leave, within the page's 16 px of scroll padding below it, then it is held where it stood", () => {
    margins.set(document.documentElement, { scrollPaddingTop: '74px' });
    standAt(below, 66);
    focus.rowLeaving(row, () => below);
    standAt(below, 30);

    aFrameOfTheClose();

    expect(scrolledBy).toEqual([{ top: -36, behavior: 'instant' }]);
  });

  it("when the visitor's own wheel ends the hold before the focus moves, then the control takes the focus without the browser scrolling it against the visitor", () => {
    const asked: (FocusOptions | undefined)[] = [];
    const focusOf = below.focus.bind(below);
    below.focus = (options?: FocusOptions) => {
      asked.push(options);
      focusOf(options);
    };
    focus.rowLeaving(row, () => below);
    document.dispatchEvent(new Event('wheel', { bubbles: true }));

    focus.moveFocus(row, below);

    expect(asked).toEqual([{ preventScroll: true }]);
    expect(document.activeElement).toBe(below);
  });

  it('when a sheet keeps no scroll padding for a moment as the row starts to leave, as its head does for two frames after a press, then the control is held below the head once the padding is back', () => {
    const panel = document.createElement('div');
    const panelScrolls: ScrollToOptions[] = [];
    panel.scrollBy = ((options: ScrollToOptions) => panelScrolls.push(options)) as never;
    panel.getBoundingClientRect = () => new DOMRect(0, 100, 375, 500);
    margins.set(panel, { overflowY: 'auto', scrollPaddingTop: '0px' });
    document.body.append(panel);
    panel.append(list);
    onTestFinished(() => panel.remove());
    focus.rowLeaving(row, () => below);
    margins.set(panel, { overflowY: 'auto', scrollPaddingTop: '57px' });
    standAt(below, 150);

    aFrameOfTheClose();

    expect(panelScrolls).toEqual([{ top: -7, behavior: 'instant' }]);
  });

  it('when the control stands in a scrolling panel, then the panel scrolls back, not the page', () => {
    const panel = document.createElement('div');
    const panelScrolls: ScrollToOptions[] = [];
    panel.scrollBy = ((options: ScrollToOptions) => panelScrolls.push(options)) as never;
    panel.getBoundingClientRect = () => new DOMRect(0, 100, 375, 500);
    margins.set(panel, { overflowY: 'auto', scrollPaddingTop: '57px' });
    document.body.append(panel);
    panel.append(list);
    onTestFinished(() => panel.remove());
    focus.rowLeaving(row, () => below);
    standAt(below, 150);

    aFrameOfTheClose();

    expect(panelScrolls).toEqual([{ top: -7, behavior: 'instant' }]);
    expect(scrolledBy).toEqual([]);
    expect([...watchers[0].targets]).toEqual([row, list, panel]);
  });

  it('when the control has taken the focus and the focus has moved on since, then nothing scrolls', () => {
    focus.rowLeaving(row, () => below);
    focus.moveFocus(row, below);
    other.focus();
    standAt(below, -30);

    aFrameOfTheClose();

    expect(scrolledBy).toEqual([]);
  });

  it('when another control takes the focus in its place, then that one is held', () => {
    focus.rowLeaving(row, () => below);
    focus.moveFocus(row, other);
    standAt(other, -12);

    aFrameOfTheClose();

    expect(scrolledBy).toEqual([{ top: -12, behavior: 'instant' }]);
  });

  it('when the focus goes in place to a region taller than the window, then the region is not held, so its result can be brought into view', () => {
    const region = document.createElement('section');
    region.tabIndex = -1;
    document.body.append(region);
    onTestFinished(() => region.remove());
    focus.rowLeaving(row);
    focus.focusInPlace(region, { row, from: below, to: null });
    standAt(region, -900);

    aFrameOfTheClose();

    expect(scrolledBy).toEqual([]);
  });

  it('when no control is left to take the focus, then nothing is held', () => {
    focus.rowLeaving(row);
    standAt(below, -30);

    aFrameOfTheClose();

    expect(scrolledBy).toEqual([]);
  });

  for (const [reducedMotion, behavior, how] of [
    [false, 'smooth', 'glides'],
    [true, 'instant', 'jumps'],
  ] as const) {
    it(`when the focus goes to the heading standing 300 px above the window${reducedMotion ? ' on a device that asks for less motion' : ''}, then no frame of the close scrolls and the heading ${how} into view once the row is gone`, async () => {
      const heading = document.createElement('h2');
      heading.tabIndex = -1;
      list.before(heading);
      onTestFinished(() => heading.remove());
      heading.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => {
        revealed.push(options);
      };
      focus = new FocusAfterRowLeaves(page(reducedMotion), () => list);
      focus.rowLeaving(row, () => null);
      focus.moveFocus(row, heading);
      focus.rowLeaveEnded(row);
      standAt(heading, -300);

      aFrameOfTheClose();
      await removed();
      aFrameOfTheClose();

      expect(scrolledBy).toEqual([]);
      expect(revealed).toEqual([{ block: 'nearest', behavior }]);
    });
  }

  it('when the nearest control left stands above the row, then no frame of the close scrolls', async () => {
    const above = document.createElement('button');
    list.before(above);
    onTestFinished(() => above.remove());
    focus.rowLeaving(row, () => above);
    focus.rowLeaveEnded(row);
    standAt(above, -300);

    aFrameOfTheClose();
    await removed();
    aFrameOfTheClose();

    expect(scrolledBy).toEqual([]);
  });

  for (const key of ['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Fn']) {
    it(`when the visitor presses ${key} alone during the close, then the control is still held`, () => {
      focus.rowLeaving(row, () => below);
      focus.moveFocus(row, below);

      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      standAt(below, -30);
      aFrameOfTheClose();

      expect(scrolledBy).toEqual([{ top: -30, behavior: 'instant' }]);
    });
  }

  it('when the visitor presses Shift with Tab during the close, then the hold ends', () => {
    focus.rowLeaving(row, () => below);
    focus.moveFocus(row, below);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    standAt(below, -30);
    aFrameOfTheClose();

    expect(scrolledBy).toEqual([]);
  });

  it('when it is forgotten after the control was brought into view while the list still moves, then no watcher, listener or timer is left', async () => {
    list.getAnimations = () =>
      [
        {
          effect: { getComputedTiming: () => ({ endTime: 60_000 }) },
          finished: new Promise(() => undefined),
        },
      ] as never;
    focus.rowLeaving(row, () => below);
    focus.moveFocus(row, below);
    focus.rowLeaveEnded(row);
    await removed();
    const waitingForTheList = timers.size;

    focus.forget();

    expect(revealed).toHaveLength(1);
    expect(watchers).toEqual([]);
    expect(listening).toBe(0);
    expect(waitingForTheList).toBe(1);
    expect(timers.size).toBe(0);
  });

  it('when the control below the row already stands above the top as the row starts to leave, as after a flick, then no frame of the close scrolls and the control is put into view at once once the row is gone', async () => {
    standAt(below, -400);
    focus.rowLeaving(row, () => below);
    focus.moveFocus(row, below);
    focus.rowLeaveEnded(row);

    aFrameOfTheClose();
    await removed();
    aFrameOfTheClose();

    expect(scrolledBy).toEqual([]);
    expect(revealed).toEqual([{ block: 'nearest', behavior: 'instant' }]);
  });

  it('when the device allows motion and the close comes over several frames, each scroll landing a frame late as on iOS, then nothing scrolls during the close, so the control only rises with it and never jerks back and forth, and it glides into view once the row is gone', async () => {
    focus = new FocusAfterRowLeaves(page(false), () => list);
    let collapsed = 0;
    let landed = 0;
    let applied = 0;
    const topNow = () => 538 - collapsed - landed;
    below.getBoundingClientRect = () => new DOMRect(0, topNow(), 300, 40);
    focus.rowLeaving(row, () => below);
    focus.moveFocus(row, below);
    focus.rowLeaveEnded(row);
    const painted: number[] = [];

    for (const step of [40, 120, 160, 150, 100, 60, 30]) {
      landed += scrolledBy.slice(applied).reduce((sum, scroll) => sum + (scroll.top ?? 0), 0);
      applied = scrolledBy.length;
      collapsed += step;
      aFrameOfTheClose();
      painted.push(topNow());
    }
    await removed();

    expect(scrolledBy).toEqual([]);
    expect(painted).toEqual([...painted].sort((higher, lower) => lower - higher));
    expect(revealed).toEqual([{ block: 'nearest', behavior: 'smooth' }]);
  });

  it('when the row is removed without its leave ever being reported, as when a leave nested in another is skipped, then the close is no longer watched once the row is gone', async () => {
    focus.rowLeaving(row, () => below);
    focus.moveFocus(row, below);

    await removed();

    await vi.waitFor(() => expect(watchers).toEqual([]));
    expect(listening).toBe(0);
    expect(revealed).toHaveLength(1);
  });

  for (const move of ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown']) {
    it(`when the visitor's own ${move} comes during the close, then later frames scroll nothing and the control is not brought into view once the row is gone`, async () => {
      focus.rowLeaving(row, () => below);
      focus.moveFocus(row, below);
      focus.rowLeaveEnded(row);

      document.dispatchEvent(new Event(move, { bubbles: true }));
      standAt(below, -30);
      aFrameOfTheClose();
      await removed();

      expect(scrolledBy).toEqual([]);
      expect(revealed).toEqual([]);
      expect(watchers).toEqual([]);
    });
  }

  it('when the row is gone and nothing in its list moves any more, then the frame of the removal is still held, and only after it the close is no longer watched', async () => {
    focus.rowLeaving(row, () => below);
    focus.moveFocus(row, below);
    focus.rowLeaveEnded(row);

    await removed();
    standAt(below, -40);
    aFrameOfTheClose();

    expect(scrolledBy).toEqual([{ top: -40, behavior: 'instant' }]);
    await vi.waitFor(() => expect(watchers).toEqual([]));
  });

  it('when the row is gone before the first frame and before the focus moves, as under reduced motion, then the control below is still held in the frame of the removal', async () => {
    focus.rowLeaving(row, () => below);
    await removed();
    focus.moveFocus(row, below);
    standAt(below, -40);

    aFrameOfTheClose();

    expect(scrolledBy).toEqual([{ top: -40, behavior: 'instant' }]);
  });

  it('when another action begins before the row is gone, then the close is no longer watched', () => {
    focus.rowLeaving(row, () => below);

    focus.forget();

    expect(watchers).toEqual([]);
  });
});

describe('Given a control that takes the focus back while the panel below it closes, and a visitor who scrolls meanwhile', () => {
  it('when the visitor turns the wheel before the panel has closed, then the control is left where they scrolled it', async () => {
    const card = document.createElement('section');
    const control = document.createElement('button');
    const scrolled: unknown[] = [];
    card.append(control);
    document.body.append(card);
    onTestFinished(() => card.remove());
    control.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => {
      scrolled.push(options);
    };
    control.getBoundingClientRect = () => new DOMRect(0, -1759, 300, 40);
    control.focus();
    let finish: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    const motion = {
      finished,
      effect: { getComputedTiming: () => ({ endTime: 60_000 }) },
    } as unknown as Animation;
    new FocusAfterRowLeaves(document, () => null).keepInViewOnceSettled(control, [motion], false);

    document.dispatchEvent(new Event('wheel', { bubbles: true }));
    finish();
    await finished;
    await Promise.resolve();

    expect(scrolled).toEqual([]);
  });
});
