import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PaymentPanel } from '../../../donations/payment-panel/payment-panel';
import { StandingOrder } from '../standing-order/standing-order';

@Component({
  selector: 'app-send-gift',
  imports: [PaymentPanel, StandingOrder],
  templateUrl: './send-gift.html',
  styleUrl: './send-gift.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SendGift {
  readonly variableSymbol = input<string | null>(null);
}
