import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  DestroyRef,
  effect,
  EnvironmentProviders,
  inject,
  Injectable,
  Injector,
  provideAppInitializer,
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

export const PAGE_LAYER_CLASS = 'page-layer';
export const PAGE_TRANSITION_CLASS = 'page-transition';
export const PAGE_TRANSITION_LONGEST_MS = 2000;
export const PAGE_COVER_LONGEST_MS = 5000;
export const KEPT_PAGES = 3;
export const FRAME_LATE_MS = 100;
export const ACCOUNT_RETURNS_KEY = 'nfnnAppAccount';

const LESS_MOTION = '(prefers-reduced-motion: reduce)';
const LOOKS = ['background-color', 'color', 'border-color', 'backdrop-filter', 'opacity'];
const BAR_ITEMS = ['.back-button', '.account-button'];
export const SHOWN_DIALOG = 'dialog[open], dialog.dialog--leaving';
const STANDING_DIALOG = 'dialog[open]:not(.dialog--leaving)';
const SHEET_HEAD = 'app-sheet-head';
const BACKDROP_LOOKS = [
  'background-color',
  'opacity',
  'backdrop-filter',
  '-webkit-backdrop-filter',
];
const SHEET_UNDER_CLASS = `${PAGE_TRANSITION_CLASS}-sheet-under`;
const HELD_CLASS = `${PAGE_TRANSITION_CLASS}--held`;
const ON_GROUND_CLASS = `${PAGE_TRANSITION_CLASS}--on-ground`;
const SHEET_LOOKS = '.dialog--sheet, app-sheet-head';
const SHEET_PANEL = '.dialog-panel';
const PANEL_SCROLL = 'panelScroll';
const MOVING_CLASS = `${PAGE_TRANSITION_CLASS}--moving`;
const HEADS_HELD_CLASS = `${PAGE_TRANSITION_CLASS}--heads-held`;
const TITLES_FOLLOW_CLASS = `${PAGE_TRANSITION_CLASS}--titles-follow`;
const TITLE_CLASS = `${PAGE_TRANSITION_CLASS}__title`;
const TITLE_TEXT_CLASS = `${PAGE_TRANSITION_CLASS}__title-text`;
const SHEET_TITLE = '.sheet-head-title';
const SHOWN_EDGE_TITLE = '.edge-title--shown';
const EDGE_TITLE_TEXT = '.edge-title-text';
const TITLE_FADE_AT = '--page-title-fade-at';
const TITLE_TRAVEL = '--page-title-travel';

export interface Running {
  readonly kind: PageTransitionKind;
  readonly overlay: HTMLElement;
  readonly swiping: boolean;
  readonly sheet: HTMLElement | null;
  revealed: boolean;
  stepped?: boolean;
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
  readonly change: () => void;
  readonly placed: () => void;
}

interface KeptSheet {
  readonly sheet: HTMLElement;
  readonly width: number;
}

interface FollowedTitle {
  readonly title: HTMLElement;
  readonly text: HTMLElement;
  readonly leaves: boolean;
}

export type BarCurve = 'still' | 'out' | 'out-early' | 'in';

export interface BarItem {
  readonly element: HTMLElement;
  readonly curve: BarCurve;
}

