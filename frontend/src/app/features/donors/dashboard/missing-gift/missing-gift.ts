import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

export const ADD_ACCOUNT_QUERY = { pridat: 'ucet' } as const;

@Component({
  selector: 'app-missing-gift',
  imports: [RouterLink],
  templateUrl: './missing-gift.html',
  styleUrl: './missing-gift.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissingGift {
  protected readonly addAccountQuery = ADD_ACCOUNT_QUERY;
}
