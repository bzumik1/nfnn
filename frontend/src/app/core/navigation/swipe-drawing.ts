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
import { SwipeSettle } from './back-swipe';
import {
  BarCurve,
  BarItem,
  FRAME_LATE_MS,
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

const SECTION_LINKS = 'nav a[href]';
const NOT_COPIED = 'iframe, video, audio, object, embed, dialog';
const HEADER = 'app-header .app-header';
const SIDE_NAVIGATION = '.side-nav-panel';
const TAB_BAR = 'app-tab-bar .tab-bar';
const STANDING_PARTS = 'app-header, .side-nav-panel, app-tab-bar';
const CATCH_UP_SPANS = 3;
const FRAME_MS = 16;

export interface CatchUp {
  readonly finger: () => number;
  readonly from: number;
  readonly show: (offset: number) => void;
  readonly goesOn: () => boolean;
  readonly caughtUp: () => void;
}

export function closeInOnFinger(view: Window, fastMs: number, catchUp: CatchUp): void {
  const closing = Math.max(1, fastMs / CATCH_UP_SPANS);
  let last: number | null = null;
  let gap = catchUp.finger() - catchUp.from;
  const closeIn = (now: number): void => {
    if (!catchUp.goesOn()) {
      return;
    }
    const elapsed = last === null ? FRAME_MS : Math.max(0, now - last);
    last = now;
    gap *= Math.exp(-elapsed / closing);
    if (Math.abs(gap) < 1) {
      gap = 0;
    }
    catchUp.show(catchUp.finger() - gap);
    if (gap === 0) {
      catchUp.caughtUp();
    } else {
      nextFrame(view, closeIn);
    }
  };
  nextFrame(view, closeIn);
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
      overlay
        .querySelectorAll<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--over`)
        .forEach((page) => (page.style.borderRadius = '0'));
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
    stage.document.querySelector(SHOWN_DIALOG) !== null
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
  const bar = { items: dress(arriving) };
  const under = arriving.box;
  const over = leaving.box;
  const dim = under.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__dim`);
  const sheet = behind?.sheet ?? null;
  const running: Running = { kind: 'pop', overlay, swiping: true, sheet, revealed: false };
  stage.running = running;
  stage.sheetUnder(sheet);
  const width = Math.max(1, content?.width ?? view.innerWidth);
  let progress = 0;
  let offset = 0;
  let ready = behind !== null;
  let shown = 0;
  let catchingUp = false;
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
    await photosDrawn(under, FRAME_LATE_MS);
    if (stage.running !== running) {
      return;
    }
    ready = true;
    catchingUp = true;
    closeInOnFinger(view, stage.durationOf('--duration-fast'), {
      finger: () => offset,
      from: shown,
      show: (at) => {
        shown = at;
        follow();
      },
      goesOn: () => catchingUp && stage.running === running,
      caughtUp: () => (catchingUp = false),
    });
  };
  const drawn =
    behind === null && destination.path !== null && !stage.dirtyForms.any()
      ? drawUnder(stage, destination.path, running, arriving, (into) => {
          bar.items = dress(into);
          followBar(bar.items, progress);
          return takeOver();
        })
      : photosDrawn(under, FRAME_LATE_MS);
  const settle = async (end: SwipeSettle): Promise<boolean> => {
    catchingUp = false;
    if (stage.running !== running) {
      return false;
    }
    if (!ready) {
      await drawn;
    }
    if (!ready) {
      stage.preview.discard();
      if (stage.running === running) {
        stage.finish();
      }
      return false;
    }
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
    await Promise.race([
      Promise.allSettled(motions.map((motion) => motion.finished)),
      new Promise((done) => view.setTimeout(done, PAGE_TRANSITION_LONGEST_MS)),
    ]);
    await drawn;
    if (!end.completes) {
      stage.preview.discard();
    }
    if (stage.running !== running) {
      return false;
    }
    if (end.completes) {
      running.stepped = true;
      stage.handingOver = true;
      stage.finishing = view.setTimeout(() => stage.finish(), PAGE_COVER_LONGEST_MS);
    } else {
      stage.finish();
    }
    return end.completes;
  };
  return {
    follow: (to) => {
      offset = Math.min(width, Math.max(0, to));
      if (ready && !catchingUp) {
        shown = offset;
        follow();
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
