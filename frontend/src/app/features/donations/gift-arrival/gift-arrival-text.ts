/// <reference types="@angular/localize" />

import { pluralCategory } from '../../../core/i18n/plural-category';
import { formatMinorUnits } from '../donation-amount';
import { GiftArrival } from './gift-arrival-watch';

export function giftArrivalText(arrival: GiftArrival): string {
  const count = arrival.count;
  const total = `${formatMinorUnits(arrival.totalMinor)}\u00a0Kč`;
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@home.donate.arrived.one:Váš dar ${total}:amount: dorazil. Děkujeme!`;
    case 'few':
      return $localize`:@@home.donate.arrived.few:Dorazily ${count}:count: dary, celkem ${total}:amount:. Děkujeme!`;
    default:
      return $localize`:@@home.donate.arrived.other:Dorazilo ${count}:count: darů, celkem ${total}:amount:. Děkujeme!`;
  }
}
