import { computed, DestroyRef, DOCUMENT, inject, Injectable, signal } from '@angular/core';

export const KEYBOARD_OPEN_CLASS = 'keyboard-open';

const COVERED_HEIGHT = '--keyboard-covered-height';
const SMALLEST_KEYBOARD_PX = 150;

export interface VisibleArea {
  readonly top: number;
  readonly height: number;
}

export function isTextEntry(element: Element | null): element is HTMLElement {
  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly && !element.disabled;
  }
  if (element instanceof HTMLInputElement) {
    return !NOT_TYPED_INTO.has(element.type) && !element.readOnly && !element.disabled;
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

const NOT_TYPED_INTO = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

@Injectable({ providedIn: 'root' })
export class SoftKeyboard {
  private readonly document = inject(DOCUMENT);
  private readonly visible = signal<VisibleArea | null>(null);

  readonly visibleArea = this.visible.asReadonly();
  readonly isOpen = computed(() => this.visible() !== null);

  constructor() {
    const view = this.document.defaultView;
    const viewport = view?.visualViewport;
    if (!view || !viewport) {
      return;
    }
    const update = () => this.update(view, viewport);
    const updateAfterFocusMoves = () => queueMicrotask(update);
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    this.document.addEventListener('focusin', update);
    this.document.addEventListener('focusout', updateAfterFocusMoves);
    inject(DestroyRef).onDestroy(() => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      this.document.removeEventListener('focusin', update);
      this.document.removeEventListener('focusout', updateAfterFocusMoves);
      this.show(null);
    });
  }

  private update(view: Window, viewport: VisualViewport): void {
    const typing = isTextEntry(this.document.activeElement);
    const keyboardHeight = view.innerHeight - viewport.height;
    if (typing && keyboardHeight >= SMALLEST_KEYBOARD_PX) {
      this.show(
        { top: viewport.offsetTop, height: viewport.height },
        view.innerHeight - viewport.offsetTop - viewport.height,
      );
    } else {
      this.show(null);
    }
  }

  private show(area: VisibleArea | null, covered = 0): void {
    const current = this.visible();
    if (current?.top === area?.top && current?.height === area?.height) {
      return;
    }
    const root = this.document.documentElement;
    root.classList.toggle(KEYBOARD_OPEN_CLASS, area !== null);
    if (area === null) {
      root.style.removeProperty(COVERED_HEIGHT);
    } else {
      root.style.setProperty(COVERED_HEIGHT, `${covered}px`);
    }
    this.visible.set(area);
  }
}
