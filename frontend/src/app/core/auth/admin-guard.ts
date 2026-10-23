import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth-store';
import { LoginDialogService } from './login-dialog.service';

export const adminGuard: CanActivateFn = async (_route, state) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  const loginDialog = inject(LoginDialogService);
  await store.restore();
  if (store.isAdmin()) {
    return true;
  }
  if (store.signedIn()) {
    return router.createUrlTree(['/darce/prehled']);
  }
  loginDialog.open('login', { returnTo: state.url });
  return router.createUrlTree(['/']);
};
