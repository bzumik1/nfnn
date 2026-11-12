import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthStore } from '../../../../core/auth/auth-store';
import { AccountCard } from '../account-card/account-card';
import { ConnectedAppsCard } from '../connected-apps-card/connected-apps-card';
import { DeviceDataCard } from '../device-data-card/device-data-card';
import { DevicesCard } from '../devices-card/devices-card';
import { DonorDonations } from '../donor-donations';
import { PageTitle } from '../page-title/page-title';
import { ProfileCard } from '../profile-card/profile-card';
import { DiagnosticsDownload } from '../../../../shared/ui/diagnostics-download/diagnostics-download';

@Component({
  selector: 'app-donor-details',
  imports: [
    PageTitle,
    ProfileCard,
    AccountCard,
    DevicesCard,
    DeviceDataCard,
    DiagnosticsDownload,
    ConnectedAppsCard,
  ],
  templateUrl: './donor-details.html',
  styleUrl: './donor-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorDetails {
  protected readonly donations = inject(DonorDonations);
  private readonly auth = inject(AuthStore);
  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly fromDevice = this.auth.fromDevice;
}
