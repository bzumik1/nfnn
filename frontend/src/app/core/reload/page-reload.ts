import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { ExternalNavigation } from '../navigation/external-navigation';
import { ReloadGuard } from './reload-guard';
import { ReloadPlace } from './reload-place';

@Injectable({ providedIn: 'root' })
export class PageReload {
  private readonly guard = inject(ReloadGuard);
  private readonly place = inject(ReloadPlace);
  private readonly navigation = inject(ExternalNavigation);
  private readonly router = inject(Router);

  reloadFocusing(target: string): boolean {
    if (!this.guard.claim('push-worker')) {
      return false;
    }
    const url = this.router.url;
    this.place.keep(url, target);
    this.navigation.loadFromServer(url);
    return true;
  }
}
