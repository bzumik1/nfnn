import { DOCUMENT, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BackTarget } from './back-target';

@Injectable({ providedIn: 'root' })
export class PageFocus {
  private readonly router = inject(Router);
  private readonly back = inject(BackTarget);
  private readonly document = inject(DOCUMENT);

  movesOnLastNavigation(): boolean {
    const navigation = this.router.lastSuccessfulNavigation();
    if (navigation === null || navigation.previousNavigation === null) {
      return false;
    }
    return navigation.trigger !== 'popstate' || this.back.returningByButton;
  }

  follow(main: HTMLElement, fragment: string | null): void {
    if (this.document.querySelector('dialog[open]')) {
      return;
    }
    if (fragment) {
      this.focusQuietly(this.document.getElementById(fragment));
      return;
    }
    if (main.contains(this.document.activeElement)) {
      return;
    }
    this.focusQuietly(this.linkToPageLeft(main) ?? main.querySelector<HTMLElement>('h1') ?? main);
  }

  private linkToPageLeft(main: HTMLElement): HTMLElement | null {
    const left = this.back.returningByButton ? this.back.leftPath : null;
    if (left === null) {
      return null;
    }
    return (
      Array.from(main.querySelectorAll<HTMLAnchorElement>('a[href]')).find(
        (link) => link.getAttribute('href') === left,
      ) ?? null
    );
  }

  private focusQuietly(target: HTMLElement | null): void {
    if (target === null) {
      return;
    }
    if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
    }
    target.focus({ preventScroll: true });
  }
}
