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
  readonly appearMs: number;
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
  showsAtOnce: (value: T) => boolean,
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
    if (revealsContent) {
      timer = setTimeout(() => {
        timer = undefined;
        appears.set(false);
      }, timings()?.appearMs ?? 0);
    }
  };
  const start = () => {
    switch (phase()) {
      case 'idle': {
        const current = timings();
        stopTimer();
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
  const finish = (value: T) => {
    const current = phase();
    if (current === 'idle') {
      return;
    }
    if (current === 'delaying' || showsAtOnce(value) || connectivity.offline()) {
      settle(false);
      return;
    }
    if (current === 'holding') {
      return;
    }
    const remaining = (timings()?.minimumMs ?? 0) - (Date.now() - shownAt);
    if (remaining <= 0) {
      settle(true);
      return;
    }
    phase.set('holding');
    timer = setTimeout(() => settle(true), remaining);
  };

  effect(() => {
    const value = source();
    untracked(() => {
      if (isLoading(value)) {
        loadingValue = value;
        start();
      } else {
        finish(value);
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
  const appearMs = milliseconds(style.getPropertyValue('--duration-slow'));
  return delayMs === null || minimumMs === null || appearMs === null
    ? null
    : { delayMs, minimumMs, appearMs };
}

export function milliseconds(token: string): number | null {
  const trimmed = token.trim();
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value)) {
    return null;
  }
  return trimmed.endsWith('ms') ? value : value * 1000;
}
