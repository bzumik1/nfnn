import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-donor-shell',
  imports: [RouterOutlet],
  templateUrl: './donor-shell.html',
  styleUrl: './donor-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorShell {}
