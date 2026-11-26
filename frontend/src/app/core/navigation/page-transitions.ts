import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  computed,
  DestroyRef,
  effect,
  EnvironmentProviders,
  inject,
  Injectable,
  Injector,
  provideAppInitializer,
  signal,
  untracked,
} from '@angular/core';
import {
  Event as RouterEvent,
  GuardsCheckEnd,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Route,
  RouteConfigLoadStart,
  Router,
  Scroll,
} from '@angular/router';
import { CompactLayout } from '../layout/compact-layout';
import { APP_DEPTH_KEY, BACK_NAVIGATION, BackDestination, BackTarget } from './back-target';
import { SwipeSettle } from './back-swipe';
import { NavigationFacts, PageTransitionKind } from './page-transition-kind';
import { RouteChrome } from './route-chrome';
import { DirtyForms } from '../updates/dirty-forms';
import { NavigationPreview } from './navigation-preview';
import { PagePlacement } from './page-placement';
import { stillCopyOf } from './still-copy';
import { steadyFrameMs } from './frame-pace';

export const PAGE_LAYER_CLASS = 'page-layer';
export const PAGE_TRANSITION_CLASS = 'page-transition';
export const PAGE_TRANSITION_LONGEST_MS = 2000;
export const PAGE_COVER_LONGEST_MS = 5000;
export const KEPT_PAGES = 3;
export const FRAME_LATE_MS = 100;
export const SECTION_READS_WITHIN_MS = 150;
export const FIRST_SECTION_READS_WITHIN_MS = 300;
export const HELD_WITHOUT_A_FRAME_MS = PAGE_TRANSITION_LONGEST_MS / 4;
export type PlacingKind = 'raf' | 'resize-observer' | 'task';
const SWIPE_HANDED_OVER_AFTER_FRAMES = 2;
export const DISPLAY_FRAME_MS = 1000 / 60;
const PRESS_LEADS_WITHIN_MS = 1000;
export const ACCOUNT_RETURNS_KEY = 'nfnnAppAccount';

export const LESS_MOTION = '(prefers-reduced-motion: reduce)';
const PACE_SAMPLED_ON = ['pointerdown', 'touchstart', 'keydown'];
export const SHOWN_DIALOG = 'dialog[open], dialog.dialog--leaving';
export const STANDING_DIALOG = 'dialog[open]:not(.dialog--leaving)';
export const STACKED_DIALOG_CLASS = 'dialog--stacked';
const DRAWN_DIALOG = `${STANDING_DIALOG}:not(.${STACKED_DIALOG_CLASS})`;
const SHEET_UNDER_CLASS = `${PAGE_TRANSITION_CLASS}-sheet-under`;
export const ON_GROUND_CLASS = `${PAGE_TRANSITION_CLASS}--on-ground`;
export const IN_SHEET_CLASS = `${PAGE_TRANSITION_CLASS}--in-sheet`;
export const SHEET_PANEL = '.dialog-panel';
export const PANEL_SCROLL = 'panelScroll';
export const MOVING_CLASS = `${PAGE_TRANSITION_CLASS}--moving`;

export interface Running {
  readonly kind: PageTransitionKind;
  readonly overlay: HTMLElement;
  readonly swiping: boolean;
  readonly sheet: HTMLElement | null;
  readonly fromSheet?: boolean;
  revealed: boolean;
  stepped?: boolean;
  still?: boolean;
}

export interface KeptPage {
  readonly copy: HTMLElement | null;
  readonly scrollY: number;
  readonly ground: string;
  readonly width: number;
  readonly sheet?: HTMLElement | null;
}

export interface PlacedPage {
  readonly box: HTMLElement;
  readonly copy: HTMLElement | null;
  readonly scrollY: number;
}

export interface SheetStep {
  readonly kind: PageTransitionKind;
  readonly depth: number;
  readonly owner: object;
  readonly change: () => void;
  readonly placed: () => void;
}

export interface KeptSheet {
  readonly sheet: HTMLElement;
  readonly width: number;
  readonly owner: object;
}

export interface FollowedTitle {
  readonly title: HTMLElement;
  readonly text: HTMLElement;
  readonly leaves: boolean;
  readonly travels: boolean;
}

export type BarCurve = 'still' | 'out' | 'out-early' | 'in';

export interface BarItem {
  readonly element: HTMLElement;
  readonly curve: BarCurve;
}

