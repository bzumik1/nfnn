import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  DestroyRef,
  EnvironmentProviders,
  inject,
  Injectable,
  Injector,
  provideAppInitializer,
} from '@angular/core';
import {
  Event as RouterEvent,
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
} from '@angular/router';

export const LAUNCH_SCREEN_SELECTOR = '.launch-screen';
export const LAUNCH_SCREEN_LONGEST_MS = 10_000;

const CANCELS_KEEPING_IT: readonly NavigationCancellationCode[] = [
  NavigationCancellationCode.Redirect,
  NavigationCancellationCode.SupersededByNewNavigation,
];

@Injectable({ providedIn: 'root' })
export class LaunchScreen {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private longest: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const navigations = inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationStart && this.longest === null) {
        this.longest = setTimeout(() => this.lift(), LAUNCH_SCREEN_LONGEST_MS);
      } else if (endsTheFirstPage(event)) {
        navigations.unsubscribe();
        afterNextRender({ write: () => this.lift() }, { injector: this.injector });
      }
    });
    inject(DestroyRef).onDestroy(() => {
      navigations.unsubscribe();
      this.stopWaiting();
    });
  }

  private lift(): void {
    this.stopWaiting();
    this.document.querySelector(LAUNCH_SCREEN_SELECTOR)?.remove();
  }

  private stopWaiting(): void {
    if (this.longest !== null) {
      clearTimeout(this.longest);
    }
  }
}

export const launchScreenAtStart: EnvironmentProviders = provideAppInitializer(() => {
  inject(LaunchScreen);
});

function endsTheFirstPage(event: RouterEvent): boolean {
  return (
    event instanceof NavigationEnd ||
    event instanceof NavigationError ||
    event instanceof NavigationSkipped ||
    (event instanceof NavigationCancel && !keepsIt(event))
  );
}

function keepsIt(cancel: NavigationCancel): boolean {
  return cancel.code !== undefined && CANCELS_KEEPING_IT.includes(cancel.code);
}
