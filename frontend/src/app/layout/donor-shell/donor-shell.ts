import { ChangeDetectionStrategy, Component, DOCUMENT, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PageTransitions } from '../../core/navigation/page-transitions';
import { dressChrome } from '../../core/navigation/step-chrome';

@Component({
  selector: 'app-donor-shell',
  imports: [RouterOutlet],
  templateUrl: './donor-shell.html',
  styleUrl: './donor-shell.scss',
  host: { class: 'ui-grouped page-layer' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorShell {
  private readonly document = inject(DOCUMENT);

  constructor() {
    inject(PageTransitions).dressing ??= dressChrome;
  }

  skipToContent(event: Event): void {
    event.preventDefault();
    this.document.getElementById('obsah')?.focus();
  }
}
