import { Location } from '@angular/common';
import { ApplicationRef, Component, inject, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import {
  Event as RouterEvent,
  GuardsCheckEnd,
  NavigationEnd,
  provideRouter,
  RouteConfigLoadStart,
  Router,
  RouterOutlet,
  withInMemoryScrolling,
} from '@angular/router';
import { CompactLayout } from '../layout/compact-layout';
import { PLACING_MARK, STEADY_FRAME_MARK } from './frame-pace';
import { APP_DEPTH_KEY, BACK_NAVIGATION, BackTarget } from './back-target';
import { PagePlacement } from './page-placement';
import { ACCOUNT_RETURNS_KEY } from './page-transitions';
import { NavigationPreview } from './navigation-preview';
import {
  FIRST_SECTION_READS_WITHIN_MS,
  FRAME_LATE_MS,
  HELD_WITHOUT_A_FRAME_MS,
  PAGE_LAYER_CLASS,
  PAGE_TRANSITION_CLASS,
  PAGE_TRANSITION_LONGEST_MS,
  PageTransitions,
  SECTION_READS_WITHIN_MS,
  STEP_ENDS_LATE_BY_MS,
} from './page-transitions';
import { withOrdinarySpaces } from '../../../testing/ordinary-spaces';
import { closeOnceCovered, SHEET_STEPPING, sheetOnly, swipeBackInSheet } from './sheet-stepping';
import { steepestStepOver } from './back-swipe';
import { afterDrawnFrames, publishSteadyFrame, STEP_CHROME } from './step-chrome';

@Component({ template: '' })
class Blank {}

const readsInFlight: (() => void)[] = [];

const CLOCK_ONLY: Parameters<typeof vi.useFakeTimers>[0] = {
  toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
};

function asksForItsText(): boolean {
  readsInFlight.push(inject(PagePlacement).reading());
  return true;
}

@Component({
  selector: 'app-scrolled-shell',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
class ScrolledShell {}

const jsdomWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');

function motionEnding(finished: Promise<unknown>) {
  return { finished, pause: () => undefined, play: () => undefined };
}

afterAll(() => {
  expect(Object.getOwnPropertyDescriptor(window, 'innerWidth')).toEqual(jsdomWidth);
});

describe('Given a phone that animates and a page of the news with an article to open', () => {
  let router: Router;
  let layer: HTMLElement;
  let coveredAtGuards: boolean[];
  let transitions: PageTransitions;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    });
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    layer.textContent = 'Aktuality';
    document.body.append(layer);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'aktuality', component: Blank },
          { path: 'aktuality/:slug', component: Blank, data: { parent: '/aktuality' } },
        ]),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
      ],
    });
    router = TestBed.inject(Router);
    transitions = dressedTransitions();
    transitions.sheets = SHEET_STEPPING;
    coveredAtGuards = [];
    router.events.subscribe((event) => {
      if (event instanceof GuardsCheckEnd) {
        coveredAtGuards.push(document.querySelector(`.${PAGE_TRANSITION_CLASS}`) !== null);
      }
    });
    await router.navigateByUrl('/aktuality');
  });

  afterEach(() => {
    document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}, dialog`).forEach((node) => node.remove());
    layer.remove();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('when the article opens, then a still copy of the news covers the screen while it opens', async () => {
    await router.navigateByUrl('/aktuality/clanek');

    expect(coveredAtGuards.at(-1)).toBe(true);
  });

  it('when the article opens while a dialog is still sliding away, then nothing covers the screen', async () => {
    const closing = document.createElement('dialog');
    closing.className = 'dialog dialog--leaving';
    document.body.append(closing);

    await router.navigateByUrl('/aktuality/clanek');

    expect(coveredAtGuards.at(-1)).toBe(false);
  });

  it('when the article opens with a closed dialog left in the page, then the article still slides in', async () => {
    document.body.append(document.createElement('dialog'));

    await router.navigateByUrl('/aktuality/clanek');

    expect(coveredAtGuards.at(-1)).toBe(true);
  });

  describe('when a sheet standing open leaves for the article', () => {
    let closedUnderCover: boolean[];

    beforeEach(() => {
      const sheet = document.createElement('dialog');
      sheet.className = 'dialog dialog--sheet';
      sheet.setAttribute('open', '');
      document.body.append(sheet);
      closedUnderCover = [];
    });

    function leaveTheSheet(): void {
      closeOnceCovered(transitions, () =>
        closedUnderCover.push(document.querySelector(`.${PAGE_TRANSITION_CLASS}`) !== null),
      );
    }

    it('then the sheet closes only once the copies cover the screen, never a frame before', async () => {
      leaveTheSheet();

      expect(closedUnderCover).toEqual([]);
      await router.navigateByUrl('/aktuality/clanek');

      expect(closedUnderCover).toEqual([true]);
    });

    it('and the navigation fails, then the sheet still closes once', async () => {
      leaveTheSheet();

      await router.navigateByUrl('/nikde').catch(() => undefined);

      expect(closedUnderCover).toEqual([false]);
    });

    it('and the system asks for less motion, then the sheet closes at once', () => {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: (query: string) =>
          ({ matches: query.includes('prefers-reduced-motion'), media: query }) as MediaQueryList,
      });

      leaveTheSheet();

      expect(closedUnderCover).toEqual([false]);
    });
  });
});

interface HeldMotion {
  pending: boolean;
  startTime: number | null;
  readonly currentTime: number | null;
  readonly startsSetByThePage: number;
  readonly currentTimesSetByThePage: number;
  finished: Promise<unknown>;
  play(): void;
}

const frameClock = { at: 0 };
const playedUntilDrawn = new Set<{ pending: boolean; started: (at: number) => void }>();

function drawnAt(at: number): void {
  playedUntilDrawn.forEach((motion) => motion.started(at));
  playedUntilDrawn.clear();
}

function heldMotion(): HeldMotion {
  let startTime: number | null = null;
  let startsSetByThePage = 0;
  let currentTimesSetByThePage = 0;
  const motion = {
    pending: true,
    finished: new Promise(() => undefined),
    get startTime(): number | null {
      return startTime;
    },
    set startTime(at: number | null) {
      startsSetByThePage++;
      startTime = at;
      motion.pending = false;
    },
    get currentTime(): number | null {
      return startTime === null ? 0 : frameClock.at - startTime;
    },
    set currentTime(_at: number | null) {
      currentTimesSetByThePage++;
    },
    get startsSetByThePage(): number {
      return startsSetByThePage;
    },
    get currentTimesSetByThePage(): number {
      return currentTimesSetByThePage;
    },
    started: (at: number): void => {
      startTime ??= at;
      motion.pending = false;
    },
    play: (): void => {
      if (startTime === null) {
        motion.pending = true;
        playedUntilDrawn.add(motion);
      }
    },
  };
  return motion;
}

function watchHeldMotions(): Map<Element, HeldMotion> {
  const motions = new Map<Element, HeldMotion>();
  const motionOf = (element: Element): HeldMotion => {
    if (!motions.has(element)) {
      motions.set(element, heldMotion());
    }
    return motions.get(element)!;
  };
  const ownAnimations = Object.getOwnPropertyDescriptor(Element.prototype, 'getAnimations');
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value(this: Element, options?: GetAnimationsOptions) {
      const elements = options?.subtree ? [this, ...this.querySelectorAll('*')] : [this];
      return elements
        .filter((element) => element.closest(`.${PAGE_TRANSITION_CLASS}`) !== null)
        .map(motionOf);
    },
  });
  onTestFinished(() => {
    playedUntilDrawn.clear();
    if (ownAnimations === undefined) {
      delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
    } else {
      Object.defineProperty(Element.prototype, 'getAnimations', ownAnimations);
    }
  });
  return motions;
}

function framesOnRequest(): (at: number) => void {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => {
    frames.push(frame);
    return frames.length;
  });
  onTestFinished(() => vi.mocked(window.requestAnimationFrame).mockRestore());
  return (at) => {
    frameClock.at = at;
    drawnAt(at);
    frames.splice(0).forEach((frame) => frame(at));
  };
}

function moving(): Element | null {
  return document.querySelector(`.${PAGE_TRANSITION_CLASS}--moving`);
}
describe('Given a phone that animates, whose router puts the scroll back, and articles whose pages ask the server for their text as they open', () => {
  let router: Router;
  let layer: HTMLElement;
  let arrived: string | null;
  let watch: MutationObserver;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    });
    document.documentElement.style.setProperty('--duration-page', '400ms');
    readsInFlight.length = 0;
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    layer.textContent = 'Aktuality';
    document.body.append(layer);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'aktuality', component: Blank },
            {
              path: 'aktuality/:slug',
              component: Blank,
              canActivate: [asksForItsText],
              data: { parent: '/aktuality' },
            },
            {
              path: 'pomahame/:slug',
              loadComponent: () => Promise.resolve(Blank),
              canActivate: [asksForItsText],
              data: { parent: '/aktuality' },
            },
          ],
          withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
        ),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
      ],
    });
    router = TestBed.inject(Router);
    dressedTransitions();
    document.body.append(document.createElement('app-scrolled-shell'));
    TestBed.inject(ApplicationRef).bootstrap(ScrolledShell);
    await router.navigateByUrl('/aktuality');
    vi.useFakeTimers();
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    onTestFinished(() => clock.mockRestore());
    arrived = null;
    watch = new MutationObserver(() => {
      const over = document.querySelector(`.${PAGE_TRANSITION_CLASS}__page--over`);
      if (arrived === null && over !== null && over.textContent?.trim() !== 'Aktuality') {
        arrived = over.textContent?.trim() ?? '';
      }
    });
    watch.observe(document.body, { childList: true, subtree: true });
  });

  afterEach(() => {
    watch.disconnect();
    vi.useRealTimers();
    document
      .querySelectorAll(`.${PAGE_TRANSITION_CLASS}, app-scrolled-shell`)
      .forEach((node) => node.remove());
    layer.remove();
    document.documentElement.style.removeProperty('--duration-page');
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  async function opensPlacedAfter(
    url: string,
    placedAfterMs: number,
    { pressStampedAheadMs = 0, preloadedMeanwhile = false } = {},
  ): Promise<void> {
    const placed = TestBed.inject(PagePlacement).pending();
    const press = new Event('pointerdown');
    if (pressStampedAheadMs > 0) {
      Object.defineProperty(press, 'timeStamp', { value: Date.now() + pressStampedAheadMs });
    }
    document.dispatchEvent(press);
    void router.navigateByUrl(url);
    if (preloadedMeanwhile) {
      (router.events as Subject<RouterEvent>).next(new RouteConfigLoadStart({ path: 'jinde' }));
    }
    await vi.advanceTimersByTimeAsync(0);
    layer.textContent = 'Načítáme stránku…';
    await vi.advanceTimersByTimeAsync(placedAfterMs);
    placed();
  }

  it('when the press carries a time stamp ahead of the page’s clock, as from another clock, then the tap budget counts from the navigation instead and never grants the whole wait', async () => {
    await opensPlacedAfter('/aktuality/zahrada-pro-deti', 150, { pressStampedAheadMs: 10_000 });
    await vi.advanceTimersByTimeAsync(5);

    expect(arrived).toBe('Načítáme stránku…');
  });

  it('when the router preloads another page’s code during the step, as the tab pages are preloaded, then the step keeps the budget of 9 frames, since its own page loaded no code', async () => {
    await opensPlacedAfter('/aktuality/zahrada-pro-deti', 150, { preloadedMeanwhile: true });
    await vi.advanceTimersByTimeAsync(5);

    expect(arrived).toBe('Načítáme stránku…');
  });

  it('when the step waits for the page’s text and so places its copies inside a frame, then its motions are let go in the frame after it, since the frame that placed them already draws them', async () => {
    watchHeldMotions();
    const draw = framesOnRequest();
    await opensPlacedAfter('/aktuality/zahrada-pro-deti', 40);
    await vi.advanceTimersByTimeAsync(5);
    layer.textContent = 'Zahrada pro děti';
    readsInFlight[0]();
    await vi.advanceTimersByTimeAsync(0);

    draw(1000);
    expect(moving()?.classList, 'held in the frame that placed the copies').toContain(
      `${PAGE_TRANSITION_CLASS}--held`,
    );
    draw(1016);

    expect(moving()?.classList).not.toContain(`${PAGE_TRANSITION_CLASS}--held`);
  });

  async function opensFromTheAccountSheet(url: string): Promise<() => void> {
    const sheet = document.createElement('dialog');
    sheet.textContent = 'Účet';
    const stage = TestBed.inject(PageTransitions);
    stage.sheets = { ...SHEET_STEPPING, standingSheetCopy: () => sheet };
    const placed = TestBed.inject(PagePlacement).pending();
    document.dispatchEvent(new Event('pointerdown'));
    void router.navigateByUrl(url, { state: { [ACCOUNT_RETURNS_KEY]: '' } });
    await vi.advanceTimersByTimeAsync(0);
    layer.textContent = 'Načítáme stránku…';
    return placed;
  }

  it('when a page opens from the account sheet and its reads answer long after the budget of 9 frames, then the step waits for them and the page slides in drawn, never empty (round 42)', async () => {
    const placed = await opensFromTheAccountSheet('/aktuality/zahrada-pro-deti');
    placed();
    await vi.advanceTimersByTimeAsync(600);
    expect(arrived, 'the page slid in before its reads were answered').toBeNull();

    layer.textContent = 'Zahrada pro děti';
    readsInFlight[0]();
    await vi.advanceTimersByTimeAsync(FRAME_LATE_MS);

    expect(arrived).toBe('Zahrada pro děti');
  });

  it('when a page opens from the account sheet and its reads never answer, then the page still slides in with its waiting line after the longest time of a step', async () => {
    const placed = await opensFromTheAccountSheet('/aktuality/zahrada-pro-deti');
    placed();
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS - 100);
    expect(arrived).toBeNull();
    await vi.advanceTimersByTimeAsync(100 + FRAME_LATE_MS);

    expect(arrived).toBe('Načítáme stránku…');
  });

  it('when the page is placed so late that waiting for its text would place the step later than 9 frames after the tap, then the article slides in at once with its waiting line', async () => {
    await opensPlacedAfter('/aktuality/zahrada-pro-deti', 250);
    await vi.advanceTimersByTimeAsync(5);

    expect(arrived).toBe('Načítáme stránku…');
  });

  it('when the page is placed early, then the step still waits for its text as long as the step can be placed within 9 frames of the tap, and the article slides in filled', async () => {
    await opensPlacedAfter('/aktuality/zahrada-pro-deti', 40);
    await vi.advanceTimersByTimeAsync(5);
    expect(arrived).toBeNull();

    layer.textContent = 'Zahrada pro děti';
    readsInFlight[0]();
    await vi.advanceTimersByTimeAsync(FRAME_LATE_MS);

    expect(arrived).toBe('Zahrada pro děti');
  });

  it('when the app has sampled no steady pace yet, so its steady frame falls back to 34 ms, then the tap budget still counts the display’s frames of 16.7 ms, and a page placed 150 ms after the tap slides in at once with its waiting line', async () => {
    await opensPlacedAfter('/aktuality/zahrada-pro-deti', 150);
    await vi.advanceTimersByTimeAsync(5);

    expect(arrived).toBe('Načítáme stránku…');
  });

  it('when the text never comes, then the article still slides in within the time a frame may be late, with its waiting line', async () => {
    await opensPlacedAfter('/aktuality/zahrada-pro-deti', 0);
    await vi.advanceTimersByTimeAsync(FRAME_LATE_MS - 10);
    expect(arrived, 'the article was copied before the time a frame may be late').toBeNull();
    await vi.advanceTimersByTimeAsync(10 + FRAME_LATE_MS);

    expect(arrived).toBe('Načítáme stránku…');
  });

  it('when the page’s code loads first, as on its first opening, then the step may wait for its text within 18 frames of the tap, and the article slides in filled', async () => {
    await opensPlacedAfter('/pomahame/zahrada-pro-deti', 200);
    await vi.advanceTimersByTimeAsync(5);
    expect(arrived).toBeNull();

    layer.textContent = 'Zahrada pro děti';
    readsInFlight[0]();
    await vi.advanceTimersByTimeAsync(FRAME_LATE_MS);

    expect(arrived).toBe('Zahrada pro děti');
  });
});

describe('Given a phone that animates, whose app has drawn frames at a steady pace since it started and no press since', () => {
  let router: Router;
  let layer: HTMLElement;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    });
    document.documentElement.style.setProperty('--duration-page', '300ms');
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    layer.textContent = 'Aktuality';
    document.body.append(layer);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'aktuality', component: Blank },
          { path: 'aktuality/:slug', component: Blank, data: { parent: '/aktuality' } },
        ]),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
      ],
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}`).forEach((node) => node.remove());
    layer.remove();
    document.documentElement.style.removeProperty('--duration-page');
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('when a frame in the first half of a step back comes long, then the step publishes the steady pace of the frames drawn since the app started and the long frame moves no start', async () => {
    const motions = watchHeldMotions();
    const draw = framesOnRequest();
    router = TestBed.inject(Router);
    const transitions = dressedTransitions();
    transitions.sheets = SHEET_STEPPING;
    for (let frame = 0; frame <= 10; frame++) {
      draw(1000 + frame * 16);
    }
    await router.navigateByUrl('/aktuality');
    await router.navigateByUrl('/aktuality/clanek');
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS * 2);
    motions.clear();
    document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}`).forEach((node) => node.remove());

    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    for (let waited = 0; moving() === null && waited < PAGE_TRANSITION_LONGEST_MS; waited += 5) {
      await vi.advanceTimersByTimeAsync(5);
    }
    draw(5000);
    draw(5016);
    draw(5032);
    draw(5112);

    expect(motions.size).toBeGreaterThan(1);
    expect(transitions.steadyFrameMs()).toBe(16);
    expect(new Set([...motions.values()].map((motion) => motion.startTime))).toEqual(
      new Set([5032]),
    );
  });

  it('when a step was drawn slowly to its end and the page then drew steadily again, then the next step publishes the pace of the frames drawn after the step, not those of its motion', async () => {
    document.documentElement.style.setProperty('--duration-page', '600ms');
    const motions = watchHeldMotions();
    const draw = framesOnRequest();
    router = TestBed.inject(Router);
    const transitions = dressedTransitions();
    transitions.sheets = SHEET_STEPPING;
    for (let frame = 0; frame <= 10; frame++) {
      draw(1000 + frame * 16);
    }
    await router.navigateByUrl('/aktuality');
    await router.navigateByUrl('/aktuality/clanek');
    for (let waited = 0; moving() === null && waited < PAGE_TRANSITION_LONGEST_MS; waited += 5) {
      await vi.advanceTimersByTimeAsync(5);
    }
    for (let at = 2000; at <= 2000 + 700; at += 30) {
      draw(at);
    }
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS * 2);
    for (let frame = 0; frame <= 10; frame++) {
      draw(4000 + frame * 16);
    }
    motions.clear();
    document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}`).forEach((node) => node.remove());

    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    for (let waited = 0; moving() === null && waited < PAGE_TRANSITION_LONGEST_MS; waited += 5) {
      await vi.advanceTimersByTimeAsync(5);
    }
    draw(5000);
    draw(5016);
    draw(5032);
    draw(5082);

    expect(motions.size).toBeGreaterThan(1);
    expect(transitions.steadyFrameMs()).toBe(16);
    expect(new Set([...motions.values()].map((motion) => motion.startTime))).toEqual(
      new Set([5032]),
    );
  });
});

