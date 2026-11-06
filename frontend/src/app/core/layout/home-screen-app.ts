import { DOCUMENT, inject, Injectable } from '@angular/core';

type HomeScreenNavigator = Navigator & { readonly standalone?: boolean };

@Injectable({ providedIn: 'root' })
export class HomeScreenApp {
  readonly onTouchScreen: boolean = openedFromTouchHomeScreen(inject(DOCUMENT));
}

function openedFromTouchHomeScreen(document: Document): boolean {
  const navigator = document.defaultView?.navigator as HomeScreenNavigator | undefined;
  return navigator?.standalone === true && navigator.maxTouchPoints > 0;
}
