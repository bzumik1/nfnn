import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LogLevelName } from '../log-lines';

@Component({
  selector: 'app-level-icon',
  templateUrl: './level-icon.html',
  styleUrl: './level-icon.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'tone()', 'aria-hidden': 'true' },
})
export class LevelIcon {
  readonly level = input.required<LogLevelName | null>();
  protected readonly tone = computed(
    () => `level-icon level-icon--${(this.level() ?? 'none').toLowerCase()}`,
  );
}
