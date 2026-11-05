import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ZoomContent } from './zoom-content';

@Component({
  selector: 'app-zoom-viewer',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZoomViewer {
  readonly content = input.required<ZoomContent>();
  readonly closed = output<void>();
}
