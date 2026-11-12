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
import { NavigationFacts, PageTransitionKind, pageTransitionFor } from './page-transition-kind';
import { chromeOf, RouteChrome } from './route-chrome';
import { stillCopyOf } from './still-copy';

export const PAGE_LAYER_CLASS = 'page-layer';
export const PAGE_TRANSITION_CLASS = 'page-transition';
export const PAGE_TRANSITION_LONGEST_MS = 2000;
export const PAGE_COVER_LONGEST_MS = 5000;
export const KEPT_PAGES = 3;

const LESS_MOTION = '(prefers-reduced-motion: reduce)';
const LOOKS = ['background-color', 'color', 'border-color', 'backdrop-filter', 'opacity'];
const SHOWN_DIALOG = 'dialog[open], dialog.dialog--leaving';

interface Running {
  readonly kind: PageTransitionKind;
  readonly overlay: HTMLElement;
  readonly swiping: boolean;
  revealed: boolean;
}

interface KeptPage {
  readonly copy: HTMLElement | null;
  readonly scrollY: number;
  readonly ground: string;
  readonly width: number;
}

interface PlacedPage {
  readonly box: HTMLElement;
  readonly copy: HTMLElement | null;
}

interface BarParts {
  readonly leaving: HTMLElement | null;
  readonly arriving: HTMLElement | null;
}

