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
} from '@angular/router';
import { CompactLayout } from '../layout/compact-layout';
import { BACK_NAVIGATION } from './back-target';
import { NavigationPreview } from './navigation-preview';
import { pageFadeFor } from './page-transition-kind';
import {
  PAGE_COVER_LONGEST_MS,
  PAGE_LAYER_CLASS,
  PAGE_TRANSITION_LONGEST_MS,
} from './page-transitions';
import { ScrollHold } from './scroll-hold';
import { stillCopyOf } from './still-copy';

export const PAGE_FADE_CLASS = 'page-fade';
export const PAGE_FADE_HIDDEN_CLASS = 'page-fade-hidden';
export const PAGE_FADE_ARRIVING_CLASS = 'page-fade-arriving';

const LESS_MOTION = '(prefers-reduced-motion: reduce)';
const OPEN_DIALOG = 'dialog[open]:not(.dialog--leaving)';
const CONTENT = 'main#obsah';
const INTERRUPTIONS = ['pointerdown', 'keydown', 'wheel'] as const;
const RENDERED_AFTER_FRAMES = 2;

interface Fading {
  readonly overlay: HTMLElement;
  readonly copy: HTMLElement;
  readonly left: HTMLElement | null;
  readonly ground: string;
  readonly focused: HTMLElement | null;
  arrived: boolean;
}

