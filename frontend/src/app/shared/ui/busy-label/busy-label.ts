import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-busy-label',
  templateUrl: './busy-label.html',
  styleUrl: './busy-label.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusyLabel {
  readonly busy = input.required<boolean>();
}
