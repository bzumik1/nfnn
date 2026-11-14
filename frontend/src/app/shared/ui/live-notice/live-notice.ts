import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface Notice {
  readonly kind: 'status' | 'alert';
  readonly text: string;
}

export type NoticeLook = 'block' | 'note' | 'footer';

const LOOK_CLASSES: Record<NoticeLook, Record<Notice['kind'], string>> = {
  block: { status: 'ui-notice ui-notice--status', alert: 'ui-notice ui-notice--alert' },
  note: {
    status: 'ui-group-note ui-group-note--status',
    alert: 'ui-group-note ui-group-note--alert',
  },
  footer: {
    status: 'ui-card__footer ui-card__footer--status',
    alert: 'ui-card__footer ui-card__footer--alert',
  },
};

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
  protected readonly statusClass = computed(() => LOOK_CLASSES[this.look()].status);
  protected readonly alertClass = computed(() => LOOK_CLASSES[this.look()].alert);
}