type SwipeDrawing = typeof import('./swipe-drawing');

export interface StepChrome {
  dress(
    stage: PageTransitions,
    overlay: HTMLElement,
    leaving: PlacedPage | null,
    arriving: PlacedPage | null,
  ): BarItem[];
  readsWaitLeftMs(stage: PageTransitions): number;
  samplePace(stage: PageTransitions): void;
  hold(view: Window, overlay: HTMLElement, kind: PlacingKind): void;
  release(view: Window, overlay: HTMLElement, steadyBeforeMs: number): void;
  cover(stage: PageTransitions, event: GuardsCheckEnd): void;
  afterDrawnFrames(
    view: Window,
    document: Document,
    frames: number,
    then: () => void,
    mayEndByClock?: () => boolean,
    goesOn?: () => boolean,
  ): void;
  moveOnceAnswered(stage: PageTransitions, running: Running, view: Window): void;
  moveTo(
    stage: PageTransitions,
    running: Running,
    view: Window,
    arriving: KeptPage,
    kind: PlacingKind,
  ): void;
  whenSectionDrawn(stage: PageTransitions, view: Window, then: () => void): void;
}

export interface SheetLooks {
  stepInSheet(stage: PageTransitions, step: SheetStep): void;
  standingSheetCopy(stage: PageTransitions): HTMLElement | null;
  holdHeads(
    stage: PageTransitions,
    overlay: HTMLElement,
    bar: HTMLElement,
    leaving: PlacedPage | null,
    arriving: PlacedPage | null,
    titles: FollowedTitle[],
  ): BarItem[];
}