describe('Given a phone that animates, an article opened from the news, and the news placed again on the way back', () => {
  let router: Router;
  let layer: HTMLElement;
  let moved: boolean;
  let watch: MutationObserver;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    });
    document.documentElement.style.setProperty('--duration-page', '300ms');
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    layer.textContent = 'Aktuality';
    document.body.append(layer);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'aktuality', component: Blank },
          { path: 'aktuality/:slug', component: Blank, data: { parent: '/aktuality' } },
        ]),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
      ],
    });
    router = TestBed.inject(Router);
    dressedTransitions();
    vi.useFakeTimers();
    await router.navigateByUrl('/aktuality');
    await router.navigateByUrl('/aktuality/clanek');
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS * 2);
    moved = false;
    watch = new MutationObserver(() => {
      moved ||= document.querySelector(`.${PAGE_TRANSITION_CLASS}--moving`) !== null;
    });
    watch.observe(document.body, { subtree: true, attributes: true, childList: true });
  });

  afterEach(() => {
    watch.disconnect();
    vi.useRealTimers();
    document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}`).forEach((node) => node.remove());
    layer.remove();
    document.documentElement.style.removeProperty('--duration-page');
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('when the news is not placed yet, then the step back keeps the article still over it until it is, and only then the news moves in', async () => {
    const placed = TestBed.inject(PagePlacement).pending();

    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS / 4 + 100);
    expect(moved).toBe(false);
    placed();
    await vi.advanceTimersByTimeAsync(50);

    expect(moved).toBe(true);
  });

  async function heldWhenTheMotionBegins(step: () => Promise<boolean>): Promise<boolean[]> {
    const heldWhenItBegins: boolean[] = [];
    const first = new MutationObserver(() => {
      const moving = document.querySelector(`.${PAGE_TRANSITION_CLASS}--moving`);
      if (moving !== null && heldWhenItBegins.length === 0) {
        heldWhenItBegins.push(moving.classList.contains(`${PAGE_TRANSITION_CLASS}--held`));
      }
    });
    first.observe(document.body, { subtree: true, attributes: true, childList: true });
    try {
      await step();
      await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS / 4 + 100);
      return heldWhenItBegins;
    } finally {
      first.disconnect();
    }
  }

  it('when the news moves in, then its motion holds still at its start until the frame that shows both pages has been drawn', async () => {
    const held = await heldWhenTheMotionBegins(() =>
      router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION }),
    );

    expect(held).toEqual([true]);
  });

  async function holdBegun(): Promise<void> {
    for (let waited = 0; moving() === null && waited < PAGE_TRANSITION_LONGEST_MS; waited += 5) {
      await vi.advanceTimersByTimeAsync(5);
    }
    expect(moving()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--held`);
  }

  function drawnSteadilyBeforeTheTap(draw: (at: number) => void, gapMs: number): void {
    document.dispatchEvent(new Event('pointerdown'));
    for (let frame = 0; frame <= 10; frame++) {
      draw(1000 + frame * gapMs);
    }
  }

  function startTimes(motions: Map<Element, HeldMotion>): Set<number | null> {
    return new Set([...motions.values()].map((motion) => motion.startTime));
  }

  it('when the first frame of the step is drawn, then its motions stay held in it, since a phone may show that frame only once it has painted both copies, and they are let go in the next frame', async () => {
    const motions = watchHeldMotions();
    const draw = framesOnRequest();
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();

    draw(5000);
    expect(moving()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--held`);
    draw(5016);

    expect(moving()?.classList).not.toContain(`${PAGE_TRANSITION_CLASS}--held`);
    expect(motions.size).toBeGreaterThan(0);
    expect(startTimes(motions)).toEqual(new Set([null]));
  });

  it('when the motions are let go, then the browser starts none of them before the frame after however long that frame takes within the motion’s length, so the screen moves only from a frame that already showed both pages at rest', async () => {
    const motions = watchHeldMotions();
    const draw = framesOnRequest();
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();
    draw(5000);
    draw(5016);

    await vi.advanceTimersByTimeAsync(300 + 2 * FRAME_LATE_MS - 20);
    expect(startTimes(motions)).toEqual(new Set([null]));
    draw(5480);
    expect(startTimes(motions)).toEqual(new Set([5480]));
    await vi.advanceTimersByTimeAsync(300 - 10);
    expect(moving(), 'the motion was cut before its end').not.toBeNull();
  });

  it('when a visible page keeps the step held for 1800 ms before its frames come, then the longest time of the step counts from the moment its motion is let go, so the slide runs its whole length and still ends within that length and 200 ms', async () => {
    watchHeldMotions();
    const draw = framesOnRequest();
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();
    await vi.advanceTimersByTimeAsync(1800);
    expect(moving()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--held`);
    draw(6800);
    draw(6816);
    draw(6832);

    await vi.advanceTimersByTimeAsync(300 - 10);
    expect(moving(), 'the motion was cut before its end').not.toBeNull();
    await vi.advanceTimersByTimeAsync(2 * FRAME_LATE_MS + 20);

    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
  });

  it('when the second frame of the hold comes 270 ms late, then the motions are let go only in it, the step is not cut before the motion has run its whole length from the frame after, and it ends within that length and 200 ms', async () => {
    watchHeldMotions();
    const draw = framesOnRequest();
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();
    draw(5000);
    await vi.advanceTimersByTimeAsync(270);
    expect(moving()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--held`);
    draw(5270);
    draw(5286);

    await vi.advanceTimersByTimeAsync(300 - 10);
    expect(moving(), 'the motion was cut before its end').not.toBeNull();
    await vi.advanceTimersByTimeAsync(2 * FRAME_LATE_MS + 20);

    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
  });

  it('when the first frame comes later than a frame may be late, as when a phone takes long to render the page beneath, then the motions stay held through that frame and are let go only in the one after it, never by the clock before the copies are painted', async () => {
    const motions = watchHeldMotions();
    const draw = framesOnRequest();
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();

    await vi.advanceTimersByTimeAsync(FRAME_LATE_MS + 50);
    expect(moving()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--held`);
    draw(5150);
    expect(moving()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--held`);
    draw(5166);
    expect(moving()?.classList).not.toContain(`${PAGE_TRANSITION_CLASS}--held`);
    draw(5182);

    expect(startTimes(motions)).toEqual(new Set([5182]));
  });

  it('when the page is visible and its main thread is busy past HELD_WITHOUT_A_FRAME_MS, so its first frame is still to come, then the clock never lets the held motions go, and the first frame and the one after it do', async () => {
    watchHeldMotions();
    const draw = framesOnRequest();
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();

    await vi.advanceTimersByTimeAsync(HELD_WITHOUT_A_FRAME_MS + 100);
    expect(moving()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--held`);
    draw(5600);
    expect(moving()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--held`);
    draw(5616);

    expect(moving()?.classList).not.toContain(`${PAGE_TRANSITION_CLASS}--held`);
  });

  it('when the page is hidden after the first frame of the hold and no frame comes after it, then the page clock lets the held motions go after HELD_WITHOUT_A_FRAME_MS, as when no frame came at all', async () => {
    watchHeldMotions();
    const draw = framesOnRequest();
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();
    draw(5000);
    hiddenWithoutTellingThePage();

    await vi.advanceTimersByTimeAsync(HELD_WITHOUT_A_FRAME_MS - 10);
    expect(moving()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--held`);
    await vi.advanceTimersByTimeAsync(10);

    expect(moving()?.classList).not.toContain(`${PAGE_TRANSITION_CLASS}--held`);
  });

  it('when the browser has drawn no frame since the press, as when it gives no more frames at all, and the page clock’s wait runs on time, then the clock lets the held motions go after the time a frame may be late, in a visible page too', async () => {
    watchHeldMotions();
    framesOnRequest();
    document.dispatchEvent(new Event('pointerdown'));
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();

    await vi.advanceTimersByTimeAsync(FRAME_LATE_MS + 5);

    expect(moving()?.classList).not.toContain(`${PAGE_TRANSITION_CLASS}--held`);
  });

  it('when the browser has drawn no frame since the press but the page clock’s look runs late, as after a long task, then that late look does not let the held motions go, and the frames that come next do', async () => {
    watchHeldMotions();
    const draw = framesOnRequest();
    document.dispatchEvent(new Event('pointerdown'));
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();
    const own = performance.now.bind(performance);
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => own() + 200);
    onTestFinished(() => clock.mockRestore());

    await vi.advanceTimersByTimeAsync(FRAME_LATE_MS + 5);
    expect(moving()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--held`);
    draw(5000);
    draw(5016);

    expect(moving()?.classList).not.toContain(`${PAGE_TRANSITION_CLASS}--held`);
  });

  it('when the browser drew a frame after the press, as an iPhone does before it holds the next one back while it paints the copies, then the page clock never lets the held motions go in a visible page, not even after 500 ms of looks on time (round 28)', async () => {
    watchHeldMotions();
    const draw = framesOnRequest();
    document.dispatchEvent(new Event('pointerdown'));
    draw(1000);
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();

    await vi.advanceTimersByTimeAsync(HELD_WITHOUT_A_FRAME_MS);

    expect(moving()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--held`);
  });

  it('when no frame came between the press and the placing, as a quick tap, a trackpad’s tap-to-click or a test’s click, and the hold then draws its first frame, then the page clock never ends the hold afterwards, since the next frame may be held back while the copies are painted (round 28)', async () => {
    watchHeldMotions();
    const draw = framesOnRequest();
    document.dispatchEvent(new Event('pointerdown'));
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();
    draw(5000);

    await vi.advanceTimersByTimeAsync(HELD_WITHOUT_A_FRAME_MS);

    expect(moving()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--held`);
  });

  it('when a second press comes while the step is held, then the hold keeps the frames-since-the-press its step began with, so the clock never lets it go', async () => {
    watchHeldMotions();
    const draw = framesOnRequest();
    document.dispatchEvent(new Event('pointerdown'));
    draw(1000);
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();
    document.dispatchEvent(new Event('pointerdown'));

    await vi.advanceTimersByTimeAsync(FRAME_LATE_MS + 50);

    expect(moving()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--held`);
  });

  it('when the step comes from a key, whose press and click share one task before any frame, then the page clock never lets the held motions go in a visible page, as an iPad with a keyboard may hold that frame back', async () => {
    watchHeldMotions();
    framesOnRequest();
    document.dispatchEvent(new Event('keydown'));
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();

    await vi.advanceTimersByTimeAsync(FRAME_LATE_MS + 50);

    expect(moving()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--held`);
  });

  it('when the news is placed by a resize observer, inside the frame that draws it, then the motions are held through that frame only and let go in the next', async () => {
    watchHeldMotions();
    const draw = framesOnRequest();
    const placement = TestBed.inject(PagePlacement);
    const placed = placement.pending();
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS / 4 + 10);

    placement.inRendering(placed);
    await vi.advanceTimersByTimeAsync(0);
    expect(moving()?.classList, 'held in the frame that placed the copies').toContain(
      `${PAGE_TRANSITION_CLASS}--held`,
    );
    draw(5000);

    expect(moving()?.classList).not.toContain(`${PAGE_TRANSITION_CLASS}--held`);
  });

  it('when the step ends while its motions are held and no frame comes, then the page clock stops looking', async () => {
    watchHeldMotions();
    framesOnRequest();
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();
    dressedTransitions().finish();

    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS * 3);

    expect(vi.getTimerCount(), 'timers still pending after the step ended').toBe(0);
  });

  function hiddenWithoutTellingThePage(): void {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    onTestFinished(() => visibility.mockRestore());
  }

  it('when the page is hidden and no frame comes at all after the hold begins, as in a home-screen app put away, then only the page clock lets the held motions go, after HELD_WITHOUT_A_FRAME_MS, and each starts with the first frame drawn after', async () => {
    const motions = watchHeldMotions();
    const draw = framesOnRequest();
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();
    hiddenWithoutTellingThePage();

    await vi.advanceTimersByTimeAsync(HELD_WITHOUT_A_FRAME_MS - 10);
    expect(moving()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--held`);
    await vi.advanceTimersByTimeAsync(10);
    expect(moving()?.classList).not.toContain(`${PAGE_TRANSITION_CLASS}--held`);
    draw(5200);

    expect(motions.size).toBeGreaterThan(0);
    expect(startTimes(motions)).toEqual(new Set([5200]));
  });

  it('when the page clock lets the held motions go between two frames, then they start with the next frame drawn and no later long frame moves that start', async () => {
    const motions = watchHeldMotions();
    const draw = framesOnRequest();
    drawnSteadilyBeforeTheTap(draw, 16);
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();
    hiddenWithoutTellingThePage();
    await vi.advanceTimersByTimeAsync(HELD_WITHOUT_A_FRAME_MS);
    draw(5048);

    for (const at of [5064, 5131, 5164]) {
      draw(at);
    }

    expect(startTimes(motions)).toEqual(new Set([5048]));
  });

  it('when the motions of the step never report that they are ready or finished, then the step still ends within its motion’s length after it is let go, not only after its longest time', async () => {
    watchHeldMotions();
    const draw = framesOnRequest();
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();
    draw(5000);
    draw(5016);
    draw(5032);

    await vi.advanceTimersByTimeAsync(300 + 2 * FRAME_LATE_MS + 1);

    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
  });

  it('when no frame comes at all, then the step ends after its longest time instead of leaving its cover over the page', async () => {
    watchHeldMotions();
    framesOnRequest();

    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS * 2);

    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
  });

  function stepLeftOver(): string[] {
    return [
      ...Array.from(document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}`), () => 'copies'),
      ...(layer.closest('[inert]') === null ? [] : ['the page is inert']),
      ...(dressedTransitions().stepping() ? ['the step runs'] : []),
    ];
  }

  it('when the frames stop right after the one that lets the motions go and the motions never report that they finished, as on a cold runner, then the step still ends within its motion’s length and STEP_ENDS_LATE_BY_MS, without waiting for another frame, leaving no copy and nothing inert', async () => {
    watchHeldMotions();
    const draw = framesOnRequest();
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();
    draw(5000);
    draw(5016);
    expect(moving()?.classList, 'the motions were not let go').not.toContain(
      `${PAGE_TRANSITION_CLASS}--held`,
    );

    await vi.advanceTimersByTimeAsync(300 + STEP_ENDS_LATE_BY_MS);

    expect(stepLeftOver()).toEqual([]);
  });

  it('when frames come only every 600 ms and the motions never report that they finished, then the step ends within its motion’s length and STEP_ENDS_LATE_BY_MS after the frame that lets them go, not after the next frame or its longest time', async () => {
    watchHeldMotions();
    const draw = framesOnRequest();
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();
    for (const at of [5600, 6200]) {
      await vi.advanceTimersByTimeAsync(600);
      draw(at);
    }
    expect(moving()?.classList, 'the motions were not let go').not.toContain(
      `${PAGE_TRANSITION_CLASS}--held`,
    );

    await vi.advanceTimersByTimeAsync(300 + STEP_ENDS_LATE_BY_MS);

    expect(stepLeftOver()).toEqual([]);
  });

  it('when the frame after the one that lets the motions go is drawn, then the browser starts every motion at its time, so that frame still shows both pages at rest and the next one moves', async () => {
    const motions = watchHeldMotions();
    const draw = framesOnRequest();
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();

    draw(5000);
    draw(5016);
    draw(5140);
    await vi.advanceTimersByTimeAsync(0);

    expect(motions.size).toBeGreaterThan(0);
    expect(startTimes(motions)).toEqual(new Set([5140]));
  });

  it('when the held motions are let go, then the page never writes their start time nor their current time, so the browser starts each with the first frame it draws it in and that frame shows it at its start', async () => {
    const motions = watchHeldMotions();
    const draw = framesOnRequest();
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();

    draw(5000);
    draw(5016);
    draw(5140);
    await vi.advanceTimersByTimeAsync(0);

    expect(motions.size).toBeGreaterThan(0);
    expect([...motions.values()].map((motion) => motion.startsSetByThePage)).toEqual(
      [...motions.values()].map(() => 0),
    );
    expect([...motions.values()].map((motion) => motion.currentTimesSetByThePage)).toEqual(
      [...motions.values()].map(() => 0),
    );
  });

  async function releasedAt(draw: (at: number) => void, first: number, second: number) {
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await holdBegun();
    draw(2 * first - second);
    draw(first);
    draw(second);
    await vi.advanceTimersByTimeAsync(0);
  }

  it('when a later frame comes late after the first frame of the motion was drawn, then its startTime does not move later, since the browser may already have drawn it further, and nothing goes back', async () => {
    const motions = watchHeldMotions();
    const draw = framesOnRequest();
    drawnSteadilyBeforeTheTap(draw, 16);
    await releasedAt(draw, 5000, 5016);
    draw(5032);

    draw(5112);

    expect(motions.size).toBeGreaterThan(1);
    expect(startTimes(motions)).toEqual(new Set([5016]));
  });

  it('when frames come long one after another, then the motions keep the start the browser gave them', async () => {
    const motions = watchHeldMotions();
    const draw = framesOnRequest();
    drawnSteadilyBeforeTheTap(draw, 16);
    await releasedAt(draw, 5000, 5016);

    for (const at of [5116, 5216, 5316, 5416]) {
      draw(at);
    }

    expect(startTimes(motions)).toEqual(new Set([5016]));
  });

  it('when the device draws steadily at 30 frames a second, then the motions keep the start they were given', async () => {
    const motions = watchHeldMotions();
    const draw = framesOnRequest();
    drawnSteadilyBeforeTheTap(draw, 33);
    await releasedAt(draw, 5000, 5033);

    for (const at of [5066, 5099, 5132, 5165]) {
      draw(at);
    }

    expect(startTimes(motions)).toEqual(new Set([5033]));
  });

  it('when a frame comes long after the first half of the motion, then the motions keep their start', async () => {
    const motions = watchHeldMotions();
    const draw = framesOnRequest();
    drawnSteadilyBeforeTheTap(draw, 16);
    await releasedAt(draw, 5000, 5016);
    for (let at = 5032; at <= 5016 + 176; at += 16) {
      draw(at);
    }

    draw(5016 + 176 + 80);

    expect(startTimes(motions)).toEqual(new Set([5016]));
  });

  it('when the tab is hidden while the step moves, then the step ends at once instead of running on the clock it would come back to', async () => {
    watchHeldMotions();
    const draw = framesOnRequest();
    await releasedAt(draw, 5000, 5016);
    expect(moving()).not.toBeNull();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    onTestFinished(() => visibility.mockRestore());

    document.dispatchEvent(new Event('visibilitychange'));

    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
  });

  it('when another article opens from this one, then its motion holds still at its start until the frame that shows both pages has been drawn', async () => {
    const held = await heldWhenTheMotionBegins(() => router.navigateByUrl('/aktuality/druhy'));

    expect(held).toEqual([true]);
  });

  it('when the news is never placed, then the step back moves in after the duration of a page step all the same', async () => {
    TestBed.inject(PagePlacement).pending();

    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS / 4 + 100);
    expect(moved).toBe(false);
    await vi.advanceTimersByTimeAsync(300);

    expect(moved).toBe(true);
  });

  it('when nothing waits to be placed, then the step back moves in at once', async () => {
    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS / 4 + 100);

    expect(moved).toBe(true);
  });

  it('when the browser stops giving animation frames, then the step back still moves in on the clock instead of leaving its cover over the page', async () => {
    const frames = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    try {
      await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
      await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS / 4 + 500);

      expect(moved).toBe(true);
    } finally {
      frames.mockRestore();
    }
  });
});

describe('Given a phone that animates and an article opened from the news, which was kept behind it', () => {
  let router: Router;
  let layer: HTMLElement;
  let moved: boolean;
  let watch: MutationObserver;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    });
    document.documentElement.style.setProperty('--duration-page', '300ms');
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    layer.textContent = 'Aktuality';
    document.body.append(layer);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'aktuality', component: Blank },
          { path: 'aktuality/:slug', component: Blank, data: { parent: '/aktuality' } },
        ]),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
      ],
    });
    router = TestBed.inject(Router);
    router.setUpLocationChangeListener();
    dressedTransitions();
    vi.useFakeTimers();
    await router.navigateByUrl('/aktuality');
    await router.navigateByUrl('/aktuality/clanek');
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS * 2);
    layer.textContent = 'Článek';
    moved = false;
    watch = new MutationObserver(() => {
      moved ||= document.querySelector(`.${PAGE_TRANSITION_CLASS}--moving`) !== null;
    });
    watch.observe(document.body, { subtree: true, attributes: true, childList: true });
  });

  afterEach(() => {
    watch.disconnect();
    vi.useRealTimers();
    document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}`).forEach((node) => node.remove());
    layer.remove();
    document.documentElement.style.removeProperty('--duration-page');
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  async function stepsBack(): Promise<void> {
    const returned = new Promise<void>((done) => {
      const events = router.events.subscribe((event) => {
        if (event instanceof NavigationEnd) {
          events.unsubscribe();
          done();
        }
      });
    });
    TestBed.inject(Location).back();
    await vi.advanceTimersByTimeAsync(0);
    await returned;
  }

  it('when the app steps back to it, then the news moves in at once over the copy kept at the push, never waiting for the live news to be drawn and placed', async () => {
    TestBed.inject(PagePlacement).pending();

    await stepsBack();
    await vi.advanceTimersByTimeAsync(FRAME_LATE_MS);

    expect(moved).toBe(true);
    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}__page--under`)?.textContent).toContain(
      'Aktuality',
    );
    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}__page--over`)?.textContent).toContain(
      'Článek',
    );
  });

  it('when the app steps back to it, then both copies lie in the cover before anything is scrolled or read, so the screen is laid out once', async () => {
    const pagesInCover = (): number =>
      document.querySelectorAll(`.${PAGE_TRANSITION_CLASS} .${PAGE_TRANSITION_CLASS}__page`).length;
    const onePageWhen: string[] = [];
    const scrolling = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get(this: Element) {
        return scrolling.get!.call(this);
      },
      set(this: Element, top: number) {
        if (pagesInCover() === 1) {
          onePageWhen.push('scrolled');
        }
        scrolling.set!.call(this, top);
      },
    });
    const styleOf = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      if (pagesInCover() === 1) {
        onePageWhen.push('read');
      }
      return styleOf.call(window, element, pseudo);
    });
    onTestFinished(() => {
      Object.defineProperty(Element.prototype, 'scrollTop', scrolling);
    });

    await stepsBack();

    expect(document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}__page`)).toHaveLength(2);
    expect(onePageWhen).toEqual([]);
  });

  it('when the news has moved in over its kept copy, then the cover stays until the live news is placed, and goes once it is', async () => {
    const placed = TestBed.inject(PagePlacement).pending();

    await stepsBack();
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS / 4 + 100);
    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).not.toBeNull();
    placed();
    await vi.advanceTimersByTimeAsync(FRAME_LATE_MS);

    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
  });

  it('when the live news is put back at another scroll than its kept copy showed, as after a cold launch whose page moved meanwhile, then the live news takes the copy’s scroll before the cover goes, so the list never jumps at the end (round 42)', async () => {
    const placed = TestBed.inject(PagePlacement).pending();
    const scrolledTo: number[] = [];
    let scrollY = 460;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
    vi.spyOn(window, 'scrollTo').mockImplementation((options?: ScrollToOptions | number) => {
      scrollY = typeof options === 'number' ? options : (options?.top ?? scrollY);
      scrolledTo.push(scrollY);
    });
    let scrollWhenTheCoverWent: number | null = null;
    const gone = new MutationObserver(() => {
      if (
        scrollWhenTheCoverWent === null &&
        document.querySelector(`.${PAGE_TRANSITION_CLASS}`) === null
      ) {
        scrollWhenTheCoverWent = scrollY;
      }
    });

    await stepsBack();
    gone.observe(document.body, { childList: true });
    placed();
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS);
    gone.disconnect();

    expect(scrolledTo).toEqual([0]);
    expect(scrollWhenTheCoverWent).toBe(0);
  });

  it('when the live news is put back at the scroll its kept copy showed, then the step back leaves the scroll alone', async () => {
    const placed = TestBed.inject(PagePlacement).pending();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    await stepsBack();
    placed();
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS);

    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('when the window has another width than when the news was kept, then the step back waits for the live news as before', async () => {
    const width = Object.getOwnPropertyDescriptor(window, 'innerWidth')!;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 420 });
    onTestFinished(() => {
      Object.defineProperty(window, 'innerWidth', width);
    });
    TestBed.inject(PagePlacement).pending();

    await stepsBack();
    await vi.advanceTimersByTimeAsync(FRAME_LATE_MS);

    expect(moved).toBe(false);
  });
});

describe('Given the app on the home screen of a phone, scrolling restored, with an article just opened from the news', () => {
  let router: Router;
  let layer: HTMLElement;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    });
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    layer.textContent = 'Aktuality';
    document.body.append(layer);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: '', component: Blank },
            { path: 'aktuality', component: Blank },
            { path: 'aktuality/:slug', component: Blank, data: { parent: '/aktuality' } },
          ],
          withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
        ),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
      ],
    });
    router = TestBed.inject(Router);
    dressedTransitions();
    document.body.append(document.createElement('app-scrolled-shell'));
    TestBed.inject(ApplicationRef).bootstrap(ScrolledShell);
    await dressedTransitions().loadDrawing();
    await router.navigateByUrl('/aktuality');
    vi.useFakeTimers();
    await router.navigateByUrl('/aktuality/clanek');
    await vi.advanceTimersByTimeAsync(100);
  });

  afterEach(() => {
    vi.useRealTimers();
    document
      .querySelectorAll(`.${PAGE_TRANSITION_CLASS}, app-scrolled-shell`)
      .forEach((node) => node.remove());
    layer.remove();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('when a finger starts dragging it back as soon as it has slid in, then the list stays under the finger past the moment the article would have been revealed', async () => {
    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
    const swipe = dressedTransitions().startSwipe(
      TestBed.inject(BackTarget).destination('/aktuality'),
    );

    await vi.advanceTimersByTimeAsync(1000);

    expect(swipe).not.toBeNull();
    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}--swipe`)).not.toBeNull();
  });
});

