import {
  afterRemoval,
  FocusAfterRowLeaves,
  leaveWithClass,
  markRowsLeaving,
  neighbourAfterRowLeaves,
} from './leaving-row';

describe('Given a list whose row is about to leave', () => {
  let list: HTMLUListElement;

  beforeEach(() => {
    list = document.createElement('ul');
    list.innerHTML = `
      <li id="first"><button id="first-action">Odhlásit</button></li>
      <li id="second"><button id="second-action">Odhlásit</button><button>Zrušit</button></li>
      <li id="third"><button id="third-action">Odhlásit</button></li>
    `;
    document.body.append(list);
  });

  afterEach(() => list.remove());

  function byId(id: string): HTMLElement {
    return document.getElementById(id) as HTMLElement;
  }

  function actions(): HTMLElement[] {
    return Array.from(list.querySelectorAll<HTMLElement>('li > button:first-child'));
  }

  it('when a row in the middle leaves, then its neighbour below takes the focus', () => {
    const neighbour = neighbourAfterRowLeaves(byId('second'), actions());
    byId('second').remove();

    expect(neighbour()).toBe(byId('third-action'));
  });

  it('when the last row leaves, then its neighbour above takes the focus', () => {
    const neighbour = neighbourAfterRowLeaves(byId('third'), actions());
    byId('third').remove();

    expect(neighbour()).toBe(byId('second-action'));
  });

  it('when the neighbour below left with it, then the nearest row above takes the focus', () => {
    const neighbour = neighbourAfterRowLeaves(byId('second'), actions());
    byId('second').remove();
    byId('third').remove();

    expect(neighbour()).toBe(byId('first-action'));
  });

  it('when the neighbour is still disabled or inert, then it is passed over', () => {
    const neighbour = neighbourAfterRowLeaves(byId('first'), actions());
    byId('first').remove();
    (byId('second-action') as HTMLButtonElement).disabled = true;
    byId('third').setAttribute('inert', '');

    expect(neighbour()).toBeNull();
  });

  it('when the controls of the leaving row are passed too, then none of them is chosen', () => {
    const neighbour = neighbourAfterRowLeaves(
      byId('second'),
      Array.from(list.querySelectorAll<HTMLElement>('button')),
    );

    expect(neighbour()).toBe(byId('third-action'));
  });

  it('when the only row leaves, then nothing is left to take the focus and the page names its heading', () => {
    const neighbour = neighbourAfterRowLeaves(byId('first'), [byId('first-action')]);
    byId('first').remove();

    expect(neighbour()).toBeNull();
  });

  it('when the leaving row is not found, then the first control of the list takes the focus', () => {
    const neighbour = neighbourAfterRowLeaves(null, actions());

    expect(neighbour()).toBe(byId('first-action'));
  });

  it('when rows are marked as leaving, then each is inert at once, so neither Tab nor a screen reader reaches its controls', () => {
    markRowsLeaving([byId('first'), null, byId('third')]);

    expect(byId('first').hasAttribute('inert')).toBe(true);
    expect(byId('first-action').closest('[inert]')).toBe(byId('first'));
    expect(byId('second').hasAttribute('inert')).toBe(false);
    expect(byId('third').hasAttribute('inert')).toBe(true);
  });

  it('when a row is marked as leaving before its neighbour is chosen, then its own controls are still passed over', () => {
    markRowsLeaving([byId('second')]);
    const neighbour = neighbourAfterRowLeaves(byId('second'), actions());

    expect(neighbour()).toBe(byId('third-action'));
  });
});

