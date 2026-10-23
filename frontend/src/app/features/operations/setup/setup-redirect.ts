import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { SetupApi } from './setup-api';

export const SETUP_PATH = '/prvni-nastaveni';

@Injectable({ providedIn: 'root' })
export class SetupRedirect {
  private readonly api = inject(SetupApi);
  private readonly router = inject(Router);
  private checked = false;

  checkOnce(): void {
    if (this.checked) {
      return;
    }
    this.checked = true;
    this.api.status().subscribe({
      next: (status) => {
        if (status.required && !this.router.url.startsWith(SETUP_PATH)) {
          this.router.navigateByUrl(SETUP_PATH);
        }
      },
      error: () => undefined,
    });
  }
}
