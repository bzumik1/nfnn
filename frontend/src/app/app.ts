import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { Meta } from '@angular/platform-browser';
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
  private readonly meta = inject(Meta);
  private readonly statusBarTint = viewChild.required<ElementRef<HTMLElement>>('statusBarTint');

  constructor() {
    afterNextRender(() => {
      const color = getComputedStyle(this.statusBarTint().nativeElement).backgroundColor;
      this.meta.updateTag({ name: 'theme-color', content: color });
    });
  }
}
