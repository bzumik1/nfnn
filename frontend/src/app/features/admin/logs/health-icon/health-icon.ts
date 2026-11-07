import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ServerHealthKind } from '../server-health';

@Component({
  selector: 'app-health-icon',
  templateUrl: './health-icon.html',
  styleUrl: './health-icon.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"health-icon health-icon--" + kind()', 'aria-hidden': 'true' },
})
export class HealthIcon {
  readonly kind = input.required<ServerHealthKind>();
}
