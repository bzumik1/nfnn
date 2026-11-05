import { Injectable, signal } from '@angular/core';
import { SideNavBadge } from '../../shared/ui/side-nav/side-nav';

@Injectable({ providedIn: 'root' })
export class AccountBadges {
  private readonly byPath = signal<ReadonlyMap<string, SideNavBadge>>(new Map());

  show(path: string, badge: SideNavBadge): void {
    this.byPath.update((badges) => new Map(badges).set(path, badge));
  }

  clear(path: string): void {
    this.byPath.update((badges) => {
      const rest = new Map(badges);
      rest.delete(path);
      return rest;
    });
  }

  badgeOf(path: string): SideNavBadge | null {
    const badge = this.byPath().get(path);
    return badge && badge.count > 0 ? badge : null;
  }

  total(exceptPath = ''): SideNavBadge | null {
    const shown = [...this.byPath()]
      .filter(([path, badge]) => path !== exceptPath && badge.count > 0)
      .map(([, badge]) => badge);
    if (shown.length === 0) {
      return null;
    }
    return {
      count: shown.reduce((sum, badge) => sum + badge.count, 0),
      description: shown.map((badge) => badge.description).join(', '),
    };
  }
}
