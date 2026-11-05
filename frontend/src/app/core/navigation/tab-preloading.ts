import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { catchError, Observable, of } from 'rxjs';

export const LOADED_AHEAD = { loadedAhead: true } as const;

@Injectable({ providedIn: 'root' })
export class TabPagesPreloading implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    return route.data?.['loadedAhead'] === true
      ? load().pipe(catchError(() => of(null)))
      : of(null);
  }
}
