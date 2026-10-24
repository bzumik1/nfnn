import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CopyButton } from '../../../../shared/ui/copy-button/copy-button';

@Component({
  selector: 'app-symbol-card',
  imports: [RouterLink, CopyButton],
  templateUrl: './symbol-card.html',
  styleUrl: './symbol-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SymbolCard {
  readonly variableSymbol = input<string | null>(null);
  readonly hasDonated = input(false);
}
