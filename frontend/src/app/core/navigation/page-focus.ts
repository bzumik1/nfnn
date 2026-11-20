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
import { focusInView } from '../layout/focus-in-view';
import { pathOf } from './app-tabs';
import { BackTarget } from './back-target';
import { NavigationPreview } from './navigation-preview';
import { PagePlacement } from './page-placement';
import { liveDialogs } from './page-transitions';

export const RETURNING_FOCUS_LONGEST_MS = 3000;
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
    const timer = view.setTimeout(() => stop(), RETURNING_FOCUS_LONGEST_MS);
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
    return focusInView(target, this.modality.lastPressByPointer() ? { focusVisible: false } : {});
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