describe('Given a row that leaves through its leaving class', () => {
  let row: HTMLLIElement;
  let completions: number;
  let left: HTMLElement[];

  interface FakeMotion {
    readonly finished: Promise<Animation>;
    playState: AnimationPlayState;
    readonly effect: { getComputedTiming: () => { endTime: number } };
    finish: () => void;
  }

  beforeEach(() => {
    row = document.createElement('li');
    document.body.append(row);
    completions = 0;
    left = [];
  });

  afterEach(() => {
    row.remove();
    vi.useRealTimers();
  });

  function motion(endTime: number): FakeMotion {
    let resolve: (value: Animation) => void = () => undefined;
    const finished = new Promise<Animation>((done) => (resolve = done));
    const fake: FakeMotion = {
      finished,
      playState: 'running',
      effect: { getComputedTiming: () => ({ endTime }) },
      finish: () => {
        fake.playState = 'finished';
        resolve({} as Animation);
      },
    };
    return fake;
  }

  function cancelled(): FakeMotion {
    const fake = motion(150);
    Object.assign(fake, { finished: Promise.reject(new DOMException('cancelled', 'AbortError')) });
    fake.finished.catch(() => undefined);
    return fake;
  }

  function leave(motions: FakeMotion[], leaves?: (target: HTMLElement) => boolean): void {
    Object.defineProperty(row, 'getAnimations', {
      value: () => motions.filter((one) => one.playState !== 'idle'),
    });
    leaveWithClass('row--leaving', { leaves, left: (target) => left.push(target) })({
      target: row,
      animationComplete: () => (completions += 1),
    });
  }

  async function settle(): Promise<void> {
    for (let turn = 0; turn < 5; turn += 1) {
      await Promise.resolve();
    }
  }

  it('when it does not really leave, then its leave is complete at once, without the class and without inert', () => {
    leave([motion(150)], () => false);

    expect(completions).toBe(1);
    expect(row.classList.contains('row--leaving')).toBe(false);
    expect(row.hasAttribute('inert')).toBe(false);
    expect(left).toEqual([]);
  });

  it('when it has no motion, then it is inert, carries the class and its leave is complete at once', () => {
    leave([]);

    expect(row.hasAttribute('inert')).toBe(true);
    expect(row.classList.contains('row--leaving')).toBe(true);
    expect(completions).toBe(1);
    expect(left).toEqual([row]);
  });

  it('when it was made inert before it leaves, then its inert is not written again', async () => {
    row.setAttribute('inert', '');
    const writes: string[] = [];
    const watch = new MutationObserver((records) =>
      writes.push(...records.map((record) => record.attributeName ?? '')),
    );
    watch.observe(row, { attributes: true, attributeFilter: ['inert'] });

    leave([]);
    await settle();
    watch.disconnect();

    expect(writes).toEqual([]);
    expect(row.hasAttribute('inert')).toBe(true);
  });

  it('when it has several motions, then its leave is complete only once all of them finished, and it keeps the class', async () => {
    const short = motion(150);
    const long = motion(200);
    leave([short, long]);

    short.finish();
    row.dispatchEvent(new Event('animationend'));
    await settle();
    expect(completions).toBe(0);
    expect(row.hasAttribute('inert')).toBe(true);

    long.finish();
    await settle();
    expect(completions).toBe(1);
    expect(left).toEqual([row]);
    expect(row.classList.contains('row--leaving')).toBe(true);
  });

  it('when the end of its last motion arrives as an animationend, then its leave is complete once', async () => {
    const only = motion(150);
    leave([only]);
    only.playState = 'finished';

    row.dispatchEvent(new Event('animationend'));
    expect(completions).toBe(1);
    only.finish();
    await settle();

    expect(completions).toBe(1);
  });

  it('when an animationend of something inside it arrives, then its leave goes on', () => {
    const inside = document.createElement('span');
    row.append(inside);
    leave([motion(150)]);

    inside.dispatchEvent(new Event('animationend', { bubbles: true }));

    expect(completions).toBe(0);
  });

  it('when its motion is cancelled, then its leave is complete all the same', async () => {
    const motions = [cancelled()];
    leave(motions);
    motions[0].playState = 'idle';

    row.dispatchEvent(new Event('animationcancel'));
    await settle();

    expect(completions).toBe(1);
  });

  it('when no end of its motion ever arrives, then its leave is complete 300 ms after the longest one would have ended', () => {
    vi.useFakeTimers();
    leave([motion(150), motion(200)]);

    vi.advanceTimersByTime(499);
    expect(completions).toBe(0);
    vi.advanceTimersByTime(1);

    expect(completions).toBe(1);
    expect(left).toEqual([row]);
  });
});

