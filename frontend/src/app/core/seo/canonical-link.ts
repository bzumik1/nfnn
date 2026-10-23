import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

export const SITE_ORIGIN = 'https://nfnn.cz';

@Injectable({ providedIn: 'root' })
export class CanonicalLink {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);

  start(): void {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.name(event.urlAfterRedirects));
    this.name(this.router.url);
  }

  private name(url: string): void {
    const path = url.split(/[?#]/)[0] || '/';
    const address = `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
    this.link().href = address;
    this.meta.updateTag({ property: 'og:url', content: address });
  }

  private link(): HTMLLinkElement {
    const existing = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (existing) {
      return existing;
    }
    const link = this.document.createElement('link');
    link.rel = 'canonical';
    this.document.head.appendChild(link);
    return link;
  }
}
