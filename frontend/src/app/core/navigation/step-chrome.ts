import { ActivatedRouteSnapshot } from '@angular/router';
import {
  BarCurve,
  BarItem,
  DISPLAY_FRAME_MS,
  FollowedTitle,
  FRAME_LATE_MS,
  HELD_WITHOUT_A_FRAME_MS,
  IN_SHEET_CLASS,
  MOVING_CLASS,
  ON_GROUND_CLASS,
  PAGE_TRANSITION_CLASS,
  PageTransitions,
  PlacedPage,
  StepChrome,
} from './page-transitions';

const PLACED_WITHIN_FRAMES = 9;
const FIRST_OPENING_PLACED_WITHIN_FRAMES = 18;
const FRAMES_TO_PLACE = 2;
const LONG_TASK_MS = 50;
const LOOKS = ['background-color', 'color', 'border-color', 'backdrop-filter', 'opacity'];
const BAR_ITEMS = ['.back-button', '.account-button'];
const GROUND_CHANGES_CLASS = `${PAGE_TRANSITION_CLASS}--ground-changes`;
const HOME_SCREEN_CLASS = `${PAGE_TRANSITION_CLASS}--home-screen`;
const SHEET_LOOKS = '.dialog--sheet, app-sheet-head';
const TITLES_FOLLOW_CLASS = `${PAGE_TRANSITION_CLASS}--titles-follow`;
const TITLE_CLASS = `${PAGE_TRANSITION_CLASS}__title`;
const TITLE_TEXT_CLASS = `${PAGE_TRANSITION_CLASS}__title-text`;
const SHOWN_EDGE_TITLE = '.edge-title--shown';
const EDGE_TITLE_TEXT = '.edge-title-text';
const TITLE_FADE_AT = '--page-title-fade-at';
const TITLE_TRAVEL = '--page-title-travel';

interface StepMeasure {
  readonly over: HTMLElement | null;
  readonly width: number;
  readonly fadeAt: number;
}

export const STEP_CHROME: StepChrome = { dress: dressChrome, readsWaitLeftMs, afterDrawnFrames };

function readsWaitLeftMs(stage: PageTransitions): number {
  const frames = loadedItsCode(stage) ? FIRST_OPENING_PLACED_WITHIN_FRAMES : PLACED_WITHIN_FRAMES;
  const frameMs = Math.min(stage.steadyFrameMs(), DISPLAY_FRAME_MS);
  const now = stage.document.defaultView?.performance.now() ?? 0;
  return stage.tappedAt + (frames - FRAMES_TO_PLACE) * frameMs - now;
}

function loadedItsCode(stage: PageTransitions): boolean {
  let route: ActivatedRouteSnapshot | null = stage.router.routerState.snapshot.root;
  while (route !== null) {
    if (route.routeConfig !== null && stage.loadedRoutes.has(route.routeConfig)) {
      return true;
    }
    route = route.firstChild;
  }
  return false;
}

export function dressChrome(
  stage: PageTransitions,
  overlay: HTMLElement,
  leaving: PlacedPage | null,
  arriving: PlacedPage | null,
): BarItem[] {
  const leavingTabBar = leaving?.copy?.querySelector('app-tab-bar') != null;
  const arrivingTabBar =
    arriving?.copy == null || arriving.copy.querySelector('app-tab-bar') !== null;
  overlay.classList.toggle(
    `${PAGE_TRANSITION_CLASS}--under-tab-bar`,
    leavingTabBar && arrivingTabBar,
  );
  if (arriving !== null) {
    const onGround = isSheet(leaving) && isSheet(arriving);
    overlay.classList.toggle(ON_GROUND_CLASS, onGround);
    overlay.classList.toggle(
      GROUND_CHANGES_CLASS,
      onGround &&
        !overlay.classList.contains(IN_SHEET_CLASS) &&
        leaving !== null &&
        sheetStandsOn(leaving) !== sheetStandsOn(arriving),
    );
  }
  overlay.classList.toggle(HOME_SCREEN_CLASS, fromTheHomeScreen(stage.document.defaultView));
  decideCorners(overlay, leaving, arriving);
  overlay.querySelector(`.${PAGE_TRANSITION_CLASS}__bar`)?.remove();
  const bar = stage.document.createElement('div');
  bar.className = `${PAGE_TRANSITION_CLASS}__bar`;
  overlay.append(bar);
  const titles: FollowedTitle[] = [];
  const heads = stage.sheets?.holdHeads(stage, overlay, bar, leaving, arriving, titles) ?? [];
  const arrivingPart = barPart(stage, bar, arriving);
  const leavingPart = barPart(stage, bar, leaving);
  addTitle(stage, titles, leavingPart?.querySelector<HTMLElement>(SHOWN_EDGE_TITLE), true);
  addTitle(stage, titles, arrivingPart?.querySelector<HTMLElement>(SHOWN_EDGE_TITLE), false);
  followTitles(stage, overlay, titles);
  return [
    ...heads,
    ...BAR_ITEMS.flatMap((selector) => {
      const out = leavingPart?.querySelector<HTMLElement>(selector) ?? null;
      const into = arrivingPart?.querySelector<HTMLElement>(selector) ?? null;
      if (out !== null && into !== null && looksAlike(stage, out, into)) {
        into.remove();
        return [barItem(out, 'still')];
      }
      return [
        ...(out === null ? [] : [barItem(out, into === null ? 'out-early' : 'out')]),
        ...(into === null ? [] : [barItem(into, 'in')]),
      ];
    }),
  ];
}

