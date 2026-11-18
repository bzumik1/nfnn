import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  EnvironmentProviders,
  inject,
  Injectable,
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
import {
  NavigationFacts,
  PageTransitionKind,
  pageTransitionFor,
  pushWithinSection,
} from './page-transition-kind';
import { pathOf, tabOf } from './app-tabs';
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
export const ACCOUNT_RETURNS_KEY = 'nfnnAppAccount';

const LESS_MOTION = '(prefers-reduced-motion: reduce)';
const LOOKS = ['background-color', 'color', 'border-color', 'backdrop-filter', 'opacity'];
const BAR_ITEMS = ['.back-button', '.account-button'];
const SHOWN_DIALOG = 'dialog[open], dialog.dialog--leaving';
const STANDING_DIALOG = 'dialog[open]:not(.dialog--leaving)';
const SHEET_HEAD = 'app-sheet-head';
const SECTION_LINKS = 'nav a[href]';
const HEADER = 'app-header .app-header';
const SIDE_NAVIGATION = '.side-nav-panel';
const SHEET_UNDER_CLASS = `${PAGE_TRANSITION_CLASS}-sheet-under`;
const CATCH_UP_SPANS = 3;
const FRAME_MS = 16;

interface Running {
  readonly kind: PageTransitionKind;
  readonly overlay: HTMLElement;
  readonly swiping: boolean;
  readonly sheet: HTMLElement | null;
  revealed: boolean;
}

interface KeptPage {
  readonly copy: HTMLElement | null;
  readonly scrollY: number;
  readonly ground: string;
  readonly width: number;
  readonly sheet?: HTMLElement | null;
}

interface PlacedPage {
  readonly box: HTMLElement;
  readonly copy: HTMLElement | null;
  readonly scrollY: number;
}

type BarCurve = 'still' | 'out' | 'out-early' | 'in';

interface BarItem {
  readonly element: HTMLElement;
  readonly curve: BarCurve;
}

