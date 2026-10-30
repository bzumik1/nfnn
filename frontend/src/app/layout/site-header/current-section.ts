import { inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

export type ListSection = 'aktuality' | 'projekty';

export function currentListSection(): Signal<ListSection | null> {
  const router = inject(Router);
  return toSignal(
    router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => listSectionOf(router.url)),
    ),
    { initialValue: listSectionOf(router.url) },
  );
}

export function onHomePage(): Signal<boolean> {
  const router = inject(Router);
  return toSignal(
    router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => isHome(router.url)),
    ),
    { initialValue: isHome(router.url) },
  );
}

function isHome(url: string): boolean {
  return pathOf(url) === '/';
}

function pathOf(url: string): string {
  return url.split(/[?#]/)[0];
}

function listSectionOf(url: string): ListSection | null {
  const first = pathOf(url).split('/')[1];
  return first === 'aktuality' || first === 'projekty' ? first : null;
}