export function addTitle(
  stage: PageTransitions,
  titles: FollowedTitle[],
  title: HTMLElement | null | undefined,
  leaves: boolean,
  travels = true,
): void {
  if (title == null || !stage.compact()) {
    return;
  }
  if (!travels) {
    title.classList.add(TITLE_CLASS);
    titles.push({ title, text: title, leaves, travels });
    return;
  }
  let text = title.querySelector<HTMLElement>(EDGE_TITLE_TEXT);
  if (text === null) {
    text = stage.document.createElement('span');
    text.append(...Array.from(title.childNodes));
    title.append(text);
  }
  title.classList.add(TITLE_CLASS);
  text.classList.add(TITLE_TEXT_CLASS);
  titles.push({ title, text, leaves, travels });
}

export function barItem(element: HTMLElement, curve: BarCurve): BarItem {
  element.classList.add(`${PAGE_TRANSITION_CLASS}__bar-item--${curve}`);
  return { element, curve };
}

function followTitles(
  stage: PageTransitions,
  overlay: HTMLElement,
  titles: readonly FollowedTitle[],
): void {
  stage.stopTitles();
  const view = stage.document.defaultView;
  overlay.classList.toggle(TITLES_FOLLOW_CLASS, titles.length > 0);
  if (view === null || titles.length === 0) {
    return;
  }
  const pushes = overlay.classList.contains(`${PAGE_TRANSITION_CLASS}--push`);
  titles.forEach((title) => showTitle(title, 0, 0, pushes));
  if (typeof view.requestAnimationFrame !== 'function') {
    return;
  }
  let measured: StepMeasure | null = null;
  const follow = (): void => {
    stage.titleFrame = null;
    if (!overlay.isConnected) {
      return;
    }
    const step = (measured ??= measureStep(overlay, stage.document.documentElement, view));
    const progress = stepProgress(overlay, step, pushes, view);
    titles.forEach((title) => showTitle(title, progress, step.fadeAt, pushes));
    stage.titleFrame = view.requestAnimationFrame(follow);
  };
  stage.titleFrame = view.requestAnimationFrame(follow);
}

function decideCorners(
  overlay: HTMLElement,
  leaving: PlacedPage | null,
  arriving: PlacedPage | null,
): void {
  if (
    overlay.dataset['corners'] === undefined &&
    overlay.querySelector(`.${PAGE_TRANSITION_CLASS}__page--over`) !== null
  ) {
    overlay.dataset['corners'] = String(
      leaving?.copy != null &&
        arriving?.copy != null &&
        !overlay.classList.contains(ON_GROUND_CLASS),
    );
  }
}

function fromTheHomeScreen(view: Window | null): boolean {
  return (
    view !== null &&
    ((view.navigator as Navigator & { readonly standalone?: boolean }).standalone === true ||
      (typeof view.matchMedia === 'function' &&
        view.matchMedia('(display-mode: standalone)').matches))
  );
}

function barPart(
  stage: PageTransitions,
  bar: HTMLElement,
  page: PlacedPage | null,
): HTMLElement | null {
  const header = page?.copy?.querySelector('app-header') ?? null;
  if (page === null || header === null || sheetStandsOn(page)) {
    return null;
  }
  const part = stage.document.createElement('div');
  part.className = `${PAGE_TRANSITION_CLASS}__bar-part`;
  part.style.top = `${-page.scrollY}px`;
  part.append(header.cloneNode(true));
  bar.append(part);
  return part;
}

function isSheet(page: PlacedPage | null): boolean {
  return page?.box.querySelector(SHEET_LOOKS) != null;
}

function sheetStandsOn(page: PlacedPage): boolean {
  return page.box.querySelector(`.${PAGE_TRANSITION_CLASS}__sheet`) !== null;
}