export interface SwipePreview {
  follow(offset: number): void;
  settle(settle: SwipeSettle): Promise<boolean>;
  slideBack(): Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class PageTransitions {
  readonly document = inject(DOCUMENT);
  readonly router = inject(Router);
  readonly chrome = inject(RouteChrome).current;
  readonly compact = inject(CompactLayout).isCompact;
  readonly backTarget = inject(BackTarget);
  readonly preview = inject(NavigationPreview);
  readonly dirtyForms = inject(DirtyForms);
  readonly placement = inject(PagePlacement);
  readonly injector = inject(Injector);
  drawing: SwipeDrawing | null = null;
  sheets: SheetLooks | null = null;
  private stepChrome: StepChrome | null = null;
  private readonly lent: (() => void)[] = [];
  readonly kept = new Map<number, KeptPage>();
  readonly keptSheets = new Map<number, KeptSheet>();
  handingOver = false;
  sheetHandOver: Running | null = null;
  trigger: NavigationFacts['trigger'] = 'imperative';
  restoredDepth: number | null = null;
  standingSheet: HTMLElement | null = null;
  closesWhenCovered: (() => void) | null = null;
  closingSheet: HTMLDialogElement | null = null;
  private readonly step = signal<Running | null>(null);
  readonly stepping = computed(() => this.step() !== null);
  finishing: number | null = null;
  titleFrame: number | null = null;
  readonly frameGaps: number[] = [];
  samplingRound = 0;
  private pressedAt = Number.NEGATIVE_INFINITY;
  tappedAt = 0;
  readonly loadedRoutes = new Set<Route>();
  drawnSincePress = true;

  get dressing(): StepChrome | null {
    return this.stepChrome;
  }

  set dressing(chrome: StepChrome | null) {
    this.stepChrome = chrome;
    this.sampleFramePace();
  }

  get running(): Running | null {
    return untracked(this.step);
  }

  set running(running: Running | null) {
    this.step.set(running);
  }

  constructor() {
    effect(() => {
      if (!this.compact()) {
        untracked(() => {
          if (this.running !== null) {
            this.finish();
          }
        });
      }
    });
    const events = this.router.events.subscribe((event) => this.follow(event));
    const hidden = (): void => this.endWhenHidden();
    const sample = (event: Event): void => {
      this.pressedAt = event.timeStamp;
      this.drawnSincePress = event.type === 'keydown';
      this.document.defaultView?.requestAnimationFrame?.(() => (this.drawnSincePress = true));
      this.sampleFramePace();
    };
    this.document.addEventListener('visibilitychange', hidden);
    PACE_SAMPLED_ON.forEach((type) =>
      this.document.addEventListener(type, sample, { capture: true, passive: true }),
    );
    inject(DestroyRef).onDestroy(() => {
      events.unsubscribe();
      this.document.removeEventListener('visibilitychange', hidden);
      PACE_SAMPLED_ON.forEach((type) =>
        this.document.removeEventListener(type, sample, { capture: true }),
      );
      this.finish();
    });
  }

  private endWhenHidden(): void {
    if (this.document.visibilityState === 'hidden' && this.running?.swiping === false) {
      this.finish();
    }
  }

  private follow(event: RouterEvent): void {
    if (this.preview.drives()) {
      return;
    }
    if (event instanceof NavigationStart) {
      const now = this.now();
      const sincePress = now - this.pressedAt;
      this.tappedAt = sincePress >= 0 && sincePress <= PRESS_LEADS_WITHIN_MS ? this.pressedAt : now;
      this.loadedRoutes.clear();
      const stepsBack =
        event.navigationTrigger === 'popstate' ||
        untracked(this.router.currentNavigation)?.extras.info === BACK_NAVIGATION;
      if (this.handingOver && stepsBack) {
        this.handingOver = false;
      } else {
        this.finish();
      }
      this.trigger = event.navigationTrigger ?? 'imperative';
      this.restoredDepth =
        event.navigationTrigger === 'popstate' ? depthIn(event.restoredState) : null;
      this.standingSheet = this.standingSheetCopy();
    } else if (event instanceof RouteConfigLoadStart) {
      this.loadedRoutes.add(event.route);
    } else if (event instanceof GuardsCheckEnd && event.shouldActivate) {
      this.dressing?.cover(this, event);
      this.closeCoveredSheet();
    } else if (event instanceof Scroll) {
      this.reveal();
    } else if (event instanceof NavigationEnd) {
      this.closeCoveredSheet();
      this.revealIfNoScrollFollows();
    } else if (
      event instanceof NavigationCancel ||
      event instanceof NavigationError ||
      event instanceof NavigationSkipped
    ) {
      this.closeCoveredSheet();
      this.finish();
    }
  }

  closeCoveredSheet(): void {
    const close = this.closesWhenCovered;
    this.closesWhenCovered = null;
    this.closingSheet = null;
    close?.();
  }

  followsFinger(): boolean {
    const view = this.document.defaultView;
    return view !== null && motionAllowed(view);
  }

  stepsBySwipe(): boolean {
    return (
      this.compact() ||
      (this.drawing?.pushHere(this.layer(), this.router.url, this.chrome().parent) ?? false)
    );
  }

  startSwipe(destination: BackDestination): SwipePreview | null {
    return this.drawing?.startSwipe(this, destination) ?? null;
  }

  stepInSheet(step: SheetStep): void {
    if (this.sheets === null) {
      step.change();
      this.afterRender(step.placed);
      return;
    }
    this.sheets.stepInSheet(this, step);
  }

  standingSheetCopy(): HTMLElement | null {
    return this.sheets?.standingSheetCopy(this) ?? null;
  }

  forgetSheetsOf(owner: object): void {
    for (const [depth, kept] of [...this.keptSheets]) {
      if (kept.owner === owner) {
        this.keptSheets.delete(depth);
      }
    }
  }

  countSectionReads(): void {
    this.placement.countReadsFromHere();
  }

  whenSectionDrawn(view: Window, then: () => void): void {
    if (this.dressing === null) {
      this.placement.stopCountingReads();
      then();
      return;
    }
    this.dressing.whenSectionDrawn(this, view, then);
  }

  afterRender(then: () => void): void {
    afterNextRender(then, { injector: this.injector });
  }

  loadDrawing(): Promise<SwipeDrawing> {
    return import('./swipe-drawing').then((drawing) => (this.drawing = drawing));
  }

  sheetUnder(sheet: HTMLElement | null): void {
    this.document.documentElement.classList.toggle(SHEET_UNDER_CLASS, sheet !== null);
    if (sheet !== null) {
      void this.loadDrawing();
    }
  }

  private revealIfNoScrollFollows(): void {
    const view = this.document.defaultView;
    const running = this.running;
    if (running !== null && view !== null) {
      view.setTimeout(() => {
        if (this.running === running) {
          this.reveal();
        }
      }, PAGE_TRANSITION_LONGEST_MS / 4);
    }
  }

  private reveal(): void {
    const running = this.running;
    const view = this.document.defaultView;
    if (running === null || running.revealed || view === null) {
      return;
    }
    running.revealed = true;
    if (running.swiping) {
      afterFrames(view, SWIPE_HANDED_OVER_AFTER_FRAMES, () => {
        if (this.running === running) {
          this.finish();
        }
      });
      return;
    }
    void this.placement.placed(view, this.durationOf('--duration-page')).then(() => {
      const chrome = this.dressing;
      if (chrome === null) {
        this.finish();
      } else {
        chrome.moveOnceAnswered(this, running, view);
      }
    });
  }

  moveTo(running: Running, view: Window, arriving: KeptPage, kind: PlacingKind = 'task'): void {
    if (this.dressing === null) {
      this.finish();
      return;
    }
    this.dressing.moveTo(this, running, view, arriving, kind);
  }

  private now(): number {
    return this.document.defaultView?.performance.now() ?? 0;
  }

  steadyFrameMs(): number {
    return steadyFrameMs(this.frameGaps);
  }

  private sampleFramePace(): void {
    this.dressing?.samplePace(this);
  }

  finishAfter(view: Window, ms: number): void {
    if (this.finishing !== null) {
      view.clearTimeout(this.finishing);
    }
    this.finishing = view.setTimeout(() => this.finish(), ms);
  }

  finishWhenStill(running: Running, page: HTMLElement, view: Window): () => void {
    this.finishAfter(view, PAGE_TRANSITION_LONGEST_MS);
    view.getComputedStyle(page).getPropertyValue('animation-name');
    const motions = typeof page.getAnimations === 'function' ? page.getAnimations() : [];
    const still = (): void => {
      if (this.running !== running || running.still) {
        return;
      }
      running.still = true;
      this.finish();
    };
    void Promise.allSettled(motions.map((motion) => motion.finished)).then(still);
    return still;
  }

  overlay(kind: PageTransitionKind): HTMLElement {
    const overlay = this.document.createElement('div');
    overlay.className = `${PAGE_TRANSITION_CLASS} ${PAGE_TRANSITION_CLASS}--${kind}`;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    this.document.body.append(overlay);
    return overlay;
  }

  keep(layer: HTMLElement): KeptPage {
    const view = this.document.defaultView;
    return {
      copy: stillCopyOf(layer),
      scrollY: view?.scrollY ?? 0,
      ground: this.groundColour(),
      width: view?.innerWidth ?? 0,
    };
  }

  placeholder(): KeptPage {
    return {
      copy: null,
      scrollY: 0,
      ground: this.groundColour(),
      width: this.document.defaultView?.innerWidth ?? 0,
    };
  }

  keptAt(depth: number, view: Window): KeptPage | null {
    const kept = this.kept.get(depth);
    return kept !== undefined && kept.width === view.innerWidth ? kept : null;
  }

  place(overlay: HTMLElement, kept: KeptPage, position: 'under' | 'over'): PlacedPage {
    const placed = this.put(overlay, kept, position);
    placed.scroll();
    return placed.page;
  }

  private put(
    overlay: HTMLElement,
    kept: KeptPage,
    position: 'under' | 'over',
  ): { readonly page: PlacedPage; readonly scroll: () => void } {
    const page = this.document.createElement('div');
    page.className = `${PAGE_TRANSITION_CLASS}__page ${PAGE_TRANSITION_CLASS}__page--${position}`;
    page.style.backgroundColor = kept.ground;
    const scroller = this.document.createElement('div');
    scroller.className = `${PAGE_TRANSITION_CLASS}__scroller`;
    const copy = kept.copy;
    if (copy !== null) {
      scroller.append(copy);
    }
    page.append(scroller);
    const sheet = kept.sheet == null ? null : (kept.sheet.cloneNode(true) as HTMLElement);
    if (sheet !== null) {
      page.append(sheet);
    }
    if (position === 'under') {
      const dim = this.document.createElement('div');
      dim.className = `${PAGE_TRANSITION_CLASS}__dim`;
      page.append(dim);
      overlay.prepend(page);
    } else {
      overlay.append(page);
    }
    const panel = sheet?.querySelector<HTMLElement>(SHEET_PANEL);
    return {
      page: { box: page, copy, scrollY: kept.scrollY },
      scroll: () => {
        scroller.scrollTop = kept.scrollY;
        if (panel != null) {
          panel.scrollTop = Number(sheet?.dataset[PANEL_SCROLL] ?? 0);
        }
      },
    };
  }

  placedPage(overlay: HTMLElement, position: 'under' | 'over'): PlacedPage | null {
    const box = overlay.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--${position}`);
    if (box === null) {
      return null;
    }
    const scroller = box.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__scroller`);
    return {
      box,
      copy: (scroller?.firstElementChild as HTMLElement | null) ?? null,
      scrollY: scroller?.scrollTop ?? 0,
    };
  }

