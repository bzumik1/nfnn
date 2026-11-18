import { Injectable } from '@angular/core';
import { SwipePreview } from './page-transitions';

export interface StepsInside {
  startSwipe(): SwipePreview | null;
  back(): void;
}

@Injectable({ providedIn: 'root' })
export class SheetSteps {
  private readonly offered = new Map<HTMLDialogElement, StepsInside>();

  offer(dialog: HTMLDialogElement, steps: StepsInside): () => void {
    this.offered.set(dialog, steps);
    return () => {
      if (this.offered.get(dialog) === steps) {
        this.offered.delete(dialog);
      }
    };
  }

  of(dialog: HTMLDialogElement): StepsInside | null {
    return this.offered.get(dialog) ?? null;
  }
}
