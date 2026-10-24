import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { SetupApi } from './setup-api';

export const SETUP_PATH = '/prvni-nastaveni';

@Injectable({ providedIn: 'root' })
export class SetupRedirect {
  private readonly api = inject(SetupApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private checked = false;
  private watch: Subscription | null = null;

  checkOnce(): void {
    if (this.checked) {
      return;
    }
    this.checked = true;
    this.check();
  }

  private check(): void {
    this.api.status().subscribe({
      next: (status) => {
        if (!status.required) {
          this.stopWatching();
          return;
        }
        this.watchNavigation();
        if (!this.router.url.startsWith(SETUP_PATH)) {
          this.router.navigateByUrl(SETUP_PATH);
        }
      },
      error: () => undefined,
    });
  }

  private watchNavigation(): void {
    if (this.watch !== null) {
      return;
    }
    this.watch = this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        filter((event) => !event.urlAfterRedirects.startsWith(SETUP_PATH)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.check());
  }

  private stopWatching(): void {
    this.watch?.unsubscribe();
    this.watch = null;
  }
}
