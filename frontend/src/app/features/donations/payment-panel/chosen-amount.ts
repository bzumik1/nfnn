import { Injectable, signal } from '@angular/core';

export interface ChosenAmount {
  readonly amount: number;
  readonly custom: boolean;
}

@Injectable({ providedIn: 'root' })
export class ChosenAmountStore {
  private readonly chosen = signal<ChosenAmount | null>(null);

  readonly remembered = this.chosen.asReadonly();

  remember(choice: ChosenAmount): void {
    this.chosen.set(choice);
  }
}
