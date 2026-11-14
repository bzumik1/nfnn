import {
  computed,
  DestroyRef,
  DOCUMENT,
  EnvironmentProviders,
  inject,
  Injectable,
  provideAppInitializer,
  signal,
} from '@angular/core';

export type AppearanceChoice = 'auto' | 'light' | 'dark';

export const APPEARANCE_STORAGE_KEY = 'nfnn.appearance';

const DARK_DEVICE = '(prefers-color-scheme: dark)';
const COLOR_SCHEMES: Record<AppearanceChoice, string> = {
  auto: 'light dark',
  light: 'light',
  dark: 'dark',
};

function isChoice(value: string | null): value is AppearanceChoice {
  return value === 'auto' || value === 'light' || value === 'dark';
}

function keptStorage(view: Window | null | undefined): Storage | null {
  try {
    return view?.localStorage ?? null;
  } catch {
    return null;
  }
}

function keptChoice(view: Window | null | undefined): AppearanceChoice {
  try {
    const kept = view?.localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? null;
    return isChoice(kept) ? kept : 'auto';
  } catch {
    return 'auto';
  }
}

function applyChoice(document: Document, choice: AppearanceChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') {
    root.removeAttribute('data-appearance');
  } else {
    root.setAttribute('data-appearance', choice);
  }
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute('content', COLOR_SCHEMES[choice]);
}

@Injectable({ providedIn: 'root' })
export class Appearance {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly chosen = signal<AppearanceChoice>('auto');
  private readonly deviceDark = signal(false);

  readonly choice = this.chosen.asReadonly();
  readonly dark = computed(() => {
    const choice = this.chosen();
    return choice === 'auto' ? this.deviceDark() : choice === 'dark';
  });

  start(): void {
    const view = this.document.defaultView;
    const query = view?.matchMedia?.(DARK_DEVICE);
    const followDevice = (event: { matches: boolean }): void => this.deviceDark.set(event.matches);
    const followOtherTabs = (event: StorageEvent): void => {
      const ours = event.key === APPEARANCE_STORAGE_KEY || event.key === null;
      if (ours && event.storageArea === keptStorage(view)) {
        this.chosen.set(keptChoice(view));
        this.apply();
      }
    };
    if (query) {
      this.deviceDark.set(query.matches);
      query.addEventListener('change', followDevice);
    }
    view?.addEventListener('storage', followOtherTabs);
    this.destroyRef.onDestroy(() => {
      query?.removeEventListener('change', followDevice);
      view?.removeEventListener('storage', followOtherTabs);
    });
    this.chosen.set(keptChoice(view));
    this.apply();
  }

  choose(choice: AppearanceChoice): void {
    this.chosen.set(choice);
    this.keep(choice);
    this.apply();
  }

  private apply(): void {
    applyChoice(this.document, this.chosen());
  }

  private keep(choice: AppearanceChoice): void {
    try {
      const storage = this.document.defaultView?.localStorage;
      if (choice === 'auto') {
        storage?.removeItem(APPEARANCE_STORAGE_KEY);
      } else {
        storage?.setItem(APPEARANCE_STORAGE_KEY, choice);
      }
    } catch {
      return;
    }
  }
}

export const appearanceAtStart: EnvironmentProviders = provideAppInitializer(() =>
  inject(Appearance).start(),
);
