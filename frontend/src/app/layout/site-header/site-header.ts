/// <reference types="@angular/localize" />

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth-store';
import { LoginDialogService } from '../../core/auth/login-dialog.service';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink],
  templateUrl: './site-header.html',
  styleUrl: './site-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteHeader {
  private readonly loginDialog = inject(LoginDialogService);

  protected readonly auth = inject(AuthStore);
  protected readonly scrolled = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly openMenuLabel = $localize`:@@layout.header.toggleMenu:Otevřít menu`;
  protected readonly closeMenuLabel = $localize`:@@layout.header.closeMenu:Zavřít menu`;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly menuButton = viewChild.required<ElementRef<HTMLButtonElement>>('menuButton');

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled.set(window.scrollY > 50);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menuOpen()) {
      this.menuOpen.set(false);
      this.menuButton().nativeElement.focus();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
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

  openLogin(): void {
    this.menuOpen.set(false);
    this.loginDialog.open();
  }
}
