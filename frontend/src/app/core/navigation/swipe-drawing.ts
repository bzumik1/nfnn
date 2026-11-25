import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  Router,
} from '@angular/router';
import { pathOf } from './app-tabs';
import { pushWithinSection } from './page-transition-kind';
import { BackDestination } from './back-target';
import { curveOf, easedAt, settleFrom, steepestStepOver, SwipeSettle } from './back-swipe';
import {
  BarCurve,
  BarItem,
  DISPLAY_FRAME_MS,
  FRAME_LATE_MS,
  HELD_WITHOUT_A_FRAME_MS,
  liveDialogs,
  motionAllowed,
  nextFrame,
  PAGE_COVER_LONGEST_MS,
  PAGE_LAYER_CLASS,
  PAGE_TRANSITION_CLASS,
  PAGE_TRANSITION_LONGEST_MS,
  PageTransitions,
  PlacedPage,
  Running,
  SHOWN_DIALOG,
  SwipePreview,
} from './page-transitions';
import { sheetOnly, sheetOverlay, standingSheetCopy } from './sheet-stepping';
import { afterDrawnFrames, publishSteadyFrame } from './step-chrome';

const SECTION_LINKS = 'nav a[href]';
const NOT_COPIED = 'iframe, video, audio, object, embed, dialog';
const HEADER = 'app-header .app-header';
const SIDE_NAVIGATION = '.side-nav-panel';
const TAB_BAR = 'app-tab-bar .tab-bar';
const STANDING_PARTS = 'app-header, .side-nav-panel, app-tab-bar';
const CATCH_UP_SPANS = 3;
const CLOSE_IN_FRAMES_AT_LEAST = 8;
const ARRIVED_WITHIN_PX = 0.5;
const SETTLE_ARRIVES_WITHIN_SLIDES = 1.5;
const SETTLE_ARRIVES_WITHIN_MS = 400;
const SETTLE_SPARE_FRAMES = 3;
const CLOSE_IN_MARK = 'nfnn.close-in';
const SETTLE_FIRST_MARK = 'nfnn.settle-first';

function measuredFrameMs(stage: PageTransitions): number {
  return stage.frameGaps.length === 0 ? DISPLAY_FRAME_MS : stage.steadyFrameMs();
}

export interface CatchUp {
  readonly frameMs: number;
  readonly finger: () => number;
  readonly from: number;
  readonly show: (offset: number, drawn: boolean) => void;
  readonly goesOn: () => boolean;
  readonly caughtUp: () => void;
}

export function closeInOnFinger(view: Window, fastMs: number, catchUp: CatchUp): void {
  const closing = Math.max(1, fastMs / CATCH_UP_SPANS);
  const startGap = Math.max(0, catchUp.finger() - catchUp.from);
  const stepAtMost = startGap / CLOSE_IN_FRAMES_AT_LEAST;
  let behind = startGap;
  let last: number | null = null;
  let lastDrawnAt = view.performance.now();
  let elapsed = 0;
  const closeIn = (now: number, drawn: boolean): void => {
    if (!catchUp.goesOn()) {
      return;
    }
    const stopped = !drawn && now - lastDrawnAt >= HELD_WITHOUT_A_FRAME_MS;
    if (drawn) {
      elapsed += Math.min(
        catchUp.frameMs,
        last === null ? DISPLAY_FRAME_MS : Math.max(0, now - last),
      );
      last = now;
      lastDrawnAt = now;
    } else if (stopped) {
      elapsed += Math.max(0, now - (last ?? lastDrawnAt));
      last = now;
    }
    if (drawn || stopped) {
      const spans = elapsed / closing;
      const left = startGap * (1 + spans) * Math.exp(-spans);
      const target = left < 1 ? 0 : left;
      const before = behind;
      behind = Math.max(target, behind - stepAtMost);
      markFrame(view, CLOSE_IN_MARK, { behind, step: before - behind, gap0: startGap, drawn });
      const finger = Math.max(0, catchUp.finger());
      catchUp.show(Math.min(finger, Math.max(0, finger - behind)), drawn);
    }
    if (behind === 0) {
      catchUp.caughtUp();
    } else {
      nextFrame(view, closeIn);
    }
  };
  nextFrame(view, closeIn);
}

export interface SettleTrack {
  readonly plan: SwipeSettle;
  readonly finger: SwipeSettle;
  readonly frameMs: number;
  readonly firstStepAtMost: number;
  readonly show: (at: number, drawn: boolean) => void;
  readonly goesOn: () => boolean;
  readonly drawnAt?: number;
  readonly afterFreezeStepAtMost?: number;
}