export interface SwipePreview {
  follow(offset: number): void;
  settle(settle: SwipeSettle): Promise<void>;
  slideBack(): Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class PageTransitions {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly chrome = inject(RouteChrome).current;
  private readonly compact = inject(CompactLayout).isCompact;
  private readonly backTarget = inject(BackTarget);
  private readonly kept = new Map<number, KeptPage>();
  private handingOver = false;
  private trigger: NavigationFacts['trigger'] = 'imperative';
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
    if (event instanceof NavigationStart) {
      if (this.handingOver) {
        this.handingOver = false;
      } else {
        this.finish();
      }
      this.trigger = event.navigationTrigger ?? 'imperative';
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

  startSwipe(destination: BackDestination): SwipePreview | null {
    const view = this.document.defaultView;
    const layer = this.layer();
    if (
      view === null ||
      layer === null ||
      this.running !== null ||
      !this.compact() ||
      view.matchMedia?.(LESS_MOTION).matches !== false ||
      this.document.querySelector(SHOWN_DIALOG) !== null
    ) {
      return null;
    }
    const behind = destination.kind === 'step' ? this.keptAt(destination.depth, view) : null;
    const overlay = this.overlay('pop');
    overlay.classList.add(`${PAGE_TRANSITION_CLASS}--swipe`);
    const arriving = this.place(overlay, behind ?? this.placeholder(), 'under');
    const leaving = this.place(overlay, this.keep(layer), 'over');
    const bar = this.dressChrome(overlay, leaving, arriving);
    const under = arriving.box;
    const over = leaving.box;
    const dim = under.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__dim`);
    const running: Running = { kind: 'pop', overlay, swiping: true, revealed: false };
    this.running = running;
    const width = Math.max(1, view.innerWidth);
    const settle = async (end: SwipeSettle): Promise<void> => {
      if (this.running !== running) {
        return;
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
        ...barMotions(bar, end.completes ? 1 : 0, timing),
      ];
      await Promise.race([
        Promise.allSettled(motions.map((motion) => motion.finished)),
        new Promise((done) => view.setTimeout(done, PAGE_TRANSITION_LONGEST_MS)),
      ]);
      if (this.running !== running) {
        return;
      }
      if (end.completes) {
        this.handingOver = true;
        this.finishing = view.setTimeout(() => this.finish(), PAGE_COVER_LONGEST_MS);
      } else {
        this.finish();
      }
    };
    let offset = 0;
    return {
      follow: (to) => {
        offset = Math.min(width, Math.max(0, to));
        const progress = offset / width;
        over.style.transform = `translateX(${offset}px)`;
        under.style.transform = parallaxAt(progress);
        if (dim !== null) {
          dim.style.opacity = String(1 - progress);
        }
        followBar(bar, progress);
      },
      settle,
      slideBack: () =>
        settle({
          completes: false,
          from: offset,
          to: 0,
          durationMs: this.pageDurationMs(),
          easing: 'ease-out',
        }),
    };
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
    if (layer === null || view === null || !this.compact() || !motionAllowed(view)) {
      return;
    }
    const deepens =
      !extras.skipLocationChange &&
      this.trigger === 'imperative' &&
      extras.info !== BACK_NAVIGATION &&
      (!extras.replaceUrl || depthIn(extras.state) >= this.backTarget.nextDepth());
    if (kind === null) {
      if (deepens) {
        this.keepBehind(this.backTarget.nextDepth() - 1, this.keep(layer));
      }
      return;
    }
    const overlay = this.overlay(kind);
    const left = this.keep(layer);
    if (kind === 'push') {
      this.keepBehind(this.backTarget.nextDepth() - 1, left);
    }
    const placed = this.place(overlay, left, kind === 'push' ? 'under' : 'over');
    this.dressChrome(overlay, placed, null);
    this.running = { kind, overlay, swiping: false, revealed: false };
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
      const layer = this.layer();
      if (running.swiping) {
        if (this.running === running) {
          this.finish();
        }
        return;
      }
      if (this.running !== running || layer === null) {
        this.finish();
        return;
      }
      const shown = this.place(
        running.overlay,
        this.keep(layer),
        running.kind === 'push' ? 'over' : 'under',
      );
      const left = this.placedPage(running.overlay, running.kind === 'push' ? 'under' : 'over');
      this.dressChrome(running.overlay, left, shown);
      running.overlay.classList.add(`${PAGE_TRANSITION_CLASS}--moving`);
      this.finishWhenStill(running, shown.box, view);
    });
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
    const copy = kept.copy === null ? null : (kept.copy.cloneNode(true) as HTMLElement);
    if (copy !== null) {
      scroller.append(copy);
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
    return { box: page, copy };
  }

  private placedPage(overlay: HTMLElement, position: 'under' | 'over'): PlacedPage | null {
    const box = overlay.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__page--${position}`);
    if (box === null) {
      return null;
    }
    const scroller = box.querySelector(`.${PAGE_TRANSITION_CLASS}__scroller`);
    return { box, copy: (scroller?.firstElementChild as HTMLElement | null) ?? null };
  }

  private dressChrome(
    overlay: HTMLElement,
    leaving: PlacedPage | null,
    arriving: PlacedPage | null,
  ): BarParts {
    const leavingBar = leaving?.copy?.querySelector('.back-button') ?? null;
    const arrivingBar = arriving?.copy?.querySelector('.back-button') ?? null;
    const bothTabBars =
      leaving?.copy?.querySelector('app-tab-bar') && arriving?.copy?.querySelector('app-tab-bar');
    if (bothTabBars) {
      leaving?.copy?.querySelectorAll('app-tab-bar').forEach((bar) => bar.remove());
      arriving?.copy?.querySelectorAll('app-tab-bar').forEach((bar) => bar.remove());
    }
    overlay.classList.toggle(`${PAGE_TRANSITION_CLASS}--under-tab-bar`, Boolean(bothTabBars));
    overlay.querySelector(`.${PAGE_TRANSITION_CLASS}__bar`)?.remove();
    const bar = this.document.createElement('div');
    bar.className = `${PAGE_TRANSITION_CLASS}__bar`;
    overlay.append(bar);
    const arrivingPart =
      arrivingBar === null ? null : this.barPart(bar, arriving!.copy!, 'arriving');
    const leavingPart = leavingBar === null ? null : this.barPart(bar, leaving!.copy!, 'leaving');
    if (
      leavingPart !== null &&
      arrivingPart !== null &&
      this.looksAlike(leavingPart, arrivingPart)
    ) {
      arrivingPart.remove();
      leavingPart.classList.add(`${PAGE_TRANSITION_CLASS}__bar-part--still`);
      return { leaving: null, arriving: null };
    }
    return { leaving: leavingPart, arriving: arrivingPart };
  }

  private barPart(bar: HTMLElement, copy: HTMLElement, side: 'leaving' | 'arriving'): HTMLElement {
    const part = this.document.createElement('div');
    part.className = `${PAGE_TRANSITION_CLASS}__bar-part ${PAGE_TRANSITION_CLASS}__bar-part--${side}`;
    const header = copy.querySelector('app-header');
    if (header !== null) {
      part.append(header.cloneNode(true));
    }
    bar.append(part);
    return part;
  }

  private looksAlike(leaving: HTMLElement, arriving: HTMLElement): boolean {
    const view = this.document.defaultView;
    const first = leaving.querySelector('.back-button');
    const second = arriving.querySelector('.back-button');
    if (view === null || first === null || second === null) {
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
      box.left === otherBox.left &&
      box.top === otherBox.top &&
      box.width === otherBox.width
    );
  }

  private pageDurationMs(): number {
    const view = this.document.defaultView;
    const token = view
      ?.getComputedStyle(this.document.documentElement)
      .getPropertyValue('--duration-page');
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
  }
}

function motionAllowed(view: Window): boolean {
  return view.matchMedia?.(LESS_MOTION).matches === false;
}

function depthIn(state: unknown): number {
  const depth =
    typeof state === 'object' && state !== null
      ? (state as Record<string, unknown>)[APP_DEPTH_KEY]
      : undefined;
  return typeof depth === 'number' ? depth : 0;
}

function followBar(bar: BarParts, progress: number): void {
  if (bar.leaving !== null) {
    bar.leaving.style.opacity = String(1 - progress);
  }
  if (bar.arriving !== null) {
    bar.arriving.style.opacity = String(progress);
  }
}

function barMotions(
  bar: BarParts,
  progress: number,
  timing: KeyframeAnimationOptions,
): Animation[] {
  return [
    ...(bar.leaving === null ? [] : [bar.leaving.animate([{ opacity: 1 - progress }], timing)]),
    ...(bar.arriving === null ? [] : [bar.arriving.animate([{ opacity: progress }], timing)]),
  ];
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
