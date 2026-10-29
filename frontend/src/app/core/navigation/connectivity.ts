import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Connectivity {
  private readonly document = inject(DOCUMENT);

  isOffline(): boolean {
    return this.document.defaultView?.navigator.onLine === false;
  }
}