function looksAlike(stage: PageTransitions, first: HTMLElement, second: HTMLElement): boolean {
  const view = stage.document.defaultView;
  if (view === null) {
    return false;
  }
  const one = view.getComputedStyle(first);
  const other = view.getComputedStyle(second);
  const box = first.getBoundingClientRect();
  const otherBox = second.getBoundingClientRect();
  return (
    LOOKS.every(
      (property) => one.getPropertyValue(property) === other.getPropertyValue(property),
    ) &&
    first.textContent === second.textContent &&
    first.querySelector('img')?.getAttribute('src') ===
      second.querySelector('img')?.getAttribute('src') &&
    box.left === otherBox.left &&
    box.top === otherBox.top &&
    box.width === otherBox.width
  );
}

function measureStep(overlay: HTMLElement, root: HTMLElement, view: Window): StepMeasure {
  const over = overlay.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--over`);
  const fadeAt = Number.parseFloat(view.getComputedStyle(root).getPropertyValue(TITLE_FADE_AT));
  return {
    over,
    width: over === null ? view.innerWidth : over.offsetWidth || view.innerWidth,
    fadeAt: Number.isFinite(fadeAt) ? fadeAt : 0,
  };
}

function stepProgress(
  overlay: HTMLElement,
  { over, width }: StepMeasure,
  pushes: boolean,
  view: Window,
): number {
  if (over === null || (pushes && !overlay.classList.contains(MOVING_CLASS))) {
    return 0;
  }
  const transform = view.getComputedStyle(over).transform;
  const Matrix = (view as Window & { DOMMatrixReadOnly?: typeof DOMMatrixReadOnly })
    .DOMMatrixReadOnly;
  const offset =
    typeof Matrix === 'function' && transform !== '' && transform !== 'none'
      ? new Matrix(transform).m41
      : 0;
  const along = width > 0 ? Math.min(1, Math.max(0, offset / width)) : 0;
  return pushes ? 1 - along : along;
}

function showTitle(
  { title, text, leaves, travels }: FollowedTitle,
  progress: number,
  fadeAt: number,
  pushes: boolean,
): void {
  const opacity = leaves ? fadingOut(progress, fadeAt) : fadingIn(progress, fadeAt);
  title.style.opacity = String(opacity);
  if (travels) {
    const travel = (pushes ? -1 : 1) * (leaves ? progress : progress - 1);
    text.style.setProperty(TITLE_TRAVEL, String(travel));
  }
}

function fadingOut(progress: number, fadeAt: number): number {
  if (fadeAt <= 0) {
    return progress > 0 ? 0 : 1;
  }
  return Math.min(1, Math.max(0, 1 - progress / fadeAt));
}

function fadingIn(progress: number, fadeAt: number): number {
  if (fadeAt <= 0) {
    return progress > 0 ? 1 : 0;
  }
  if (fadeAt >= 1) {
    return progress >= 1 ? 1 : 0;
  }
  return Math.min(1, Math.max(0, (progress - fadeAt) / (1 - fadeAt)));
}

export function afterDrawnFrames(
  view: Window,
  document: Document,
  frames: number,
  then: () => void,
  mayEndByClock: () => boolean = () => false,
  goesOn: () => boolean = () => true,
): void {
  if (frames <= 0) {
    then();
    return;
  }
  const startedAt = view.performance.now();
  let armedAt = startedAt;
  let looked = 0;
  let done = false;
  let byClock = 0;
  const goOn = (drawn: boolean): void => {
    if (done) {
      return;
    }
    done = true;
    view.clearTimeout(byClock);
    if (!goesOn()) {
      return;
    }
    if (drawn) {
      afterDrawnFrames(view, document, frames - 1, then, () => false, goesOn);
    } else {
      then();
    }
  };
  const look = (): void => {
    if (!goesOn()) {
      done = true;
      return;
    }
    const now = view.performance.now();
    looked += FRAME_LATE_MS;
    const ranOnTime = now - armedAt <= FRAME_LATE_MS + LONG_TASK_MS;
    const waitedMs = Math.max(looked, now - startedAt);
    if (
      (document.visibilityState === 'hidden' && waitedMs >= HELD_WITHOUT_A_FRAME_MS) ||
      (ranOnTime && mayEndByClock())
    ) {
      goOn(false);
      return;
    }
    armedAt = now;
    byClock = view.setTimeout(look, FRAME_LATE_MS);
  };
  byClock = view.setTimeout(look, FRAME_LATE_MS);
  view.requestAnimationFrame(() => goOn(true));
}
