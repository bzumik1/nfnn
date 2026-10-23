import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DonorDonations } from './donor-donations';
import { DashboardTopBar } from './top-bar/top-bar';

@Component({
  selector: 'app-donor-area',
  imports: [RouterOutlet, DashboardTopBar],
  providers: [DonorDonations],
  templateUrl: './donor-area.html',
  styleUrl: './donor-area.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonorArea {}
