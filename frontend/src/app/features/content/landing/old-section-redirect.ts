import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';

const SECTION_PAGES: ReadonlyMap<string, string> = new Map([
  ['o-nas', '/o-nas'],
  ['projekty', '/projekty'],
  ['aktuality', '/aktuality'],
  ['prispet', '/prispet'],
  ['kontakt', '/o-nas#kontakt'],
  ['uvod', '/'],
]);

export const oldSectionRedirect: CanActivateFn = (route) => {
  const target = route.fragment === null ? undefined : SECTION_PAGES.get(route.fragment);
  if (target === undefined) {
    return true;
  }
  const router = inject(Router);
  return new RedirectCommand(router.parseUrl(target), { replaceUrl: true });
};
