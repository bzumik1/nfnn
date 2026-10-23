import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AccountCard } from '../account-card/account-card';
import { DonorDonations } from '../donor-donations';
import { PageTitle } from '../page-title/page-title';
import { PasskeysCard } from '../passkeys-card/passkeys-card';
import { ProfileCard } from '../profile-card/profile-card';

@Component({
  selector: 'app-donor-details',
  imports: [PageTitle, ProfileCard, AccountCard, PasskeysCard],
  templateUrl: './donor-details.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorDetails {
  protected readonly donations = inject(DonorDonations);
  protected readonly passkeyCount = signal<number | null>(null);
}
