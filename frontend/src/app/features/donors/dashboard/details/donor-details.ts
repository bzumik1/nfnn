import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthStore } from '../../../../core/auth/auth-store';
import { AccountCard } from '../account-card/account-card';
import { ConnectedAppsCard } from '../connected-apps-card/connected-apps-card';
import { DonorDonations } from '../donor-donations';
import { PageTitle } from '../page-title/page-title';
import { ProfileCard } from '../profile-card/profile-card';

@Component({
  selector: 'app-donor-details',
  imports: [PageTitle, ProfileCard, AccountCard, ConnectedAppsCard],
  templateUrl: './donor-details.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorDetails {
  protected readonly donations = inject(DonorDonations);
  protected readonly isAdmin = inject(AuthStore).isAdmin;
}
