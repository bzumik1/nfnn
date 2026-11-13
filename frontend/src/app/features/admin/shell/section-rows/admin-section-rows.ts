import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FOUNDATION_STAR } from '../../../../shared/ui/foundation-star/foundation-star';
import { SideNavBadge } from '../../../../shared/ui/side-nav/side-nav';

export type SectionIcon = 'payments' | 'donors' | 'news' | 'projects' | 'foundation';

export interface SectionRow {
  readonly path: string;
  readonly label: string;
  readonly icon?: SectionIcon;
  readonly badge?: SideNavBadge;
}

export interface SectionRowGroup {
  readonly id: string;
  readonly label: string;
  readonly rows: readonly SectionRow[];
}

@Component({
  selector: 'app-admin-section-rows',
  imports: [RouterLink],
  templateUrl: './admin-section-rows.html',
})
export class AdminSectionRows {
  protected readonly star = FOUNDATION_STAR;
  readonly label = input.required<string>();
  readonly groups = input.required<readonly SectionRowGroup[]>();
}