type SwipeDrawing = typeof import('./swipe-drawing');

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
  private readonly lent: (() => void)[] = [];
  private readonly kept = new Map<number, KeptPage>();
  private readonly keptSheets = new Map<number, KeptSheet>();
  handingOver = false;
  sheetHandOver: Running | null = null;
  private trigger: NavigationFacts['trigger'] = 'imperative';
  private restoredDepth: number | null = null;
  private standingSheet: HTMLElement | null = null;
  running: Running | null = null;
  finishing: number | null = null;
  private titleFrame: number | null = null;

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
    inject(DestroyRef).onDestroy(() => {
      events.unsubscribe();
      this.finish();
    });
  }

  private follow(event: RouterEvent): void {
    if (this.preview.drives()) {
      return;
    }
    if (event instanceof NavigationStart) {
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
    } else if (event instanceof GuardsCheckEnd && event.shouldActivate) {
      this.cover(event);
    } else if (event instanceof Scroll) {
      this.reveal();
    } else if (event instanceof NavigationEnd) {
      this.revealIfNoScrollFollows();
    } else if (
      event instanceof NavigationCancel ||
      event instanceof NavigationError ||
      event instanceof NavigationSkipped
    ) {
      this.finish();
    }
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

  startSheetSwipe(depth: number): SwipePreview | null {
    const view = this.document.defaultView;
    const under = this.keptSheets.get(depth - 1);
    if (view === null || under === undefined || under.width !== view.innerWidth) {
      return null;
    }
    return this.drawing?.startSheetSwipe(this, under.sheet) ?? null;
  }

  stepInSheet(step: SheetStep): void {
    const view = this.document.defaultView;
    const handOver = this.sheetHandOver;
    if (handOver !== null) {
      this.sheetHandOver = null;
      step.change();
      this.afterRender(() => {
        step.placed();
        if (this.running === handOver) {
          this.finish();
        }
      });
      return;
    }
    const moves = view !== null && this.compact() && motionAllowed(view) && this.running === null;
    const leaving = moves ? this.standingSheetCopy() : null;
    if (view === null || leaving === null) {
      step.change();
      this.afterRender(step.placed);
      return;
    }
    if (step.kind === 'push') {
      this.keptSheets.set(step.depth - 1, { sheet: leaving, width: view.innerWidth });
    }
    const overlay = this.overlay(step.kind);
    overlay.classList.add(ON_GROUND_CLASS);
    const left = this.place(
      overlay,
      this.sheetOnly(leaving),
      step.kind === 'push' ? 'under' : 'over',
    );
    this.dressChrome(overlay, left, null);
    const running: Running = {
      kind: step.kind,
      overlay,
      swiping: false,
      sheet: leaving,
      revealed: true,
    };
    this.running = running;
    this.sheetUnder(leaving);
    this.finishing = view.setTimeout(() => this.finish(), PAGE_COVER_LONGEST_MS);
    step.change();
    this.afterRender(() => {
      step.placed();
      if (this.running !== running) {
        return;
      }
      const arriving = this.standingSheetCopy();
      if (arriving === null) {
        this.finish();
        return;
      }
      this.moveTo(running, view, this.sheetOnly(arriving));
    });
  }

  sheetOnly(sheet: HTMLElement): KeptPage {
    return {
      copy: null,
      scrollY: 0,
      ground: 'transparent',
      width: this.document.defaultView?.innerWidth ?? 0,
      sheet,
    };
  }

  private afterRender(then: () => void): void {
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
      dialogOpen: liveDialogs(this.document, SHOWN_DIALOG).length > 0,
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
    const overlay = this.overlay(kind);
    const left = { ...this.shown(layer), sheet: kind === 'push' ? returningSheet : null };
    if (kind === 'push') {
      this.keepBehind(this.backTarget.nextDepth() - 1, left);
    }
    const placed = this.place(overlay, left, kind === 'push' ? 'under' : 'over');
    this.dressChrome(overlay, placed, null);
    const sheet =
      kind === 'pop' && this.restoredDepth !== null
        ? (this.keptAt(this.restoredDepth, view)?.sheet ?? null)
        : null;
    this.running = { kind, overlay, swiping: false, sheet, revealed: false };
    this.sheetUnder(sheet ?? left.sheet);
    this.finishing = view.setTimeout(() => this.finish(), PAGE_COVER_LONGEST_MS);
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
    afterFrames(view, 2, () => {
      if (running.swiping) {
        if (this.running === running) {
          this.finish();
        }
        return;
      }
      void this.placement
        .placed(view, this.durationOf('--duration-page'))
        .then(() => this.move(running, view));
    });
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

  private moveTo(running: Running, view: Window, arriving: KeptPage): void {
    const shown = this.place(running.overlay, arriving, running.kind === 'push' ? 'over' : 'under');
    const left = this.placedPage(running.overlay, running.kind === 'push' ? 'under' : 'over');
    this.dressChrome(running.overlay, left, shown);
    running.overlay.classList.add(HELD_CLASS, MOVING_CLASS);
    this.finishWhenStill(running, shown.box, view);
    void afterDrawn(view, this.durationOf('--duration-fast') / 2).then(() =>
      running.overlay.classList.remove(HELD_CLASS),
    );
  }

  private finishWhenStill(running: Running, page: HTMLElement, view: Window): void {
    if (this.finishing !== null) {
      view.clearTimeout(this.finishing);
    }
    this.finishing = view.setTimeout(() => this.finish(), PAGE_TRANSITION_LONGEST_MS);
    view.getComputedStyle(page).getPropertyValue('animation-name');
    const motions = typeof page.getAnimations === 'function' ? page.getAnimations() : [];
    void Promise.allSettled(motions.map((motion) => motion.finished)).then(() => {
      if (this.running === running) {
        this.finish();
      }
    });
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
    scroller.scrollTop = kept.scrollY;
    const panel = sheet?.querySelector<HTMLElement>(SHEET_PANEL);
    if (panel != null) {
      panel.scrollTop = Number(sheet?.dataset[PANEL_SCROLL] ?? 0);
    }
    return { box: page, copy, scrollY: kept.scrollY };
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
    const leavingTabBar = leaving?.copy?.querySelector('app-tab-bar') != null;
    const arrivingTabBar =
      arriving?.copy == null || arriving.copy.querySelector('app-tab-bar') !== null;
    overlay.classList.toggle(
      `${PAGE_TRANSITION_CLASS}--under-tab-bar`,
      leavingTabBar && arrivingTabBar,
    );
    if (arriving !== null) {
      overlay.classList.toggle(ON_GROUND_CLASS, this.isSheet(leaving) && this.isSheet(arriving));
    }
    overlay.querySelector(`.${PAGE_TRANSITION_CLASS}__bar`)?.remove();
    const bar = this.document.createElement('div');
    bar.className = `${PAGE_TRANSITION_CLASS}__bar`;
    overlay.append(bar);
    const titles: FollowedTitle[] = [];
    const heads = this.holdHeads(overlay, bar, leaving, arriving, titles);
    const arrivingPart = this.barPart(bar, arriving);
    const leavingPart = this.barPart(bar, leaving);
    this.addTitle(titles, leavingPart?.querySelector<HTMLElement>(SHOWN_EDGE_TITLE), true);
    this.addTitle(titles, arrivingPart?.querySelector<HTMLElement>(SHOWN_EDGE_TITLE), false);
    this.followTitles(overlay, titles);
    return [
      ...heads,
      ...BAR_ITEMS.flatMap((selector) => {
        const out = leavingPart?.querySelector<HTMLElement>(selector) ?? null;
        const into = arrivingPart?.querySelector<HTMLElement>(selector) ?? null;
        if (out !== null && into !== null && this.looksAlike(out, into)) {
          into.remove();
          return [this.barItem(out, 'still')];
        }
        return [
          ...(out === null ? [] : [this.barItem(out, into === null ? 'out-early' : 'out')]),
          ...(into === null ? [] : [this.barItem(into, 'in')]),
        ];
      }),
    ];
  }

  private holdHeads(
    overlay: HTMLElement,
    bar: HTMLElement,
    leaving: PlacedPage | null,
    arriving: PlacedPage | null,
    titles: FollowedTitle[],
  ): BarItem[] {
    const out = this.headOf(leaving);
    const into = this.headOf(arriving);
    const held = leaving !== null && arriving !== null && out !== null && into !== null;
    overlay.classList.toggle(HEADS_HELD_CLASS, held);
    if (!held) {
      return [];
    }
    const standing = this.standingCopy(bar, into, arriving.box);
    const leavingHead = this.standingCopy(bar, out, leaving.box);
    this.addTitle(titles, leavingHead.querySelector<HTMLElement>(SHEET_TITLE), true);
    this.addTitle(titles, standing.querySelector<HTMLElement>(SHEET_TITLE), false);
    return [this.barItem(standing, 'still'), this.barItem(leavingHead, 'out')];
  }

  private headOf(page: PlacedPage | null): HTMLElement | null {
    return (
      page?.box.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__sheet ${SHEET_HEAD}`) ??
      page?.copy?.querySelector<HTMLElement>(SHEET_HEAD) ??
      null
    );
  }

  private addTitle(
    titles: FollowedTitle[],
    title: HTMLElement | null | undefined,
    leaves: boolean,
  ): void {
    if (title == null || !this.compact()) {
      return;
    }
    let text = title.querySelector<HTMLElement>(EDGE_TITLE_TEXT);
    if (text === null) {
      text = this.document.createElement('span');
      text.append(...Array.from(title.childNodes));
      title.append(text);
    }
    title.classList.add(TITLE_CLASS);
    text.classList.add(TITLE_TEXT_CLASS);
    titles.push({ title, text, leaves });
  }

  private followTitles(overlay: HTMLElement, titles: readonly FollowedTitle[]): void {
    this.stopTitles();
    const view = this.document.defaultView;
    overlay.classList.toggle(TITLES_FOLLOW_CLASS, titles.length > 0);
    if (view === null || titles.length === 0) {
      return;
    }
    const pushes = overlay.classList.contains(`${PAGE_TRANSITION_CLASS}--push`);
    const fadeAt = Number.parseFloat(
      view.getComputedStyle(this.document.documentElement).getPropertyValue(TITLE_FADE_AT),
    );
    const follow = (): void => {
      this.titleFrame = null;
      if (!overlay.isConnected) {
        return;
      }
      const progress = stepProgress(overlay, pushes, view);
      titles.forEach((title) =>
        showTitle(title, progress, Number.isFinite(fadeAt) ? fadeAt : 0, pushes),
      );
      if (typeof view.requestAnimationFrame === 'function') {
        this.titleFrame = view.requestAnimationFrame(follow);
      }
    };
    follow();
  }

  private stopTitles(): void {
    if (this.titleFrame !== null) {
      this.document.defaultView?.cancelAnimationFrame(this.titleFrame);
      this.titleFrame = null;
    }
  }

  private standingCopy(bar: HTMLElement, head: HTMLElement, box: HTMLElement): HTMLElement {
    const place = head.getBoundingClientRect();
    const origin = box.getBoundingClientRect();
    const copy = head.cloneNode(true) as HTMLElement;
    copy.classList.add(`${PAGE_TRANSITION_CLASS}__head`);
    copy.style.position = 'absolute';
    copy.style.margin = '0';
    copy.style.top = `${place.top - origin.top}px`;
    copy.style.left = `${place.left - origin.left}px`;
    copy.style.width = `${place.width}px`;
    copy.style.height = `${place.height}px`;
    bar.append(copy);
    return copy;
  }

  shown(layer: HTMLElement): KeptPage {
    const kept = this.keep(layer);
    const giveBack = this.drawing?.lendPhotos(layer, kept.copy);
    if (giveBack !== undefined) {
      this.lent.push(giveBack);
    }
    return kept;
  }

  standingSheetCopy(): HTMLElement | null {
    const top = liveDialogs(this.document, STANDING_DIALOG).at(-1);
    const view = this.document.defaultView;
    if (top === undefined || view === null) {
      return null;
    }
    const layer = this.document.createElement('div');
    layer.className = `${PAGE_TRANSITION_CLASS}__sheet`;
    const backdrop = this.document.createElement('div');
    backdrop.className = `${PAGE_TRANSITION_CLASS}__sheet-backdrop`;
    const look = view.getComputedStyle(top, '::backdrop');
    BACKDROP_LOOKS.forEach((property) =>
      backdrop.style.setProperty(property, look.getPropertyValue(property)),
    );
    layer.append(backdrop, stillCopyOf(top));
    const panel = top.querySelector<HTMLElement>(SHEET_PANEL);
    layer.dataset[PANEL_SCROLL] = String(panel?.scrollTop ?? 0);
    return layer;
  }

  private barPart(bar: HTMLElement, page: PlacedPage | null): HTMLElement | null {
    const header = page?.copy?.querySelector('app-header') ?? null;
    if (page === null || header === null || this.sheetStandsOn(page)) {
      return null;
    }
    const part = this.document.createElement('div');
    part.className = `${PAGE_TRANSITION_CLASS}__bar-part`;
    part.style.top = `${-page.scrollY}px`;
    part.append(header.cloneNode(true));
    bar.append(part);
    return part;
  }

  private isSheet(page: PlacedPage | null): boolean {
    return page?.box.querySelector(SHEET_LOOKS) != null;
  }

  private sheetStandsOn(page: PlacedPage): boolean {
    return page.box.querySelector(`.${PAGE_TRANSITION_CLASS}__sheet`) !== null;
  }

  private barItem(element: HTMLElement, curve: BarCurve): BarItem {
    element.classList.add(`${PAGE_TRANSITION_CLASS}__bar-item--${curve}`);
    return { element, curve };
  }

  private looksAlike(first: HTMLElement, second: HTMLElement): boolean {
    const view = this.document.defaultView;
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
    this.running?.overlay.remove();
    this.running = null;
    this.handingOver = false;
    this.sheetHandOver = null;
    const root = this.document.documentElement;
    if (root.classList.contains(SHEET_UNDER_CLASS)) {
      root.classList.remove(SHEET_UNDER_CLASS);
      this.drawing?.standAtOnce(this.document.querySelectorAll('dialog[open]'));
    }
  }
}

function stepProgress(overlay: HTMLElement, pushes: boolean, view: Window): number {
  const over = overlay.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--over`);
  if (over === null || (pushes && !overlay.classList.contains(MOVING_CLASS))) {
    return 0;
  }
  const transform = view.getComputedStyle(over).transform;
  const Matrix = (view as Window & { DOMMatrixReadOnly?: typeof DOMMatrixReadOnly })
    .DOMMatrixReadOnly;
  const width = over.offsetWidth || view.innerWidth;
  const offset =
    typeof Matrix === 'function' && transform !== '' && transform !== 'none'
      ? new Matrix(transform).m41
      : 0;
  const along = width > 0 ? Math.min(1, Math.max(0, offset / width)) : 0;
  return pushes ? 1 - along : along;
}

function showTitle(
  { title, text, leaves }: FollowedTitle,
  progress: number,
  fadeAt: number,
  pushes: boolean,
): void {
  const opacity = leaves ? fadingOut(progress, fadeAt) : fadingIn(progress, fadeAt);
  const travel = (pushes ? -1 : 1) * (leaves ? progress : progress - 1);
  title.style.opacity = String(opacity);
  text.style.setProperty(TITLE_TRAVEL, String(travel));
}

function fadingOut(progress: number, fadeAt: number): number {
  if (fadeAt <= 0) {
    return progress > 0 ? 0 : 1;
  }
  return Math.min(1, Math.max(0, 1 - progress / fadeAt));
}

function fadingIn(progress: number, fadeAt: number): number {
  if (fadeAt >= 1) {
    return progress >= 1 ? 1 : 0;
  }
  return Math.min(1, Math.max(0, (progress - fadeAt) / (1 - fadeAt)));
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

export function nextFrame(view: Window, then: (now: number) => void): void {
  let done = false;
  const once = (now: number): void => {
    if (!done) {
      done = true;
      view.clearTimeout(late);
      then(now);
    }
  };
  const late = view.setTimeout(() => once(view.performance.now()), FRAME_LATE_MS);
  view.requestAnimationFrame(once);
}

export function afterDrawn(view: Window, longestMs?: number): Promise<void> {
  const drawn = new Promise<void>((done) => afterFrames(view, 2, done));
  if (longestMs === undefined) {
    return drawn;
  }
  return Promise.race([drawn, new Promise<void>((done) => view.setTimeout(done, longestMs))]);
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
