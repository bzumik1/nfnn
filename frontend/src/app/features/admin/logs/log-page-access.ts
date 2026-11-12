import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';

@Injectable({ providedIn: 'root' })
export class LogPageAccess {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);

  leavesOn(failure: unknown): boolean {
    if (problemTypeEndsWith(failure, UNAUTHENTICATED)) {
      this.sendToSignIn();
      return true;
    }
    if (problemTypeEndsWith(failure, FORBIDDEN)) {
      this.router.navigateByUrl('/darce/prehled');
      return true;
    }
    return false;
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}
