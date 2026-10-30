import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAccessRefusal } from './admin-access-refusal';
import { AuthStore } from './auth-store';
import { LoginDialogService } from './login-dialog.service';

export const adminGuard: CanActivateFn = async (_route, state) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  const loginDialog = inject(LoginDialogService);
  const refusal = inject(AdminAccessRefusal);
  await store.restore();
  if (store.isAdmin()) {
    refusal.clear();
    return true;
  }
  if (store.signedIn()) {
    refusal.refuse(
      store.donor()?.secondFactor.neededForAdministration ? 'second-factor' : 'not-administrator',
    );
    return router.createUrlTree(['/darce/prehled']);
  }
  loginDialog.open('login', { returnTo: state.url, forAdministration: true });
  return router.createUrlTree(['/']);
};
