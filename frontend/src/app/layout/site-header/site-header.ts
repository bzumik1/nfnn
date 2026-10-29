/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth-store';
import { LoginDialogService } from '../../core/auth/login-dialog.service';
import { currentListSection, onHomePage } from './current-section';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink],
  templateUrl: './site-header.html',
  styleUrl: './site-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:scroll)': 'onScroll()',
    '(document:keydown.escape)': 'onEscape()',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class SiteHeader {
  private readonly loginDialog = inject(LoginDialogService);

  protected readonly auth = inject(AuthStore);
  protected readonly current = currentListSection();
  protected readonly scrolled = signal(false);
  protected readonly menuOpen = signal(false);
  private readonly onHome = onHomePage();
  protected readonly logoOnDark = computed(
    () => !this.onHome() && !this.scrolled() && !this.menuOpen(),
  );
  protected readonly openMenuLabel = $localize`:@@layout.header.toggleMenu:Otevřít menu`;
  protected readonly closeMenuLabel = $localize`:@@layout.header.closeMenu:Zavřít menu`;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly menuButton = viewChild.required<ElementRef<HTMLButtonElement>>('menuButton');
  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('nav');

  protected onScroll(): void {
    this.scrolled.set(window.scrollY > 50);
  }

  protected onEscape(): void {
    if (this.menuOpen()) {
      this.menuOpen.set(false);
      this.menuButton().nativeElement.focus();
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen() && !this.host.nativeElement.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }

  toggleMenu(): void {
    this.menuOpen.update((value) => !value);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  leaveMenu(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && !this.host.nativeElement.contains(next)) {
      this.menuOpen.set(false);
    }
  }

  openLogin(): void {
    this.menuOpen.set(false);
    this.loginDialog.open('login', { afterSignIn: () => this.focusHeader() });
  }

  private focusHeader(): void {
    afterNextRender(() => this.nav().nativeElement.focus(), { injector: this.injector });
  }
}
