import { DOCUMENT } from '@angular/common';
import {
  EnvironmentInjector,
  EnvironmentProviders,
  inject,
  provideAppInitializer,
} from '@angular/core';

type HomeScreenNavigator = Navigator & { readonly standalone?: boolean };

export function isHomeScreenApp(navigator: Navigator): boolean {
  return (navigator as HomeScreenNavigator).standalone === true && navigator.maxTouchPoints > 0;
}

export const edgeSwipeBackAtStart: EnvironmentProviders = provideAppInitializer(() => {
  const view = inject(DOCUMENT).defaultView;
  const injector = inject(EnvironmentInjector);
  if (view === null || !isHomeScreenApp(view.navigator)) {
    return;
  }
  void import('./edge-swipe-back').then(({ EdgeSwipeBack }) => injector.get(EdgeSwipeBack).start());
});
