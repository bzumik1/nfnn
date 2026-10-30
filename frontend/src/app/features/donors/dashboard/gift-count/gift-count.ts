import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DonationItem } from '../../../donations/donations-api';

export function receivedVerifications(items: readonly DonationItem[], year?: number): number {
  return items.filter(
    (item) =>
      item.status === 'RECEIVED' &&
      item.accountVerification &&
      (year === undefined || Number(item.receivedAt.slice(0, 4)) === year),
  ).length;
}

@Component({
  selector: 'app-gift-count',
  templateUrl: './gift-count.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GiftCount {
  readonly gifts = input.required<number>();
  readonly verifications = input(0);
}