describe('Given the app on the home screen of a phone, scrolling restored, on the news with an article to open, in a browser that gives no frame for now', () => {
  let router: Router;
  let layer: HTMLElement;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    });
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    layer.textContent = 'Aktuality';
    document.body.append(layer);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'aktuality', component: Blank },
            { path: 'aktuality/:slug', component: Blank, data: { parent: '/aktuality' } },
          ],
          withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
        ),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
      ],
    });
    router = TestBed.inject(Router);
    dressedTransitions();
    document.body.append(document.createElement('app-scrolled-shell'));
    TestBed.inject(ApplicationRef).bootstrap(ScrolledShell);
    vi.useFakeTimers();
    await router.navigateByUrl('/aktuality');
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS * 2);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document
      .querySelectorAll(`.${PAGE_TRANSITION_CLASS}, app-scrolled-shell`)
      .forEach((node) => node.remove());
    layer.remove();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  function copiesPlaced(position: 'over' | 'under'): string[] {
    const placed: string[] = [];
    const watch = new MutationObserver((records) =>
      records
        .flatMap((record) => Array.from(record.addedNodes))
        .filter(
          (node): node is HTMLElement =>
            node instanceof HTMLElement &&
            node.classList.contains(`${PAGE_TRANSITION_CLASS}__page--${position}`),
        )
        .forEach((page) => placed.push(page.textContent ?? '')),
    );
    watch.observe(document.body, { subtree: true, childList: true });
    onTestFinished(() => watch.disconnect());
    return placed;
  }

  it('when the article opens, then its copy joins the cover as soon as the router has scrolled it, never waiting for a frame first', async () => {
    const arriving = copiesPlaced('over');

    await router.navigateByUrl('/aktuality/clanek');
    layer.textContent = 'Článek';
    await vi.advanceTimersByTimeAsync(FRAME_LATE_MS / 2);

    expect(arriving).toEqual(['Článek']);
  });

  it('when the news comes back with no copy kept of it, then its copy joins the cover as soon as the router has put its scroll back, never waiting for a frame first', async () => {
    await router.navigateByUrl('/aktuality/clanek');
    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS * 2);
    const width = Object.getOwnPropertyDescriptor(window, 'innerWidth')!;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 420 });
    onTestFinished(() => {
      Object.defineProperty(window, 'innerWidth', width);
    });

    const returning = copiesPlaced('under');

    await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
    layer.textContent = 'Aktuality';
    await vi.advanceTimersByTimeAsync(FRAME_LATE_MS / 2);

    expect(returning).toEqual(['Aktuality']);
  });
});

interface Painted {
  readonly title: string;
  readonly back?: boolean;
  readonly tabBar?: boolean;
  readonly sheet?: boolean;
  readonly account?: string;
  readonly head?: string;
  readonly photo?: boolean;
}

function paint(layer: HTMLElement, page: Painted): void {
  layer.replaceChildren();
  const header = document.createElement('app-header');
  const bar = document.createElement('header');
  bar.className = 'app-header';
  if (page.back === true) {
    const back = document.createElement('button');
    back.className = 'back-button';
    back.setAttribute('aria-label', 'Zpět');
    bar.append(back);
  }
  if (page.account !== undefined) {
    const account = document.createElement('button');
    account.className = 'account-button';
    account.textContent = page.account;
    bar.append(account);
  }
  header.append(bar);
  const main = document.createElement('main');
  if (page.head !== undefined) {
    const head = document.createElement('app-sheet-head');
    head.textContent = page.head;
    main.append(head);
  }
  const heading = document.createElement('h1');
  heading.textContent = page.title;
  main.append(heading);
  if (page.photo === true) {
    const photo = document.createElement('img');
    photo.alt = 'Zahrada';
    main.append(photo);
  }
  layer.append(header, main);
  if (page.tabBar === true) {
    layer.append(document.createElement('app-tab-bar'));
  }
  if (page.sheet === true) {
    const sheet = document.createElement('dialog');
    sheet.setAttribute('open', '');
    sheet.textContent = 'Účet';
    layer.append(sheet);
  }
}

