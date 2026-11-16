import {
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  inject,
  InjectionToken,
  Signal,
  signal,
  untracked,
} from '@angular/core';

import { Connectivity } from '../../../core/connectivity/connectivity';

export interface LoadingTimings {
  readonly delayMs: number;
  readonly minimumMs: number;
}

export const LOADING_TIMINGS = new InjectionToken<() => LoadingTimings | null>('LOADING_TIMINGS', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => themeTimings(document);
  },
});

export interface LoadingView<T> {
  readonly state: Signal<T>;
  readonly busy: Signal<boolean>;
  readonly skeleton: Signal<boolean>;
  readonly appears: Signal<boolean>;
}

type Phase = 'idle' | 'delaying' | 'shown' | 'holding';

export function loadingView<T>(
  source: Signal<T>,
  isLoading: (value: T) => boolean,
): LoadingView<T> {
  const timings = inject(LOADING_TIMINGS);
  const connectivity = inject(Connectivity);
  const phase = signal<Phase>('idle');
  const appears = signal(false);
  let loadingValue = untracked(source);
  let shownAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stopTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const settle = (revealsContent: boolean) => {
    stopTimer();
    phase.set('idle');
    appears.set(revealsContent);
  };
  const start = () => {
    switch (phase()) {
      case 'idle': {
        const current = timings();
        appears.set(false);
        if (current === null) {
          return;
        }
        phase.set('delaying');
        timer = setTimeout(() => {
          timer = undefined;
          shownAt = Date.now();
          phase.set('shown');
        }, current.delayMs);
        return;
      }
      case 'holding':
        stopTimer();
        phase.set('shown');
        return;
      default:
        return;
    }
  };
  const finish = () => {
    switch (phase()) {
      case 'delaying':
        settle(false);
        return;
      case 'shown': {
        if (connectivity.offline()) {
          settle(false);
          return;
        }
        const remaining = (timings()?.minimumMs ?? 0) - (Date.now() - shownAt);
        if (remaining <= 0) {
          settle(true);
          return;
        }
        phase.set('holding');
        timer = setTimeout(() => settle(true), remaining);
        return;
      }
      default:
        return;
    }
  };

  effect(() => {
    const value = source();
    untracked(() => {
      if (isLoading(value)) {
        loadingValue = value;
        start();
      } else {
        finish();
      }
    });
  });
  inject(DestroyRef).onDestroy(stopTimer);

  const holds = computed(() => phase() === 'shown' || phase() === 'holding');
  const state = computed(() => {
    const value = source();
    return holds() && !isLoading(value) ? loadingValue : value;
  });
  return {
    state,
    busy: computed(() => isLoading(state())),
    skeleton: holds,
    appears: appears.asReadonly(),
  };
}

function themeTimings(document: Document): LoadingTimings | null {
  const view = document.defaultView;
  if (view === null) {
    return null;
  }
  const style = view.getComputedStyle(document.documentElement);
  const delayMs = milliseconds(style.getPropertyValue('--delay-loading'));
  const minimumMs = milliseconds(style.getPropertyValue('--duration-loading-min'));
  return delayMs === null || minimumMs === null ? null : { delayMs, minimumMs };
}

function milliseconds(token: string): number | null {
  const trimmed = token.trim();
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value)) {
    return null;
  }
  return trimmed.endsWith('ms') ? value : value * 1000;
}
