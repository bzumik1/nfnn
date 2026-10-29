import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoginDialog } from './features/donors/login-dialog/login-dialog';
import { LoginDialogService } from './core/auth/login-dialog.service';
import { ChunkLoadNotice } from './layout/chunk-load-notice/chunk-load-notice';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoginDialog, ChunkLoadNotice],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly loginDialog = inject(LoginDialogService);
}
