import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { AppInstall } from '../../../../core/install/app-install';

@Component({
  selector: 'app-install-row',
  templateUrl: './install-row.html',
  styleUrl: './install-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallRow {
  private readonly install = inject(AppInstall);

  readonly howId = input.required<string>();

  protected readonly way = this.install.way;
  protected readonly howShown = signal(false);

  protected addToHomeScreen(): void {
    if (this.way() === 'prompt') {
      void this.install.install();
      return;
    }
    this.howShown.update((shown) => !shown);
  }
}
