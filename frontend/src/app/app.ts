import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoginDialog } from './features/donors/login-dialog/login-dialog';
import { LoginDialogService } from './core/auth/login-dialog.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoginDialog],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly loginDialog = inject(LoginDialogService);
}
