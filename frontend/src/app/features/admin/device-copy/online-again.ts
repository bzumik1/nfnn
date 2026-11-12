import { computed, effect, inject, type Signal, untracked } from '@angular/core';
import { Connectivity } from '../../../core/connectivity/connectivity';

export interface OnlineAgain {
  readonly offline: () => boolean;
  readonly serverAway: Signal<boolean>;
}

export function reloadWhenOnlineAgain(waiting: () => boolean, reload: () => void): OnlineAgain {
  const connectivity = inject(Connectivity);
  let wasOffline = untracked(() => connectivity.offline());
  effect(() => {
    const offline = connectivity.offline();
    untracked(() => {
      if (wasOffline && !offline && waiting()) {
        reload();
      }
      wasOffline = offline;
    });
  });
  return {
    offline: () => untracked(() => connectivity.offline()),
    serverAway: computed(() => connectivity.cause() === 'server'),
  };
}