function markFrame(view: Window, name: string, detail: object): void {
  view.performance.mark?.(name, { detail });
}

export function trackSettle(view: Window, track: SettleTrack): Promise<void> {
  const { plan } = track;
  const curve = curveOf(plan.easing);
  const way = plan.to - plan.from;
  const steepest = new Map<number, number>();
  let floor = track.firstStepAtMost;
  const stepAtMostOver = (advanceMs: number): number => {
    const key = Math.floor(advanceMs * 10) / 10;
    const known = steepest.get(key) ?? steepestStepOver(track.finger, key);
    steepest.set(key, known);
    return Math.max(floor, known);
  };
  return new Promise((settled) => {
    let at = plan.from;
    let presentedAt = plan.from;
    let elapsed = 0;
    let last: number | null = null;
    let lastDrawnAt = track.drawnAt ?? view.performance.now();
    const arriveBy =
      view.performance.now() +
      Math.max(track.finger.durationMs * SETTLE_ARRIVES_WITHIN_SLIDES, SETTLE_ARRIVES_WITHIN_MS) +
      SETTLE_SPARE_FRAMES * track.frameMs;
    let first = true;
    const step = (now: number, drawn: boolean): void => {
      if (!track.goesOn()) {
        settled();
        return;
      }
      const stopped = !drawn && now - lastDrawnAt >= HELD_WITHOUT_A_FRAME_MS;
      if (drawn && now - lastDrawnAt >= HELD_WITHOUT_A_FRAME_MS) {
        at = presentedAt;
        floor = Math.max(floor, track.afterFreezeStepAtMost ?? 0);
        first = true;
      }
      if (drawn || stopped) {
        const advanceMs = drawn
          ? Math.min(track.frameMs, last === null ? DISPLAY_FRAME_MS : Math.max(0, now - last))
          : Math.max(0, now - (last ?? lastDrawnAt));
        elapsed += advanceMs;
        last = now;
        if (drawn) {
          lastDrawnAt = now;
        }
        const due = now >= arriveBy;
        const target =
          due || plan.durationMs <= 0
            ? plan.to
            : plan.from + way * easedAt(curve, elapsed / plan.durationMs);
        const atMost = due
          ? Infinity
          : first
            ? floor
            : stepAtMostOver(drawn ? advanceMs : track.frameMs);
        const from = at;
        const towards = target - at;
        at = Math.abs(towards) <= atMost ? target : at + Math.sign(towards) * atMost;
        if (first) {
          markFrame(view, SETTLE_FIRST_MARK, { from, step: at - from, atMost, drawn });
        }
        first = false;
        if (drawn) {
          presentedAt = at;
        }
        track.show(at, drawn);
      }
      if (Math.abs(plan.to - at) < ARRIVED_WITHIN_PX) {
        if (at !== plan.to) {
          track.show(plan.to, drawn);
        }
        settled();
      } else {
        nextFrame(view, step);
      }
    };
    nextFrame(view, step);
  });
}

export async function withoutFocus<T>(
  document: Document,
  layer: HTMLElement | null,
  draw: () => Promise<T>,
): Promise<T> {
  const focused = document.activeElement;
  layer?.setAttribute('inert', '');
  try {
    return await draw();
  } finally {
    layer?.removeAttribute('inert');
    if (
      focused instanceof HTMLElement &&
      focused.isConnected &&
      focused !== document.body &&
      document.activeElement !== focused
    ) {
      focused.focus({ preventScroll: true });
    }
  }
}

export function standAtOnce(parts: Iterable<Element>): void {
  for (const part of parts) {
    part
      .getAnimations?.({ subtree: true })
      .filter((motion) => motion.effect?.getComputedTiming().endTime !== Infinity)
      .forEach((motion) => motion.finish());
  }
}

export interface ContentArea {
  readonly width: number;
  readonly lineUp: () => never[];
}

