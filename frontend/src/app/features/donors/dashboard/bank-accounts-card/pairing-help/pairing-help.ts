import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-pairing-help',
  templateUrl: './pairing-help.html',
  styleUrl: './pairing-help.scss',
})
export class PairingHelp {
  readonly variableSymbol = input<string | null>(null);
  readonly open = input(false);
  readonly closeRequested = output<void>();

  protected requestClose(): void {
    this.closeRequested.emit();
  }
}
