import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-share-button',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareButton {
  readonly pageTitle = input.required<string>();
  readonly url = input.required<string>();
}