export function clipToContent(document: Document, overlay: HTMLElement): ContentArea {
  const view = document.defaultView;
  const box = (selector: string): DOMRect | null => {
    const part = document.querySelector(`.${PAGE_LAYER_CLASS} ${selector}`);
    const place = part?.getBoundingClientRect() ?? null;
    return place !== null && place.height > 0 ? place : null;
  };
  const top = Math.max(0, box(HEADER)?.bottom ?? 0);
  const start = Math.max(0, box(SIDE_NAVIGATION)?.right ?? 0);
  const tabBar = box(TAB_BAR);
  const bottom = tabBar === null ? 0 : Math.max(0, (view?.innerHeight ?? 0) - tabBar.top);
  overlay.classList.add(`${PAGE_TRANSITION_CLASS}--content`);
  overlay.style.inset = `${top}px 0 ${bottom}px ${start}px`;
  return {
    width: (view?.innerWidth ?? 0) - start,
    lineUp: () => {
      overlay
        .querySelectorAll<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__scroller`)
        .forEach((scroller) => (scroller.style.inset = `${-top}px 0 ${-bottom}px ${-start}px`));
      overlay.querySelectorAll<HTMLElement>(STANDING_PARTS).forEach((part) => {
        part.style.visibility = 'hidden';
        if (part.localName === 'app-tab-bar') {
          part.style.display = 'none';
        }
      });
      return [];
    },
  };
}

export function pushHere(layer: HTMLElement | null, url: string, parent: string | null): boolean {
  const sections = Array.from(layer?.querySelectorAll(SECTION_LINKS) ?? [])
    .filter((link) => link.closest('main') === null)
    .map((link) => pathOf(link.getAttribute('href') ?? ''));
  return pushWithinSection(pathOf(url), parent, sections);
}

export function lendPhotos(live: HTMLElement, copy: HTMLElement | null): () => void {
  const copied = Array.from(copy?.querySelectorAll('img') ?? []);
  const lent = Array.from(live.querySelectorAll('img'))
    .filter((photo) => photo.closest(NOT_COPIED) === null)
    .map((photo, at) => [photo, copied[at]] as const)
    .filter(([photo, stand]) => stand !== undefined && photo.complete && photo.naturalWidth > 0);
  lent.forEach(([photo, stand]) => exchange(photo, stand));
  return () => lent.forEach(([photo, stand]) => exchange(stand, photo));
}

function exchange(first: Element, second: Element): void {
  if (first.parentNode === null || second.parentNode === null) {
    return;
  }
  const mark = first.ownerDocument.createComment('');
  first.replaceWith(mark);
  second.replaceWith(first);
  mark.replaceWith(second);
}

export async function photosDrawn(page: HTMLElement, longestMs: number): Promise<void> {
  const view = page.ownerDocument.defaultView;
  const photos = Array.from(page.querySelectorAll('img'));
  if (view === null || photos.length === 0) {
    return;
  }
  await Promise.race([
    Promise.allSettled(
      photos.map((photo) => (typeof photo.decode === 'function' ? photo.decode() : undefined)),
    ),
    new Promise((done) => view.setTimeout(done, longestMs)),
  ]);
}

export function untilRouterRests(router: Router, longestMs: number): Promise<void> {
  return new Promise((done) => {
    const rest = (): void => {
      if (router.currentNavigation() === null) {
        clearTimeout(limit);
        moves.unsubscribe();
        done();
      }
    };
    const limit = setTimeout(() => {
      moves.unsubscribe();
      done();
    }, longestMs);
    const moves = router.events.subscribe((event) => {
      if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError ||
        event instanceof NavigationSkipped
      ) {
        queueMicrotask(rest);
      }
    });
    rest();
  });
}

export function startSwipe(
  stage: PageTransitions,
  destination: BackDestination,
): SwipePreview | null {
  const view = stage.document.defaultView;
  const layer = stage.layer();
  if (
    view === null ||
    layer === null ||
    stage.running !== null ||
    !motionAllowed(view) ||
    !stage.stepsBySwipe() ||
    liveDialogs(stage.document, SHOWN_DIALOG).length > 0
  ) {
    return null;
  }
  const behind = destination.kind === 'step' ? stage.keptAt(destination.depth, view) : null;
  const overlay = stage.overlay('pop');
  overlay.classList.add(`${PAGE_TRANSITION_CLASS}--swipe`);
  const content = stage.compact() ? null : clipToContent(stage.document, overlay);
  const arriving = stage.place(overlay, behind ?? stage.placeholder(), 'under');
  const leaving = stage.place(overlay, stage.shown(layer), 'over');
  const dress = (into: PlacedPage): BarItem[] =>
    content?.lineUp() ?? stage.dressChrome(overlay, leaving, into);
  const sheet = behind?.sheet ?? null;
  const running: Running = { kind: 'pop', overlay, swiping: true, sheet, revealed: false };
  stage.running = running;
  stage.sheetUnder(sheet);
  return followingFinger(stage, view, {
    running,
    under: arriving.box,
    over: leaving.box,
    bar: { items: dress(arriving) },
    width: Math.max(1, content?.width ?? view.innerWidth),
    ready: behind !== null,
    draw: (bar, takeOver) =>
      behind === null && destination.path !== null && !stage.dirtyForms.any()
        ? drawUnder(stage, destination.path, running, arriving, (into) => {
            bar.items = dress(into);
            return takeOver();
          })
        : photosDrawn(arriving.box, FRAME_LATE_MS),
    handOver: () => (stage.handingOver = true),
    discard: () => stage.preview.discard(),
  });
}

export function startSheetSwipe(stage: PageTransitions, under: HTMLElement): SwipePreview | null {
  const view = stage.document.defaultView;
  const shown = standingSheetCopy(stage);
  if (view === null || shown === null || stage.running !== null || !motionAllowed(view)) {
    return null;
  }
  const overlay = sheetOverlay(stage, 'pop');
  overlay.classList.add(`${PAGE_TRANSITION_CLASS}--swipe`);
  const arriving = stage.place(overlay, sheetOnly(stage, under), 'under');
  const leaving = stage.place(overlay, sheetOnly(stage, shown), 'over');
  const running: Running = { kind: 'pop', overlay, swiping: true, sheet: shown, revealed: true };
  stage.running = running;
  stage.sheetUnder(shown);
  return followingFinger(stage, view, {
    running,
    under: arriving.box,
    over: leaving.box,
    bar: { items: stage.dressChrome(overlay, leaving, arriving) },
    width: Math.max(1, view.innerWidth),
    ready: true,
    draw: () => Promise.resolve(),
    handOver: () => (stage.sheetHandOver = running),
    discard: () => undefined,
  });
}

interface FingerStage {
  readonly running: Running;
  readonly under: HTMLElement;
  readonly over: HTMLElement;
  readonly bar: { items: BarItem[] };
  readonly width: number;
  readonly ready: boolean;
  readonly draw: (bar: { items: BarItem[] }, takeOver: () => Promise<void>) => Promise<void>;
  readonly handOver: () => void;
  readonly discard: () => void;
}

function followingFinger(
  stage: PageTransitions,
  view: Window,
  { running, under, over, bar, width, draw, handOver, discard, ...start }: FingerStage,
): SwipePreview {
  const dim = under.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__dim`);
  let progress = 0;
  let offset = 0;
  let ready = start.ready;
  let shown = 0;
  let presented = 0;
  let presentedStep = 0;
  let stepAtMost = 0;
  let closedIn = false;
  let catchingUp = false;
  let drawnAt = view.performance.now();
  let settling = false;
  let presenting = false;
  const present = (): void => {
    presentedStep = shown - presented;
    presented = shown;
  };
  const place = (at: number, drawn = true): void => {
    shown = at;
    if (drawn) {
      present();
    } else if (!presenting) {
      presenting = true;
      view.requestAnimationFrame(() => {
        presenting = false;
        present();
      });
    }
    follow();
  };
  const follow = (): void => {
    progress = shown / width;
    over.style.transform = `translateX(${shown}px)`;
    under.style.transform = parallaxAt(progress);
    if (dim !== null) {
      dim.style.opacity = String(1 - progress);
    }
    followBar(bar.items, progress);
  };
  const takeOver = async (): Promise<void> => {
    followBar(bar.items, progress);
    await photosDrawn(under, FRAME_LATE_MS);
    if (stage.running !== running) {
      return;
    }
    ready = true;
    const watchFrames = (now: number): void => {
      drawnAt = now;
      if (!settling && stage.running === running) {
        view.requestAnimationFrame(watchFrames);
      }
    };
    view.requestAnimationFrame(watchFrames);
    catchingUp = true;
    stepAtMost = Math.max(0, offset - shown) / CLOSE_IN_FRAMES_AT_LEAST;
    closeInOnFinger(view, stage.durationOf('--duration-fast'), {
      frameMs: measuredFrameMs(stage),
      finger: () => offset,
      from: shown,
      show: (at, drawn) => {
        closedIn ||= drawn;
        place(at, drawn);
      },
      goesOn: () => catchingUp && stage.running === running,
      caughtUp: () => (catchingUp = false),
    });
  };
  const drawn = draw(bar, takeOver);
  const settle = async (wanted: SwipeSettle): Promise<boolean> => {
    catchingUp = false;
    settling = true;
    if (stage.running !== running) {
      return false;
    }
    if (!ready) {
      await drawn;
      catchingUp = false;
    }
    if (!ready) {
      discard();
      if (stage.running === running) {
        stage.finish();
      }
      return false;
    }
    if (stepAtMost > 0 && shown !== presented) {
      shown = presented;
      follow();
    }
    const lags = shown !== wanted.from && stepAtMost > 0;
    const end = lags ? settleFrom(wanted, shown, width) : wanted;
    await (lags || (closedIn && stepAtMost > 0)
      ? (closedIn ? Promise.resolve() : afterTwoDrawnFrames()).then(() =>
          trackSettle(view, {
            plan: end,
            finger: wanted,
            frameMs: measuredFrameMs(stage),
            firstStepAtMost: Math.max(Math.sign(end.to - shown) * presentedStep, stepAtMost),
            drawnAt,
            afterFreezeStepAtMost: Math.abs(wanted.from - presented) / CLOSE_IN_FRAMES_AT_LEAST,
            show: place,
            goesOn: () => stage.running === running,
          }),
        )
      : slide(end));
    await drawn;
    if (!end.completes) {
      discard();
    }
    if (stage.running !== running) {
      return false;
    }
    if (end.completes) {
      running.stepped = true;
      handOver();
      stage.finishAfter(view, PAGE_COVER_LONGEST_MS);
    } else {
      stage.finish();
    }
    return end.completes;
  };
  const afterTwoDrawnFrames = (): Promise<void> =>
    new Promise<void>((drawn) => afterDrawnFrames(view, stage.document, 2, drawn));
  const slide = async (end: SwipeSettle): Promise<void> => {
    const timing: KeyframeAnimationOptions = {
      duration: end.durationMs,
      easing: end.easing,
      fill: 'forwards',
    };
    const motions = [
      over.animate([{ transform: `translateX(${end.to}px)` }], timing),
      under.animate([{ transform: end.completes ? 'none' : parallaxAt(0) }], timing),
      ...(dim === null ? [] : [dim.animate([{ opacity: end.completes ? 0 : 1 }], timing)]),
      ...barMotions(bar.items, end.completes ? 1 : 0, timing),
    ];
    motions.forEach((motion) => motion.pause());
    await afterTwoDrawnFrames();
    motions.forEach((motion) => motion.play());
    publishSteadyFrame(view, stage.steadyFrameMs());
    await Promise.race([
      Promise.allSettled(motions.map((motion) => motion.finished)),
      new Promise((done) =>
        view.requestAnimationFrame(() => view.setTimeout(done, end.durationMs + 2 * FRAME_LATE_MS)),
      ),
      new Promise((done) => view.setTimeout(done, PAGE_TRANSITION_LONGEST_MS)),
    ]);
  };
  return {
    follow: (to) => {
      offset = Math.min(width, Math.max(0, to));
      if (ready && !catchingUp) {
        place(offset, false);
      }
    },
    settle,
    slideBack: async () => {
      await settle({
        completes: false,
        from: offset,
        to: 0,
        durationMs: stage.durationOf('--duration-page'),
        easing: 'ease-out',
      });
    },
  };
}

async function drawUnder(
  stage: PageTransitions,
  path: string,
  running: Running,
  arriving: PlacedPage,
  drawnUnder: (into: PlacedPage) => Promise<void>,
): Promise<void> {
  let takenOver: Promise<void> = Promise.resolve();
  await withoutFocus(stage.document, stage.layer(), async () => {
    await stage.preview.visit(path, () => {
      const layer = stage.layer();
      const scroller = arriving.box.querySelector<HTMLElement>(
        `.${PAGE_TRANSITION_CLASS}__scroller`,
      );
      const drawn = layer === null ? null : stage.shown(layer);
      if (drawn?.copy == null || scroller === null || stage.running !== running) {
        return;
      }
      scroller.replaceChildren(drawn.copy);
      scroller.scrollTop = drawn.scrollY;
      scroller.style.backgroundColor = drawn.ground;
      takenOver = drawnUnder({ box: arriving.box, copy: drawn.copy, scrollY: drawn.scrollY });
    });
    await untilRouterRests(stage.router, PAGE_COVER_LONGEST_MS);
  });
  await takenOver;
}

function barOpacity(curve: BarCurve, progress: number): string {
  switch (curve) {
    case 'out':
      return String(1 - progress);
    case 'out-early':
      return String(Math.max(0, 1 - 2 * progress));
    case 'in':
      return String(progress);
    default:
      return '';
  }
}

function followBar(bar: BarItem[], progress: number): void {
  bar.forEach((item) => (item.element.style.opacity = barOpacity(item.curve, progress)));
}

function barMotions(
  bar: BarItem[],
  progress: number,
  timing: KeyframeAnimationOptions,
): Animation[] {
  return bar
    .filter((item) => item.curve !== 'still')
    .map((item) =>
      item.element.animate([{ opacity: Number(barOpacity(item.curve, progress)) }], timing),
    );
}

function parallaxAt(progress: number): string {
  return `translateX(calc(var(--page-parallax) * ${1 - progress}))`;
}