describe('Given the app on the home screen of a phone, where the news led to the donor overview', () => {
  let router: Router;
  let layer: HTMLElement;
  let transitions: PageTransitions;

  function overlay(): HTMLElement {
    return document.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}`)!;
  }

  function under(): HTMLElement {
    return overlay().querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--under`)!;
  }

  function over(): HTMLElement {
    return overlay().querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--over`)!;
  }

  function barButtons(): HTMLElement[] {
    return Array.from(
      overlay().querySelectorAll<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__bar .back-button`),
    );
  }

  function swipeBack() {
    return transitions.startSwipe(TestBed.inject(BackTarget).destination('/'))!;
  }

  async function openOverviewFromTheNews(
    news: Painted,
    overview: Painted,
    sheetReturns = false,
  ): Promise<void> {
    paint(layer, news);
    const depth = TestBed.inject(BackTarget).nextDepth();
    await router.navigateByUrl('/darce/prehled', {
      replaceUrl: true,
      state: { [APP_DEPTH_KEY]: depth, ...(sheetReturns ? { [ACCOUNT_RETURNS_KEY]: '' } : {}) },
    });
    paint(layer, overview);
    transitions.finish();
  }

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    document.body.append(layer);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Blank },
          { path: 'aktuality', component: Blank },
          { path: 'darce/prehled', component: Blank, data: { parent: '/' } },
          { path: 'darce/dary', component: Blank, data: { parent: '/darce/prehled' } },
          { path: 'projekty', component: Blank },
        ]),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
        {
          provide: NavigationPreview,
          useValue: {
            active: () => false,
            drives: () => false,
            discard: () => undefined,
            visit: () => Promise.resolve(null),
          },
        },
      ],
    });
    router = TestBed.inject(Router);
    transitions = dressedTransitions();
    transitions.sheets = SHEET_STEPPING;
    await dressedTransitions().loadDrawing();
    await router.navigateByUrl('/aktuality');
  });

  afterEach(() => {
    document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}`).forEach((node) => node.remove());
    layer.remove();
    delete (window as { matchMedia?: unknown }).matchMedia;
    Object.defineProperty(window, 'innerWidth', jsdomWidth!);
    vi.restoreAllMocks();
  });

  it('when the overview was opened from the account sheet over the news, then the news without the sheet lies under the finger', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' });

    swipeBack();

    expect(withOrdinarySpaces(under().querySelector('h1')?.textContent)).toBe('Aktuality');
    expect(under().querySelector('dialog')).toBeNull();
    expect(withOrdinarySpaces(over().querySelector('h1')?.textContent)).toBe('Přehled');
  });

  it('when the overview was opened from the account sheet, which comes back on the way back, then the news lies under the finger with the account sheet standing over it', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' }, true);

    swipeBack();

    expect(withOrdinarySpaces(under().querySelector('h1')?.textContent)).toBe('Aktuality');
    expect(withOrdinarySpaces(under().querySelector('dialog')?.textContent)).toBe('Účet');
    expect(over().querySelector('dialog')).toBeNull();
  });

  it('when the account sheet comes back on the way back, then the real sheet stays unseen while the page moves and shows once it stands', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' }, true);

    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => motionEnding(Promise.resolve()),
    });
    try {
      const swipe = swipeBack();
      expect(document.documentElement.classList).toContain(`${PAGE_TRANSITION_CLASS}-sheet-under`);
      await swipe.slideBack();

      expect(document.documentElement.classList).not.toContain(
        `${PAGE_TRANSITION_CLASS}-sheet-under`,
      );
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('when the real sheet comes back while the page moves, then once the page has stopped the sheet and its backdrop stand fully at once, their fade in cut short, so the page under them never shows through', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' }, true);
    const sheet = document.createElement('dialog');
    const fades = ['', '::backdrop'].map((pseudoElement) => ({
      effect: {
        target: sheet,
        pseudoElement,
        getComputedTiming: () => ({ endTime: 300 }),
      },
      finish: vi.fn(),
    }));
    const breathing = {
      effect: { target: sheet, getComputedTiming: () => ({ endTime: Infinity }) },
      finish: vi.fn(),
    };
    const elsewhere = {
      effect: { target: layer, getComputedTiming: () => ({ endTime: 300 }) },
      finish: vi.fn(),
    };
    Object.defineProperty(sheet, 'getAnimations', {
      configurable: true,
      value: (options?: GetAnimationsOptions) =>
        options?.subtree === true ? [...fades, breathing] : [fades[0], breathing],
    });
    Object.defineProperty(layer, 'getAnimations', {
      configurable: true,
      value: () => [elsewhere],
    });
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => motionEnding(Promise.resolve()),
    });
    try {
      const swipe = swipeBack();
      sheet.setAttribute('open', '');
      document.body.append(sheet);
      await vi.dynamicImportSettled();
      expect(fades.every((fade) => fade.finish.mock.calls.length === 0)).toBe(true);

      await swipe.slideBack();

      expect(fades.map((fade) => fade.finish.mock.calls.length)).toEqual([1, 1]);
      expect(breathing.finish).not.toHaveBeenCalled();
      expect(elsewhere.finish).not.toHaveBeenCalled();
    } finally {
      sheet.remove();
      delete (layer as { getAnimations?: unknown }).getAnimations;
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('when the step ends while a dialog over the sheet fades out, then that dialog keeps its fade out to its end, so it still closes as it leaves', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' }, true);
    const asking = document.createElement('dialog');
    const fadingOut = {
      effect: { target: asking, getComputedTiming: () => ({ endTime: 300 }) },
      finish: vi.fn(),
    };
    Object.defineProperty(asking, 'getAnimations', {
      configurable: true,
      value: () => [fadingOut],
    });
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => motionEnding(Promise.resolve()),
    });
    try {
      const swipe = swipeBack();
      asking.setAttribute('open', '');
      asking.className = 'dialog dialog--leaving';
      document.body.append(asking);
      await vi.dynamicImportSettled();

      await swipe.slideBack();

      expect(document.documentElement.classList).not.toContain(
        `${PAGE_TRANSITION_CLASS}-sheet-under`,
      );
      expect(fadingOut.finish).not.toHaveBeenCalled();
    } finally {
      asking.remove();
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('when the step ends while a question that opened over the sheet fades in, then the question keeps its own fade, since the step never drew it', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' }, true);
    const asking = document.createElement('dialog');
    const fadingIn = {
      effect: { target: asking, getComputedTiming: () => ({ endTime: 300 }) },
      finish: vi.fn(),
    };
    Object.defineProperty(asking, 'getAnimations', {
      configurable: true,
      value: () => [fadingIn],
    });
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => motionEnding(Promise.resolve()),
    });
    try {
      const swipe = swipeBack();
      asking.setAttribute('open', '');
      asking.className = 'dialog dialog--stacked';
      document.body.append(asking);
      await vi.dynamicImportSettled();

      await swipe.slideBack();

      expect(document.documentElement.classList).not.toContain(
        `${PAGE_TRANSITION_CLASS}-sheet-under`,
      );
      expect(fadingIn.finish).not.toHaveBeenCalled();
    } finally {
      asking.remove();
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('when both pages are sheets of the administration, then the head of the sheet stands while the pages move and its title changes in place', async () => {
    await openOverviewFromTheNews(
      { title: 'Dárci', head: 'Dárci' },
      { title: 'Jana Nováková', head: 'Jana Nováková' },
    );

    swipeBack().follow(195);

    const heads = barItems('app-sheet-head');
    expect(heads.map((head) => withOrdinarySpaces(head.textContent))).toEqual([
      'Dárci',
      'Jana Nováková',
    ]);
    expect(heads[1].style.opacity).toBe('0.5');
    expect(heads[0].style.opacity).toBe('');
    expect(overlay().classList).toContain(`${PAGE_TRANSITION_CLASS}--heads-held`);
  });

  it('when only the page being left is a sheet, then its head rides with it', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality' }, { title: 'Přehled', head: 'Přehled' });

    swipeBack();

    expect(barItems('app-sheet-head')).toHaveLength(0);
    expect(overlay().classList).not.toContain(`${PAGE_TRANSITION_CLASS}--heads-held`);
  });

  it('when only the page being left is a sheet, then the title of its head is followed from the start of the step, so it fades by half the way as it rides with the page', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality' }, { title: 'Přehled', head: 'Přehled' });
    const title = document.createElement('h2');
    title.className = 'sheet-head-title';
    title.textContent = 'Přehled';
    layer.querySelector('app-sheet-head')!.replaceChildren(title);

    swipeBack();

    const riding = over().querySelector<HTMLElement>('.sheet-head-title');
    expect(riding?.style.opacity).toBe('1');
    expect(riding?.style.getPropertyValue('--page-title-travel')).toBe('');
  });

  function slidesWhenReleased(): () => void {
    let release: () => void = () => undefined;
    const slid = new Promise<void>((done) => (release = done));
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => motionEnding(slid),
    });
    return release;
  }

  const LET_GO_PAST_HALF = {
    completes: true,
    from: 300,
    to: 390,
    durationMs: 150,
    easing: 'ease-out',
  } as const;

  it('when the slide after the finger lets go never reports that it finished, then the swipe still settles within the slide’s length, long before its longest time', async () => {
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => ({
        finished: new Promise(() => undefined),
        ready: new Promise(() => undefined),
        pause: () => undefined,
        play: () => undefined,
      }),
    });
    try {
      await openOverviewFromTheNews({ title: 'Aktuality' }, { title: 'Přehled' });
      const left = swipeBack().settle(LET_GO_PAST_HALF);

      const settled = await Promise.race([
        left.then(() => 'settled'),
        new Promise((late) =>
          setTimeout(() => late('still sliding'), PAGE_TRANSITION_LONGEST_MS / 2),
        ),
      ]);

      expect(settled).toBe('settled');
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('when the browser draws no frame for 270 ms after the slide is let go, then the swipe is not settled before the slide has run its whole length from the frame drawn then, and it settles within that length and 200 ms', async () => {
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => ({
        finished: new Promise(() => undefined),
        ready: new Promise(() => undefined),
        pause: () => undefined,
        play: () => undefined,
      }),
    });
    try {
      await openOverviewFromTheNews({ title: 'Aktuality' }, { title: 'Přehled' });
      vi.useFakeTimers();
      const frames: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => {
        frames.push(frame);
        return frames.length;
      });
      const draw = (at: number): void => {
        frameClock.at = at;
        drawnAt(at);
        frames.splice(0).forEach((frame) => frame(at));
      };
      let settled = false;
      void swipeBack()
        .settle(LET_GO_PAST_HALF)
        .then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(0);
      draw(5000);
      await vi.advanceTimersByTimeAsync(0);
      draw(5016);
      await vi.advanceTimersByTimeAsync(270);
      draw(5286);

      await vi.advanceTimersByTimeAsync(LET_GO_PAST_HALF.durationMs - 10);
      expect(settled, 'the slide was cut before its end').toBe(false);
      await vi.advanceTimersByTimeAsync(2 * FRAME_LATE_MS + 20);

      expect(settled).toBe(true);
    } finally {
      if (vi.isMockFunction(window.requestAnimationFrame)) {
        vi.mocked(window.requestAnimationFrame).mockRestore();
      }
      vi.useRealTimers();
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('when the finger lets go, then the page holds where it was let go until the frame drawn next and only then slides on', async () => {
    const steps: string[] = [];
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => ({
        finished: Promise.resolve(),
        pause: () => steps.push('holds'),
        play: () => steps.push('slides'),
      }),
    });
    try {
      await openOverviewFromTheNews({ title: 'Aktuality' }, { title: 'Přehled' });
      const left = swipeBack().settle(LET_GO_PAST_HALF);
      const atOnce = [...steps];

      expect(await left).toBe(true);
      expect(atOnce.length).toBeGreaterThan(0);
      expect(new Set(atOnce)).toEqual(new Set(['holds']));
      expect(steps).toEqual([...atOnce, ...atOnce.map(() => 'slides')]);
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('when a frame in the first half of the slide after the finger lets go comes long, then the page never sets the start of a motion of the slide, which starts with the frame the browser first draws it in and never later', async () => {
    const slides: HeldMotion[] = [];
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => {
        const slide = Object.assign(heldMotion(), { pause: () => undefined });
        slides.push(slide);
        return slide;
      },
    });
    try {
      await openOverviewFromTheNews({ title: 'Aktuality' }, { title: 'Přehled' });
      const waiting: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        waiting.push(callback);
        return waiting.length;
      });
      const draw = async (at: number): Promise<void> => {
        frameClock.at = at;
        drawnAt(at);
        waiting.splice(0).forEach((callback) => callback(at));
        await vi.dynamicImportSettled();
      };
      document.dispatchEvent(new Event('pointerdown'));
      for (let frame = 0; frame <= 10; frame++) {
        await draw(1000 + frame * 16);
      }

      void swipeBack().settle(LET_GO_PAST_HALF);
      let at = 5000;
      while (slides.length === 0 || slides.some((slide) => slide.startTime === null)) {
        expect(at, 'the slide never started').toBeLessThan(5400);
        await draw(at);
        at += 16;
      }
      const slidFrom = slides[0].startTime!;
      await draw(slidFrom + 16);
      await draw(slidFrom + 16 + 80);

      expect(new Set(slides.map((slide) => slide.startTime))).toEqual(new Set([slidFrom]));
      expect(slides.map((slide) => slide.startsSetByThePage)).toEqual(slides.map(() => 0));
      expect(slides.map((slide) => slide.currentTimesSetByThePage)).toEqual(slides.map(() => 0));
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('when another step takes the page over while it slides off under the finger, then the swipe says the page did not leave, so no second step follows', async () => {
    const slidOff = slidesWhenReleased();
    try {
      await openOverviewFromTheNews({ title: 'Aktuality' }, { title: 'Přehled' });
      const left = swipeBack().settle(LET_GO_PAST_HALF);

      await router.navigateByUrl('/projekty');
      slidOff();

      expect(await left).toBe(false);
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('when the page has slid off and a navigation other than its step back starts, then the cover it left goes at once', async () => {
    const slidOff = slidesWhenReleased();
    try {
      await openOverviewFromTheNews({ title: 'Aktuality' }, { title: 'Přehled' });
      const left = swipeBack().settle(LET_GO_PAST_HALF);
      slidOff();
      expect(await left).toBe(true);

      await router.navigateByUrl('/projekty');

      expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('when the screen changed its width since the news was left, then the copy of another width is not laid under the finger', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 700 });

    swipeBack();

    expect(under().querySelector('h1')).toBeNull();
  });

  it('when both pages show the tab bar, then the copies give way to the live tab bar, which stays put above them', async () => {
    await openOverviewFromTheNews(
      { title: 'Aktuality', tabBar: true, sheet: true },
      { title: 'Přehled', tabBar: true },
    );

    swipeBack();

    expect(overlay().classList).toContain(`${PAGE_TRANSITION_CLASS}--under-tab-bar`);
  });

  it('when only the page under the finger shows the tab bar, then the tab bar rides with that page', async () => {
    await openOverviewFromTheNews(
      { title: 'Aktuality', tabBar: true, sheet: true },
      { title: 'Přehled' },
    );

    swipeBack();

    expect(under().querySelector('app-tab-bar')).not.toBeNull();
    expect(overlay().classList).not.toContain(`${PAGE_TRANSITION_CLASS}--under-tab-bar`);
  });

  function barItems(selector: string): HTMLElement[] {
    return Array.from(
      overlay().querySelectorAll<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__bar ${selector}`),
    );
  }

  function layerClones(): () => number {
    const original = HTMLElement.prototype.cloneNode;
    let clones = 0;
    vi.spyOn(HTMLElement.prototype, 'cloneNode').mockImplementation(function (
      this: HTMLElement,
      deep?: boolean,
    ) {
      if (this.classList.contains(PAGE_LAYER_CLASS)) {
        clones++;
      }
      return original.call(this, deep);
    });
    return () => clones;
  }

  it('when the news kept under the overview holds a photo, then the overview follows the finger at once, never waiting for the photo it already drew', async () => {
    await openOverviewFromTheNews(
      { title: 'Aktuality', sheet: true, photo: true },
      { title: 'Přehled' },
    );
    const swipe = swipeBack();
    expect(under().querySelector('img')).not.toBeNull();

    swipe.follow(195);

    expect(over().style.transform).toBe('translateX(195px)');
  });

  it('when the swipe has stepped back, then the page it returned to stands at once as its copy showed it, its entrance not played again', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' });
    const entrance = {
      effect: { getComputedTiming: () => ({ endTime: 500 }) },
      finish: vi.fn(),
    };
    const breathing = {
      effect: { getComputedTiming: () => ({ endTime: Infinity }) },
      finish: vi.fn(),
    };
    Object.defineProperty(layer, 'getAnimations', {
      configurable: true,
      value: (options?: GetAnimationsOptions) =>
        options?.subtree === true ? [entrance, breathing] : [],
    });
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => motionEnding(Promise.resolve()),
    });
    vi.useFakeTimers();
    try {
      const left = swipeBack().settle(LET_GO_PAST_HALF);
      await vi.advanceTimersByTimeAsync(FRAME_LATE_MS * 2);
      expect(await left).toBe(true);
      expect(entrance.finish).not.toHaveBeenCalled();

      await router.navigateByUrl('/aktuality', { info: BACK_NAVIGATION });
      await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS);

      expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
      expect(entrance.finish).toHaveBeenCalledTimes(1);
      expect(breathing.finish).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      delete (layer as { getAnimations?: unknown }).getAnimations;
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('when both pages have the round back button, then one back button stands still above the moving pages', async () => {
    await openOverviewFromTheNews(
      { title: 'Aktuality', back: true, sheet: true },
      { title: 'Přehled', back: true },
    );

    swipeBack().follow(195);

    expect(barButtons()).toHaveLength(1);
    expect(barButtons()[0].style.opacity).toBe('');
  });

  it('when only the page being left has the round back button, then it stays in place and is gone by half the way, as the page Zpět leads to shows its logo there', async () => {
    await openOverviewFromTheNews(
      { title: 'Aktuality', sheet: true },
      { title: 'Přehled', back: true },
    );
    const swipe = swipeBack();

    swipe.follow(97.5);
    expect(barButtons()).toHaveLength(1);
    expect(barButtons()[0].style.opacity).toBe('0.5');
    swipe.follow(195);
    expect(barButtons()[0].style.opacity).toBe('0');
  });

  it('when both pages show the same account circle, then one circle stands still and the copies do not carry their own', async () => {
    await openOverviewFromTheNews(
      { title: 'Aktuality', back: true, account: 'JN', sheet: true },
      { title: 'Přehled', back: true, account: 'JN' },
    );

    swipeBack().follow(195);

    expect(barItems('.account-button')).toHaveLength(1);
    expect(barItems('.account-button')[0].style.opacity).toBe('');
  });

  it('when nothing of the page Zpět leads to is kept, then the tab bar of the page being left stays put, as the page it returns to has one too', async () => {
    paint(layer, { title: 'Přehled', tabBar: true });

    transitions.startSwipe({ kind: 'parent', path: '/' });

    expect(overlay().classList).toContain(`${PAGE_TRANSITION_CLASS}--under-tab-bar`);
  });

  it('when a finger takes the page, then the page is copied once', async () => {
    await openOverviewFromTheNews({ title: 'Aktuality', sheet: true }, { title: 'Přehled' });
    const clones = layerClones();

    swipeBack();

    expect(clones()).toBe(1);
  });

  it('when another tab opens, then the page left is not copied, as Zpět never leads back across tabs', async () => {
    paint(layer, { title: 'Aktuality', tabBar: true });
    const clones = layerClones();

    await router.navigateByUrl('/projekty');

    expect(clones()).toBe(0);
  });

  it('when a deeper page opens with a tap and both show alike round back buttons, then that button stands still through the slide', async () => {
    vi.useFakeTimers();
    const seen: string[][] = [];
    const watch = new MutationObserver(() => {
      const moving = document.querySelector(`.${PAGE_TRANSITION_CLASS}--moving`);
      if (moving !== null && seen.length === 0) {
        seen.push(
          Array.from(
            moving.querySelectorAll(`.${PAGE_TRANSITION_CLASS}__bar .back-button`),
            (button) => button.className,
          ),
        );
      }
    });
    try {
      await openOverviewFromTheNews(
        { title: 'Aktuality', sheet: true },
        { title: 'Přehled', back: true },
      );
      watch.observe(document.body, { subtree: true, attributes: true, childList: true });
      const opened = router.navigateByUrl('/darce/dary');
      await vi.advanceTimersByTimeAsync(0);
      paint(layer, { title: 'Moje dary', back: true });
      await opened;
      await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_LONGEST_MS / 2);

      expect(seen).toEqual([[`back-button ${PAGE_TRANSITION_CLASS}__bar-item--still`]]);
    } finally {
      watch.disconnect();
      vi.useRealTimers();
    }
  });
});

