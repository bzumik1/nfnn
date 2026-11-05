import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth-store';
import { SignedOutNotice } from '../../../../core/auth/signed-out-notice';

@Component({
  selector: 'app-donor-sign-out',
  templateUrl: './donor-sign-out.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorSignOut {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly signedOut = inject(SignedOutNotice);

  protected readonly signingOut = signal(false);

  protected signOut(): void {
    if (this.signingOut()) {
      return;
    }
    this.signingOut.set(true);
    this.auth.logout().subscribe(() => {
      void this.router.navigateByUrl('/');
      this.signedOut.show();
    });
  }
}
