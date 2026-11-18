import { DOCUMENT, inject, Injectable, Injector } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
  DetachedRouteHandle,
} from '@angular/router';
import { KeptTabPages } from './kept-tab-pages';
import { NavigationPreview } from './navigation-preview';
import type { PreviewLending } from './preview-lending';

type HomeScreenNavigator = Navigator & { readonly standalone?: boolean };

@Injectable({ providedIn: 'root' })
export class PreviewingReuse extends BaseRouteReuseStrategy {
  private readonly kept = inject(KeptTabPages);
  private readonly preview = inject(NavigationPreview);
  private lending: PreviewLending | null = null;

  constructor() {
    super();
    const injector = inject(Injector);
    const navigator = inject(DOCUMENT).defaultView?.navigator as HomeScreenNavigator | undefined;
    if (navigator?.standalone === true) {
      void import('./preview-lending').then(
        ({ PreviewLending }) => (this.lending = new PreviewLending(injector, this.kept)),
      );
    }
  }

  override shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return this.preview.drives() || this.kept.shouldDetach(route);
  }

  override store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    if (this.lending?.takesBack(route, handle)) {
      return;
    }
    if (!this.preview.took(route, handle)) {
      this.kept.store(route, handle);
    }
  }

  override shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return (
      this.lending?.lends(route) || (this.preview.holds(route) ?? this.kept.shouldAttach(route))
    );
  }

  override retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    return (
      this.lending?.handleFor(route) ?? this.preview.handleFor(route) ?? this.kept.retrieve(route)
    );
  }
}
