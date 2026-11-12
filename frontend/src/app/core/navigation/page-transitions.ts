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
import { BACK_NAVIGATION } from './back-target';
import { NavigationFacts, PageTransitionKind, pageTransitionFor } from './page-transition-kind';
import { chromeOf, RouteChrome } from './route-chrome';
import { stillCopyOf } from './still-copy';

export const PAGE_LAYER_CLASS = 'page-layer';
export const PAGE_TRANSITION_CLASS = 'page-transition';
export const PAGE_TRANSITION_LONGEST_MS = 2000;
export const PAGE_COVER_LONGEST_MS = 5000;

const LESS_MOTION = '(prefers-reduced-motion: reduce)';
const SHOWN_DIALOG = 'dialog[open], dialog.dialog--leaving';

interface Running {
  readonly kind: PageTransitionKind;
  readonly withTabBar: boolean;
  readonly overlay: HTMLElement;
  revealed: boolean;
}

@Injectable({ providedIn: 'root' })
export class PageTransitions {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly chrome = inject(RouteChrome).current;
  private readonly compact = inject(CompactLayout).isCompact;
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
      this.finish();
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

  private cover(event: GuardsCheckEnd): void {
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
    const overlay = this.document.createElement('div');
    overlay.className = `${PAGE_TRANSITION_CLASS} ${PAGE_TRANSITION_CLASS}--${kind}`;
    overlay.classList.toggle(`${PAGE_TRANSITION_CLASS}--under-tab-bar`, !withTabBar);
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    this.document.body.append(overlay);
    this.place(overlay, layer, withTabBar, kind === 'push' ? 'under' : 'over');
    this.running = { kind, withTabBar, overlay, revealed: false };
    this.finishing = view.setTimeout(() => this.finish(), PAGE_COVER_LONGEST_MS);
  }

  private revealIfNoScrollFollows(): void {
    const view = this.document.defaultView;
    if (this.running !== null && view !== null) {
      view.setTimeout(() => this.reveal(), PAGE_TRANSITION_LONGEST_MS / 4);
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
      if (this.running !== running || layer === null) {
        this.finish();
        return;
      }
      const page = this.place(
        running.overlay,
        layer,
        running.withTabBar,
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

  private place(
    overlay: HTMLElement,
    layer: HTMLElement,
    withTabBar: boolean,
    position: 'under' | 'over',
  ): HTMLElement {
    const view = this.document.defaultView;
    const page = this.document.createElement('div');
    page.className = `${PAGE_TRANSITION_CLASS}__page ${PAGE_TRANSITION_CLASS}__page--${position}`;
    page.style.backgroundColor = this.groundColour();
    const scroller = this.document.createElement('div');
    scroller.className = `${PAGE_TRANSITION_CLASS}__scroller`;
    scroller.append(stillCopyOf(layer, { withTabBar }));
    page.append(scroller);
    if (position === 'under') {
      const dim = this.document.createElement('div');
      dim.className = `${PAGE_TRANSITION_CLASS}__dim`;
      page.append(dim);
      overlay.prepend(page);
    } else {
      overlay.append(page);
    }
    scroller.scrollTop = view?.scrollY ?? 0;
    return page;
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
  }
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
