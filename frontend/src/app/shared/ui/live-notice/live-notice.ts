import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface Notice {
  readonly kind: 'status' | 'alert';
  readonly text: string;
}

export type NoticeLook = 'block' | 'note';

@Component({
  selector: 'app-live-notice',
  templateUrl: './live-notice.html',
  styleUrl: './live-notice.scss',
  host: { class: 'live-notice' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveNotice {
  readonly notice = input<Notice | null>(null);
  readonly look = input<NoticeLook>('block');
  protected readonly statusClass = computed(() =>
    this.look() === 'note' ? 'ui-group-note ui-group-note--status' : 'ui-notice ui-notice--status',
  );
  protected readonly alertClass = computed(() =>
    this.look() === 'note' ? 'ui-group-note ui-group-note--alert' : 'ui-notice ui-notice--alert',
  );
}
