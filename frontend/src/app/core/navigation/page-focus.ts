import { DOCUMENT, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BackTarget } from './back-target';
import { NavigationPreview } from './navigation-preview';

const PAGE_HEADING = 'h1[tabindex="-1"]';
const SHEET_TITLE = 'h2[tabindex="-1"]';
const FOCUS_TARGET = '[tabindex="-1"]';

@Injectable({ providedIn: 'root' })
export class PageFocus {
  private readonly router = inject(Router);
  private readonly back = inject(BackTarget);
  private readonly preview = inject(NavigationPreview);
  private readonly document = inject(DOCUMENT);

  movesOnLastNavigation(): boolean {
    const navigation = this.router.lastSuccessfulNavigation();
    if (navigation === null || navigation.previousNavigation === null || this.preview.drives()) {
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
    const link = this.linkToPageLeft(main);
    if (link !== null) {
      this.focusQuietly(link);
      link.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      return;
    }
    this.focusQuietly(main.querySelector<HTMLElement>('h1') ?? main);
  }

  keepNear(places: readonly HTMLElement[]): void {
    const connected = places.filter((place) => place.isConnected);
    if (!this.focusLostAmong(connected)) {
      return;
    }
    const sheet = connected.find((place) => place.localName === 'dialog');
    if (sheet !== undefined) {
      this.focusQuietly(sheet.querySelector<HTMLElement>(SHEET_TITLE) ?? sheet);
      return;
    }
    for (const at of connected) {
      const heading = at.querySelector<HTMLElement>(PAGE_HEADING);
      if (heading !== null) {
        this.focusQuietly(heading);
        return;
      }
      if (at.matches(FOCUS_TARGET)) {
        this.focusQuietly(at);
        return;
      }
    }
  }

  private focusLostAmong(places: readonly HTMLElement[]): boolean {
    const active = this.document.activeElement;
    if (active === null || active === this.document.body) {
      return true;
    }
    return active.localName === 'dialog' && places.includes(active as HTMLElement);
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
