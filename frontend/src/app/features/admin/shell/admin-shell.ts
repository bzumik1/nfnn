/// <reference types="@angular/localize" />

import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { AppHeader } from '../../../layout/app-header/app-header';
import { TabBar } from '../../../layout/tab-bar/tab-bar';
import { DIALOG_PRESENTATION } from '../../../shared/ui/dialog/dialog-presentation';
import { SideNav } from '../../../shared/ui/side-nav/side-nav';
import { ADMIN_SECTIONS } from './admin-sections';
import { ADMINISTRATION_LOCK } from './administration-lock';
import { AlertBadgeRefresh } from './alert-badge-refresh';

@Component({
  selector: 'app-admin-shell',
  imports: [AppHeader, NgComponentOutlet, RouterOutlet, SideNav, TabBar],
  providers: [{ provide: DIALOG_PRESENTATION, useValue: 'sheet' }],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShell {
  protected readonly groups = ADMIN_SECTIONS;
  protected readonly navLabel = $localize`:@@admin.nav.label:Správa`;
  protected readonly compact = inject(CompactLayout).isCompact;
  protected readonly lock = inject(ADMINISTRATION_LOCK);

  constructor() {
    inject(AlertBadgeRefresh).watch(inject(DestroyRef));
  }
}