describe('Given a list whose row leaves while the rows below it settle into its place', () => {
  let list: HTMLUListElement;
  let completions: (() => void)[];

  beforeEach(() => {
    vi.useFakeTimers();
    list = document.createElement('ul');
    list.innerHTML = `
      <li id="first"></li>
      <li id="second"></li>
      <li id="third"></li>
      <li id="fourth"></li>
    `;
    document.body.append(list);
    completions = [];
  });

  afterEach(() => {
    list.remove();
    vi.useRealTimers();
  });

  function byId(id: string): HTMLElement {
    return document.getElementById(id) as HTMLElement;
  }

  function settling(): string[] {
    return Array.from(list.querySelectorAll('.row--settling')).map((row) => row.id);
  }

  function leave(id: string): void {
    const row = byId(id);
    let finish: (value: Animation) => void = () => undefined;
    const finished = new Promise<Animation>((done) => (finish = done));
    Object.defineProperty(row, 'getAnimations', {
      value: () => [
        { finished, playState: 'running', effect: { getComputedTiming: () => ({ endTime: 150 }) } },
      ],
    });
    leaveWithClass('row--leaving', { settling: 'row--settling' })({
      target: row,
      animationComplete: () => row.remove(),
    });
    completions.push(() => finish({} as Animation));
  }

  async function finishLeave(index: number): Promise<void> {
    completions[index]();
    for (let turn = 0; turn < 5; turn += 1) {
      await Promise.resolve();
    }
  }

  it('when a row in the middle starts to leave, then only the rows below it settle, and they stay out of the reach of presses only, never inert', () => {
    leave('second');

    expect(settling()).toEqual(['third', 'fourth']);
    expect(byId('third').hasAttribute('inert')).toBe(false);
    expect(byId('fourth').hasAttribute('inert')).toBe(false);
  });

  it('when its leave is complete, then the rows below keep settling for a double tap of 300 ms, and then take presses again', async () => {
    leave('second');
    await finishLeave(0);

    vi.advanceTimersByTime(299);
    expect(settling()).toEqual(['third', 'fourth']);
    vi.advanceTimersByTime(1);

    expect(settling()).toEqual([]);
  });

  it('when no end of its motion ever arrives, then the rows below settle until 300 ms after its leave is complete', () => {
    leave('second');

    vi.advanceTimersByTime(450 + 299);
    expect(settling()).toEqual(['third', 'fourth']);
    vi.advanceTimersByTime(1);

    expect(settling()).toEqual([]);
  });

  it('when a second row leaves while the rows below still settle, then they settle until 300 ms after the later leave is complete', async () => {
    leave('first');
    await finishLeave(0);
    vi.advanceTimersByTime(200);
    leave('second');
    vi.advanceTimersByTime(100);
    expect(settling()).toEqual(['third', 'fourth']);

    await finishLeave(1);
    vi.advanceTimersByTime(299);
    expect(settling()).toEqual(['third', 'fourth']);
    vi.advanceTimersByTime(1);

    expect(settling()).toEqual([]);
  });

  it('when a row with no motion of its own leaves, then the rows below still settle for a double tap of 300 ms, and then take presses again', () => {
    const row = byId('second');
    Object.defineProperty(row, 'getAnimations', { value: () => [] });

    leaveWithClass('row--leaving', { settling: 'row--settling' })({
      target: row,
      animationComplete: () => row.remove(),
    });

    expect(byId('second')).toBeNull();
    vi.advanceTimersByTime(299);
    expect(settling()).toEqual(['third', 'fourth']);
    vi.advanceTimersByTime(1);

    expect(settling()).toEqual([]);
  });

  it('when a row leaves without settling the rows below, then none of them carries a class', () => {
    leaveWithClass('row--leaving')({ target: byId('second'), animationComplete: () => undefined });

    expect(list.querySelectorAll('[class]')).toHaveLength(1);
  });
});

