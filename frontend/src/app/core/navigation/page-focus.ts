import {
  afterNextRender,
  type AfterRenderRef,
  DestroyRef,
  DOCUMENT,
  inject,
  Injectable,
  Injector,
} from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { InputModality } from '../input/input-modality';
import {
  bringIntoView,
  focusWithoutScroll,
  liesInView,
  motionsMoving,
  viewBand,
} from '../layout/focus-in-view';
import { pathOf } from './app-tabs';
import { BackTarget } from './back-target';
import { LISTENING, VISITOR_MOVES } from './growing-page';
import { NavigationPreview } from './navigation-preview';
import { PagePlacement } from './page-placement';
import { liveDialogs } from './page-transitions';

export const RETURNING_FOCUS_LONGEST_MS = 3000;
const FOCUS_DRAWN_AT_FRAME_CALLBACK = 3;
export const LEADS_TO_ATTRIBUTE = 'data-leads-to';

const KEPT_OPENERS = 20;
const OPENER_FRESH_MS = 1000;
const CONTROL = 'a[href], button, [role="button"], [tabindex]';
const LEADING_TO = `a[href], [${LEADS_TO_ATTRIBUTE}]`;
const PAGE_HEADING = 'h1[tabindex="-1"]';
const SHEET_TITLE = 'h2[tabindex="-1"]';
const FOCUS_TARGET = '[tabindex="-1"]';

interface Press {
  readonly control: Element;
  readonly at: number;
}

interface ScrollGuard {
  stop(): void;
  measure<T>(read: () => T): T;
}

@Injectable({ providedIn: 'root' })
export class PageFocus {
  private readonly router = inject(Router);
  private readonly back = inject(BackTarget);
  private readonly preview = inject(NavigationPreview);
  private readonly modality = inject(InputModality);
  private readonly placement = inject(PagePlacement);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly openers = new Map<string, string>();
  private pressed: Press | null = null;
  private stopReturning: (() => void) | null = null;
  private guard: ScrollGuard | null = null;

