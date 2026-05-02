import { Component, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

type Mode = 'login' | 'register' | 'reset';

@Component({
  selector: 'app-donor-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class DonorLogin {
  protected readonly mode = signal<Mode>('login');
  protected readonly loading = signal(false);
  protected readonly resetSent = signal(false);
  protected readonly error = signal('');

  protected name = '';
  protected email = '';
  protected password = '';
  protected resetEmail = '';

  constructor(private readonly router: Router) {}

  setMode(next: Mode): void {
    this.mode.set(next);
    this.error.set('');
  }

  submitAuth(form: NgForm): void {
    if (form.invalid) {
      this.error.set('Vyplňte prosím všechna pole.');
      return;
    }
    this.loading.set(true);
    setTimeout(() => {
      this.loading.set(false);
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
}
