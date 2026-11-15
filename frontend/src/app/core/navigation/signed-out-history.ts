import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthStore } from '../auth/auth-store';
import { forgetOwnHistory } from './own-history';

const SIGNED_IN_AREAS = ['/sprava', '/darce'];

function inSignedInArea(url: URL): boolean {
  return SIGNED_IN_AREAS.some(
    (area) => url.pathname === area || url.pathname.startsWith(`${area}/`),
  );
}

@Injectable({ providedIn: 'root' })
export class SignedOutHistory {
  private readonly auth = inject(AuthStore);
  private readonly view = inject(DOCUMENT).defaultView;

  constructor() {
    effect(() => {
      if (this.auth.status() === 'anonymous') {
        untracked(() => this.forget());
      }
    });
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        if (untracked(this.auth.status) === 'anonymous') {
          this.forget();
        }
      });
  }

  private forget(): void {
    if (this.view) {
      forgetOwnHistory(this.view, inSignedInArea);
    }
  }
}
