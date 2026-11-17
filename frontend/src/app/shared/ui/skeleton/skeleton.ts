import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  templateUrl: './skeleton.html',
  host: { 'aria-hidden': 'true', class: 'skeleton' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Skeleton {
  readonly rows = input(3);
  readonly inset = input(false);
  protected readonly lines = computed(() =>
    Array.from({ length: this.rows() }, (_, index) => index),
  );
}
