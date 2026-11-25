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
  ActivatedRouteSnapshot,
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
import { NavigationFacts, PageTransitionKind, pageTransitionFor } from './page-transition-kind';
import { tabOf } from './app-tabs';
import { chromeOf, RouteChrome } from './route-chrome';
import { DirtyForms } from '../updates/dirty-forms';
import { NavigationPreview } from './navigation-preview';
import { PagePlacement } from './page-placement';
import { stillCopyOf } from './still-copy';
import { STEADY_FRAME_MARK, STEADY_FRAMES_KEPT, steadyFrameMs } from './frame-pace';

export const PAGE_LAYER_CLASS = 'page-layer';
export const PAGE_TRANSITION_CLASS = 'page-transition';
export const PAGE_TRANSITION_LONGEST_MS = 2000;
export const PAGE_COVER_LONGEST_MS = 5000;
export const KEPT_PAGES = 3;
export const FRAME_LATE_MS = 100;
export const HELD_WITHOUT_A_FRAME_MS = PAGE_TRANSITION_LONGEST_MS / 4;
const SWIPE_HANDED_OVER_AFTER_FRAMES = 2;
const PLACED_WITHIN_FRAMES = 9;
const FIRST_OPENING_PLACED_WITHIN_FRAMES = 18;
const FRAMES_TO_PLACE = 2;
export const DISPLAY_FRAME_MS = 1000 / 60;
const PRESS_LEADS_WITHIN_MS = 1000;
export const ACCOUNT_RETURNS_KEY = 'nfnnAppAccount';

const LESS_MOTION = '(prefers-reduced-motion: reduce)';
const PACE_SAMPLED_ON = ['pointerdown', 'touchstart', 'keydown'];
export const SHOWN_DIALOG = 'dialog[open], dialog.dialog--leaving';
export const STANDING_DIALOG = 'dialog[open]:not(.dialog--leaving)';
export const STACKED_DIALOG_CLASS = 'dialog--stacked';
const DRAWN_DIALOG = `${STANDING_DIALOG}:not(.${STACKED_DIALOG_CLASS})`;
const SHEET_UNDER_CLASS = `${PAGE_TRANSITION_CLASS}-sheet-under`;
const HELD_CLASS = `${PAGE_TRANSITION_CLASS}--held`;
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
  revealed: boolean;
  stepped?: boolean;
  ahead?: boolean;
  arrived?: boolean;
  still?: boolean;
}