  dressChrome(
    overlay: HTMLElement,
    leaving: PlacedPage | null,
    arriving: PlacedPage | null,
  ): BarItem[] {
    return this.dressing?.dress(this, overlay, leaving, arriving) ?? [];
  }

  stopTitles(): void {
    if (this.titleFrame !== null) {
      this.document.defaultView?.cancelAnimationFrame(this.titleFrame);
      this.titleFrame = null;
    }
  }

  shown(layer: HTMLElement): KeptPage {
    const kept = this.keep(layer);
    const giveBack = this.drawing?.lendPhotos(layer, kept.copy);
    if (giveBack !== undefined) {
      this.lent.push(giveBack);
    }
    return kept;
  }

  durationOf(name: string): number {
    const view = this.document.defaultView;
    const token = view?.getComputedStyle(this.document.documentElement).getPropertyValue(name);
    const value = Number.parseFloat(token ?? '');
    if (!Number.isFinite(value)) {
      return 0;
    }
    return token?.trim().endsWith('ms') === true ? value : value * 1000;
  }

  private groundColour(): string {
    const view = this.document.defaultView;
    const body = view?.getComputedStyle(this.document.body).backgroundColor ?? '';
    if (body !== '' && body !== 'transparent' && body !== 'rgba(0, 0, 0, 0)') {
      return body;
    }
    return view?.getComputedStyle(this.document.documentElement).backgroundColor ?? '';
  }

