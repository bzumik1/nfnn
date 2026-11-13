import { DOCUMENT } from '@angular/common';
import { ApplicationRef, inject, Injectable, Injector, untracked } from '@angular/core';
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

export const PREVIEW_OUT = 'nfnn.preview.out';
export const PREVIEW_BACK = 'nfnn.preview.back';
export const PREVIEW_DRAWING_LONGEST_MS = 300;
export const PREVIEW_STEP_LONGEST_MS = 1000;

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
  private interrupted = false;
  private discardWhenOver = false;
  private watching: Subscription | null = null;

  active(): boolean {
    return this.phase !== 'none';
  }

  drives(): boolean {
    return this.step() !== null;
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
    this.interrupted = false;
    let captured: T | null = null;
    this.phase = 'out';
    if ((await this.navigate(router, path, PREVIEW_OUT)) && !this.interrupted) {
      this.previewed = path;
      await this.drawn();
      captured = this.interrupted ? null : capture();
    }
    if (this.interrupted) {
      this.letGo('origin');
    } else {
      this.phase = 'back';
      const returned = await this.navigate(router, origin, PREVIEW_BACK);
      await this.drawn();
      if (!returned) {
        this.letGo('origin');
      }
      this.window?.scrollTo({ top, behavior: 'instant' });
      if (focused instanceof HTMLElement && focused.isConnected && focused !== this.document.body) {
        focused.focus({ preventScroll: true });
      }
    }
    this.phase = 'none';
    if (this.discardWhenOver || this.interrupted) {
      this.discard();
    }
    return captured;
  }

  discard(): void {
    if (this.phase !== 'none') {
      this.discardWhenOver = true;
      return;
    }
    this.discardWhenOver = false;
    this.letGo('destination');
    this.previewed = null;
  }

  took(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): boolean {
    const step = this.step();
    if (step === PREVIEW_OUT) {
      if (handle !== null) {
        this.origin.push(slotOf(route, handle));
      }
      return true;
    }
    if (step === PREVIEW_BACK) {
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
    const step = this.step();
    if (step === PREVIEW_OUT) {
      return false;
    }
    if (step === PREVIEW_BACK) {
      return this.origin.some((slot) => matches(slot, route));
    }
    return this.destination.some((slot) => matches(slot, route)) ? true : null;
  }

  handleFor(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const slots = this.step() === PREVIEW_BACK ? this.origin : this.destination;
    return slots.find((slot) => matches(slot, route))?.handle ?? null;
  }

  private step(): string | null {
    const router = this.injector.get(Router);
    const navigation =
      untracked(router.currentNavigation) ?? untracked(router.lastSuccessfulNavigation);
    const info = navigation?.extras.info;
    return info === PREVIEW_OUT || info === PREVIEW_BACK ? info : null;
  }

  private navigate(router: Router, url: string, step: string): Promise<boolean> {
    const view = this.window;
    return Promise.race([
      router.navigateByUrl(url, { skipLocationChange: true, info: step }).catch(() => false),
      new Promise<boolean>((done) =>
        view === null ? done(false) : view.setTimeout(() => done(false), PREVIEW_STEP_LONGEST_MS),
      ),
    ]);
  }

  private async drawn(): Promise<void> {
    const view = this.window;
    if (view === null) {
      return;
    }
    const stable = this.injector.get(ApplicationRef).whenStable();
    await Promise.race([
      stable,
      new Promise((done) => view.setTimeout(done, PREVIEW_DRAWING_LONGEST_MS)),
    ]).catch(() => undefined);
    await new Promise<void>((done) =>
      view.requestAnimationFrame(() => view.requestAnimationFrame(() => done())),
    );
  }

  private watch(router: Router): void {
    this.watching ??= router.events.subscribe((event) => {
      if (!(event instanceof NavigationStart) || this.drives()) {
        return;
      }
      if (this.phase !== 'none') {
        this.interrupted = true;
      } else if (this.previewed !== null && pathOf(event.url) !== pathOf(this.previewed)) {
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
