import {
  DestroyRef,
  DOCUMENT,
  EnvironmentProviders,
  inject,
  Injectable,
  provideAppInitializer,
} from '@angular/core';

export const WINDOW_CONTROLS_CLASS = 'has-window-controls';

type HomeScreenNavigator = Navigator & { readonly standalone?: boolean };

function isIpadHomeScreenApp(navigator: HomeScreenNavigator): boolean {
  return (
    navigator.standalone === true &&
    navigator.maxTouchPoints > 0 &&
    !/iPhone|iPod/.test(navigator.userAgent)
  );
}

function isSmallerThanScreen(view: Window): boolean {
  return view.outerWidth * view.outerHeight < view.screen.width * view.screen.height;
}

@Injectable({ providedIn: 'root' })
export class WindowControls {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  start(): void {
    const view = this.document.defaultView;
    if (!view || !isIpadHomeScreenApp(view.navigator)) {
      return;
    }
    const root = this.document.documentElement;
    const follow = () => root.classList.toggle(WINDOW_CONTROLS_CLASS, isSmallerThanScreen(view));
    follow();
    view.addEventListener('resize', follow);
    this.destroyRef.onDestroy(() => view.removeEventListener('resize', follow));
  }
}

export const windowControlsAtStart: EnvironmentProviders = provideAppInitializer(() =>
  inject(WindowControls).start(),
);
