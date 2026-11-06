import { computed, Provider, signal } from '@angular/core';

import { SoftKeyboard, VisibleArea } from '../soft-keyboard';

export const KEYBOARD_ON_SMALL_PHONE: VisibleArea = { top: 0, height: 287 };

export class FakeSoftKeyboard {
  private readonly visible = signal<VisibleArea | null>(null);

  readonly visibleArea = this.visible.asReadonly();
  readonly isOpen = computed(() => this.visible() !== null);

  show(area: VisibleArea = KEYBOARD_ON_SMALL_PHONE): void {
    this.visible.set(area);
  }

  hide(): void {
    this.visible.set(null);
  }
}

export function provideFakeSoftKeyboard(keyboard: FakeSoftKeyboard): Provider {
  return { provide: SoftKeyboard, useValue: keyboard };
}
