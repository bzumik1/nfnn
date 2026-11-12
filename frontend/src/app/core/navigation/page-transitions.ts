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
import { BACK_NAVIGATION, BackDestination, BackTarget } from './back-target';
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
const SHOWN_DIALOG = 'dialog[open], dialog.dialog--leaving';

interface Running {
  readonly kind: PageTransitionKind;
  readonly withTabBar: boolean;
  readonly overlay: HTMLElement;
  readonly swiping: boolean;
  revealed: boolean;
}

interface KeptPage {
  readonly copy: HTMLElement | null;
  readonly scrollY: number;
  readonly ground: string;
  readonly withTabBar: boolean;
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
    const behind = destination.kind === 'step' ? this.kept.get(destination.depth) : undefined;
    const withTabBar = behind?.withTabBar ?? false;
    const overlay = this.overlay('pop', withTabBar);
    overlay.classList.add(`${PAGE_TRANSITION_CLASS}--swipe`);
    const under = this.place(overlay, behind ?? this.placeholder(), 'under');
    const over = this.place(overlay, this.keep(layer, withTabBar), 'over');
    const dim = under.querySelector<HTMLElement>(`.${PAGE_TRANSITION_CLASS}__dim`);
    const running: Running = { kind: 'pop', withTabBar, overlay, swiping: true, revealed: false };
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
    if (kind === null || layer === null || view === null) {
      return;
    }
    const withTabBar = this.chrome().tabBar !== destination.tabBar;
    const overlay = this.overlay(kind, withTabBar);
    const left = this.keep(layer, withTabBar);
    if (kind === 'push') {
      this.keepBehind(this.backTarget.nextDepth() - 1, left);
    }
    this.place(overlay, left, kind === 'push' ? 'under' : 'over');
    this.running = { kind, withTabBar, overlay, swiping: false, revealed: false };
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
      const page = this.place(
        running.overlay,
        this.keep(layer, running.withTabBar),
        running.kind === 'push' ? 'over' : 'under',
      );
      running.overlay.classList.add(`${PAGE_TRANSITION_CLASS}--moving`);
      this.finishWhenStill(running, page, view);
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

  private overlay(kind: PageTransitionKind, withTabBar: boolean): HTMLElement {
    const overlay = this.document.createElement('div');
    overlay.className = `${PAGE_TRANSITION_CLASS} ${PAGE_TRANSITION_CLASS}--${kind}`;
    overlay.classList.toggle(`${PAGE_TRANSITION_CLASS}--under-tab-bar`, !withTabBar);
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    this.document.body.append(overlay);
    return overlay;
  }

  private keep(layer: HTMLElement, withTabBar: boolean): KeptPage {
    return {
      copy: stillCopyOf(layer, { withTabBar }),
      scrollY: this.document.defaultView?.scrollY ?? 0,
      ground: this.groundColour(),
      withTabBar,
    };
  }

  private placeholder(): KeptPage {
    return { copy: null, scrollY: 0, ground: this.groundColour(), withTabBar: false };
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

  private place(overlay: HTMLElement, kept: KeptPage, position: 'under' | 'over'): HTMLElement {
    const page = this.document.createElement('div');
    page.className = `${PAGE_TRANSITION_CLASS}__page ${PAGE_TRANSITION_CLASS}__page--${position}`;
    page.style.backgroundColor = kept.ground;
    const scroller = this.document.createElement('div');
    scroller.className = `${PAGE_TRANSITION_CLASS}__scroller`;
    if (kept.copy !== null) {
      scroller.append(kept.copy);
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
    return page;
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
