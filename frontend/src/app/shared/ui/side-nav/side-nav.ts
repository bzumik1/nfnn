import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface SideNavBadge {
  readonly count: number;
  readonly description: string;
}

export interface SideNavItem {
  readonly path: string;
  readonly label: string;
  readonly exact?: boolean;
  readonly badge?: SideNavBadge;
}

export interface SideNavGroup {
  readonly id: string;
  readonly label: string | null;
  readonly items: readonly SideNavItem[];
}

@Component({
  selector: 'app-side-nav',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive],
  templateUrl: './side-nav.html',
  styleUrl: './side-nav.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SideNav {
  readonly groups = input.required<readonly SideNavGroup[]>();
  readonly label = input.required<string>();
  readonly navId = input('side-nav');
  readonly panel = input(true);
}
