import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SideNavBadge } from '../side-nav/side-nav';

export type SectionIcon =
  | 'payments'
  | 'donors'
  | 'news'
  | 'projects'
  | 'more'
  | 'gifts'
  | 'receipts'
  | 'accounts'
  | 'details'
  | 'admin';

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
  selector: 'app-section-rows',
  imports: [RouterLink],
  templateUrl: './section-rows.html',
  styleUrl: './section-rows.scss',
})
export class SectionRows {
  readonly label = input.required<string>();
  readonly groups = input.required<readonly SectionRowGroup[]>();
}