  constructor() {
    const press = (event: Event): void => {
      const control = event.target instanceof Element ? event.target.closest(CONTROL) : null;
      this.pressed = control === null ? null : { control, at: this.now() };
    };
    const listening: AddEventListenerOptions = { capture: true, passive: true };
    this.document.addEventListener('click', press, listening);
    const navigations = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.navigationStarts(event);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('click', press, listening);
      navigations.unsubscribe();
      this.stopReturning?.();
      this.guard?.stop();
    });
  }

  movesOnLastNavigation(): boolean {
    const navigation = this.router.lastSuccessfulNavigation();
    if (navigation === null || navigation.previousNavigation === null || this.preview.drives()) {
      return false;
    }
    return navigation.trigger !== 'popstate' || this.back.returningByButton;
  }

  follow(main: HTMLElement, fragment: string | null): void {
    if (liveDialogs(this.document, 'dialog[open]').length > 0) {
      return;
    }
    if (fragment) {
      this.focusQuietly(this.document.getElementById(fragment));
      return;
    }
    const returning = this.returnTarget(main);
    if (!main.contains(this.document.activeElement) && returning?.() == null) {
      this.focusQuietly(main.querySelector<HTMLElement>('h1') ?? main);
    }
    this.returnAfterStepBack(main);
  }

  keepOnPressed(control: HTMLElement): void {
    if (this.document.activeElement !== control) {
      control.focus({ preventScroll: true });
    }
  }

  keepNear(places: readonly HTMLElement[]): void {
    const connected = places.filter((place) => place.isConnected);
    if (!this.focusLostAmong(connected)) {
      return;
    }
    for (const at of connected) {
      if (at.localName === 'dialog') {
        this.focusQuietly(at.querySelector<HTMLElement>(SHEET_TITLE) ?? at);
        return;
      }
      const heading = at.querySelector<HTMLElement>(PAGE_HEADING);
      if (heading !== null) {
        this.focusQuietly(heading);
        return;
      }
      if (at.matches(FOCUS_TARGET)) {
        this.focusQuietly(at);
        return;
      }
    }
  }

  private focusLostAmong(places: readonly HTMLElement[]): boolean {
    const active = this.document.activeElement;
    if (active === null || active === this.document.body) {
      return true;
    }
    return active.localName === 'dialog' && places.includes(active as HTMLElement);
  }

  returnAfterStepBack(scope: HTMLElement): void {
    this.stopReturning?.();
    this.guard?.stop();
    const find = this.preview.drives() ? null : this.returnTarget(scope);
    const view = this.document.defaultView;
    if (find === null || view === null) {
      return;
    }
    if (this.placement.isSettled() && this.placement.isAnswered()) {
      this.returnWhenFound(scope, find, view);
      return;
    }
    let waiting = true;
    let drawing: AfterRenderRef | null = null;
    const stop = (): void => {
      waiting = false;
      drawing?.destroy();
      if (this.stopReturning === stop) {
        this.stopReturning = null;
      }
    };
    this.stopReturning = stop;
    const until = view.performance.now() + RETURNING_FOCUS_LONGEST_MS;
    const left = (): number => Math.max(0, until - view.performance.now());
    void this.placement
      .placed(view, left())
      .then(() => (waiting ? this.placement.answered(view, left()) : undefined))
      .then(() => {
        if (!waiting) {
          return;
        }
        drawing = afterNextRender(
          () => {
            if (waiting) {
              stop();
              this.returnWhenFound(scope, find, view);
            }
          },
          { injector: this.injector },
        );
      });
  }

  private returnWhenFound(
    scope: HTMLElement,
    find: () => HTMLElement | null,
    view: Window & typeof globalThis,
  ): void {
    if (this.bringBack(scope, find)) {
      return;
    }
    const observer = new view.MutationObserver(() => {
      if (!this.atFallback(scope) || this.bringBack(scope, find)) {
        stop();
      }
    });
    const timer = view.setTimeout(() => {
      stop();
      if (this.document.activeElement === this.document.body) {
        this.focusQuietly(scope.querySelector<HTMLElement>('h1'));
      }
    }, RETURNING_FOCUS_LONGEST_MS);
    const stop = (): void => {
      observer.disconnect();
      view.clearTimeout(timer);
      if (this.stopReturning === stop) {
        this.stopReturning = null;
      }
    };
    this.stopReturning = stop;
    observer.observe(scope, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['id', 'href', LEADS_TO_ATTRIBUTE],
    });
  }

  private navigationStarts(event: NavigationStart): void {
    this.stopReturning?.();
    this.guard?.stop();
    const pressed = this.pressed;
    this.pressed = null;
    if (event.navigationTrigger === 'popstate') {
      return;
    }
    const left = pathOf(this.router.url);
    this.openers.delete(left);
    const opener = pressed !== null && this.now() - pressed.at <= OPENER_FRESH_MS ? pressed : null;
    if (opener === null || opener.control.id === '' || opener.control.closest('dialog') !== null) {
      return;
    }
    this.openers.set(left, opener.control.id);
    while (this.openers.size > KEPT_OPENERS) {
      this.openers.delete(this.openers.keys().next().value!);
    }
  }

  private returnTarget(scope: HTMLElement): (() => HTMLElement | null) | null {
    const left = this.back.leftPath;
    if (this.router.lastSuccessfulNavigation()?.trigger !== 'popstate' || left === null) {
      return null;
    }
    const opener = this.openers.get(pathOf(this.router.url)) ?? null;
    return () => this.openerIn(scope, opener) ?? this.leadingTo(scope, left);
  }

  private openerIn(scope: HTMLElement, id: string | null): HTMLElement | null {
    const opener = id === null ? null : this.document.getElementById(id);
    return opener !== null && scope.contains(opener) && opener.closest('dialog') === null
      ? opener
      : null;
  }

  private leadingTo(scope: HTMLElement, path: string): HTMLElement | null {
    return (
      Array.from(scope.querySelectorAll<HTMLElement>(LEADING_TO)).find(
        (candidate) =>
          (candidate.getAttribute(LEADS_TO_ATTRIBUTE) ?? candidate.getAttribute('href')) === path &&
          candidate.closest('dialog') === null,
      ) ?? null
    );
  }

  private bringBack(scope: HTMLElement, find: () => HTMLElement | null): boolean {
    const target = find();
    if (target === null || !this.atFallback(scope)) {
      return false;
    }
    if (
      !focusWithoutScroll(target, this.modality.lastPressByPointer() ? { focusVisible: false } : {})
    ) {
      return false;
    }
    this.guardScrollUntilFocusDrawn(target);
    this.bringIntoViewOnceStill(target);
    return true;
  }

  private bringIntoViewOnceStill(target: HTMLElement): void {
    const view = this.document.defaultView;
    const motions = motionsMoving(target);
    if (view === null || motions.length === 0) {
      this.bringAndKeep(target);
      return;
    }
    const settle = (): void => {
      if (this.stopReturning !== stop) {
        return;
      }
      stop();
      if (this.document.activeElement === target) {
        this.bringAndKeep(target);
      }
    };
    const timer = view.setTimeout(settle, RETURNING_FOCUS_LONGEST_MS);
    const stop = (): void => {
      view.clearTimeout(timer);
      if (this.stopReturning === stop) {
        this.stopReturning = null;
      }
    };
    this.stopReturning = stop;
    void Promise.allSettled(motions.map((motion) => motion.finished)).then(settle);
  }

  private bringAndKeep(target: HTMLElement): void {
    const guard = this.guard;
    const brought =
      guard === null ? bringIntoView(target) : guard.measure(() => bringIntoView(target));
    if (brought) {
      guard?.stop();
      this.keepWhereBrought(target);
    }
  }

  private guardScrollUntilFocusDrawn(target: HTMLElement): void {
    this.guard?.stop();
    const view = this.document.defaultView;
    if (view === null || typeof view.requestAnimationFrame !== 'function' || !liesInView(target)) {
      return;
    }
    const style = this.document.documentElement.style;
    const ownPadding = { top: style.scrollPaddingTop, bottom: style.scrollPaddingBottom };
    const band = viewBand(target);
    const box = target.getBoundingClientRect();
    const margins = view.getComputedStyle(target);
    const top = box.top - (Number.parseFloat(margins.scrollMarginTop) || 0);
    const bottom = box.bottom + (Number.parseFloat(margins.scrollMarginBottom) || 0);
    const liftsTop = top < band.top;
    const liftsBottom = bottom > band.bottom;
    const sticksOut = top < 0 || bottom > view.innerHeight;
    const kept = view.scrollY;
    const lift = (): void => {
      if (liftsTop) {
        style.scrollPaddingTop = '0px';
      }
      if (liftsBottom) {
        style.scrollPaddingBottom = '0px';
      }
    };
    const restore = (): void => {
      if (liftsTop) {
        style.scrollPaddingTop = ownPadding.top;
      }
      if (liftsBottom) {
        style.scrollPaddingBottom = ownPadding.bottom;
      }
    };
    let callbacks = 0;
    let frame = 0;
    const putBack = (): void => {
      if (this.document.activeElement !== target) {
        guard.stop();
        return;
      }
      if (Math.abs(view.scrollY - kept) >= 1) {
        view.scrollTo({ top: kept, behavior: 'instant' });
      }
    };
    const countFrame = (): void => {
      callbacks++;
      if (callbacks >= FOCUS_DRAWN_AT_FRAME_CALLBACK || this.document.activeElement !== target) {
        guard.stop();
        return;
      }
      frame = view.requestAnimationFrame(countFrame);
    };
    const timer = view.setTimeout(() => guard.stop(), RETURNING_FOCUS_LONGEST_MS);
    const guard: ScrollGuard = {
      stop: () => {
        if (this.guard !== guard) {
          return;
        }
        this.guard = null;
        view.cancelAnimationFrame?.(frame);
        view.clearTimeout(timer);
        if (sticksOut) {
          view.removeEventListener('scroll', putBack, LISTENING);
        }
        VISITOR_MOVES.forEach((type) => view.removeEventListener(type, guard.stop, LISTENING));
        restore();
      },
      measure: (read) => {
        restore();
        try {
          return read();
        } finally {
          if (this.guard === guard) {
            lift();
          }
        }
      },
    };
    this.guard = guard;
    lift();
    VISITOR_MOVES.forEach((type) => view.addEventListener(type, guard.stop, LISTENING));
    if (sticksOut) {
      view.addEventListener('scroll', putBack, LISTENING);
    }
    frame = view.requestAnimationFrame(countFrame);
  }

  private keepWhereBrought(target: HTMLElement): void {
    const view = this.document.defaultView;
    if (view === null || typeof view.ResizeObserver === 'undefined') {
      return;
    }
    let broughtTo = target.getBoundingClientRect().top;
    const follow = (): void => {
      if (this.document.activeElement !== target) {
        stop();
        return;
      }
      const drift = target.getBoundingClientRect().top - broughtTo;
      if (Math.abs(drift) >= 1) {
        view.scrollBy({ top: drift, behavior: 'instant' });
        broughtTo = target.getBoundingClientRect().top;
      }
    };
    const growth = new view.ResizeObserver(follow);
    const timer = view.setTimeout(() => stop(), RETURNING_FOCUS_LONGEST_MS);
    const stop = (): void => {
      growth.disconnect();
      view.clearTimeout(timer);
      VISITOR_MOVES.forEach((type) => view.removeEventListener(type, stop, LISTENING));
      if (this.stopReturning === stop) {
        this.stopReturning = null;
      }
    };
    this.stopReturning = stop;
    VISITOR_MOVES.forEach((type) => view.addEventListener(type, stop, LISTENING));
    growth.observe(this.document.body);
  }

  private atFallback(scope: HTMLElement): boolean {
    const active = this.document.activeElement;
    return (
      liveDialogs(this.document, 'dialog[open]').length === 0 &&
      (active === null ||
        active === this.document.body ||
        active === this.document.documentElement ||
        active === scope ||
        active === scope.querySelector('h1'))
    );
  }

  private now(): number {
    return this.document.defaultView?.performance.now() ?? 0;
  }

  private focusQuietly(target: HTMLElement | null): void {
    if (target === null) {
      return;
    }
    if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
    }
    target.focus({ preventScroll: true });
  }
}