@Injectable({ providedIn: 'root' })
export class PageFade {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly compact = inject(CompactLayout).isCompact;
  private readonly preview = inject(NavigationPreview);
  private readonly scrollHold = inject(ScrollHold);
  private readonly interrupt = (): void => this.finish();
  private fading: Fading | null = null;
  private limit: number | null = null;

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
      this.finish();
    } else if (event instanceof GuardsCheckEnd && event.shouldActivate) {
      this.cover(event);
    } else if (event instanceof NavigationEnd) {
      this.arrived();
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
    const layer = this.document.querySelector<HTMLElement>(`.${PAGE_LAYER_CLASS}`);
    const navigation = untracked(this.router.currentNavigation);
    if (view === null || layer === null || navigation === null) {
      return;
    }
    const fades = pageFadeFor({
      first: event.id === 1 || !this.router.navigated,
      reducedMotion: view.matchMedia?.(LESS_MOTION).matches !== false,
      compact: this.compact(),
      dialogOpen: this.document.querySelector(OPEN_DIALOG) !== null,
      trigger: navigation.trigger,
      back: navigation.extras.info === BACK_NAVIGATION,
      skipLocationChange: navigation.extras.skipLocationChange === true,
      from: this.router.url,
      to: event.urlAfterRedirects,
    });
    if (!fades) {
      return;
    }
    const overlay = this.document.createElement('div');
    overlay.className = PAGE_FADE_CLASS;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('inert', '');
    const copy = this.document.createElement('div');
    copy.className = `${PAGE_FADE_CLASS}__copy`;
    copy.style.width = `${this.document.documentElement.clientWidth}px`;
    const ground = this.groundOf(layer, view);
    if (shellChanges(event, this.router)) {
      overlay.style.backgroundColor = ground;
    }
    copy.append(stillCopyOf(layer));
    overlay.append(copy);
    this.document.body.append(overlay);
    copy.scrollTop = -layer.getBoundingClientRect().top;
    const left = this.document.querySelector<HTMLElement>(CONTENT);
    const focused = this.document.activeElement;
    left?.setAttribute('aria-hidden', 'true');
    left?.setAttribute('inert', '');
    this.document.documentElement.classList.add(PAGE_FADE_HIDDEN_CLASS);
    this.scrollHold.hold();
    INTERRUPTIONS.forEach((type) =>
      this.document.addEventListener(type, this.interrupt, { capture: true, passive: true }),
    );
    view.addEventListener('resize', this.interrupt);
    this.fading = {
      overlay,
      copy,
      left,
      ground,
      focused: focused instanceof HTMLElement && left?.contains(focused) === true ? focused : null,
      arrived: false,
    };
    this.limit = view.setTimeout(() => this.finish(), PAGE_COVER_LONGEST_MS);
  }

  private arrived(): void {
    const fading = this.fading;
    const view = this.document.defaultView;
    if (fading === null || view === null) {
      return;
    }
    fading.arrived = true;
    unhide(fading.left);
    this.keepGround(fading, view);
    afterFrames(view, RENDERED_AFTER_FRAMES, () => {
      if (this.fading === fading) {
        this.keepGround(fading, view);
        fading.overlay.classList.add(`${PAGE_FADE_CLASS}--leaving`);
        this.whenStill(fading.copy, view, () => this.fadeIn(fading, view));
      }
    });
  }

  private fadeIn(fading: Fading, view: Window): void {
    if (this.fading !== fading) {
      return;
    }
    fading.overlay.remove();
    const root = this.document.documentElement;
    root.classList.remove(PAGE_FADE_HIDDEN_CLASS);
    root.classList.add(PAGE_FADE_ARRIVING_CLASS);
    this.scrollHold.release();
    const content = this.document.querySelector<HTMLElement>(CONTENT);
    if (content === null) {
      this.finish();
      return;
    }
    this.whenStill(content, view, () => {
      if (this.fading === fading) {
        this.finish();
      }
    });
  }

  private whenStill(element: HTMLElement, view: Window, then: () => void): void {
    if (this.limit !== null) {
      view.clearTimeout(this.limit);
    }
    let done = false;
    const once = (): void => {
      if (!done) {
        done = true;
        then();
      }
    };
    this.limit = view.setTimeout(once, PAGE_TRANSITION_LONGEST_MS);
    view.getComputedStyle(element).getPropertyValue('animation-name');
    const motions = typeof element.getAnimations === 'function' ? element.getAnimations() : [];
    void Promise.allSettled(motions.map((motion) => motion.finished)).then(once);
  }

  private keepGround(fading: Fading, view: Window): void {
    const layer = this.document.querySelector<HTMLElement>(`.${PAGE_LAYER_CLASS}`);
    const ground = layer === null ? fading.ground : this.groundOf(layer, view);
    if (fading.ground !== '' && ground !== fading.ground) {
      fading.overlay.style.backgroundColor = fading.ground;
    }
  }

  private groundOf(layer: HTMLElement, view: Window): string {
    return (
      [layer, this.document.body, this.document.documentElement]
        .map((element) => view.getComputedStyle(element).backgroundColor)
        .find((colour) => colour !== '' && colour !== 'transparent' && !isClear(colour)) ?? ''
    );
  }

  private giveFocusBack(focused: HTMLElement | null): void {
    const active = this.document.activeElement;
    if (focused?.isConnected === true && (active === null || active === this.document.body)) {
      focused.focus({ preventScroll: true });
    }
  }

  private finish(): void {
    if (this.limit !== null) {
      this.document.defaultView?.clearTimeout(this.limit);
      this.limit = null;
    }
    const fading = this.fading;
    this.fading = null;
    if (fading !== null) {
      INTERRUPTIONS.forEach((type) =>
        this.document.removeEventListener(type, this.interrupt, { capture: true }),
      );
      this.document.defaultView?.removeEventListener('resize', this.interrupt);
      fading.overlay.remove();
      unhide(fading.left);
      if (!fading.arrived) {
        this.giveFocusBack(fading.focused);
      }
    }
    this.document.documentElement.classList.remove(
      PAGE_FADE_HIDDEN_CLASS,
      PAGE_FADE_ARRIVING_CLASS,
    );
    this.scrollHold.release();
  }
}

function shellChanges(event: GuardsCheckEnd, router: Router): boolean {
  return (
    event.state.root.firstChild?.routeConfig !==
    router.routerState.snapshot.root.firstChild?.routeConfig
  );
}

function isClear(colour: string): boolean {
  return /^rgba\(.*,\s*0\)$/.test(colour);
}

function unhide(content: HTMLElement | null): void {
  content?.removeAttribute('aria-hidden');
  content?.removeAttribute('inert');
}

function afterFrames(view: Window, frames: number, then: () => void): void {
  if (frames === 0) {
    then();
    return;
  }
  view.requestAnimationFrame(() => afterFrames(view, frames - 1, then));
}

export const pageFadeAtStart: EnvironmentProviders = provideAppInitializer(
  () => void inject(PageFade),
);