export interface SwipePreview {
  follow(offset: number): void;
  settle(settle: SwipeSettle): Promise<boolean>;
  slideBack(): Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class PageTransitions {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly chrome = inject(RouteChrome).current;
  private readonly compact = inject(CompactLayout).isCompact;
  private readonly backTarget = inject(BackTarget);
  private readonly preview = inject(NavigationPreview);
  private readonly dirtyForms = inject(DirtyForms);
  private readonly placement = inject(PagePlacement);
  private readonly kept = new Map<number, KeptPage>();
  private handingOver = false;
  private trigger: NavigationFacts['trigger'] = 'imperative';
  private restoredDepth: number | null = null;
  private standingSheet: HTMLElement | null = null;
  private running: Running | null = null;
  private finishing: number | null = null;

  constructor() {
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
    if (this.compact()) {
      return true;
    }
    const layer = this.layer();
    const sections =
      layer === null
        ? []
        : Array.from(layer.querySelectorAll<HTMLAnchorElement>(SECTION_LINKS))
            .filter((link) => link.closest('main') === null)
            .map((link) => pathOf(link.getAttribute('href') ?? ''));
    return pushWithinSection(pathOf(this.router.url), this.chrome().parent, sections);
  }

  startSwipe(destination: BackDestination): SwipePreview | null {
    const view = this.document.defaultView;
    const layer = this.layer();
    if (
      view === null ||
      layer === null ||
      this.running !== null ||
      !motionAllowed(view) ||
      !this.stepsBySwipe() ||
      this.document.querySelector(SHOWN_DIALOG) !== null
    ) {
      return null;
    }
    const behind = destination.kind === 'step' ? this.keptAt(destination.depth, view) : null;
    const overlay = this.overlay('pop');
    overlay.classList.add(`${PAGE_TRANSITION_CLASS}--swipe`);
    const content = this.compact() ? null : this.contentArea(overlay);
    const arriving = this.place(overlay, behind ?? this.placeholder(), 'under');
    const leaving = this.place(overlay, this.keep(layer), 'over');
    if (content !== null) {
      overlay
        .querySelectorAll<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__scroller`)
        .forEach(
          (scroller) => (scroller.style.inset = `${-content.top}px 0 0 ${-content.start}px`),
        );
    }
    const dress = (into: PlacedPage): BarItem[] =>
      content === null ? this.dressChrome(overlay, leaving, into) : [];
    const bar = { items: dress(arriving) };
    const under = arriving.box;
    const over = leaving.box;
    const dim = under.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__dim`);
    const sheet = behind?.sheet ?? null;
    const running: Running = { kind: 'pop', overlay, swiping: true, sheet, revealed: false };
    this.running = running;
    this.document.documentElement.classList.toggle(SHEET_UNDER_CLASS, sheet !== null);
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
    const drawn =
      behind === null && destination.path !== null && !this.dirtyForms.any()
        ? this.drawUnder(destination.path, running, arriving, (into) => {
            bar.items = dress(into);
          }).then((under) => {
            if (!under || this.running !== running) {
              return;
            }
            ready = true;
            catchingUp = true;
            const closing = Math.max(1, this.durationOf('--duration-fast') / CATCH_UP_SPANS);
            let last: number | null = null;
            let gap = offset - shown;
            const closeIn = (now: number): void => {
              if (!catchingUp || this.running !== running) {
                return;
              }
              const elapsed = last === null ? FRAME_MS : Math.max(0, now - last);
              last = now;
              gap *= Math.exp(-elapsed / closing);
              if (Math.abs(gap) < 1) {
                gap = 0;
              }
              shown = offset - gap;
              follow();
              catchingUp = gap !== 0;
              if (catchingUp) {
                view.requestAnimationFrame(closeIn);
              }
            };
            view.requestAnimationFrame(closeIn);
          })
        : Promise.resolve();
    const settle = async (end: SwipeSettle): Promise<boolean> => {
      catchingUp = false;
      if (this.running !== running) {
        return false;
      }
      if (!ready) {
        await drawn;
      }
      if (!ready) {
        this.preview.discard();
        if (this.running === running) {
          this.finish();
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
      if (!end.completes) {
        this.preview.discard();
      }
      if (this.running !== running) {
        return false;
      }
      if (end.completes) {
        this.handingOver = true;
        this.finishing = view.setTimeout(() => this.finish(), PAGE_COVER_LONGEST_MS);
      } else {
        this.finish();
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
          durationMs: this.durationOf('--duration-page'),
          easing: 'ease-out',
        });
      },
    };
  }

  private async drawUnder(
    path: string,
    running: Running,
    arriving: PlacedPage,
    redressed: (into: PlacedPage) => void,
  ): Promise<boolean> {
    const drawn = await this.withoutFocus(() =>
      this.preview.visit(path, () => {
        const layer = this.layer();
        return layer === null ? null : this.keep(layer);
      }),
    );
    const scroller = arriving.box.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__scroller`);
    if (drawn === null || drawn.copy === null || scroller === null || this.running !== running) {
      return false;
    }
    scroller.replaceChildren(drawn.copy);
    scroller.scrollTop = drawn.scrollY;
    scroller.style.backgroundColor = drawn.ground;
    redressed({ box: arriving.box, copy: drawn.copy, scrollY: drawn.scrollY });
    return true;
  }

  private async withoutFocus<T>(draw: () => Promise<T>): Promise<T> {
    const layer = this.layer();
    const focused = this.document.activeElement;
    layer?.setAttribute('inert', '');
    try {
      return await draw();
    } finally {
      layer?.removeAttribute('inert');
      if (
        focused instanceof HTMLElement &&
        focused.isConnected &&
        focused !== this.document.body &&
        this.document.activeElement !== focused
      ) {
        focused.focus({ preventScroll: true });
      }
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
    const kind = pageTransitionFor({
      first: event.id === 1 || !this.router.navigated,
      reducedMotion: view?.matchMedia?.(LESS_MOTION).matches !== false,
      compact: this.compact(),
      dialogOpen: this.document.querySelector(SHOWN_DIALOG) !== null,
      trigger: this.trigger,
      back: extras.info === BACK_NAVIGATION,
      replaceUrl: extras.replaceUrl === true,
      skipLocationChange: extras.skipLocationChange === true,
      from: { url: this.router.url, parent: this.chrome().parent },
      to: { url: event.urlAfterRedirects, parent: destination.parent },
    });
    const standingSheet = this.standingSheet;
    this.standingSheet = null;
    if (layer === null || view === null || !motionAllowed(view)) {
      return;
    }
    const deepens =
      !extras.skipLocationChange &&
      sameTab(this.router.url, event.urlAfterRedirects) &&
      this.trigger === 'imperative' &&
      extras.info !== BACK_NAVIGATION &&
      (!extras.replaceUrl || depthIn(extras.state) >= this.backTarget.nextDepth());
    const returningSheet = sheetReturnsIn(extras.state) ? standingSheet : null;
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
    const left = this.keep(layer);
    if (kind === 'push') {
      this.keepBehind(this.backTarget.nextDepth() - 1, { ...left, sheet: returningSheet });
    }
    const placed = this.place(overlay, left, kind === 'push' ? 'under' : 'over');
    this.dressChrome(overlay, placed, null);
    const sheet =
      kind === 'pop' && this.restoredDepth !== null
        ? (this.keptAt(this.restoredDepth, view)?.sheet ?? null)
        : null;
    this.running = { kind, overlay, swiping: false, sheet, revealed: false };
    this.document.documentElement.classList.toggle(SHEET_UNDER_CLASS, sheet !== null);
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
    const shown = this.place(
      running.overlay,
      { ...this.keep(layer), sheet: running.sheet },
      running.kind === 'push' ? 'over' : 'under',
    );
    const left = this.placedPage(running.overlay, running.kind === 'push' ? 'under' : 'over');
    this.dressChrome(running.overlay, left, shown);
    running.overlay.classList.add(`${PAGE_TRANSITION_CLASS}--moving`);
    this.finishWhenStill(running, shown.box, view);
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

  private overlay(kind: PageTransitionKind): HTMLElement {
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

  private placeholder(): KeptPage {
    return {
      copy: null,
      scrollY: 0,
      ground: this.groundColour(),
      width: this.document.defaultView?.innerWidth ?? 0,
    };
  }

  private keptAt(depth: number, view: Window): KeptPage | null {
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

  private place(overlay: HTMLElement, kept: KeptPage, position: 'under' | 'over'): PlacedPage {
    const page = this.document.createElement('div');
    page.className = `${PAGE_TRANSITION_CLASS}__page ${PAGE_TRANSITION_CLASS}__page--${position}`;
    page.style.backgroundColor = kept.ground;
    const scroller = this.document.createElement('div');
    scroller.className = `${PAGE_TRANSITION_CLASS}__scroller`;
    const copy = kept.copy;
    if (copy !== null) {
      scroller.append(copy);
    }
    if (kept.sheet != null) {
      scroller.append(kept.sheet.cloneNode(true));
    }
    page.append(scroller);
    if (position === 'under') {
      const dim = this.document.createElement('div');
      dim.className = `${PAGE_TRANSITION_CLASS}__dim`;
      page.append(dim);
      overlay.prepend(page);
    } else {
      overlay.append(page);
    }
    scroller.scrollTop = kept.scrollY;
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

  private dressChrome(
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
    overlay.querySelector(`.${PAGE_TRANSITION_CLASS}__bar`)?.remove();
    const bar = this.document.createElement('div');
    bar.className = `${PAGE_TRANSITION_CLASS}__bar`;
    overlay.append(bar);
    const heads = this.holdHeads(overlay, bar, leaving, arriving);
    const arrivingPart = this.barPart(bar, arriving);
    const leavingPart = this.barPart(bar, leaving);
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
  ): BarItem[] {
    const out = leaving?.copy?.querySelector<HTMLElement>(SHEET_HEAD) ?? null;
    const into = arriving?.copy?.querySelector<HTMLElement>(SHEET_HEAD) ?? null;
    const held = leaving !== null && arriving !== null && out !== null && into !== null;
    overlay.classList.toggle(`${PAGE_TRANSITION_CLASS}--heads-held`, held);
    if (!held) {
      return [];
    }
    const standing = this.standingCopy(bar, into, arriving.box);
    const leavingHead = this.standingCopy(bar, out, leaving.box);
    return [this.barItem(standing, 'still'), this.barItem(leavingHead, 'out')];
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

  private contentArea(overlay: HTMLElement): { top: number; start: number; width: number } {
    const view = this.document.defaultView;
    const header = this.document.querySelector(`.${PAGE_LAYER_CLASS} ${HEADER}`);
    const sideNavigation = this.document.querySelector(`.${PAGE_LAYER_CLASS} ${SIDE_NAVIGATION}`);
    const top = Math.max(0, header?.getBoundingClientRect().bottom ?? 0);
    const start = Math.max(0, sideNavigation?.getBoundingClientRect().right ?? 0);
    overlay.classList.add(`${PAGE_TRANSITION_CLASS}--content`);
    overlay.style.inset = `${top}px 0 0 ${start}px`;
    return { top, start, width: (view?.innerWidth ?? 0) - start };
  }

  private standingSheetCopy(): HTMLElement | null {
    const dialogs = this.document.querySelectorAll<HTMLElement>(STANDING_DIALOG);
    const top = dialogs.item(dialogs.length - 1);
    return top === null ? null : stillCopyOf(top);
  }

  private barPart(bar: HTMLElement, page: PlacedPage | null): HTMLElement | null {
    const header = page?.copy?.querySelector('app-header') ?? null;
    if (page === null || header === null) {
      return null;
    }
    const part = this.document.createElement('div');
    part.className = `${PAGE_TRANSITION_CLASS}__bar-part`;
    part.style.top = `${-page.scrollY}px`;
    part.append(header.cloneNode(true));
    bar.append(part);
    return part;
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

  private durationOf(name: string): number {
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

  private layer(): HTMLElement | null {
    return this.document.querySelector<HTMLElement>(`.${PAGE_LAYER_CLASS}`);
  }

  private finish(): void {
    const view = this.document.defaultView;
    if (this.finishing !== null) {
      view?.clearTimeout(this.finishing);
      this.finishing = null;
    }
    this.running?.overlay.remove();
    this.running = null;
    this.handingOver = false;
    this.document.documentElement.classList.remove(SHEET_UNDER_CLASS);
  }
}

function motionAllowed(view: Window): boolean {
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

function sameTab(from: string, to: string): boolean {
  const here = tabOf(from);
  const there = tabOf(to);
  return here === null || there === null || here.id === there.id;
}

function parallaxAt(progress: number): string {
  return `translateX(calc(var(--page-parallax) * ${1 - progress}))`;
}

function afterFrames(view: Window, frames: number, then: () => void): void {
  if (frames === 0) {
    then();
    return;
  }
  view.requestAnimationFrame(() => afterFrames(view, frames - 1, then));
}

export const pageTransitionsAtStart: EnvironmentProviders = provideAppInitializer(
  () => void inject(PageTransitions),
);