describe('Given the app on the home screen of a phone opened straight on the donor overview, whose Zpět leads to a page never drawn', () => {
  let layer: HTMLElement;
  let visits: string[];
  let finishVisit: () => void;
  let cannotDraw: () => void;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    document.body.append(layer);
    visits = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Blank },
          { path: 'darce/prehled', component: Blank, data: { parent: '/' } },
        ]),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
        {
          provide: NavigationPreview,
          useValue: {
            active: () => false,
            drives: () => false,
            discard: () => undefined,
            visit: <T>(path: string, capture: () => T) => {
              visits.push(path);
              return new Promise<T | null>((done) => {
                cannotDraw = () => done(null);
                finishVisit = () => {
                  paint(layer, { title: 'Úvod', account: 'JN' });
                  const captured = capture();
                  paint(layer, { title: 'Přehled' });
                  done(captured);
                };
              });
            },
          },
        },
      ],
    });
    await dressedTransitions().loadDrawing();
    await TestBed.inject(Router).navigateByUrl('/darce/prehled');
    paint(layer, { title: 'Přehled' });
  });

  afterEach(() => {
    document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}`).forEach((node) => node.remove());
    layer.remove();
    delete (window as { matchMedia?: unknown }).matchMedia;
    Object.defineProperty(window, 'innerWidth', jsdomWidth!);
  });

  async function drawnUnder(): Promise<void> {
    await vi.dynamicImportSettled();
    await new Promise((done) => setTimeout(done, 0));
    await vi.dynamicImportSettled();
  }

  function over(): HTMLElement {
    return document.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--over`)!;
  }

  function framesByHand(): { run(at: number): void; restore(): void } {
    let waiting: FrameRequestCallback[] = [];
    const asked = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        waiting.push(callback);
        return waiting.length;
      });
    return {
      run: (at) => {
        const now = waiting;
        waiting = [];
        now.forEach((callback) => callback(at));
      },
      restore: () => asked.mockRestore(),
    };
  }

  function offsetOf(page: HTMLElement): number {
    return Number.parseFloat(/translateX\(([-\d.]+)px\)/.exec(page.style.transform)?.[1] ?? '0');
  }

  it('when a finger takes the page before the page Zpět leads to is drawn, then the page stays over it, never over an empty ground', async () => {
    const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
    await vi.dynamicImportSettled();

    swipe.follow(120);

    expect(over().style.transform).toBe('');
  });

  it('when the page Zpět leads to is drawn 220 px behind a finger that holds still, as the iPhone SE drew it in round 29, then the page sets off from rest and gathers speed, so no frame shows it more than an eighth of the way further, never the 42 to 129 px jump of one frame', async () => {
    document.documentElement.style.setProperty('--duration-fast', '150ms');
    const frames = framesByHand();
    try {
      const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(220);
      finishVisit();
      await drawnUnder();

      const offsets = [offsetOf(over())];
      for (let frame = 1; frame <= 40; frame++) {
        frames.run(frame * 16);
        offsets.push(offsetOf(over()));
      }
      const steps = offsets.slice(1).map((offset, frame) => offset - offsets[frame]);

      expect(steps[0], 'the first frame of the close-in').toBeLessThanOrEqual(220 * 0.05);
      expect(Math.max(...steps), 'the longest step of one frame').toBeLessThanOrEqual(220 / 8);
      expect(offsets.at(-1)).toBe(220);
    } finally {
      frames.restore();
      document.documentElement.style.removeProperty('--duration-fast');
    }
  });

  function oneFakePageClock(): () => number {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const origin = Date.now();
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => Date.now() - origin);
    onTestFinished(() => clock.mockRestore());
    return () => performance.now();
  }

  async function drawnUnderOnTheFakeClock(): Promise<void> {
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);
    await vi.dynamicImportSettled();
  }

  async function screenStepsOfACloseIn(gapsAfterTwoFramesMs: readonly number[]): Promise<number[]> {
    const now = oneFakePageClock();
    const frames = framesByHand();
    try {
      const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(220);
      finishVisit();
      await drawnUnderOnTheFakeClock();
      const offsets = [offsetOf(over())];
      frames.run(now());
      offsets.push(offsetOf(over()));
      await vi.advanceTimersByTimeAsync(16);
      frames.run(now());
      offsets.push(offsetOf(over()));
      for (const gapMs of gapsAfterTwoFramesMs) {
        await vi.advanceTimersByTimeAsync(gapMs);
        frames.run(now());
        offsets.push(offsetOf(over()));
      }
      return offsets.slice(1).map((offset, frame) => offset - offsets[frame]);
    } finally {
      frames.restore();
    }
  }

  it('when the page clock ticks before a frame that comes 120 ms late, as when an iPhone SE paints for 120 ms, with the frames and the clock on one timeline, then the tick moves nothing and the late frame moves the page by one frame, no more than an eighth of the gap', async () => {
    document.documentElement.style.setProperty('--duration-fast', '150ms');
    onTestFinished(() => {
      document.documentElement.style.removeProperty('--duration-fast');
    });

    const steps = await screenStepsOfACloseIn([FRAME_LATE_MS + 20]);

    expect(Math.max(...steps), 'the longest step on the screen').toBeLessThanOrEqual(220 / 8);
  });

  it('when the frames stop for 250 ms during the close-in and come again, so the page clock ticks twice in between, then the first frame drawn again moves the page by one frame, no more than an eighth of the gap', async () => {
    document.documentElement.style.setProperty('--duration-fast', '150ms');
    onTestFinished(() => {
      document.documentElement.style.removeProperty('--duration-fast');
    });

    const steps = await screenStepsOfACloseIn([2 * FRAME_LATE_MS + 50]);

    expect(Math.max(...steps), 'the longest step on the screen').toBeLessThanOrEqual(220 / 8);
  });

  it('when the app was opened straight on the article and swiped at once, so the frames it measured were its first slow frames of 34 ms, then the close-in still moves by the frames it draws, no more than a twentieth of the gap in its first frame nor an eighth in any', async () => {
    document.documentElement.style.setProperty('--duration-fast', '150ms');
    onTestFinished(() => {
      document.documentElement.style.removeProperty('--duration-fast');
    });
    const frames = framesByHand();
    try {
      const transitions = dressedTransitions();
      document.dispatchEvent(new Event('pointerdown'));
      for (let frame = 0; frame <= 11; frame++) {
        frames.run(1000 + frame * 34);
      }
      const swipe = transitions.startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(220);
      finishVisit();
      await drawnUnder();
      const offsets = [offsetOf(over())];
      for (let frame = 0; frame < 4; frame++) {
        frames.run(3000 + (frame * 1000) / 60);
        offsets.push(offsetOf(over()));
      }
      const steps = offsets.slice(1).map((offset, frame) => offset - offsets[frame]);

      expect(steps[0], 'the first frame of the close-in').toBeLessThanOrEqual(220 * 0.05);
      expect(Math.max(...steps), 'the longest step on the screen').toBeLessThanOrEqual(220 / 8);
    } finally {
      frames.restore();
    }
  });

  it('when the app was opened straight on the article and swiped at once, and one vsync is missed while the page beneath renders, then that frame of 33 ms still moves the page no more than an eighth of the gap', async () => {
    document.documentElement.style.setProperty('--duration-fast', '150ms');
    onTestFinished(() => {
      document.documentElement.style.removeProperty('--duration-fast');
    });
    const frames = framesByHand();
    try {
      const transitions = dressedTransitions();
      document.dispatchEvent(new Event('pointerdown'));
      for (let frame = 0; frame <= 11; frame++) {
        frames.run(1000 + frame * 34);
      }
      const swipe = transitions.startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(220);
      finishVisit();
      await drawnUnder();
      const offsets = [offsetOf(over())];
      for (const at of [3000, 3016.7, 3050, 3066.7, 3083.3, 3100]) {
        frames.run(at);
        offsets.push(offsetOf(over()));
      }
      const steps = offsets.slice(1).map((offset, frame) => offset - offsets[frame]);

      expect(Math.max(...steps), 'the longest step on the screen').toBeLessThanOrEqual(220 / 8);
    } finally {
      frames.restore();
    }
  });

  async function coldCloseInSteps(stamps: readonly number[]): Promise<number[]> {
    const frames = framesByHand();
    try {
      const transitions = dressedTransitions();
      document.dispatchEvent(new Event('pointerdown'));
      for (let frame = 0; frame <= 11; frame++) {
        frames.run(1000 + frame * 34);
      }
      const swipe = transitions.startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(220);
      finishVisit();
      await drawnUnder();
      const offsets = [offsetOf(over())];
      for (const at of stamps) {
        frames.run(at);
        offsets.push(offsetOf(over()));
      }
      return offsets.slice(1).map((offset, frame) => offset - offsets[frame]);
    } finally {
      frames.restore();
    }
  }

  function framesFrom(start: number, gaps: readonly number[]): number[] {
    return gaps.reduce<number[]>((stamps, gap) => [...stamps, stamps.at(-1)! + gap], [start]);
  }

  for (const { missed, stamps } of [
    { missed: 'one vsync', stamps: framesFrom(3000, [33.3, 16.7, 16.7, 16.7, 16.7]) },
    { missed: 'two vsyncs', stamps: framesFrom(3000, [50, 16.7, 16.7, 16.7, 16.7]) },
  ]) {
    it(`when the app was opened straight on the article and swiped at once, and the second frame of the close-in comes after ${missed} missed, then that frame moves the page no more than an eighth of the gap`, async () => {
      document.documentElement.style.setProperty('--duration-fast', '150ms');
      onTestFinished(() => {
        document.documentElement.style.removeProperty('--duration-fast');
      });

      const steps = await coldCloseInSteps(stamps);

      expect(Math.max(...steps), 'the longest step on the screen').toBeLessThanOrEqual(220 / 8);
    });
  }

  it('when Safari stamps two frames 3.5 ms apart, as when a late update is followed by one on time, then the close-in is not slowed by it, and the page is with the finger within 45 frames, not after 1.9 s', async () => {
    document.documentElement.style.setProperty('--duration-fast', '150ms');
    onTestFinished(() => {
      document.documentElement.style.removeProperty('--duration-fast');
    });

    await coldCloseInSteps(framesFrom(3000, [16.7, 3.5, ...Array<number>(42).fill(16.7)]));

    expect(offsetOf(over())).toBe(220);
  });

  it('when the close-in after a cold start meets late, missed, on-time and early frames in turn, then no frame moves the page more than an eighth of the gap', async () => {
    document.documentElement.style.setProperty('--duration-fast', '150ms');
    onTestFinished(() => {
      document.documentElement.style.removeProperty('--duration-fast');
    });

    const steps = await coldCloseInSteps(
      framesFrom(3000, [33.3, 16.7, 50, 16.7, 8.3, 16.7, 33.3, 16.7, 16.7, 50, 16.7, 16.7]),
    );

    steps.forEach((step, frame) =>
      expect(step, `the step of frame ${frame + 1}`).toBeLessThanOrEqual(220 / 8),
    );
  });

  it('when two long tasks in a row hold back the first frame of the close-in, so the page clock ticks twice before it, then the ticks move nothing and that frame moves the page by one frame, no more than an eighth of the gap', async () => {
    document.documentElement.style.setProperty('--duration-fast', '150ms');
    onTestFinished(() => {
      document.documentElement.style.removeProperty('--duration-fast');
    });
    const now = oneFakePageClock();
    const frames = framesByHand();
    try {
      const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(220);
      finishVisit();
      await drawnUnderOnTheFakeClock();
      const before = offsetOf(over());

      await vi.advanceTimersByTimeAsync(2 * FRAME_LATE_MS + 20);
      expect(offsetOf(over()), 'the page moved while no frame was drawn').toBe(before);
      frames.run(now());

      expect(offsetOf(over()) - before, 'the step of the first frame').toBeLessThanOrEqual(220 / 8);
    } finally {
      frames.restore();
    }
  });

  it('when the app draws steadily at 30 frames a second, as in Low Power Mode, then the close-in keeps its speed in time wherever an eighth of the gap per frame allows it, so the page is with the finger within 13 of its frames', async () => {
    document.documentElement.style.setProperty('--duration-fast', '150ms');
    const frames = framesByHand();
    try {
      const transitions = dressedTransitions();
      document.dispatchEvent(new Event('pointerdown'));
      for (let frame = 0; frame <= 11; frame++) {
        frames.run(1000 + frame * 33);
      }
      const swipe = transitions.startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(220);
      finishVisit();
      await drawnUnder();

      for (let frame = 1; frame <= 13; frame++) {
        frames.run(2000 + frame * 33);
      }

      expect(offsetOf(over())).toBe(220);
    } finally {
      frames.restore();
      document.documentElement.style.removeProperty('--duration-fast');
    }
  });

  it('when a flick lets the page go past half before the page Zpět leads to is drawn, then the slide that takes the page from where it stands starts only after two drawn frames, never by the page clock in a visible page within 250 ms, so the copy just placed is painted before the page moves (the clock’s 500 ms bound is the afterTwoFrames rows’)', async () => {
    const frames = framesByHand();
    try {
      const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(120);
      void swipe.settle({
        completes: true,
        from: 120,
        to: 390,
        durationMs: 150,
        easing: 'ease-out',
        speed: 1,
      });
      finishVisit();
      await drawnUnder();

      await new Promise((done) => setTimeout(done, 2 * FRAME_LATE_MS + 50));
      expect(offsetOf(over()), 'the page moved by the clock').toBe(0);
      frames.run(16);
      frames.run(32);
      expect(offsetOf(over()), 'the page moved before two frames were drawn').toBe(0);
      await Promise.resolve();
      frames.run(48);

      await vi.waitFor(() => expect(offsetOf(over())).toBeGreaterThan(0));
    } finally {
      frames.restore();
    }
  });

  it('when a frame of the close-in comes 100 ms late, as when the article is drawn again behind the cover on an iPhone SE, then the close-in advances by one frame of the display, so that frame moves the page no more than an eighth of the gap either', async () => {
    document.documentElement.style.setProperty('--duration-fast', '150ms');
    const frames = framesByHand();
    try {
      const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(220);
      finishVisit();
      await drawnUnder();

      const offsets = [offsetOf(over())];
      for (const at of [16, 32, 132, 148, 164, 180, 196, 212, 228, 244, 260, 276, 292]) {
        frames.run(at);
        offsets.push(offsetOf(over()));
      }
      const steps = offsets.slice(1).map((offset, frame) => offset - offsets[frame]);

      expect(Math.max(...steps), 'the longest step of one frame').toBeLessThanOrEqual(220 / 8);
    } finally {
      frames.restore();
      document.documentElement.style.removeProperty('--duration-fast');
    }
  });

  it('when the finger goes back towards the edge while the page closes in on it, then the page never goes past the edge nor ahead of the finger', async () => {
    document.documentElement.style.setProperty('--duration-fast', '150ms');
    const frames = framesByHand();
    try {
      const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(220);
      finishVisit();
      await drawnUnder();
      for (const at of [16, 32, 48]) {
        frames.run(at);
      }

      swipe.follow(5);
      frames.run(64);

      expect(offsetOf(over())).toBeGreaterThanOrEqual(0);
      expect(offsetOf(over())).toBeLessThanOrEqual(5);
    } finally {
      frames.restore();
      document.documentElement.style.removeProperty('--duration-fast');
    }
  });

  it('when the finger lets go past half while the page still closes in on it, then the slide through the real swipe goes on from where the page stands in the next frame, never standing still for held frames, and with a late frame and a tick of the page clock on its way it moves every frame towards its end, the first no more than the page was moving or an eighth of the gap and none more than that or the finger’s own slide at its steepest', async () => {
    const now = oneFakePageClock();
    const frames = framesByHand();
    try {
      const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(220);
      finishVisit();
      await drawnUnderOnTheFakeClock();
      const closing = [offsetOf(over())];
      for (let frame = 0; frame < 3; frame++) {
        await vi.advanceTimersByTimeAsync(16);
        frames.run(now());
        closing.push(offsetOf(over()));
      }
      const liftedAt = closing.at(-1)!;
      const lastStep = liftedAt - closing.at(-2)!;
      const end = {
        completes: true,
        from: 220,
        to: 390,
        durationMs: 150,
        easing: 'cubic-bezier(0.25, 0.5, 0.25, 1)',
        speed: 1,
      };
      void swipe.settle(end);
      await vi.advanceTimersByTimeAsync(16);
      frames.run(now());
      await vi.advanceTimersByTimeAsync(0);
      expect(offsetOf(over()), 'the page stood still in the frame after the lift').toBeGreaterThan(
        liftedAt,
      );

      const offsets = [liftedAt, offsetOf(over())];
      const gaps: (number | 'tick')[] = [16, 50, 16, 'tick', ...Array<number>(30).fill(16)];
      for (const gap of gaps) {
        if (gap === 'tick') {
          await vi.advanceTimersByTimeAsync(FRAME_LATE_MS + 20);
        } else {
          await vi.advanceTimersByTimeAsync(gap);
          frames.run(now());
        }
        const page = document.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--over`);
        if (page === null) {
          break;
        }
        offsets.push(offsetOf(page));
      }
      const steps = offsets.slice(1).map((at, frame) => at - offsets[frame]);
      const firstAtMost = Math.max(lastStep, 220 / 8);
      const anyAtMost = Math.max(firstAtMost, steepestStepOver(end, 1000 / 60));

      expect(steps[0], 'the first frame of the slide').toBeLessThanOrEqual(firstAtMost + 1e-6);
      steps.forEach((step, frame) => {
        expect(step, `frame ${frame + 1} went back`).toBeGreaterThanOrEqual(-1e-6);
        expect(step, `frame ${frame + 1}`).toBeLessThanOrEqual(anyAtMost + 1e-6);
      });
      expect(offsets.at(-1), 'where the slide ended').toBe(390);
    } finally {
      frames.restore();
    }
  });

  it('when the finger lets go past half while no frame is drawn for 520 ms as the page closes in on it, then the first frame drawn after shows the page no further from where the last drawn frame showed it than it was moving or an eighth of the gap, never the moves the page clock made unseen', async () => {
    const now = oneFakePageClock();
    const frames = framesByHand();
    try {
      const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(220);
      finishVisit();
      await drawnUnderOnTheFakeClock();
      const drawn = [offsetOf(over())];
      for (let frame = 0; frame < 2; frame++) {
        await vi.advanceTimersByTimeAsync(16);
        frames.run(now());
        drawn.push(offsetOf(over()));
      }
      await vi.advanceTimersByTimeAsync(520);
      void swipe.settle({
        completes: true,
        from: 220,
        to: 390,
        durationMs: 150,
        easing: 'cubic-bezier(0.25, 0.5, 0.25, 1)',
        speed: 3,
      });
      await vi.advanceTimersByTimeAsync(0);
      frames.run(now());
      await vi.advanceTimersByTimeAsync(0);
      const lastDrawn = drawn.at(-1)!;
      const moved = offsetOf(over()) - lastDrawn;

      expect(moved, 'the page stood still in the first frame after the lift').toBeGreaterThan(0);
      expect(moved, 'the first frame after the freeze').toBeLessThanOrEqual(
        Math.max(lastDrawn - drawn.at(-2)!, 220 / 8) + 1e-6,
      );
    } finally {
      frames.restore();
    }
  });

  for (const { display, frameMs } of [
    { display: '30 Hz', frameMs: 1000 / 30 },
    { display: '60 Hz', frameMs: 1000 / 60 },
  ]) {
    for (const travel of [20, 40]) {
      it(`when a ${display} display has drawn the page at the finger, the finger moves ${travel} px more before the next frame and lets go, then the first frame of the slide moves the page from where the last drawn frame showed it no more than it was moving or an eighth of the gap, since the finger's last travel was never drawn`, async () => {
        const now = oneFakePageClock();
        const frames = framesByHand();
        try {
          const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
          await vi.dynamicImportSettled();
          swipe.follow(220);
          finishVisit();
          await drawnUnderOnTheFakeClock();
          const drawn = [offsetOf(over())];
          for (let frame = 0; frame < 60 && drawn.at(-1)! < 220; frame++) {
            await vi.advanceTimersByTimeAsync(frameMs);
            frames.run(now());
            drawn.push(offsetOf(over()));
          }
          expect(drawn.at(-1), 'the page closed in on the finger').toBe(220);
          swipe.follow(220 + travel / 2);
          swipe.follow(220 + travel);
          void swipe.settle({
            completes: true,
            from: 220 + travel,
            to: 390,
            durationMs: 150,
            easing: 'cubic-bezier(0.25, 0.5, 0.25, 1)',
            speed: 1,
          });
          await vi.advanceTimersByTimeAsync(frameMs);
          frames.run(now());
          await vi.advanceTimersByTimeAsync(0);
          const moved = offsetOf(over()) - 220;

          expect(moved, 'the page stood still in the first frame after the lift').toBeGreaterThan(
            0,
          );
          expect(moved, 'the first frame of the slide').toBeLessThanOrEqual(
            Math.max(220 - drawn.at(-2)!, 220 / 8) + 1e-6,
          );
        } finally {
          frames.restore();
        }
      });
    }
  }

  it('when no frame is drawn for 600, 800 or 1100 ms while the finger runs far ahead of a page that closed in on a short gap, and it lets go in that time, slowly or with a flick, on a 30 or 60 Hz display that measured its own frames, then the page arrives within 1.5 times the finger’s own slide or 400 ms after the frames come again, each frame moving it no more than it was moving, an eighth of the gap it now shows to the finger, or the finger’s own slide at its steepest', async () => {
    const now = oneFakePageClock();
    const frames = framesByHand();
    const late: string[] = [];
    try {
      for (const [freezeMs, frameMs, speed, durationMs] of [600, 800, 1100].flatMap((freeze) =>
        [1000 / 30, 1000 / 60].flatMap((frame) => [
          [freeze, frame, 0.2, 350],
          [freeze, frame, 1, 180],
        ]),
      )) {
        const transitions = dressedTransitions();
        transitions.frameGaps.splice(0, Infinity, ...Array<number>(10).fill(frameMs));
        const swipe = transitions.startSwipe({ kind: 'parent', path: '/' })!;
        await vi.dynamicImportSettled();
        swipe.follow(56);
        finishVisit();
        await drawnUnderOnTheFakeClock();
        const drawn = [offsetOf(over())];
        for (let frame = 0; frame < 2; frame++) {
          await vi.advanceTimersByTimeAsync(frameMs);
          frames.run(now());
          drawn.push(offsetOf(over()));
        }
        await vi.advanceTimersByTimeAsync(freezeMs / 2);
        swipe.follow(300);
        await vi.advanceTimersByTimeAsync(freezeMs / 2);
        const end = {
          completes: true,
          from: 300,
          to: 390,
          durationMs,
          easing: 'cubic-bezier(0.25, 0.5, 0.25, 1)',
          speed,
        };
        const settled = swipe.settle(end);
        const lastDrawn = drawn.at(-1)!;
        const atMost = Math.max(
          lastDrawn - drawn.at(-2)!,
          56 / 8,
          (300 - lastDrawn) / 8,
          steepestStepOver(end, frameMs),
        );
        const resumedAt = now();
        const offsets = [lastDrawn];
        let arrivedMs: number | null = null;
        for (let frame = 0; frame < 120 && arrivedMs === null; frame++) {
          await vi.advanceTimersByTimeAsync(frameMs);
          frames.run(now());
          await vi.advanceTimersByTimeAsync(0);
          const page = document.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--over`);
          const at = page === null ? 390 : offsetOf(page);
          if (at - offsets.at(-1)! > atMost + 1e-6) {
            late.push(
              `${freezeMs} ms, ${frameMs.toFixed(1)} ms frames, ${speed} px/ms: frame ${frame + 1} moved ${(at - offsets.at(-1)!).toFixed(1)} over ${atMost.toFixed(1)}`,
            );
          }
          offsets.push(at);
          if (at === 390) {
            arrivedMs = now() - resumedAt;
          }
        }
        if (arrivedMs === null || arrivedMs > Math.max(1.5 * end.durationMs, 400) + frameMs) {
          late.push(
            `${freezeMs} ms, ${frameMs.toFixed(1)} ms frames, ${speed} px/ms: arrived after ${arrivedMs} ms (${offsets.map((at) => at.toFixed(0)).join(' ')})`,
          );
        }
        await vi.advanceTimersByTimeAsync(2000);
        await settled;
        dressedTransitions().finish();
        document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}`).forEach((node) => node.remove());
      }

      expect(late).toEqual([]);
    } finally {
      frames.restore();
    }
  });

  it('when the page has closed in on a finger that then rests still for 600 ms while frames keep coming, and the first frame after the lift comes 120 ms late, then the slide runs its planned curve from the lift, never taking the still page for a freeze and jumping to its end', async () => {
    const now = oneFakePageClock();
    const frames = framesByHand();
    try {
      const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(220);
      finishVisit();
      await drawnUnderOnTheFakeClock();
      for (let frame = 0; frame < 60 && offsetOf(over()) < 220; frame++) {
        await vi.advanceTimersByTimeAsync(16);
        frames.run(now());
      }
      expect(offsetOf(over()), 'the page closed in on the finger').toBe(220);
      for (let rested = 0; rested < 600; rested += 16) {
        await vi.advanceTimersByTimeAsync(16);
        frames.run(now());
      }

      const end = {
        completes: true,
        from: 220,
        to: 390,
        durationMs: 300,
        easing: 'ease-out',
      };
      void swipe.settle(end);
      const liftedAt = now();
      await vi.advanceTimersByTimeAsync(120);
      frames.run(now());
      const offsets = [220, offsetOf(over())];
      let arrivedMs: number | null = null;
      for (let frame = 0; frame < 60 && arrivedMs === null; frame++) {
        await vi.advanceTimersByTimeAsync(16);
        frames.run(now());
        await vi.advanceTimersByTimeAsync(0);
        const page = document.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--over`);
        const at = page === null ? 390 : offsetOf(page);
        offsets.push(at);
        if (at === 390) {
          arrivedMs = now() - liftedAt;
        }
      }

      expect(
        arrivedMs,
        `arrived before its planned ${end.durationMs} ms: ${offsets.map((at) => at.toFixed(1)).join(', ')}`,
      ).toBeGreaterThanOrEqual(end.durationMs - 16);
    } finally {
      frames.restore();
    }
  });

  it('when the page clock closes the last of the gap while no frame is drawn for 520 ms, frames come again showing the page at the still finger, and the finger lets go, then the slide never shows the page behind where the last drawn frame showed it, and no frame steps back', async () => {
    const now = oneFakePageClock();
    const frames = framesByHand();
    try {
      const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(220);
      finishVisit();
      await drawnUnderOnTheFakeClock();
      for (let frame = 0; frame < 60 && 220 - offsetOf(over()) > 220 / 8; frame++) {
        await vi.advanceTimersByTimeAsync(16);
        frames.run(now());
      }
      expect(offsetOf(over()), 'the page an eighth of the gap from the finger').toBe(220 - 220 / 8);
      await vi.advanceTimersByTimeAsync(520);
      expect(offsetOf(over()), 'the page clock closed the gap unseen').toBe(220);
      await vi.advanceTimersByTimeAsync(16);
      frames.run(now());
      await vi.advanceTimersByTimeAsync(16);
      frames.run(now());

      void swipe.settle({
        completes: true,
        from: 220,
        to: 390,
        durationMs: 150,
        easing: 'cubic-bezier(0.25, 0.5, 0.25, 1)',
        speed: 1,
      });
      const offsets = [220];
      for (let frame = 0; frame < 40; frame++) {
        await vi.advanceTimersByTimeAsync(16);
        frames.run(now());
        await vi.advanceTimersByTimeAsync(0);
        const page = document.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--over`);
        if (page === null) {
          break;
        }
        offsets.push(offsetOf(page));
      }
      const steps = offsets.slice(1).map((at, frame) => at - offsets[frame]);

      expect(
        steps.filter((step) => step < -1e-6),
        `steps back in ${offsets.map((at) => at.toFixed(1)).join(', ')}`,
      ).toEqual([]);
      expect(offsets.at(-1), 'where the slide ended').toBe(390);
    } finally {
      frames.restore();
    }
  });

  it('when the finger lets go once the page has closed in on it, then the page slides on in the next frame drawn, never holding still for frames, since the close-in has drawn the page beneath already', async () => {
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => ({
        pause: () => undefined,
        play: () => undefined,
        cancel: () => undefined,
        finished: new Promise(() => undefined),
      }),
    });
    const now = oneFakePageClock();
    const frames = framesByHand();
    try {
      const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(220);
      finishVisit();
      await drawnUnderOnTheFakeClock();
      for (let frame = 0; frame < 60 && offsetOf(over()) < 220; frame++) {
        await vi.advanceTimersByTimeAsync(16);
        frames.run(now());
      }
      expect(offsetOf(over()), 'the page closed in on the finger').toBe(220);

      void swipe.settle({
        completes: true,
        from: 220,
        to: 390,
        durationMs: 150,
        easing: 'cubic-bezier(0.25, 0.5, 0.25, 1)',
        speed: 1,
      });
      await vi.advanceTimersByTimeAsync(16);
      frames.run(now());
      await vi.advanceTimersByTimeAsync(0);

      expect(offsetOf(over()), 'the page stood still in the frame after the lift').toBeGreaterThan(
        220,
      );
    } finally {
      frames.restore();
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('when the finger lets the page go back while the page still closes in on it, then the slide that settles it owns the page, and the close-in never moves it towards the finger again', async () => {
    const frames = framesByHand();
    try {
      const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(200);
      finishVisit();
      await drawnUnder();
      for (const at of [16, 32, 48]) {
        frames.run(at);
      }
      const letGoAt = offsetOf(over());
      expect(letGoAt).toBeGreaterThan(0);
      void swipe.settle({
        completes: false,
        from: 200,
        to: 0,
        durationMs: 150,
        easing: 'ease-out',
        speed: 0,
      });

      const offsets = [letGoAt];
      for (let frame = 4; frame <= 60; frame++) {
        frames.run(frame * 16);
        await Promise.resolve();
        const page = document.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--over`);
        if (page === null) {
          break;
        }
        offsets.push(offsetOf(page));
      }

      offsets
        .slice(1)
        .forEach((offset, frame) =>
          expect(offset, `frame ${frame + 4}`).toBeLessThanOrEqual(offsets[frame]),
        );
      expect(offsets.at(-1), 'where the page stood last').toBeLessThan(letGoAt);
      await vi.waitFor(() =>
        expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull(),
      );
    } finally {
      frames.restore();
    }
  });

  it('when the page Zpět leads to is drawn while the finger keeps moving, then the page closes in on the finger frame by frame until it is with it and then follows it 1:1, never jumping at an end set in advance', async () => {
    document.documentElement.style.setProperty('--duration-fast', '150ms');
    const frames = framesByHand();
    try {
      const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(120);
      finishVisit();
      await drawnUnder();

      const gaps: number[] = [];
      for (let frame = 1; frame <= 40; frame++) {
        const finger = 120 + frame * 3;
        swipe.follow(finger);
        frames.run(frame * 16);
        gaps.push(finger - offsetOf(over()));
      }

      expect(gaps[0]).toBeGreaterThan(30);
      gaps.slice(1).forEach((gap, frame) => expect(gap).toBeLessThanOrEqual(gaps[frame]));
      expect(gaps.at(-1)).toBe(0);
      swipe.follow(300);
      expect(offsetOf(over())).toBe(300);
      expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)?.classList).not.toContain(
        `${PAGE_TRANSITION_CLASS}--catching-up`,
      );
    } finally {
      frames.restore();
      document.documentElement.style.removeProperty('--duration-fast');
    }
  });

  it('when the browser stops giving animation frames while the page closes in on the finger, then the page still closes in on the clock and ends with the finger', async () => {
    document.documentElement.style.setProperty('--duration-fast', '150ms');
    const frames = framesByHand();
    try {
      const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      swipe.follow(120);
      finishVisit();
      await drawnUnder();

      await expect.poll(() => offsetOf(over()), { timeout: 2000 }).toBe(120);
    } finally {
      frames.restore();
      document.documentElement.style.removeProperty('--duration-fast');
    }
  });

  it('when the page Zpět leads to is drawn under a page that has not moved yet, then the header of the page under it shows no more than the page does, so its avatar never flashes', async () => {
    const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
    await vi.dynamicImportSettled();
    swipe.follow(39);

    finishVisit();
    await Promise.resolve();

    const avatar = document.querySelector<HTMLElement>(
      `.${PAGE_TRANSITION_CLASS}__bar .account-button`,
    );
    expect(avatar?.style.opacity).toBe('0');
  });

  it('when the page Zpět leads to cannot be drawn, then letting go past half leaves the page where it is and says it did not leave', async () => {
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => motionEnding(Promise.resolve()),
    });
    try {
      const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
      await vi.dynamicImportSettled();
      const moves = transformsOf(over());
      swipe.follow(300);
      const left = swipe.settle({
        completes: true,
        from: 300,
        to: 390,
        durationMs: 150,
        easing: 'ease-out',
      });
      cannotDraw();

      expect(await left).toBe(false);
      expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
      expect(moves(), 'the page moved over a ground with no page drawn on it').toEqual([]);
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('when a finger takes the page, then the page Zpět leads to is drawn under cover and then lies under the finger', async () => {
    dressedTransitions().startSwipe({ kind: 'parent', path: '/' });
    await vi.dynamicImportSettled();
    const under = () =>
      withOrdinarySpaces(
        document.querySelector(`.${PAGE_TRANSITION_CLASS}__page--under h1`)?.textContent,
      ) ?? null;

    expect(visits).toEqual(['/']);
    expect(under()).toBeNull();
    finishVisit();
    await drawnUnder();

    expect(under()).toBe('Úvod');
  });
});

describe('Given the app on a wide screen, where the header and the side navigation stand beside the content', () => {
  let router: Router;
  let layer: HTMLElement;
  let transitions: PageTransitions;
  let lessMotion: boolean;

  function paintWide(title: string): void {
    layer.replaceChildren();
    const header = document.createElement('app-header');
    const nav = document.createElement('nav');
    for (const [path, name] of [
      ['/', 'Úvod'],
      ['/aktuality', 'Aktuality'],
      ['/projekty', 'Pomáháme'],
    ]) {
      const link = document.createElement('a');
      link.setAttribute('href', path);
      link.textContent = name;
      nav.append(link);
    }
    header.append(nav);
    const main = document.createElement('main');
    const heading = document.createElement('h1');
    heading.textContent = title;
    const inMain = document.createElement('a');
    inMain.setAttribute('href', '/aktuality/clanek');
    main.append(heading, inMain);
    const tabBar = document.createElement('app-tab-bar');
    const tabs = document.createElement('nav');
    tabs.className = 'tab-bar';
    tabs.textContent = 'Záložky';
    tabBar.append(tabs);
    layer.append(header, main, tabBar);
  }

  function overlay(): HTMLElement | null {
    return document.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}`);
  }

  beforeEach(async () => {
    lessMotion = false;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion') && lessMotion,
          media: query,
        }) as MediaQueryList,
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1180 });
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    document.body.append(layer);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Blank },
          { path: 'aktuality', component: Blank },
          { path: 'aktuality/:slug', component: Blank, data: { parent: '/aktuality' } },
          { path: 'overit', component: Blank, data: { parent: '/' } },
        ]),
        { provide: CompactLayout, useValue: { isCompact: signal(false).asReadonly() } },
        {
          provide: NavigationPreview,
          useValue: {
            active: () => false,
            drives: () => false,
            discard: () => undefined,
            visit: () => Promise.resolve(null),
          },
        },
      ],
    });
    router = TestBed.inject(Router);
    transitions = dressedTransitions();
    transitions.sheets = SHEET_STEPPING;
    await transitions.loadDrawing();
    await router.navigateByUrl('/aktuality');
    paintWide('Aktuality');
  });

  afterEach(() => {
    document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}`).forEach((node) => node.remove());
    layer.remove();
    delete (window as { matchMedia?: unknown }).matchMedia;
    Object.defineProperty(window, 'innerWidth', jsdomWidth!);
  });

  async function openArticle(): Promise<void> {
    await router.navigateByUrl('/aktuality/clanek');
    paintWide('Zahrada pro děti');
  }

  it('when an article opened from the news is open, then a swipe is a step, and only the content follows the finger over a copy of the news while the header carries no copy of its own', async () => {
    await openArticle();

    expect(transitions.stepsBySwipe()).toBe(true);
    const swipe = transitions.startSwipe(TestBed.inject(BackTarget).destination('/aktuality'));

    expect(swipe).not.toBeNull();
    expect(overlay()?.classList).toContain(`${PAGE_TRANSITION_CLASS}--content`);
    expect(
      withOrdinarySpaces(
        overlay()?.querySelector(`.${PAGE_TRANSITION_CLASS}__page--under h1`)?.textContent,
      ),
    ).toBe('Aktuality');
    expect(overlay()?.querySelector(`.${PAGE_TRANSITION_CLASS}__bar`)).toBeNull();
  });

  it('when a finger takes the article, then the copies carry no header, side navigation or tab bar of their own, which stand live beside the content', async () => {
    await openArticle();

    transitions.startSwipe(TestBed.inject(BackTarget).destination('/aktuality'));

    const standing = Array.from(
      overlay()?.querySelectorAll<HTMLElement>('app-header, .side-nav-panel, app-tab-bar') ?? [],
    );
    expect(standing.length).toBeGreaterThan(0);
    expect(standing.filter((part) => part.style.visibility !== 'hidden')).toEqual([]);
    expect(
      standing
        .filter((part) => part.localName === 'app-tab-bar')
        .map((tabBar) => tabBar.style.display),
    ).toEqual(['none', 'none']);
  });

  it('when a step without a finger opens the article, then nothing slides, as on a computer today', async () => {
    const covered: boolean[] = [];
    router.events.subscribe((event) => {
      if (event instanceof GuardsCheckEnd) {
        covered.push(overlay() !== null);
      }
    });

    await openArticle();

    expect(covered).toEqual([false]);
  });

  it('when a section of the header is open, then a swipe is no step, as the header switches sections', () => {
    expect(transitions.stepsBySwipe()).toBe(false);
  });

  it('when a page of no section is open, then a swipe is no step', async () => {
    await router.navigateByUrl('/overit');
    paintWide('Ověření');

    expect(transitions.stepsBySwipe()).toBe(false);
  });

  it('when the visitor asks for less motion, then the page does not follow the finger', async () => {
    await openArticle();
    lessMotion = true;

    expect(transitions.stepsBySwipe()).toBe(true);
    expect(transitions.followsFinger()).toBe(false);
  });
});

describe('Given the app on the home screen of a phone opened straight on the donor overview, whose drawing of the page Zpět leads to gives up while the router still moves', () => {
  let layer: HTMLElement;
  let router: Router;
  let landingMayOpen: (opens: boolean) => void;
  let previewing: boolean;

  beforeEach(async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: false, media: query }) as MediaQueryList,
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () => motionEnding(Promise.resolve()),
    });
    layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    document.body.append(layer);
    previewing = false;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            component: Blank,
            canActivate: [() => new Promise<boolean>((opens) => (landingMayOpen = opens))],
          },
          { path: 'darce/prehled', component: Blank, data: { parent: '/' } },
        ]),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
        {
          provide: NavigationPreview,
          useValue: {
            active: () => previewing,
            drives: () => previewing,
            discard: () => undefined,
            visit: () => {
              previewing = true;
              void router.navigateByUrl('/', { skipLocationChange: true });
              return Promise.resolve(null);
            },
          },
        },
      ],
    });
    router = TestBed.inject(Router);
    await dressedTransitions().loadDrawing();
    await router.navigateByUrl('/darce/prehled');
    paint(layer, { title: 'Přehled' });
  });

  afterEach(() => {
    document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}`).forEach((node) => node.remove());
    layer.remove();
    delete (window as { matchMedia?: unknown }).matchMedia;
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
    Object.defineProperty(window, 'innerWidth', jsdomWidth!);
  });

  it('when the finger lets go past half before the router has come to rest, then the still copy keeps covering the page until it has, and the swipe ends without a step', async () => {
    const swipe = dressedTransitions().startSwipe({ kind: 'parent', path: '/' })!;
    const moves = transformsOf(
      document.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--over`)!,
    );
    swipe.follow(300);
    const left = swipe.settle({
      completes: true,
      from: 300,
      to: 390,
      durationMs: 150,
      easing: 'ease-out',
    });
    let ended = false;
    void left.then(() => (ended = true));

    await vi.dynamicImportSettled();
    await new Promise((done) => setTimeout(done, 50));
    expect(ended).toBe(false);
    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).not.toBeNull();
    landingMayOpen(false);

    expect(await left).toBe(false);
    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
    expect(moves(), 'the page moved over a ground with no page drawn on it').toEqual([]);
  });
});

describe('Given the app on a phone with a sheet open at its list', () => {
  let sheet: HTMLDialogElement;
  let transitions: PageTransitions;
  let compact: WritableSignal<boolean>;

  function headOf(title: string): HTMLElement {
    const head = document.createElement('app-sheet-head');
    const back = document.createElement('button');
    back.className = 'sheet-head-button sheet-head-back';
    const name = document.createElement('h2');
    name.className = 'sheet-head-title';
    name.textContent = title;
    const close = document.createElement('button');
    close.className = 'sheet-head-button sheet-head-close';
    head.append(back, name, close);
    return head;
  }

  function headTitles(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        `.${PAGE_TRANSITION_CLASS}__bar .${PAGE_TRANSITION_CLASS}__title`,
      ),
    );
  }

  function overlayPage(position: 'over' | 'under'): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      `.${PAGE_TRANSITION_CLASS} .${PAGE_TRANSITION_CLASS}__page--${position}`,
    );
  }

  function withLessMotion(lessMotion: boolean): void {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion') && lessMotion,
          media: query,
        }) as MediaQueryList,
    });
  }

  function heldFrames(): FrameRequestCallback[] {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => {
      frames.push(frame);
      return frames.length;
    });
    return frames;
  }

  function drawFrame(frames: FrameRequestCallback[]): void {
    frames.splice(0).forEach((frame) => frame(performance.now()));
  }

  function stepBackToTheList(): void {
    sheet.replaceChildren(headOf('Moje dary'));
    transitions.stepInSheet({
      kind: 'pop',
      depth: 0,
      owner: sheet,
      change: () => sheet.replaceChildren(headOf('Účet')),
      placed: () => undefined,
    });
    TestBed.inject(ApplicationRef).tick();
  }

  function titleOpacities(): string[][] {
    return headTitles().map((title) => [title.textContent?.trim() ?? '', title.style.opacity]);
  }

  beforeEach(() => {
    withLessMotion(false);
    sheet = document.createElement('dialog');
    sheet.setAttribute('open', '');
    sheet.textContent = 'Účet';
    document.body.append(sheet);
    compact = signal(true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CompactLayout, useValue: { isCompact: compact.asReadonly() } },
      ],
    });
    transitions = dressedTransitions();
    transitions.sheets = SHEET_STEPPING;
  });

  afterEach(() => {
    transitions.finish();
    document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}, dialog`).forEach((node) => node.remove());
    delete (window as { matchMedia?: unknown }).matchMedia;
    delete (window as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly;
    document.documentElement.style.removeProperty('--page-title-fade-at');
    vi.restoreAllMocks();
  });

  function sheetStepLeftOver(): string[] {
    return [
      ...Array.from(document.querySelectorAll(`.${PAGE_TRANSITION_CLASS}`), () => 'copies'),
      ...(sheet.closest('[inert]') === null ? [] : ['the sheet is inert']),
      ...(transitions.stepping() ? ['the step runs'] : []),
    ];
  }

  function openMyOverviewInTheSheet(): void {
    transitions.stepInSheet({
      kind: 'push',
      depth: 1,
      owner: sheet,
      change: () => (sheet.textContent = 'Můj přehled'),
      placed: () => undefined,
    });
    TestBed.inject(ApplicationRef).tick();
  }

  async function copiesPlacedInTheSheet(): Promise<void> {
    for (let waited = 0; overlayPage('over') === null && waited < 1000; waited += 5) {
      await vi.advanceTimersByTimeAsync(5);
    }
    expect(overlayPage('over')?.textContent ?? '', 'the copies were never placed').toContain(
      'Můj přehled',
    );
  }

  it('when a section opens inside the sheet and the frames stop right after the one that lets its motions go, which never report that they finished, as on a cold runner, then the step ends within its motion’s length and STEP_ENDS_LATE_BY_MS, leaving no copy of the list beside the section', async () => {
    vi.useFakeTimers(CLOCK_ONLY);
    onTestFinished(() => {
      vi.useRealTimers();
    });
    watchHeldMotions();
    const frames = heldFrames();
    openMyOverviewInTheSheet();
    await copiesPlacedInTheSheet();
    drawFrame(frames);
    drawFrame(frames);

    await vi.advanceTimersByTimeAsync(STEP_ENDS_LATE_BY_MS);

    expect(sheetStepLeftOver()).toEqual([]);
    expect(sheet.textContent).toBe('Můj přehled');
  });

  it('when a section opens inside the sheet before the step chrome has registered, and the chrome registers while the step runs, then the step still ends with the section shown and no copy left', async () => {
    vi.useFakeTimers(CLOCK_ONLY);
    onTestFinished(() => {
      vi.useRealTimers();
    });
    watchHeldMotions();
    const frames = heldFrames();
    transitions.dressing = null;
    openMyOverviewInTheSheet();
    transitions.dressing = STEP_CHROME;
    await copiesPlacedInTheSheet();
    drawFrame(frames);
    drawFrame(frames);

    await vi.advanceTimersByTimeAsync(STEP_ENDS_LATE_BY_MS);

    expect(sheetStepLeftOver()).toEqual([]);
    expect(sheet.textContent).toBe('Můj přehled');
  });

  it('when a section opens inside the sheet while its page is still being placed, then its copies are placed only once the page is placed and drawn, so it never slides in empty (round 42)', async () => {
    const frames = heldFrames();
    const placement = TestBed.inject(PagePlacement);
    let pagePlaced: () => void = () => undefined;
    transitions.stepInSheet({
      kind: 'push',
      depth: 1,
      owner: sheet,
      change: () => {
        pagePlaced = placement.pending();
        sheet.textContent = '';
      },
      placed: () => undefined,
    });
    TestBed.inject(ApplicationRef).tick();
    drawFrame(frames);
    expect(overlayPage('over'), 'the section slid in before its page was placed').toBeNull();

    sheet.textContent = 'Moje dary';
    pagePlaced();

    await vi.waitFor(() => {
      TestBed.inject(ApplicationRef).tick();
      drawFrame(frames);
      expect(overlayPage('over')?.textContent).toContain('Moje dary');
    });
  });

  it('when a section opens inside the sheet and asks the server for its data, then its copies are placed only once the answers came, so it never slides in empty (round 42)', async () => {
    const frames = heldFrames();
    const placement = TestBed.inject(PagePlacement);
    let answered: () => void = () => undefined;
    transitions.stepInSheet({
      kind: 'push',
      depth: 1,
      owner: sheet,
      change: () => {
        answered = placement.reading();
        sheet.textContent = 'Načítáme';
      },
      placed: () => undefined,
    });
    TestBed.inject(ApplicationRef).tick();
    drawFrame(frames);
    expect(overlayPage('over'), 'the section slid in before its data came').toBeNull();

    sheet.textContent = 'Moje dary';
    answered();

    await vi.waitFor(() => {
      TestBed.inject(ApplicationRef).tick();
      drawFrame(frames);
      expect(overlayPage('over')?.textContent).toContain('Moje dary');
    });
  });

  it('when a section opens inside the sheet and its data do not come within D1’s 150 ms, then it slides in with what it shows, so a read in the background never holds the step longer', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const frames = heldFrames();
    const placement = TestBed.inject(PagePlacement);
    transitions.stepInSheet({
      kind: 'push',
      depth: 1,
      owner: sheet,
      change: () => {
        placement.reading();
        sheet.textContent = 'Moje dary';
      },
      placed: () => undefined,
    });
    TestBed.inject(ApplicationRef).tick();
    drawFrame(frames);
    await vi.advanceTimersByTimeAsync(SECTION_READS_WITHIN_MS - 10);
    drawFrame(frames);
    expect(overlayPage('over')).toBeNull();

    await vi.advanceTimersByTimeAsync(10 + FRAME_LATE_MS);
    drawFrame(frames);

    expect(overlayPage('over')?.textContent).toContain('Moje dary');
  });

  it('when a section opens inside the sheet while its page is being placed and its data never come, then it slides in 300 ms after the page was placed, and a page never placed holds it at most the longest time of a step', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const frames = heldFrames();
    const placement = TestBed.inject(PagePlacement);
    transitions.stepInSheet({
      kind: 'push',
      depth: 1,
      owner: sheet,
      change: () => {
        placement.pending();
        placement.reading();
        sheet.textContent = 'Načítáme';
      },
      placed: () => undefined,
    });
    TestBed.inject(ApplicationRef).tick();
    drawFrame(frames);
    await vi.advanceTimersByTimeAsync(
      PAGE_TRANSITION_LONGEST_MS + FIRST_SECTION_READS_WITHIN_MS - 10,
    );
    drawFrame(frames);
    expect(overlayPage('over')).toBeNull();

    await vi.advanceTimersByTimeAsync(10 + FRAME_LATE_MS);
    drawFrame(frames);

    expect(overlayPage('over')?.textContent).toContain('Načítáme');
  });

  it('when a section opens inside the sheet, then the page that slides in is the section over the list it leaves', () => {
    const frames = heldFrames();
    transitions.stepInSheet({
      kind: 'push',
      depth: 1,
      owner: sheet,
      change: () => (sheet.textContent = 'Moje dary'),
      placed: () => undefined,
    });
    TestBed.inject(ApplicationRef).tick();
    drawFrame(frames);

    expect(overlayPage('under')?.textContent).toContain('Účet');
    expect(overlayPage('over')?.textContent).toContain('Moje dary');
    expect(overlayPage('over')?.textContent).not.toContain('Účet');
  });

  it('when a section opens inside the sheet, then its copies are placed in the frame drawn after it rendered, marked as placed inside a frame, and its motions are let go in the frame after', () => {
    const frames = heldFrames();
    performance.clearMarks(PLACING_MARK);
    transitions.stepInSheet({
      kind: 'push',
      depth: 1,
      owner: sheet,
      change: () => (sheet.textContent = 'Moje dary'),
      placed: () => undefined,
    });
    TestBed.inject(ApplicationRef).tick();
    drawFrame(frames);
    const marks = performance.getEntriesByName(PLACING_MARK) as PerformanceMark[];
    const held = document.querySelector(`.${PAGE_TRANSITION_CLASS}`)?.classList;

    expect(marks.map((mark) => (mark.detail as { kind: string }).kind)).toEqual(['raf']);
    expect(held).toContain(`${PAGE_TRANSITION_CLASS}--held`);
    drawFrame(frames);
    expect(held).not.toContain(`${PAGE_TRANSITION_CLASS}--held`);
  });

  it('when a section opens inside the sheet under a head that stands, then only the title it leaves shows as the step starts', () => {
    const frames = heldFrames();
    sheet.replaceChildren(headOf('Účet'));
    transitions.stepInSheet({
      kind: 'push',
      depth: 1,
      owner: sheet,
      change: () => sheet.replaceChildren(headOf('Moje dary')),
      placed: () => undefined,
    });
    TestBed.inject(ApplicationRef).tick();
    drawFrame(frames);

    expect(headTitles().map((title) => [title.textContent?.trim(), title.style.opacity])).toEqual(
      expect.arrayContaining([
        ['Účet', '1'],
        ['Moje dary', '0'],
      ]),
    );
    expect(headTitles()).toHaveLength(2);
  });

  it('when the window grows past the side navigation while a step moves, then the step ends at once', () => {
    transitions.stepInSheet({
      kind: 'push',
      depth: 1,
      owner: sheet,
      change: () => (sheet.textContent = 'Moje dary'),
      placed: () => undefined,
    });
    TestBed.inject(ApplicationRef).tick();

    compact.set(false);
    TestBed.tick();

    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
    expect(transitions.running).toBeNull();
  });

  it('when the head of a step back is dressed, then it reads neither the root nor the place or width of the leaving section before the next frame, and each only once for the whole step', () => {
    const frames = heldFrames();
    const overlay = transitions.overlay('pop');
    sheet.replaceChildren(headOf('Moje dary'));
    const leaving = transitions.place(
      overlay,
      sheetOnly(transitions, transitions.standingSheetCopy()!),
      'over',
    );
    sheet.replaceChildren(headOf('Účet'));
    const arriving = transitions.place(
      overlay,
      sheetOnly(transitions, transitions.standingSheetCopy()!),
      'under',
    );
    const styled: Element[] = [];
    const style = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      styled.push(element);
      return style(element, pseudo);
    });
    const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get');
    const readRoot = (): number =>
      styled.filter((element) => element === document.documentElement).length;
    const readLeaving = (): number => styled.filter((element) => element === leaving.box).length;

    transitions.dressChrome(overlay, leaving, arriving);

    expect(readRoot()).toBe(0);
    expect(readLeaving()).toBe(0);
    expect(width).not.toHaveBeenCalled();
    expect(titleOpacities()).toEqual(
      expect.arrayContaining([
        ['Moje dary', '1'],
        ['Účet', '0'],
      ]),
    );

    drawFrame(frames);
    drawFrame(frames);

    expect(readRoot()).toBe(1);
    expect(readLeaving()).toBe(2);
    expect(width).toHaveBeenCalledTimes(1);
  });

  it('when the theme fades the titles of the head at once, then the title a step back brings shows whole as soon as the step has begun', () => {
    document.documentElement.style.setProperty('--page-title-fade-at', '0');
    Object.defineProperty(window, 'DOMMatrixReadOnly', {
      configurable: true,
      value: class {
        readonly m41: number;
        constructor(transform: string) {
          this.m41 = Number(transform.split(',')[4]);
        }
      },
    });
    const frames = heldFrames();
    stepBackToTheList();
    drawFrame(frames);
    overlayPage('over')!.style.transform = `matrix(1, 0, 0, 1, ${window.innerWidth / 2}, 0)`;

    drawFrame(frames);

    expect(titleOpacities()).toEqual(
      expect.arrayContaining([
        ['Moje dary', '0'],
        ['Účet', '1'],
      ]),
    );
  });

  it('when the system asks for less motion and a section opens inside the sheet, then the section stands at once with no page moving', () => {
    withLessMotion(true);
    const placed = vi.fn();

    transitions.stepInSheet({
      kind: 'push',
      depth: 1,
      owner: sheet,
      change: () => (sheet.textContent = 'Moje dary'),
      placed,
    });
    TestBed.inject(ApplicationRef).tick();

    expect(sheet.textContent).toBe('Moje dary');
    expect(placed).toHaveBeenCalledTimes(1);
    expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
    expect(transitions.running).toBeNull();
  });

  describe('when a section opened inside the sheet with motion', () => {
    beforeEach(async () => {
      await transitions.loadDrawing();
      transitions.stepInSheet({
        kind: 'push',
        depth: 1,
        owner: sheet,
        change: () => (sheet.textContent = 'Moje dary'),
        placed: () => undefined,
      });
      TestBed.inject(ApplicationRef).tick();
      transitions.finish();
    });

    it('and a finger takes the section back, then the list it left follows the finger under it', () => {
      expect(swipeBackInSheet(transitions, 1)).not.toBeNull();
      expect(overlayPage('under')?.textContent).toContain('Účet');
    });

    it('and the system then asks for less motion, then nothing follows a finger and the step back comes at once', () => {
      withLessMotion(true);

      expect(swipeBackInSheet(transitions, 1)).toBeNull();
      expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
    });

    it('and the sheet that kept the list is gone, then no copy of that list is left for a finger to follow', () => {
      transitions.forgetSheetsOf(sheet);

      expect(swipeBackInSheet(transitions, 1)).toBeNull();
      expect(document.querySelector(`.${PAGE_TRANSITION_CLASS}`)).toBeNull();
    });

    it('and another sheet is gone, then the copy of the list stays', () => {
      transitions.forgetSheetsOf(document.createElement('dialog'));

      expect(swipeBackInSheet(transitions, 1)).not.toBeNull();
    });
  });
});

