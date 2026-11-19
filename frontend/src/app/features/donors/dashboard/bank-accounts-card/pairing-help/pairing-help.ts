import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Disclosure } from '../../../../../shared/ui/disclosure/disclosure';

@Component({
  selector: 'app-pairing-help',
  imports: [Disclosure],
  templateUrl: './pairing-help.html',
  styleUrl: './pairing-help.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PairingHelp {
  readonly variableSymbol = input<string | null>(null);
  readonly open = input(false);
  readonly closeRequested = output<void>();

  protected requestClose(): void {
    this.closeRequested.emit();
  }
}
