import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { formatBankTime } from '../../donations/donation-date';
import { AdministrationReads } from './administration-reads';

@Component({
  selector: 'app-copy-age',
  templateUrl: './copy-age.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CopyAge {
  private readonly reads = inject(AdministrationReads);

  protected readonly time = computed(() => {
    const time = this.reads.copyTime();
    return this.reads.fromCopyOffline() && time !== null ? formatBankTime(time) : null;
  });
}
