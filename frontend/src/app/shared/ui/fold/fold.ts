import { ChangeDetectionStrategy, Component, input, linkedSignal } from '@angular/core';

@Component({
  selector: 'app-fold',
  templateUrl: './fold.html',
  styleUrl: './fold.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.inert]': "open() ? null : ''",
    '[attr.aria-hidden]': "open() ? null : 'true'",
  },
})
export class Fold {
  readonly open = input.required<boolean>();

  protected readonly moves = linkedSignal<boolean, boolean>({
    source: () => !this.open(),
    computation: (closed, previous) => closed || (previous?.value ?? false),
  });
}
