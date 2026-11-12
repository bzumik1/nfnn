import { effect, inject, untracked } from '@angular/core';
import { Connectivity, isUnreachable } from '../../../core/connectivity/connectivity';

export interface OnlineAgain {
  readonly unreachable: (failure: unknown) => boolean;
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
  return { unreachable: (failure) => isUnreachable(failure) || connectivity.offline() };
}