describe('Given a row watched until it is removed', () => {
  let section: HTMLElement;
  let list: HTMLUListElement;
  let row: HTMLLIElement;
  let other: HTMLLIElement;
  let releases: boolean[];
  let stopWatching: () => void;

  beforeEach(() => {
    section = document.createElement('section');
    list = document.createElement('ul');
    row = document.createElement('li');
    other = document.createElement('li');
    list.append(row, other);
    section.append(list);
    document.body.append(section);
    releases = [];
    stopWatching = afterRemoval(row, () => releases.push(row.isConnected));
  });

  afterEach(() => section.remove());

  async function settle(): Promise<void> {
    for (let turn = 0; turn < 5; turn += 1) {
      await Promise.resolve();
    }
  }

  it('when it is removed from its list, then it is released once, only after the removal', async () => {
    row.remove();
    expect(releases).toEqual([]);

    await settle();

    expect(releases).toEqual([false]);
  });

  it('when another row of its list is removed, then it is not released', async () => {
    other.remove();
    await settle();

    expect(releases).toEqual([]);
  });

  it('when its watch is stopped before it is removed, then it is never released', async () => {
    stopWatching();

    row.remove();
    await settle();

    expect(releases).toEqual([]);
  });

  it('when its list leaves with the section around it, then it is not released, because only its own list is watched', async () => {
    expect(() => section.remove()).not.toThrow();
    await settle();

    expect(releases).toEqual([]);
  });

  it('when it is put back and removed again after its release, then it is not released a second time', async () => {
    row.remove();
    await settle();

    list.append(row);
    await settle();
    row.remove();
    await settle();

    expect(releases).toEqual([false]);
  });
});

describe('Given a row in a fold, watched from the list around the fold until it is removed', () => {
  let card: HTMLUListElement;
  let fold: HTMLLIElement;
  let row: HTMLLIElement;
  let releases: boolean[];

  beforeEach(() => {
    card = document.createElement('ul');
    fold = document.createElement('li');
    const folded = document.createElement('ul');
    row = document.createElement('li');
    folded.append(row);
    fold.append(folded);
    card.append(fold);
    document.body.append(card);
    releases = [];
    afterRemoval(row, () => releases.push(row.isConnected), card);
  });

  afterEach(() => card.remove());

  async function settle(): Promise<void> {
    for (let turn = 0; turn < 5; turn += 1) {
      await Promise.resolve();
    }
  }

  it('when the whole fold leaves with the row still in it, then it is released once, after the removal', async () => {
    fold.remove();
    expect(releases).toEqual([]);

    await settle();

    expect(releases).toEqual([false]);
  });

  it('when only the row leaves its fold, then it is released once', async () => {
    row.remove();
    await settle();

    expect(releases).toEqual([false]);
  });

  it('when another row of the list around the fold is removed, then it is not released', async () => {
    const other = document.createElement('li');
    card.append(other);
    await settle();
    other.remove();
    await settle();

    expect(releases).toEqual([]);
  });
});

describe('Given a row that has already left the document', () => {
  it('when it is watched until it is removed, then it is released at once', () => {
    const list = document.createElement('ul');
    const row = document.createElement('li');
    list.append(row);
    const releases: boolean[] = [];

    afterRemoval(row, () => releases.push(row.isConnected));

    expect(releases).toEqual([false]);
  });
});

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

describe('Given a row whose leave carries the control below it toward the top of what shows the page', () => {
  let list: HTMLUListElement;
  let row: HTMLElement;
  let below: HTMLElement;
  let other: HTMLButtonElement;
  let watchers: WatchedSizes[];
  let scrolledBy: ScrollToOptions[];
  let revealed: unknown[];
  let margins: Map<Element, Partial<CSSStyleDeclaration>>;
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
    focus = new FocusAfterRowLeaves(page(), () => list);
  });

  afterEach(() => {
    focus.forget();
    list.remove();
    other.remove();
  });

  function page(): Document {
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
        matchMedia: () => ({ matches: false }),
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