describe('Given the steady frame a step is judged against', () => {
  it('when two steps publish it one after the other, then whoever reads the frames finds only the last one', () => {
    const marks: { name: string; detail: unknown }[] = [];
    const view = {
      performance: {
        mark: (name: string, options?: PerformanceMarkOptions) =>
          marks.push({ name, detail: options?.detail }),
        clearMarks: (name?: string) =>
          marks.splice(0, marks.length, ...marks.filter((mark) => mark.name !== name)),
      },
    } as unknown as Window;

    publishSteadyFrame(view, 16.7);
    publishSteadyFrame(view, 25);

    expect(marks).toEqual([{ name: STEADY_FRAME_MARK, detail: { steadyBeforeMs: 25 } }]);
  });
});

describe('Given a page that waits for two drawn frames before it starts a motion', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function framesOf(): { view: Window; draw: (at: number) => void } {
    let waiting: FrameRequestCallback[] = [];
    const view = {
      requestAnimationFrame: (callback: FrameRequestCallback) => waiting.push(callback),
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
      performance: window.performance,
    } as unknown as Window;
    return {
      view,
      draw: (at) => {
        const now = waiting;
        waiting = [];
        now.forEach((callback) => callback(at));
      },
    };
  }

  it('when both frames are drawn, then it goes on in the second', () => {
    const { view, draw } = framesOf();
    let wentOn = 0;
    afterDrawnFrames(view, document, 2, () => wentOn++);

    draw(5000);
    expect(wentOn).toBe(0);
    draw(5016);

    expect(wentOn).toBe(1);
  });

  it('when the second frame of a visible page comes later than the clock’s bound, then it still waits for that frame and never goes on by the clock', async () => {
    vi.useFakeTimers();
    const { view, draw } = framesOf();
    let wentOn = 0;
    afterDrawnFrames(view, document, 2, () => wentOn++);
    draw(5000);

    await vi.advanceTimersByTimeAsync(HELD_WITHOUT_A_FRAME_MS + 100);
    expect(wentOn).toBe(0);
    draw(5600);

    expect(wentOn).toBe(1);
  });

  it('when the page is hidden and no frame comes, then the page clock lets it go on after HELD_WITHOUT_A_FRAME_MS, once', async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    onTestFinished(() => visibility.mockRestore());
    const { view, draw } = framesOf();
    let wentOn = 0;
    afterDrawnFrames(view, document, 2, () => wentOn++);

    await vi.advanceTimersByTimeAsync(HELD_WITHOUT_A_FRAME_MS);
    expect(wentOn).toBe(1);
    draw(5000);
    draw(5016);

    expect(wentOn).toBe(1);
  });
});

