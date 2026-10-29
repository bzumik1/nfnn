import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ExternalNavigation {
  private readonly document = inject(DOCUMENT);

  assign(url: string): void {
    this.document.defaultView?.location.assign(url);
  }

  loadFromServer(url: string): void {
    const view = this.document.defaultView;
    if (!view) {
      return;
    }
    const current = new URL(view.location.href);
    const target = new URL(url, current);
    if (target.pathname !== current.pathname || target.search !== current.search) {
      view.location.assign(url);
      return;
    }
    view.history.replaceState(null, '', url);
    view.location.reload();
  }
}
