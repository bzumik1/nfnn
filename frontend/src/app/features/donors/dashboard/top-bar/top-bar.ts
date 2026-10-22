import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth-store';

@Component({
  selector: 'app-dashboard-top-bar',
  imports: [RouterLink],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardTopBar {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);

  readonly area = input<'donor' | 'admin'>('donor');

  protected readonly donor = this.auth.donor;
  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly switching = computed(() => this.area() === 'admin' || this.isAdmin());
  protected readonly signingOut = signal(false);

  protected logout(): void {
    if (this.signingOut()) {
      return;
    }
    this.signingOut.set(true);
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/'));
  }
}
