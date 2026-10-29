import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ChunkLoadRecovery } from '../../core/reload/chunk-load-recovery';

@Component({
  selector: 'app-chunk-load-notice',
  templateUrl: './chunk-load-notice.html',
  styleUrl: './chunk-load-notice.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChunkLoadNotice {
  protected readonly recovery = inject(ChunkLoadRecovery);
}
