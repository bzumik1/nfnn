import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal, Type } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoginDialog } from './features/donors/login-dialog/login-dialog';
import { AuthStore } from './core/auth/auth-store';
import { LoginDialogService } from './core/auth/login-dialog.service';
import { SESSION_JAR } from './core/auth/session-jar';
import { ChunkLoadNotice } from './layout/chunk-load-notice/chunk-load-notice';
import { OfflineStatus } from './layout/offline-status/offline-status';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoginDialog, ChunkLoadNotice, OfflineStatus, NgComponentOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly loginDialog = inject(LoginDialogService);
  protected readonly notificationsOffer = signal<Type<unknown> | null>(null);
  private readonly jar = inject(SESSION_JAR);
  private readonly auth = inject(AuthStore);
  private offerRequested = false;

  constructor() {
    effect(() => {
      if (this.jar.installed && this.auth.donor() !== null && !this.offerRequested) {
        this.offerRequested = true;
        import('./features/donors/notifications-offer/notifications-offer').then(
          (loaded) => this.notificationsOffer.set(loaded.NotificationsOffer),
          () => undefined,
        );
      }
    });
  }
}
