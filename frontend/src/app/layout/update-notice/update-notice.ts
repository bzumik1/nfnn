import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-update-notice',
  templateUrl: './update-notice.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateNotice {}
