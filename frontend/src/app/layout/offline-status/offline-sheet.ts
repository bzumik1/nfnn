import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { Connectivity } from '../../core/connectivity/connectivity';
import { Dialog } from '../../shared/ui/dialog/dialog';

type TryOutcome = 'trying' | 'reached' | 'still-offline';

@Component({
  selector: 'app-offline-sheet',
  imports: [Dialog],
  templateUrl: './offline-sheet.html',
  styleUrl: './offline-sheet.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfflineSheet {
  protected readonly connectivity = inject(Connectivity);

  readonly dataTime = input<string | null>(null);
  readonly closed = output<void>();

  protected readonly tryOutcome = signal<TryOutcome | null>(null);
  protected readonly serverDown = computed(() => this.connectivity.cause() === 'server');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  constructor() {
    let wasOffline = this.connectivity.offline();
    effect(() => {
      const offline = this.connectivity.offline();
      untracked(() => {
        if (!offline && wasOffline) {
          this.tryOutcome.set('reached');
        }
        wasOffline = offline;
      });
    });
    afterRenderEffect(() => {
      if (this.tryOutcome() === 'reached') {
        untracked(() => this.closeButton()?.nativeElement.focus());
      }
    });
  }

  protected tryAgain(): void {
    if (this.tryOutcome() === 'trying') {
      return;
    }
    this.tryOutcome.set('trying');
    this.connectivity.tryAgain().subscribe((reached) => {
      if (!reached || this.connectivity.offline()) {
        this.tryOutcome.set('still-offline');
      } else {
        this.tryOutcome.set('reached');
      }
    });
  }
}
