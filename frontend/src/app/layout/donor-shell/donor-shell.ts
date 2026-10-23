import { ChangeDetectionStrategy, Component, DOCUMENT, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-donor-shell',
  imports: [RouterOutlet],
  templateUrl: './donor-shell.html',
  styleUrl: './donor-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorShell {
  private readonly document = inject(DOCUMENT);

  skipToContent(event: Event): void {
    event.preventDefault();
    this.document.getElementById('obsah')?.focus();
  }
}
