/// <reference types="@angular/localize" />

import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { LoginDialogService } from '../login-dialog.service';

type Mode = 'login' | 'register' | 'reset';

@Component({
  selector: 'app-login-dialog',
  imports: [FormsModule],
  templateUrl: './login-dialog.html',
  styleUrl: './login-dialog.scss',
})
export class LoginDialog {
  private readonly router = inject(Router);
  private readonly dialog = inject(LoginDialogService);

  protected readonly mode = signal<Mode>('login');
  protected readonly loading = signal(false);
  protected readonly resetSent = signal(false);
  protected readonly error = signal('');

  protected name = '';
  protected email = '';
  protected password = '';
  protected resetEmail = '';

  setMode(next: Mode): void {
    this.mode.set(next);
    this.error.set('');
  }

  submitAuth(form: NgForm): void {
    if (form.invalid) {
      this.error.set($localize`:@@donor.login.error.fields:Vyplňte prosím všechna pole.`);
      return;
    }
    this.loading.set(true);
    setTimeout(() => {
      this.loading.set(false);
      this.dialog.close();
      this.router.navigateByUrl('/donor/prehled');
    }, 800);
  }

  submitReset(): void {
    this.loading.set(true);
    setTimeout(() => {
      this.loading.set(false);
      this.resetSent.set(true);
    }, 1000);
  }

  backToLogin(): void {
    this.resetSent.set(false);
    this.setMode('login');
  }

  closeDialog(): void {
    this.dialog.close();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeDialog();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeDialog();
  }
}
