import { DOCUMENT } from '@angular/common';
import { ApplicationRef, inject, Injectable, Injector } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  destroyDetachedRouteHandle,
  DetachedRouteHandle,
  NavigationStart,
  Route,
  Router,
} from '@angular/router';
import { Subscription } from 'rxjs';
import { pathOf } from './app-tabs';

export const PREVIEW_NAVIGATION = 'nfnn.preview';
export const PREVIEW_DRAWING_LONGEST_MS = 300;

type Phase = 'none' | 'out' | 'back';

interface Slot {
  readonly handle: DetachedRouteHandle;
  readonly route: Route | null;
  readonly path: string;
}

@Injectable({ providedIn: 'root' })
export class NavigationPreview {
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private phase: Phase = 'none';
  private origin: Slot[] = [];
  private destination: Slot[] = [];
  private previewed: string | null = null;
  private watching: Subscription | null = null;

  active(): boolean {
    return this.phase !== 'none';
  }

  async visit<T>(path: string, capture: () => T): Promise<T | null> {
    if (this.phase !== 'none') {
      return null;
    }
    const router = this.injector.get(Router);
    this.watch(router);
    this.discard();
    const origin = router.url;
    const top = this.window?.scrollY ?? 0;
    const focused = this.document.activeElement;
    let captured: T | null = null;
    this.phase = 'out';
    try {
      if (await this.navigate(router, path)) {
        this.previewed = path;
        await this.drawn().catch(() => undefined);
        captured = capture();
      }
    } finally {
      this.phase = 'back';
      const returned = await this.navigate(router, origin);
      await this.drawn().catch(() => undefined);
      this.phase = 'none';
      this.window?.scrollTo({ top, behavior: 'instant' });
      if (focused instanceof HTMLElement && focused.isConnected && focused !== this.document.body) {
        focused.focus({ preventScroll: true });
      }
      if (!returned && pathOf(router.url) !== pathOf(origin)) {
        this.letGo('origin');
        void router.navigateByUrl(origin, { replaceUrl: true });
      }
    }
    return captured;
  }

  discard(): void {
    this.letGo('destination');
    this.previewed = null;
  }

  took(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): boolean {
    if (this.phase === 'out') {
      if (handle !== null) {
        this.origin.push(slotOf(route, handle));
      }
      return true;
    }
    if (this.phase === 'back') {
      if (handle !== null) {
        this.destination.push(slotOf(route, handle));
      } else {
        this.origin = this.origin.filter((slot) => !matches(slot, route));
      }
      return true;
    }
    if (handle === null && this.destination.some((slot) => matches(slot, route))) {
      this.destination = this.destination.filter((slot) => !matches(slot, route));
      if (this.destination.length === 0) {
        this.previewed = null;
      }
      return true;
    }
    return false;
  }

  holds(route: ActivatedRouteSnapshot): boolean | null {
    if (this.phase === 'out') {
      return false;
    }
    if (this.phase === 'back') {
      return this.origin.some((slot) => matches(slot, route));
    }
    return this.destination.some((slot) => matches(slot, route)) ? true : null;
  }

  handleFor(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const slots = this.phase === 'back' ? this.origin : this.destination;
    return slots.find((slot) => matches(slot, route))?.handle ?? null;
  }

  private navigate(router: Router, url: string): Promise<boolean> {
    return router
      .navigateByUrl(url, { skipLocationChange: true, info: PREVIEW_NAVIGATION })
      .catch(() => false);
  }

  private async drawn(): Promise<void> {
    const view = this.window;
    const stable = this.injector.get(ApplicationRef).whenStable();
    await Promise.race([
      stable,
      new Promise((done) =>
        view === null ? done(undefined) : view.setTimeout(done, PREVIEW_DRAWING_LONGEST_MS),
      ),
    ]);
    await new Promise<void>((done) =>
      view === null
        ? done()
        : view.requestAnimationFrame(() => view.requestAnimationFrame(() => done())),
    );
  }

  private watch(router: Router): void {
    this.watching ??= router.events.subscribe((event) => {
      if (
        event instanceof NavigationStart &&
        this.phase === 'none' &&
        this.previewed !== null &&
        pathOf(event.url) !== pathOf(this.previewed)
      ) {
        this.discard();
      }
    });
  }

  private letGo(which: 'origin' | 'destination'): void {
    const slots = which === 'origin' ? this.origin : this.destination;
    slots.forEach((slot) => destroyDetachedRouteHandle(slot.handle));
    if (which === 'origin') {
      this.origin = [];
    } else {
      this.destination = [];
    }
  }
}

function slotOf(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle): Slot {
  return { handle, route: route.routeConfig, path: pathOfRoute(route) };
}

function matches(slot: Slot, route: ActivatedRouteSnapshot): boolean {
  return slot.route === route.routeConfig && slot.path === pathOfRoute(route);
}

function pathOfRoute(route: ActivatedRouteSnapshot): string {
  return `/${route.pathFromRoot.flatMap((step) => step.url.map((segment) => segment.path)).join('/')}`;
}
