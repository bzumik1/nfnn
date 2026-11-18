import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { ExternalNavigation } from '../navigation/external-navigation';
import { DirtyForms } from '../updates/dirty-forms';
import { RunningWork } from '../updates/running-work';
import { ReloadGuard } from './reload-guard';
import { ReloadPlace } from './reload-place';

@Injectable({ providedIn: 'root' })
export class PageReload {
  private readonly guard = inject(ReloadGuard);
  private readonly place = inject(ReloadPlace);
  private readonly navigation = inject(ExternalNavigation);
  private readonly router = inject(Router);
  private readonly dirtyForms = inject(DirtyForms);
  private readonly runningWork = inject(RunningWork);

  reloadFocusing(target: string): boolean {
    if (this.dirtyForms.any() || this.runningWork.any() || !this.guard.claim('push-worker')) {
      return false;
    }
    const url = this.router.url;
    this.place.keep(url, target);
    this.navigation.loadFromServer(url);
    return true;
  }
}
