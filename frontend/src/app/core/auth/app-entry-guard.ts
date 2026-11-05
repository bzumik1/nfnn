import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from './auth-store';
import { LoginDialogService } from './login-dialog.service';

export const APP_ENTRY_PATH = 'aplikace';

export const appEntryGuard: CanActivateFn = async () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  const loginDialog = inject(LoginDialogService);
  await store.restore();
  if (store.isAdmin()) {
    return router.createUrlTree(['/sprava']);
  }
  if (store.signedIn()) {
    return router.createUrlTree(['/darce', 'prehled']);
  }
  loginDialog.open('login', { returnTo: `/${APP_ENTRY_PATH}` });
  return router.createUrlTree(['/']);
};
