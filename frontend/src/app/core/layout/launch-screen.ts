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
  Router,
} from '@angular/router';

export const LAUNCH_SCREEN_SELECTOR = '.launch-screen';

@Injectable({ providedIn: 'root' })
export class LaunchScreen {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  constructor() {
    const navigations = inject(Router).events.subscribe((event) => {
      if (endsTheFirstPage(event)) {
        navigations.unsubscribe();
        afterNextRender({ write: () => this.lift() }, { injector: this.injector });
      }
    });
    inject(DestroyRef).onDestroy(() => navigations.unsubscribe());
  }

  private lift(): void {
    this.document.querySelector(LAUNCH_SCREEN_SELECTOR)?.remove();
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
    (event instanceof NavigationCancel && event.code !== NavigationCancellationCode.Redirect)
  );
}
