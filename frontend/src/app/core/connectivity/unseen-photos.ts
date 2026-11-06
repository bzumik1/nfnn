import { DestroyRef, DOCUMENT, inject, Injectable } from '@angular/core';

export const UNSEEN_PHOTO_CLASS = 'is-unavailable';

@Injectable({ providedIn: 'root' })
export class UnseenPhotos {
  constructor() {
    const document = inject(DOCUMENT);
    document.addEventListener('error', markUnavailable, { capture: true });
    document.addEventListener('load', markLoaded, { capture: true });
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('error', markUnavailable, { capture: true });
      document.removeEventListener('load', markLoaded, { capture: true });
    });
  }
}

function markUnavailable(event: Event): void {
  const image = sitePhoto(event.target);
  image?.classList.add(UNSEEN_PHOTO_CLASS);
}

function markLoaded(event: Event): void {
  const image = sitePhoto(event.target);
  image?.classList.remove(UNSEEN_PHOTO_CLASS);
}

function sitePhoto(target: EventTarget | null): HTMLImageElement | null {
  return target instanceof HTMLImageElement ? target : null;
}