describe('Given a step of the app, whose top page has the display’s corners only in the app opened from the home screen', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
      ],
    });
  });

  function homeScreen(standalone: boolean, displayMode: boolean): void {
    Object.defineProperty(Navigator.prototype, 'standalone', {
      configurable: true,
      get: () => standalone,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) =>
        ({
          matches: displayMode && query === '(display-mode: standalone)',
          media: query,
        }) as MediaQueryList,
    });
    onTestFinished(() => {
      delete (Navigator.prototype as { standalone?: boolean }).standalone;
    });
  }

  it('when it runs from the home screen of an iPhone, then the layer of a dressed step says so, so only there the top page gets the corners', () => {
    homeScreen(true, false);
    const transitions = dressedTransitions();

    const overlay = transitions.overlay('push');
    transitions.dressChrome(overlay, null, null);

    expect(overlay.classList).toContain(`${PAGE_TRANSITION_CLASS}--home-screen`);
    overlay.remove();
  });

  it('when it runs as an installed app on another system, then the layer of a dressed step says so too', () => {
    homeScreen(false, true);
    const transitions = dressedTransitions();

    const overlay = transitions.overlay('pop');
    transitions.dressChrome(overlay, null, null);

    expect(overlay.classList).toContain(`${PAGE_TRANSITION_CLASS}--home-screen`);
    overlay.remove();
  });

  it('when it runs in a browser tab, then the layer of a dressed step does not, so no page of the step is rounded', () => {
    homeScreen(false, false);
    const transitions = dressedTransitions();

    const overlay = transitions.overlay('push');
    transitions.dressChrome(overlay, null, null);

    expect(overlay.classList).not.toContain(`${PAGE_TRANSITION_CLASS}--home-screen`);
    overlay.remove();
  });
});

function dressedTransitions(): PageTransitions {
  const transitions = TestBed.inject(PageTransitions);
  transitions.dressing = STEP_CHROME;
  return transitions;
}

function transformsOf(page: HTMLElement): () => string[] {
  const seen: string[] = [];
  const note = (records: readonly MutationRecord[]): void => {
    for (const record of records) {
      const before = /transform:\s*([^;]+)/.exec(record.oldValue ?? '')?.[1]?.trim();
      if (before !== undefined && before !== '') {
        seen.push(before);
      }
    }
    if (records.length > 0 && page.style.transform !== '') {
      seen.push(page.style.transform);
    }
  };
  const watch = new MutationObserver(note);
  watch.observe(page, { attributes: true, attributeFilter: ['style'], attributeOldValue: true });
  onTestFinished(() => watch.disconnect());
  return () => {
    note(watch.takeRecords());
    return seen;
  };
}
