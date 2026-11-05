import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { ZoomContent } from './zoom-content';

@Component({
  selector: 'app-zoomable',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Zoomable {
  readonly content = input.required<ZoomContent>();
}
