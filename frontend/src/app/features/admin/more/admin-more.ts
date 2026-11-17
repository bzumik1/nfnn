/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { ADMIN_HOME_PATH, ADMIN_OCCASIONAL, ADMIN_TECHNICAL } from '../shell/admin-sections';
import { AdminSectionRows, SectionRowGroup } from '../shell/section-rows/admin-section-rows';
import { SideNavGroup } from '../../../shared/ui/side-nav/side-nav';

@Component({
  selector: 'app-admin-more',
  imports: [AdminSectionRows],
  templateUrl: './admin-more.html',
  styleUrl: './admin-more.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMore {
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly compact = inject(CompactLayout).isCompact;
  private readonly router = inject(Router);

  protected readonly label = $localize`:@@admin.more.nav:Další sekce správy`;
  protected readonly groups: readonly SectionRowGroup[] = [
    rowsOf(ADMIN_OCCASIONAL),
    rowsOf(ADMIN_TECHNICAL),
  ];

  constructor() {
    afterNextRender(() => this.title().nativeElement.focus());
    effect(() => {
      if (!this.compact()) {
        void this.router.navigateByUrl(ADMIN_HOME_PATH, { replaceUrl: true });
      }
    });
  }
}

function rowsOf(group: SideNavGroup): SectionRowGroup {
  return { id: `admin-more-${group.id}`, label: group.label ?? '', rows: group.items };
}
