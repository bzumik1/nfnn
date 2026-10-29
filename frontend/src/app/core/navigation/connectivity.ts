import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Connectivity {
  isOffline(): boolean {
    return false;
  }
}