export interface KeptPage {
  readonly copy: HTMLElement | null;
  readonly scrollY: number;
  readonly ground: string;
  readonly width: number;
  readonly sheet?: HTMLElement | null;
  readonly url?: string;
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

export type DressChrome = (
  stage: PageTransitions,
  overlay: HTMLElement,
  leaving: PlacedPage | null,
  arriving: PlacedPage | null,
) => BarItem[];

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
  private readonly chrome = inject(RouteChrome).current;
  readonly compact = inject(CompactLayout).isCompact;
  private readonly backTarget = inject(BackTarget);
  readonly preview = inject(NavigationPreview);
  readonly dirtyForms = inject(DirtyForms);
  private readonly placement = inject(PagePlacement);
  private readonly injector = inject(Injector);
  drawing: SwipeDrawing | null = null;
  sheets: SheetLooks | null = null;
  dressing: DressChrome | null = null;
  private readonly lent: (() => void)[] = [];
  private readonly kept = new Map<number, KeptPage>();
  readonly keptSheets = new Map<number, KeptSheet>();
  handingOver = false;
  sheetHandOver: Running | null = null;
  private trigger: NavigationFacts['trigger'] = 'imperative';
  private restoredDepth: number | null = null;
  private standingSheet: HTMLElement | null = null;
  closesWhenCovered: (() => void) | null = null;
  closingSheet: HTMLDialogElement | null = null;
  private readonly step = signal<Running | null>(null);
  readonly stepping = computed(() => this.step() !== null);
  finishing: number | null = null;
  titleFrame: number | null = null;
  private readonly frameGaps: number[] = [];
  private samplingRound = 0;
  private pressedAt = Number.NEGATIVE_INFINITY;
  private tappedAt = 0;
  private readonly loadedRoutes = new Set<Route>();

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
      this.sampleFramePace();
    };
    this.document.addEventListener('visibilitychange', hidden);
    PACE_SAMPLED_ON.forEach((type) =>
      this.document.addEventListener(type, sample, { capture: true, passive: true }),
    );
    this.sampleFramePace();
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
      this.cover(event);
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

  private cover(event: GuardsCheckEnd): void {
    if (this.running?.swiping === true) {
      return;
    }
    const view = this.document.defaultView;
    const layer = this.layer();
    const extras = untracked(this.router.currentNavigation)?.extras ?? {};
    const destination = chromeOf(event.state.root);
    const standingSheet = this.standingSheet;
    this.standingSheet = null;
    const returningSheet = sheetReturnsIn(extras.state) ? standingSheet : null;
    const kind = pageTransitionFor({
      first: event.id === 1 || !this.router.navigated,
      reducedMotion: view?.matchMedia?.(LESS_MOTION).matches !== false,
      compact: this.compact(),
      dialogOpen: liveDialogs(this.document, SHOWN_DIALOG).some(
        (dialog) => dialog !== this.closingSheet,
      ),
      fromSheet:
        returningSheet !== null && this.trigger === 'imperative' && extras.info !== BACK_NAVIGATION,
      trigger: this.trigger,
      back: extras.info === BACK_NAVIGATION,
      replaceUrl: extras.replaceUrl === true,
      skipLocationChange: extras.skipLocationChange === true,
      from: { url: this.router.url, parent: this.chrome().parent },
      to: { url: event.urlAfterRedirects, parent: destination.parent },
    });
    if (layer === null || view === null || !motionAllowed(view)) {
      return;
    }
    const deepens =
      !extras.skipLocationChange &&
      sameTab(this.router.url, event.urlAfterRedirects) &&
      this.trigger === 'imperative' &&
      extras.info !== BACK_NAVIGATION &&
      (!extras.replaceUrl || depthIn(extras.state) >= this.backTarget.nextDepth());
    if (kind === null || !this.compact()) {
      if (deepens) {
        this.keepBehind(this.backTarget.nextDepth() - 1, {
          ...this.keep(layer),
          sheet: returningSheet,
        });
      }
      return;
    }
    const left = { ...this.shown(layer), sheet: kind === 'push' ? returningSheet : null };
    const overlay = this.overlay(kind);
    if (kind === 'push') {
      this.keepBehind(this.backTarget.nextDepth() - 1, { ...left, url: this.router.url });
    }
    const behind =
      kind === 'pop' && this.restoredDepth !== null ? this.keptAt(this.restoredDepth, view) : null;
    const sheet = behind?.sheet ?? null;
    const ahead = behind?.copy != null && behind.url === event.urlAfterRedirects;
    const running: Running = { kind, overlay, swiping: false, sheet, revealed: false, ahead };
    if (!ahead) {
      const placed = this.place(overlay, left, kind === 'push' ? 'under' : 'over');
      this.dressChrome(overlay, placed, null);
    }
    this.running = running;
    this.sheetUnder(sheet ?? left.sheet);
    this.finishing = view.setTimeout(() => this.finish(), PAGE_COVER_LONGEST_MS);
    if (ahead) {
      this.moveOver(running, view, left, behind);
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
    void this.placement
      .placed(view, this.durationOf('--duration-page'))
      .then(() => (running.ahead ? this.arrive(running) : this.moveOnceAnswered(running, view)));
  }

  private moveOnceAnswered(running: Running, view: Window): void {
    const frames = this.loadedItsCode() ? FIRST_OPENING_PLACED_WITHIN_FRAMES : PLACED_WITHIN_FRAMES;
    const frameMs = Math.min(this.steadyFrameMs(), DISPLAY_FRAME_MS);
    const left = this.tappedAt + (frames - FRAMES_TO_PLACE) * frameMs - this.now();
    if (this.placement.isAnswered() || left <= 0) {
      this.move(running, view);
      return;
    }
    void this.placement
      .answered(view, Math.min(FRAME_LATE_MS, left))
      .then(() => nextFrame(view, () => this.move(running, view)));
  }

  private arrive(running: Running): void {
    if (this.running !== running) {
      return;
    }
    running.arrived = true;
    if (running.still) {
      this.finish();
    }
  }

  private move(running: Running, view: Window): void {
    const layer = this.layer();
    if (this.running !== running) {
      return;
    }
    if (layer === null) {
      this.finish();
      return;
    }
    this.moveTo(running, view, { ...this.shown(layer), sheet: running.sheet });
  }

  moveTo(running: Running, view: Window, arriving: KeptPage): void {
    const shown = this.place(running.overlay, arriving, running.kind === 'push' ? 'over' : 'under');
    const left = this.placedPage(running.overlay, running.kind === 'push' ? 'under' : 'over');
    this.dressChrome(running.overlay, left, shown);
    this.startMoving(running, view, shown.box);
  }

  private moveOver(running: Running, view: Window, leaving: KeptPage, arriving: KeptPage): void {
    const left = this.put(running.overlay, leaving, 'over');
    const shown = this.put(running.overlay, arriving, 'under');
    left.scroll();
    shown.scroll();
    this.dressChrome(running.overlay, this.placedPage(running.overlay, 'over'), shown.page);
    this.startMoving(running, view, shown.page.box);
  }

  private startMoving(running: Running, view: Window, page: HTMLElement): void {
    running.overlay.classList.add(HELD_CLASS, MOVING_CLASS);
    const still = this.finishWhenStill(running, page, view);
    let released = false;
    const release = (): void => {
      if (released || this.running !== running) {
        return;
      }
      released = true;
      if (this.finishing !== null) {
        view.clearTimeout(this.finishing);
      }
      this.finishing = view.setTimeout(() => this.finish(), PAGE_TRANSITION_LONGEST_MS);
      startHeldMotions(running.overlay);
      publishSteadyFrame(view, this.steadyFrameMs());
      view.requestAnimationFrame(() =>
        view.setTimeout(still, this.durationOf('--duration-page') + 2 * FRAME_LATE_MS),
      );
    };
    afterTwoFrames(view, this.document, release);
  }

  private loadedItsCode(): boolean {
    let route: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    while (route !== null) {
      if (route.routeConfig !== null && this.loadedRoutes.has(route.routeConfig)) {
        return true;
      }
      route = route.firstChild;
    }
    return false;
  }

  private now(): number {
    return this.document.defaultView?.performance.now() ?? 0;
  }

  measuredFrameMs(): number | null {
    return this.frameGaps.length === 0 ? null : this.steadyFrameMs();
  }

  steadyFrameMs(): number {
    return steadyFrameMs(this.frameGaps);
  }

  private sampleFramePace(): void {
    const view = this.document.defaultView;
    if (
      this.running !== null ||
      view === null ||
      typeof view.requestAnimationFrame !== 'function' ||
      !this.compact() ||
      !motionAllowed(view)
    ) {
      return;
    }
    const round = ++this.samplingRound;
    let previousAt = Number.NaN;
    let frames = 0;
    const frame = (at: number): void => {
      if (round !== this.samplingRound || this.running !== null || frames > STEADY_FRAMES_KEPT) {
        return;
      }
      this.keepFrameGap(at - previousAt);
      previousAt = at;
      frames++;
      view.requestAnimationFrame(frame);
    };
    view.requestAnimationFrame(frame);
  }

  private keepFrameGap(gapMs: number): void {
    if (Number.isFinite(gapMs) && gapMs > 0) {
      this.frameGaps.push(gapMs);
      this.frameGaps.splice(0, Math.max(0, this.frameGaps.length - STEADY_FRAMES_KEPT));
    }
  }

  private finishWhenStill(running: Running, page: HTMLElement, view: Window): () => void {
    if (this.finishing !== null) {
      view.clearTimeout(this.finishing);
    }
    this.finishing = view.setTimeout(() => this.finish(), PAGE_TRANSITION_LONGEST_MS);
    view.getComputedStyle(page).getPropertyValue('animation-name');
    const motions = typeof page.getAnimations === 'function' ? page.getAnimations() : [];
    const still = (): void => {
      if (this.running !== running || running.still) {
        return;
      }
      running.still = true;
      if (!running.ahead || running.arrived) {
        this.finish();
      }
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

  private keep(layer: HTMLElement): KeptPage {
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

  private keepBehind(depth: number, page: KeptPage): void {
    for (const kept of [...this.kept.keys()]) {
      if (kept >= depth) {
        this.kept.delete(kept);
      }
    }
    this.kept.set(depth, page);
    while (this.kept.size > KEPT_PAGES) {
      this.kept.delete(Math.min(...this.kept.keys()));
    }
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

  private placedPage(overlay: HTMLElement, position: 'under' | 'over'): PlacedPage | null {
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
    return this.dressing?.(this, overlay, leaving, arriving) ?? [];
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

function startHeldMotions(overlay: HTMLElement): void {
  overlay.classList.remove(HELD_CLASS);
  overlay
    .getAnimations?.({ subtree: true })
    .filter((motion) => motion.pending)
    .forEach((motion) => motion.play());
}

export function liveDialogs(document: Document, selector: string): HTMLDialogElement[] {
  return Array.from(document.querySelectorAll<HTMLDialogElement>(selector)).filter(
    (dialog) => dialog.closest(`.${PAGE_TRANSITION_CLASS}`) === null,
  );
}

export function motionAllowed(view: Window): boolean {
  return view.matchMedia?.(LESS_MOTION).matches === false;
}

function sheetReturnsIn(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    typeof (state as Record<string, unknown>)[ACCOUNT_RETURNS_KEY] === 'string'
  );
}

function depthIn(state: unknown): number {
  const depth =
    typeof state === 'object' && state !== null
      ? (state as Record<string, unknown>)[APP_DEPTH_KEY]
      : undefined;
  return typeof depth === 'number' ? depth : 0;
}

function sameTab(from: string, to: string): boolean {
  const here = tabOf(from);
  const there = tabOf(to);
  return here === null || there === null || here.id === there.id;
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

export function afterTwoFrames(view: Window, document: Document, then: () => void): void {
  let done = false;
  const goOn = (): void => {
    if (!done) {
      done = true;
      then();
    }
  };
  const goOnIfHidden = (): void => {
    if (document.visibilityState === 'hidden') {
      goOn();
    }
  };
  const byClock = view.setTimeout(goOnIfHidden, HELD_WITHOUT_A_FRAME_MS);
  view.requestAnimationFrame(() => {
    view.clearTimeout(byClock);
    const secondByClock = view.setTimeout(goOnIfHidden, HELD_WITHOUT_A_FRAME_MS);
    view.requestAnimationFrame(() => {
      view.clearTimeout(secondByClock);
      goOn();
    });
  });
}

export function publishSteadyFrame(view: Window, steadyBeforeMs: number): void {
  const timing = view.performance;
  if (typeof timing?.mark !== 'function' || typeof timing.clearMarks !== 'function') {
    return;
  }
  timing.clearMarks(STEADY_FRAME_MARK);
  timing.mark(STEADY_FRAME_MARK, { detail: { steadyBeforeMs } });
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
