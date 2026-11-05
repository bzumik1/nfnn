import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { AppInstall } from '../../../../core/install/app-install';

type Closing = 'hidden' | 'installing' | 'declined';

@Component({
  selector: 'app-install-card',
  templateUrl: './install-card.html',
  styleUrl: './install-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallCard {
  protected readonly install = inject(AppInstall);
  protected readonly closing = signal<Closing | null>(null);
  private readonly closingLine = viewChild<ElementRef<HTMLElement>>('closingLine');

  constructor() {
    afterRenderEffect(() => this.closingLine()?.nativeElement.focus());
  }

  protected async installNow(): Promise<void> {
    const outcome = await this.install.install();
    this.closing.set(outcome === 'accepted' ? 'installing' : 'declined');
  }

  protected notNow(): void {
    this.install.hideOffer();
    this.closing.set('hidden');
  }
}
