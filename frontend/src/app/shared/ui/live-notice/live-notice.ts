import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface Notice {
  readonly kind: 'status' | 'alert';
  readonly text: string;
}

@Component({
  selector: 'app-live-notice',
  templateUrl: './live-notice.html',
  styleUrl: './live-notice.scss',
  host: { class: 'live-notice' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveNotice {
  readonly notice = input<Notice | null>(null);
}
