import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  Type,
  untracked,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './core/auth/auth-store';
import { LoginDialogService } from './core/auth/login-dialog.service';
import { SESSION_JAR } from './core/auth/session-jar';
import { ChunkLoadRecovery } from './core/reload/chunk-load-recovery';
import { ChunkLoadNotice } from './layout/chunk-load-notice/chunk-load-notice';
import { OfflineStatus } from './layout/offline-status/offline-status';
import { LOGIN_DIALOG_LOADER } from './login-dialog-loader';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ChunkLoadNotice, OfflineStatus, NgComponentOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly loginDialog = inject(LoginDialogService);
  protected readonly loginDialogView = signal<Type<unknown> | null>(null);
  protected readonly notificationsOffer = signal<Type<unknown> | null>(null);
  private readonly jar = inject(SESSION_JAR);
  private readonly auth = inject(AuthStore);
  private readonly loadLoginDialog = inject(LOGIN_DIALOG_LOADER);
  private readonly chunkLoadRecovery = inject(ChunkLoadRecovery);
  private offerRequested = false;
  private loginDialogLoading = false;

  constructor() {
    effect(() => {
      if (this.loginDialog.isOpen() && this.loginDialogView() === null) {
        untracked(() => this.loadLoginDialogOnce());
      }
    });
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

  private loadLoginDialogOnce(): void {
    if (this.loginDialogLoading) {
      return;
    }
    this.loginDialogLoading = true;
    this.loadLoginDialog().then(
      (dialog) => this.loginDialogView.set(dialog),
      (error: unknown) => {
        this.loginDialogLoading = false;
        if (this.loginDialog.isOpen()) {
          this.loginDialog.close();
          this.chunkLoadRecovery.handleImportFailure(error);
        }
      },
    );
  }
}
