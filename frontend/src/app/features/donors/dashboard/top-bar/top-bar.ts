import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth-store';
import { SignedOutNotice } from '../../../../core/auth/signed-out-notice';
import { Avatar } from '../../../../shared/ui/avatar/avatar';
import { PeopleApi } from '../../../content/people-api';

@Component({
  selector: 'app-dashboard-top-bar',
  imports: [RouterLink, Avatar],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardTopBar {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly signedOut = inject(SignedOutNotice);
  private readonly people = inject(PeopleApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly area = input<'donor' | 'admin'>('donor');
  readonly wide = input(false);

  protected readonly donor = this.auth.donor;
  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly switching = computed(() => this.area() === 'admin' || this.isAdmin());
  protected readonly signingOut = signal(false);
  protected readonly portraitUrl = signal<string | null>(null);

  constructor() {
    let asked = false;
    effect(() => {
      if (!this.isAdmin() || asked) {
        return;
      }
      asked = true;
      untracked(() => this.loadPortrait());
    });
  }

  private loadPortrait(): void {
    this.people
      .mine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ member }) =>
          this.portraitUrl.set(member?.portrait ? `${member.portrait.url}?w=480` : null),
        error: () => this.portraitUrl.set(null),
      });
  }

  protected logout(): void {
    if (this.signingOut()) {
      return;
    }
    this.signingOut.set(true);
    this.auth
      .logout()
      .subscribe(() => void this.router.navigateByUrl('/').then(() => this.signedOut.show()));
  }
}
