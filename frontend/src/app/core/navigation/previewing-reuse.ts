import { inject, Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
  DetachedRouteHandle,
} from '@angular/router';
import { KeptTabPages } from './kept-tab-pages';
import { NavigationPreview } from './navigation-preview';

@Injectable({ providedIn: 'root' })
export class PreviewingReuse extends BaseRouteReuseStrategy {
  private readonly kept = inject(KeptTabPages);
  private readonly preview = inject(NavigationPreview);

  override shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return this.preview.drives() || this.kept.shouldDetach(route);
  }

  override store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    if (!this.preview.took(route, handle)) {
      this.kept.store(route, handle);
    }
  }

  override shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return this.preview.holds(route) ?? this.kept.shouldAttach(route);
  }

  override retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    return this.preview.handleFor(route) ?? this.kept.retrieve(route);
  }
}
