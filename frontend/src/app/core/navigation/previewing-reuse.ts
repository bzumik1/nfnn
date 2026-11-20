import { inject, Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
  DetachedRouteHandle,
} from '@angular/router';
import { KeptTabPages } from './kept-tab-pages';
import { NavigationPreview } from './navigation-preview';

export type ReusedPreview = Pick<NavigationPreview, 'drives' | 'took' | 'holds' | 'handleFor'>;

@Injectable({ providedIn: 'root' })
export class PreviewingReuse extends BaseRouteReuseStrategy {
  private readonly kept = inject(KeptTabPages);
  preview: ReusedPreview = inject(NavigationPreview);

  override shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return this.kept.shouldDetach(route) || this.preview.drives();
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
