import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from './auth-store';

export const APP_ENTRY_PATH = 'aplikace';

export const appEntryGuard: CanActivateFn = async () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  await store.restore();
  if (store.isAdmin()) {
    return router.createUrlTree(['/sprava']);
  }
  if (store.signedIn()) {
    return router.createUrlTree(['/darce', 'prehled']);
  }
  return router.createUrlTree(['/']);
};