  layer(): HTMLElement | null {
    return this.document.querySelector<HTMLElement>(`.${PAGE_LAYER_CLASS}`);
  }

  finish(): void {
    const view = this.document.defaultView;
    if (this.finishing !== null) {
      view?.clearTimeout(this.finishing);
      this.finishing = null;
    }
    this.stopTitles();
    this.lent.splice(0).forEach((giveBack) => giveBack());
    if (this.running?.stepped) {
      this.drawing?.standAtOnce([this.layer() ?? this.document.body]);
    }
    const ran = this.running !== null;
    this.running?.overlay.remove();
    this.running = null;
    this.handingOver = false;
    this.sheetHandOver = null;
    const root = this.document.documentElement;
    if (root.classList.contains(SHEET_UNDER_CLASS)) {
      root.classList.remove(SHEET_UNDER_CLASS);
      this.drawing?.standAtOnce(this.document.querySelectorAll(DRAWN_DIALOG));
    }
    if (ran) {
      this.sampleFramePace();
    }
  }
}

export function liveDialogs(document: Document, selector: string): HTMLDialogElement[] {
  return Array.from(document.querySelectorAll<HTMLDialogElement>(selector)).filter(
    (dialog) => dialog.closest(`.${PAGE_TRANSITION_CLASS}`) === null,
  );
}

export function motionAllowed(view: Window): boolean {
  return view.matchMedia?.(LESS_MOTION).matches === false;
}

export function depthIn(state: unknown): number {
  const depth =
    typeof state === 'object' && state !== null
      ? (state as Record<string, unknown>)[APP_DEPTH_KEY]
      : undefined;
  return typeof depth === 'number' ? depth : 0;
}

export function nextFrame(view: Window, then: (now: number, drawn: boolean) => void): void {
  let done = false;
  const once = (now: number, drawn: boolean): void => {
    if (!done) {
      done = true;
      view.clearTimeout(late);
      then(now, drawn);
    }
  };
  const late = view.setTimeout(() => once(view.performance.now(), false), FRAME_LATE_MS);
  view.requestAnimationFrame((now) => once(now, true));
}

function afterFrames(view: Window, frames: number, then: () => void): void {
  if (frames === 0) {
    then();
    return;
  }
  nextFrame(view, () => afterFrames(view, frames - 1, then));
}

export const pageTransitionsAtStart: EnvironmentProviders = provideAppInitializer(
  () => void inject(PageTransitions),
);
