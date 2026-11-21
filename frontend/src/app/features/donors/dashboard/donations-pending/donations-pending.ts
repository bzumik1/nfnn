import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { LoadFailure } from '../../../../shared/ui/load-failure/load-failure';
import { DonorDonations } from '../donor-donations';

@Component({
  selector: 'app-donations-pending',
  imports: [LoadFailure],
  templateUrl: './donations-pending.html',
  styleUrl: './donations-pending.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationsPending {
  readonly page = input<'overview' | 'gifts' | 'receipts'>('overview');

  protected readonly donations = inject(DonorDonations);
}
