import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DonorDonations } from '../donor-donations';

@Component({
  selector: 'app-donations-pending',
  templateUrl: './donations-pending.html',
  styleUrl: './donations-pending.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonationsPending {
  protected readonly donations = inject(DonorDonations);
}
